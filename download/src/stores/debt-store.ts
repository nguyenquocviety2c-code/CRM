"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Debt, DebtInvoice, CreateDebtPaymentInput } from "@/types/debt";
import { filterDebts, paginate } from "@/lib/debt-utils";
import { useBranchStore } from "@/stores/branch-store";
import { queryKeys } from "@/lib/query-keys";

// ===========================================================================
// Real Supabase data shapes (subset we use)
// ===========================================================================
//
// /api/supabase/debts returns rows from `debts` joined with `customers(*)`,
// `branches(*)`, and `debt_invoices(*)` (the array of child invoices).
//
// /api/supabase/debt-invoices returns rows from `debt_invoices` joined with
// `debts(*)` (the parent debt). The API does NOT support a `branch_id` filter,
// so we fetch everything and filter client-side via the nested parent's
// `branch_id`.
//
// We defensively read either form (`customers` vs `customer`, `debts` vs
// `debt`) since the Supabase join key may be pluralised or singular depending
// on the FK relation name.

interface SupabaseCustomer {
  id?: string;
  name?: string;
  phone?: string | null;
}

interface SupabaseDebtInvoice {
  id: string;
  debt_id: string;
  invoice_code?: string | null;
  amount?: number | string | null;
  status?: string; // "unpaid" | "partial" | "paid"
  created_at: string;
}

/** Shape returned by /api/supabase/debt-invoices — has a nested `debts` join. */
interface SupabaseDebtInvoiceWithJoin extends SupabaseDebtInvoice {
  debts?: SupabaseDebtStub | null;
  debt?: SupabaseDebtStub | null;
}

/** Minimal debt shape nested inside a debt_invoice (no customer/branch join). */
interface SupabaseDebtStub {
  id: string;
  customer_id?: string | null;
  branch_id?: string | null;
  total_amount?: number | string | null;
  status?: string;
  created_at?: string;
}

interface SupabaseDebt {
  id: string;
  customer_id?: string | null;
  branch_id?: string | null;
  total_amount: number | string;
  status?: string;
  created_at: string;
  updated_at?: string;
  customers?: SupabaseCustomer | null;
  customer?: SupabaseCustomer | null;
  debt_invoices?: SupabaseDebtInvoice[] | null;
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Coerce a Supabase numeric-ish value to a safe number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Read the nested customer object from a debt row, supporting both key forms. */
function getCustomer(debt: SupabaseDebt): SupabaseCustomer | null {
  return debt.customer || debt.customers || null;
}

/** Read the nested parent debt from a debt_invoice row. */
function getParentDebt(
  di: SupabaseDebtInvoiceWithJoin
): SupabaseDebtStub | null {
  return di.debt || di.debts || null;
}

/** Map a Supabase debt row to the frontend Debt shape. */
function mapDebt(debt: SupabaseDebt): Debt {
  const customer = getCustomer(debt);
  return {
    id: debt.id,
    customerName: customer?.name || "Khách lẻ",
    customerPhone: customer?.phone || "—",
    totalAmount: num(debt.total_amount),
    invoiceIds: (debt.debt_invoices || []).map((di) => di.id),
  };
}

/** Map a Supabase debt_invoice row to the frontend DebtInvoice shape. */
function mapDebtInvoice(di: SupabaseDebtInvoiceWithJoin): DebtInvoice {
  return {
    id: di.id,
    debtId: di.debt_id,
    invoiceCode: di.invoice_code || "",
    amount: num(di.amount),
    datetime: di.created_at,
  };
}

// ===========================================================================
// Store state — filters + pagination + dialog state ONLY (no data; that
// comes from React Query, mirroring the report-liabilities-store pattern).
// ===========================================================================

interface DebtState {
  // Filters
  search: string;

  // Pagination
  page: number;
  pageSize: number;

  // Dialog state
  isCreatePaymentOpen: boolean;
  selectedDebt: Debt | null;

