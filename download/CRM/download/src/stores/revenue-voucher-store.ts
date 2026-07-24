"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  ReceiptCategory,
  CreateReceiptInput,
} from "@/types/revenue-voucher";
import { filterReceipts, paginate } from "@/lib/revenue-voucher-utils";
import { useBranchStore } from "@/stores/branch-store";
import { queryKeys } from "@/lib/query-keys";

// ===========================================================================
// Real Supabase data shapes (subset we use)
// ===========================================================================
//
// /api/supabase/revenue-vouchers returns rows from `revenue_vouchers` joined
// with `revenue_categories(*)`, `branches(*)`, `customers(*)`.
//
// /api/supabase/revenue-categories returns flat category rows.
//
// We defensively read either form (`revenue_categories` vs `revenue_category`)
// since the Supabase join key may be pluralised or singular depending on the
// FK relation name.

interface SupabaseRevenueCategory {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
}

interface SupabaseRevenueVoucher {
  id: string;
  code: string;
  amount: number | string;
  payment_method?: string | null;
  reason?: string | null;
  invoice_id?: string | null;
  created_by?: string | null;
  category_id?: string | null;
  branch_id?: string | null;
  customer_id?: string | null;
  voucher_date?: string | null;
  created_at: string;
  revenue_categories?: SupabaseRevenueCategory | null;
  revenue_category?: SupabaseRevenueCategory | null;
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

/** Coerce a Supabase payment_method string to the Receipt union. */
function coercePaymentMethod(
  v: string | null | undefined
): "cash" | "transfer" | "card" {
  if (!v) return "cash";
  const s = String(v).toLowerCase();
  if (s === "transfer" || s === "bank" || s === "chuyển khoản") return "transfer";
  if (s === "card" || s === "thẻ") return "card";
  return "cash";
}

/** Read the nested revenue category object from a voucher row, supporting both key forms. */
function getCategory(
  v: SupabaseRevenueVoucher
): { id: string; name: string; code: string | null } {
  const cat = v.revenue_categories || v.revenue_category;
  return {
    id: v.category_id || cat?.id || "",
    name: cat?.name || "Khác",
    code: cat?.code ?? null,
  };
}

function mapRevenueVoucher(v: SupabaseRevenueVoucher): Receipt {
  const cat = getCategory(v);
  return {
    id: v.id,
    code: v.code,
    categoryId: cat.id,
    categoryName: cat.name,
    datetime: v.created_at,
    createdBy: v.created_by || "—",
    amount: num(v.amount),
    paymentMethod: coercePaymentMethod(v.payment_method),
    invoiceCode: v.invoice_id || null,
    branchId: v.branch_id || "",
  };
}

function mapRevenueCategory(c: SupabaseRevenueCategory): ReceiptCategory {
  return {
    id: c.id,
    name: c.name,
    code: c.code ?? null,
  };
}

// ===========================================================================
// Store state — filters + pagination + dialog state ONLY (no data; that
// comes from React Query, mirroring the report-liabilities-store pattern).
// ===========================================================================

interface RevenueVoucherState {
  // Page-level filters
  search: string;

  // Pagination
  page: number;
  pageSize: number;

  // Modal/Dialog visibility
  isCategoryModalOpen: boolean;
  isCategoryFormOpen: boolean;
  isCreateReceiptOpen: boolean;
  isDetailOpen: boolean;

  // Selected items
  selectedReceipt: Receipt | null;

