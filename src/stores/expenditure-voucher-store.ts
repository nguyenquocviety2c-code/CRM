"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Expenditure,
  ExpenditureCategory,
  CreateExpenditureInput,
} from "@/types/expenditure-voucher";
import { filterExpenditures, paginate } from "@/lib/expenditure-voucher-utils";
import { useBranchStore } from "@/stores/branch-store";
import { queryKeys } from "@/lib/query-keys";

// ===========================================================================
// Real Supabase data shapes (subset we use)
// ===========================================================================
//
// /api/supabase/expenditure-vouchers returns rows from `expenditure_vouchers`
// joined with `expenditure_categories(*)`, `branches(*)`.
//
// /api/supabase/expenditure-categories returns flat category rows.
//
// We defensively read either form (`expenditure_categories` vs
// `expenditure_category`) since the Supabase join key may be pluralised or
// singular depending on the FK relation name.

interface SupabaseExpenditureCategory {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
}

interface SupabaseExpenditureVoucher {
  id: string;
  code: string;
  amount: number | string;
  payment_method?: string | null;
  reason?: string | null;
  supplier_name?: string | null;
  created_by?: string | null;
  category_id?: string | null;
  branch_id?: string | null;
  voucher_date?: string | null;
  created_at: string;
  expenditure_categories?: SupabaseExpenditureCategory | null;
  expenditure_category?: SupabaseExpenditureCategory | null;
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

/** Coerce a Supabase payment_method string to the Expenditure union. */
function coercePaymentMethod(
  v: string | null | undefined
): "cash" | "transfer" | "card" {
  if (!v) return "cash";
  const s = String(v).toLowerCase();
  if (s === "transfer" || s === "bank" || s === "chuyển khoản") return "transfer";
  if (s === "card" || s === "thẻ") return "card";
  return "cash";
}

/** Read the nested expenditure category object from a voucher row, supporting both key forms. */
function getCategory(
  v: SupabaseExpenditureVoucher
): { id: string; name: string; code: string | null } {
  const cat = v.expenditure_categories || v.expenditure_category;
  return {
    id: v.category_id || cat?.id || "",
    name: cat?.name || "Khác",
    code: cat?.code ?? null,
  };
}

function mapExpenditureVoucher(v: SupabaseExpenditureVoucher): Expenditure {
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
    branchId: v.branch_id || "",
  };
}