  // Actions
  setSearch: (s: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  openCreatePaymentDialog: (debt: Debt) => void;
  closeCreatePaymentDialog: () => void;
}

export const useDebtStore = create<DebtState>((set) => ({
  // Filters
  search: "",

  // Pagination
  page: 1,
  pageSize: 20,

  // Dialog state
  isCreatePaymentOpen: false,
  selectedDebt: null,

  // Actions
  setSearch: (search) => set({ search, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),

  // Dialog control
  openCreatePaymentDialog: (debt) =>
    set({ isCreatePaymentOpen: true, selectedDebt: debt }),
  closeCreatePaymentDialog: () =>
    set({ isCreatePaymentOpen: false, selectedDebt: null }),
}));

// ===========================================================================
// Real data fetch hooks (React Query)
// ===========================================================================

/**
 * Fetch ALL debts for the selected branch (up to 500). Each debt comes
 * nested with `customers`, `branches`, and its `debt_invoices` array — so
 * this single hook is the source of truth for the debt list.
 *
 * Re-runs whenever the branch selection changes.
 */
function useRawDebts() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseDebt[]>({
    queryKey: queryKeys.debt.debts(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all") {
        params.set("branch_id", selectedBranchId);
      }
      const res = await fetch(`/api/supabase/debts?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseDebt[]) || [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch ALL debt_invoices (up to 500). The debt-invoices API does NOT support
 * a `branch_id` filter, so we fetch everything and filter client-side using
 * the nested `debts.branch_id` join.
 *
 * Used by `useDebtInvoicesByDebt` to populate the invoice dropdown in the
 * "Tạo thu nợ" dialog.
 */
function useRawDebtInvoices() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseDebtInvoiceWithJoin[]>({
    queryKey: queryKeys.debt.invoices(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      const res = await fetch(
        `/api/supabase/debt-invoices?${params.toString()}`
      );
      const json = await res.json();
      if (!json.ok) return [];
      const all = (json.data as SupabaseDebtInvoiceWithJoin[]) || [];
      if (!selectedBranchId || selectedBranchId === "all") return all;
      // Client-side branch filter via the nested parent debt.
      return all.filter((di) => {
        const parent = getParentDebt(di);
        return parent?.branch_id === selectedBranchId;
      });
    },
    staleTime: 30_000,
  });
}

// ===========================================================================
// Aggregate data hooks
// ===========================================================================

export interface DebtSummary {
  /** Total outstanding debt across all rows currently in view (post-filter). */
  totalDebt: number;
  /** Number of debts currently in view (post-filter). */
  count: number;
}

/** Compute the summary cards from a list of (filtered) debts. */
function computeSummary(debts: Debt[]): DebtSummary {
  let totalDebt = 0;
  let count = 0;
  for (const d of debts) {
    totalDebt += d.totalAmount;
    count += 1;
  }
  return { totalDebt, count };
}

/**
 * The single source of truth for the debt page. Mirrors the pattern used by
 * `useRevenueVoucherData()` and `useCashFundData()`:
 *   - fetches raw data via React Query
 *   - applies the store's current search filter
 *   - returns the summary cards + filtered list + loading flag
 */
export function useDebtData(): {
  data: Debt[];
  summary: DebtSummary;
  isLoading: boolean;
} {
  const { search } = useDebtStore();
  const { data: raw, isLoading } = useRawDebts();

  const all: Debt[] = (raw || []).map(mapDebt);
  const filtered = filterDebts(all, search);

  return {
    data: filtered,
    summary: computeSummary(filtered),
    isLoading,
  };
}

// ===========================================================================
// Mutations — optimistic cache update + dialog close
// ===========================================================================

/**
 * Apply a debt payment in-memory on the React Query cache. Mirrors the
 * original mock-store semantics: subtract the payment amount from the debt's
 * `totalAmount`, and remove the debt entirely if its remaining total drops to
 * zero or below.
 *
 * NOTE: there is no Supabase endpoint that records a "debt payment" as a
 * distinct transaction (the `debt_invoices` table is read-only from this
 * client's perspective, and `PUT /api/supabase/debts/[id]` updates the debt
 * total — which is NOT the right semantic for a payment). So we keep this as
 * a client-side optimistic update only, exactly as the original mock did.
 *
 * The dialog's `receiptCode` field (auto-generated or user-entered) is
 * accepted on the input for future use (e.g. printing the receipt) but is
 * not persisted server-side yet.
 *
 * After updating the cache, the dialog is closed.
 */
export function useCreateDebtPayment() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const closeCreatePaymentDialog = useDebtStore(
    (s) => s.closeCreatePaymentDialog
  );

  return async (input: CreateDebtPaymentInput): Promise<void> => {
    // Optimistic update: subtract the payment from the matched debt, drop the
    // debt if fully paid. We mutate the cache in-place so the UI refreshes
    // instantly without a refetch.
    const cacheKey = queryKeys.debt.debts(selectedBranchId);
    queryClient.setQueryData<SupabaseDebt[]>(cacheKey, (prev) => {
      if (!prev) return prev;
      return prev
        .map((debt) => {
          if (debt.id !== input.debtId) return debt;
          const newTotal = num(debt.total_amount) - input.amount;
          if (newTotal <= 0) return null;
          return { ...debt, total_amount: newTotal };
        })
        .filter((d): d is SupabaseDebt => d !== null);
    });

    closeCreatePaymentDialog();
  };
}

// ===========================================================================
// Backward-compatible selectors — keep the old `useFilteredDebts`,
// `usePaginatedDebts`, `useDebtInvoicesByDebt` exports working so existing
// components don't need to be rewritten.
// ===========================================================================

export function useFilteredDebts(): Debt[] {
  const { data } = useDebtData();
  return data;
}

export function usePaginatedDebts(): {
  data: Debt[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize } = useDebtStore();
  const filtered = useFilteredDebts();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}

export function useDebtInvoicesByDebt(debtId: string): DebtInvoice[] {
  const { data: raw } = useRawDebtInvoices();
  if (!debtId) return [];
  return (raw || [])
    .filter((di) => di.debt_id === debtId)
    .map(mapDebtInvoice);
}