  // Actions
  setSearch: (s: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;

  // Modal/Dialog control
  openCategoryModal: () => void;
  closeCategoryModal: () => void;
  openCategoryFormDialog: () => void;
  closeCategoryFormDialog: () => void;
  openCreateReceiptDialog: () => void;
  closeCreateReceiptDialog: () => void;
  openDetail: (receipt: Receipt) => void;
  closeDetail: () => void;
}

export const useRevenueVoucherStore = create<RevenueVoucherState>((set) => ({
  // Filters
  search: "",

  // Pagination
  page: 1,
  pageSize: 20,

  // Dialog state
  isCategoryModalOpen: false,
  isCategoryFormOpen: false,
  isCreateReceiptOpen: false,
  isDetailOpen: false,
  selectedReceipt: null,

  // Actions
  setSearch: (search) => set({ search, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),

  // Modal/Dialog control
  openCategoryModal: () => set({ isCategoryModalOpen: true }),
  closeCategoryModal: () => set({ isCategoryModalOpen: false }),
  openCategoryFormDialog: () => set({ isCategoryFormOpen: true }),
  closeCategoryFormDialog: () => set({ isCategoryFormOpen: false }),
  openCreateReceiptDialog: () => set({ isCreateReceiptOpen: true }),
  closeCreateReceiptDialog: () => set({ isCreateReceiptOpen: false }),
  openDetail: (receipt) =>
    set({
      isDetailOpen: true,
      selectedReceipt: receipt,
    }),
  closeDetail: () =>
    set({
      isDetailOpen: false,
      selectedReceipt: null,
    }),
}));

// ===========================================================================
// Real data fetch hooks (React Query)
// ===========================================================================

/**
 * Fetch ALL revenue vouchers for the selected branch (up to 500). Each voucher
 * comes nested with `revenue_categories`, `branches`, and `customers`.
 *
 * Re-runs whenever the branch selection changes.
 */
function useRawRevenueVouchers() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseRevenueVoucher[]>({
    queryKey: queryKeys.revenueVoucher.vouchers(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all") {
        params.set("branch_id", selectedBranchId);
      }
      const res = await fetch(
        `/api/supabase/revenue-vouchers?${params.toString()}`
      );
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseRevenueVoucher[]) || [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch ALL revenue categories (up to 500). Categories are branch-agnostic, so
 * no branch_id filter is sent.
 */
function useRawRevenueCategories() {
  return useQuery<SupabaseRevenueCategory[]>({
    queryKey: queryKeys.revenueVoucher.categories,
    queryFn: async () => {
      const res = await fetch(`/api/supabase/revenue-categories`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseRevenueCategory[]) || [];
    },
    staleTime: 60_000,
  });
}

// ===========================================================================
// Aggregate data hooks
// ===========================================================================

export interface RevenueVoucherSummary {
  /** Total amount across all vouchers currently in view (post-filter). */
  totalAmount: number;
  /** Number of vouchers currently in view (post-filter). */
  count: number;
  /** Sum of amounts grouped by payment method. */
  byPaymentMethod: {
    cash: number;
    transfer: number;
    card: number;
  };
}

/**
 * Compute the summary cards from a list of (filtered) receipts.
 */
function computeSummary(receipts: Receipt[]): RevenueVoucherSummary {
  let totalAmount = 0;
  let count = 0;
  const byPaymentMethod = { cash: 0, transfer: 0, card: 0 };
  for (const r of receipts) {
    totalAmount += r.amount;
    count += 1;
    if (r.paymentMethod === "cash") byPaymentMethod.cash += r.amount;
    else if (r.paymentMethod === "transfer") byPaymentMethod.transfer += r.amount;
    else if (r.paymentMethod === "card") byPaymentMethod.card += r.amount;
  }
  return { totalAmount, count, byPaymentMethod };
}

/**
 * The single source of truth for the revenue-voucher page. Mirrors the pattern
 * used by `useCashFundData()` and `useLiabilitiesTransactionData()`:
 *   - fetches raw data via React Query
 *   - applies the store's current search filter
 *   - returns the summary cards + filtered list + loading flag
 */
export function useRevenueVoucherData(): {
  data: Receipt[];
  summary: RevenueVoucherSummary;
  isLoading: boolean;
} {
  const { search } = useRevenueVoucherStore();
  const { data: raw, isLoading } = useRawRevenueVouchers();

  const all: Receipt[] = (raw || []).map(mapRevenueVoucher);
  const filtered = filterReceipts(all, search);

  return {
    data: filtered,
    summary: computeSummary(filtered),
    isLoading,
  };
}

/** Revenue categories for the dropdown / modal list. */
export function useRevenueVoucherCategories(): {
  data: ReceiptCategory[];
  isLoading: boolean;
} {
  const { data, isLoading } = useRawRevenueCategories();
  return {
    data: (data || []).map(mapRevenueCategory),
    isLoading,
  };
}

// ===========================================================================
// Mutations — POST/DELETE to Supabase, then invalidate the React Query cache
// ===========================================================================

/**
 * Create a new revenue voucher on the server. The voucher code is
 * auto-generated by the API (any `code` field from the dialog is ignored —
 * the server is the source of truth for codes).
 *
 * After a successful POST, invalidates the revenue-voucher cache so the
 * list + summary refresh.
 */
export function useAddReceipt() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  return async (input: CreateReceiptInput): Promise<void> => {
    const body: Record<string, unknown> = {
      amount: input.amount,
      payment_method: input.paymentMethod,
      reason: input.reason || "",
      created_by: input.createdBy,
      branch_id:
        selectedBranchId && selectedBranchId !== "all"
          ? selectedBranchId
          : null,
    };
    // The API expects voucher_date as "yyyy-mm-dd". The dialog gives us
    // "dd/MM/yyyy" — convert before sending.
    const m = (input.date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      body.voucher_date = `${m[3]}-${m[2]}-${m[1]}`;
    } else {
      body.voucher_date = new Date().toISOString().slice(0, 10);
    }
    if (input.categoryId) {
      body.category_id = input.categoryId;
    }

    const res = await fetch("/api/supabase/revenue-vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Tạo phiếu thu thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.revenueVoucher.all,
    });
  };
}

/**
 * Delete a revenue voucher by id. After a successful DELETE, invalidates the
 * revenue-voucher cache so the list refreshes.
 */
export function useDeleteReceipt() {
  const queryClient = useQueryClient();

  return async (id: string): Promise<void> => {
    const res = await fetch(`/api/supabase/revenue-vouchers/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Xóa phiếu thu thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.revenueVoucher.all,
    });
  };
}

/**
 * Create a new revenue category on the server. After a successful POST,
 * invalidates the category cache so the dropdown / list refreshes.
 */
export function useAddCategory() {
  const queryClient = useQueryClient();

  return async (name: string): Promise<void> => {
    const res = await fetch("/api/supabase/revenue-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), active: true }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Tạo loại phiếu thu thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.revenueVoucher.categories,
    });
  };
}

/**
 * Delete a revenue category. The Supabase route file currently does not expose
 * a DELETE /api/supabase/revenue-categories/[id] endpoint, so this hook throws
 * a clear error. When the DELETE endpoint is added later, swap the body for a
 * `fetch(..., { method: "DELETE" })` call + invalidate the categories cache.
 */
export function useDeleteCategory() {
  // const queryClient = useQueryClient(); // uncomment when DELETE endpoint lands
  return async (_id: string): Promise<void> => {
    // No DELETE endpoint exists yet — surface a clear error so callers can
    // toast it instead of silently no-op'ing.
    throw new Error(
      "Chức năng xóa loại phiếu thu chưa được hỗ trợ (thiếu API DELETE)."
    );
    // NOTE: when the DELETE endpoint is added, the call would be:
    //   const res = await fetch(`/api/supabase/revenue-categories/${_id}`, {
    //     method: "DELETE",
    //   });
    //   const json = await res.json();
    //   if (!res.ok || !json.ok) {
    //     throw new Error(json.error || "Xóa loại phiếu thu thất bại");
    //   }
    //   await queryClient.invalidateQueries({
    //     queryKey: queryKeys.revenueVoucher.categories,
    //   });
  };
}

// ===========================================================================
// Backward-compatible selectors — keep the old `useFilteredReceipts`,
// `usePaginatedReceipts`, `useFilteredCategories`, `usePaginatedCategories`
// exports working so existing components don't need to be rewritten.
// ===========================================================================

export function useFilteredReceipts(): Receipt[] {
  const { data } = useRevenueVoucherData();
  return data;
}

export function usePaginatedReceipts(): {
  data: Receipt[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize } = useRevenueVoucherStore();
  const filtered = useFilteredReceipts();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}

export function useFilteredCategories(): ReceiptCategory[] {
  const { data } = useRevenueVoucherCategories();
  return data;
}

export function usePaginatedCategories(): {
  data: ReceiptCategory[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize } = useRevenueVoucherStore();
  const filtered = useFilteredCategories();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}