function mapExpenditureCategory(
  c: SupabaseExpenditureCategory
): ExpenditureCategory {
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

interface ExpenditureVoucherState {
  // Page-level filters
  search: string;

  // Pagination
  page: number;
  pageSize: number;

  // Modal/Dialog visibility
  isCategoryModalOpen: boolean;
  isCategoryFormOpen: boolean;
  isCreateExpenditureOpen: boolean;

  // Actions
  setSearch: (s: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;

  // Modal/Dialog control
  openCategoryModal: () => void;
  closeCategoryModal: () => void;
  openCategoryFormDialog: () => void;
  closeCategoryFormDialog: () => void;
  openCreateExpenditureDialog: () => void;
  closeCreateExpenditureDialog: () => void;
}

export const useExpenditureVoucherStore = create<ExpenditureVoucherState>(
  (set) => ({
    // Filters
    search: "",

    // Pagination
    page: 1,
    pageSize: 20,

    // Dialog state
    isCategoryModalOpen: false,
    isCategoryFormOpen: false,
    isCreateExpenditureOpen: false,

    // Actions
    setSearch: (search) => set({ search, page: 1 }),
    setPage: (page) => set({ page }),
    setPageSize: (pageSize) => set({ pageSize, page: 1 }),

    // Modal/Dialog control
    openCategoryModal: () => set({ isCategoryModalOpen: true }),
    closeCategoryModal: () => set({ isCategoryModalOpen: false }),
    openCategoryFormDialog: () => set({ isCategoryFormOpen: true }),
    closeCategoryFormDialog: () => set({ isCategoryFormOpen: false }),
    openCreateExpenditureDialog: () => set({ isCreateExpenditureOpen: true }),
    closeCreateExpenditureDialog: () => set({ isCreateExpenditureOpen: false }),
  })
);

// ===========================================================================
// Real data fetch hooks (React Query)
// ===========================================================================

/**
 * Fetch ALL expenditure vouchers for the selected branch (up to 500). Each
 * voucher comes nested with `expenditure_categories` and `branches`.
 *
 * Re-runs whenever the branch selection changes.
 */
function useRawExpenditureVouchers() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseExpenditureVoucher[]>({
    queryKey: queryKeys.expenditureVoucher.vouchers(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all") {
        params.set("branch_id", selectedBranchId);
      }
      const res = await fetch(
        `/api/supabase/expenditure-vouchers?${params.toString()}`
      );
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseExpenditureVoucher[]) || [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch ALL expenditure categories (up to 500). Categories are
 * branch-agnostic, so no branch_id filter is sent.
 */
function useRawExpenditureCategories() {
  return useQuery<SupabaseExpenditureCategory[]>({
    queryKey: queryKeys.expenditureVoucher.categories,
    queryFn: async () => {
      const res = await fetch(`/api/supabase/expenditure-categories`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseExpenditureCategory[]) || [];
    },
    staleTime: 60_000,
  });
}

// ===========================================================================
// Aggregate data hooks
// ===========================================================================

export interface ExpenditureVoucherSummary {
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
 * Compute the summary cards from a list of (filtered) expenditures.
 */
function computeSummary(
  expenditures: Expenditure[]
): ExpenditureVoucherSummary {
  let totalAmount = 0;
  let count = 0;
  const byPaymentMethod = { cash: 0, transfer: 0, card: 0 };
  for (const e of expenditures) {
    totalAmount += e.amount;
    count += 1;
    if (e.paymentMethod === "cash") byPaymentMethod.cash += e.amount;
    else if (e.paymentMethod === "transfer")
      byPaymentMethod.transfer += e.amount;
    else if (e.paymentMethod === "card") byPaymentMethod.card += e.amount;
  }
  return { totalAmount, count, byPaymentMethod };
}

/**
 * The single source of truth for the expenditure-voucher page. Mirrors the
 * pattern used by `useRevenueVoucherData()` and `useCashFundData()`:
 *   - fetches raw data via React Query
 *   - applies the store's current search filter
 *   - returns the summary cards + filtered list + loading flag
 */
export function useExpenditureVoucherData(): {
  data: Expenditure[];
  summary: ExpenditureVoucherSummary;
  isLoading: boolean;
} {
  const { search } = useExpenditureVoucherStore();
  const { data: raw, isLoading } = useRawExpenditureVouchers();

  const all: Expenditure[] = (raw || []).map(mapExpenditureVoucher);
  const filtered = filterExpenditures(all, search);

  return {
    data: filtered,
    summary: computeSummary(filtered),
    isLoading,
  };
}

/** Expenditure categories for the dropdown / modal list. */
export function useExpenditureVoucherCategories(): {
  data: ExpenditureCategory[];
  isLoading: boolean;
} {
  const { data, isLoading } = useRawExpenditureCategories();
  return {
    data: (data || []).map(mapExpenditureCategory),
    isLoading,
  };
}

// ===========================================================================
// Mutations — POST/DELETE to Supabase, then invalidate the React Query cache
// ===========================================================================

/**
 * Create a new expenditure voucher on the server. The voucher code is
 * auto-generated by the API (any `code` field from the dialog is ignored —
 * the server is the source of truth for codes).
 *
 * After a successful POST, invalidates the expenditure-voucher cache so the
 * list + summary refresh.
 */
export function useAddExpenditure() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  return async (input: CreateExpenditureInput): Promise<void> => {
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

    const res = await fetch("/api/supabase/expenditure-vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Tạo phiếu chi thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenditureVoucher.all,
    });
  };
}

/**
 * Delete an expenditure voucher by id. After a successful DELETE, invalidates
 * the expenditure-voucher cache so the list refreshes.
 */
export function useDeleteExpenditure() {
  const queryClient = useQueryClient();

  return async (id: string): Promise<void> => {
    const res = await fetch(`/api/supabase/expenditure-vouchers/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Xóa phiếu chi thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenditureVoucher.all,
    });
  };
}

/**
 * Create a new expenditure category on the server. After a successful POST,
 * invalidates the category cache so the dropdown / list refreshes.
 */
export function useAddCategory() {
  const queryClient = useQueryClient();

  return async (name: string): Promise<void> => {
    const res = await fetch("/api/supabase/expenditure-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), active: true }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Tạo loại phiếu chi thất bại");
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenditureVoucher.categories,
    });
  };
}

/**
 * Delete an expenditure category. The Supabase route file currently does not
 * expose a DELETE /api/supabase/expenditure-categories/[id] endpoint, so this
 * hook throws a clear error. When the DELETE endpoint is added later, swap
 * the body for a `fetch(..., { method: "DELETE" })` call + invalidate the
 * categories cache.
 */
export function useDeleteCategory() {
  // const queryClient = useQueryClient(); // uncomment when DELETE endpoint lands
  return async (_id: string): Promise<void> => {
    // No DELETE endpoint exists yet — surface a clear error so callers can
    // toast it instead of silently no-op'ing.
    throw new Error(
      "Chức năng xóa loại phiếu chi chưa được hỗ trợ (thiếu API DELETE)."
    );
    // NOTE: when the DELETE endpoint is added, the call would be:
    //   const res = await fetch(`/api/supabase/expenditure-categories/${_id}`, {
    //     method: "DELETE",
    //   });
    //   const json = await res.json();
    //   if (!res.ok || !json.ok) {
    //     throw new Error(json.error || "Xóa loại phiếu chi thất bại");
    //   }
    //   await queryClient.invalidateQueries({
    //     queryKey: queryKeys.expenditureVoucher.categories,
    //   });
  };
}

// ===========================================================================
// Backward-compatible selectors — keep the old `useFilteredExpenditures`,
// `usePaginatedExpenditures`, `useFilteredCategories`,
// `usePaginatedCategories` exports working so existing components don't need
// to be rewritten.
// ===========================================================================

export function useFilteredExpenditures(): Expenditure[] {
  const { data } = useExpenditureVoucherData();
  return data;
}

export function usePaginatedExpenditures(): {
  data: Expenditure[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize } = useExpenditureVoucherStore();
  const filtered = useFilteredExpenditures();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}

export function useFilteredCategories(): ExpenditureCategory[] {
  const { data } = useExpenditureVoucherCategories();
  return data;
}

export function usePaginatedCategories(): {
  data: ExpenditureCategory[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize } = useExpenditureVoucherStore();
  const filtered = useFilteredCategories();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}
