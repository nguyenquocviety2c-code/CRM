"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Transaction,
  CashFundHistory,
  Category,
} from "@/types/cash-fund";
import {
  filterTransactions,
  paginate,
  computeSummary,
} from "@/lib/cash-fund-utils";
import { useBranchStore } from "@/stores/branch-store";
import { queryKeys } from "@/lib/query-keys";

// ===========================================================================
// Real Supabase data shapes (subset we use)
// ===========================================================================
//
// /api/supabase/cash-fund-settings returns a single row (or a default stub)
// from `cash_fund_settings` joined with `branches(*)`.
//
// /api/supabase/cash-fund-histories returns rows from `cash_fund_histories`
// joined with `branches(*)`, ordered by created_at desc.
//
// /api/supabase/revenue-vouchers returns rows from `revenue_vouchers`
// joined with `revenue_categories(*)`, `branches(*)`, `customers(*)`.
//
// /api/supabase/expenditure-vouchers returns rows from `expenditure_vouchers`
// joined with `expenditure_categories(*)`, `branches(*)`.
//
// /api/supabase/revenue-categories and /api/supabase/expenditure-categories
// return flat category rows.
//
// We defensively read either form (`revenue_categories` vs `revenue_category`)
// since the Supabase join key may be pluralised or singular depending on the
// FK relation name.

interface SupabaseCashFundSettings {
  id?: string;
  branch_id?: string | null;
  opening_balance?: number | string | null;
  carry_forward?: boolean | null;
  effective_date?: string | null;
  created_at?: string;
  branches?: { id?: string; name?: string } | null;
}

interface SupabaseCashFundHistory {
  id: string;
  previous_value?: number | string | null;
  new_value?: number | string | null;
  reason?: string | null;
  mechanism?: string | null;
  operator?: string | null;
  branch_id?: string | null;
  created_at: string;
  branches?: { id?: string; name?: string } | null;
}

interface SupabaseRevenueCategory {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
}

interface SupabaseExpenditureCategory {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
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

/** Coerce a Supabase payment_method string to the Transaction union. */
function coercePaymentMethod(
  v: string | null | undefined
): "cash" | "transfer" | "card" {
  if (!v) return "cash";
  const s = String(v).toLowerCase();
  if (s === "transfer" || s === "bank" || s === "chuyển khoản") return "transfer";
  if (s === "card" || s === "thẻ") return "card";
  return "cash";
}

function revenueCategoryName(
  v: SupabaseRevenueVoucher
): { id: string; name: string } {
  const cat = v.revenue_categories || v.revenue_category;
  return {
    id: v.category_id || cat?.id || "",
    name: cat?.name || "Khác",
  };
}

function expenditureCategoryName(
  v: SupabaseExpenditureVoucher
): { id: string; name: string } {
  const cat = v.expenditure_categories || v.expenditure_category;
  return {
    id: v.category_id || cat?.id || "",
    name: cat?.name || "Khác",
  };
}

function mapRevenueVoucher(v: SupabaseRevenueVoucher): Transaction {
  const cat = revenueCategoryName(v);
  return {
    id: v.id,
    voucherCode: v.code,
    type: "revenue",
    categoryId: cat.id,
    categoryName: cat.name,
    amount: num(v.amount),
    createdBy: v.created_by || "—",
    createdAt: v.created_at,
    paymentMethod: coercePaymentMethod(v.payment_method),
    reason: v.reason || "",
    link: v.invoice_id ? "Xem hóa đơn" : undefined,
  };
}

function mapExpenditureVoucher(v: SupabaseExpenditureVoucher): Transaction {
  const cat = expenditureCategoryName(v);
  return {
    id: v.id,
    voucherCode: v.code,
    type: "expense",
    categoryId: cat.id,
    categoryName: cat.name,
    amount: num(v.amount),
    createdBy: v.created_by || "—",
    createdAt: v.created_at,
    paymentMethod: coercePaymentMethod(v.payment_method),
    reason: v.reason || "",
    link: undefined,
  };
}

function mapHistory(h: SupabaseCashFundHistory): CashFundHistory {
  const value = num(h.new_value ?? h.previous_value);
  const mechanism =
    h.mechanism === "auto_carry_forward" ? "auto_carry_forward" : "manual";
  return {
    id: h.id,
    value,
    createdAt: h.created_at,
    createdBy: h.operator || "—",
    reason: h.reason || "Cập nhật quỹ đầu ngày",
    mechanism,
  };
}

// ===========================================================================
// Store state — filters + pagination + dialog state ONLY (no data; that
// comes from React Query, mirroring the report-liabilities-store pattern).
// ===========================================================================

interface CashFundState {
  // Filters
  search: string;
  filterType: "all" | "revenue" | "expense";
  filterCategoryId: string;

  // Pagination
  page: number;
  pageSize: number;

  // Dialog state
  isHistoryOpen: boolean;
  isSettingOpen: boolean;
  isVoucherOpen: boolean;
  voucherType: "revenue" | "expense";

  // Actions
  setSearch: (search: string) => void;
  setFilterType: (type: "all" | "revenue" | "expense") => void;
  setFilterCategoryId: (id: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  openHistory: () => void;
  openSetting: () => void;
  openVoucher: (type: "revenue" | "expense") => void;
  closeAllDialogs: () => void;
}

export const useCashFundStore = create<CashFundState>((set) => ({
  // Filters
  search: "",
  filterType: "all",
  filterCategoryId: "all",

  // Pagination
  page: 1,
  pageSize: 20,

  // Dialog state
  isHistoryOpen: false,
  isSettingOpen: false,
  isVoucherOpen: false,
  voucherType: "expense",

  // Actions
  setSearch: (search) => set({ search, page: 1 }),
  setFilterType: (filterType) => set({ filterType, page: 1 }),
  setFilterCategoryId: (filterCategoryId) => set({ filterCategoryId, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),

  openHistory: () => set({ isHistoryOpen: true }),
  openSetting: () => set({ isSettingOpen: true }),
  openVoucher: (type) => set({ isVoucherOpen: true, voucherType: type }),
  closeAllDialogs: () =>
    set({
      isHistoryOpen: false,
      isSettingOpen: false,
      isVoucherOpen: false,
    }),
}));

// ===========================================================================
// Real data fetch hooks (React Query)
// ===========================================================================

/**
 * Fetch the cash-fund settings for the selected branch (one row, or the API
 * returns a `{ opening_balance: 0, carry_forward: true }` stub when nothing
 * exists yet).
 */
function useRawCashFundSettings() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseCashFundSettings>({
    queryKey: queryKeys.cashFund.settings(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBranchId && selectedBranchId !== "all") {
        params.set("branch_id", selectedBranchId);
      }
      const url = `/api/supabase/cash-fund-settings${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) return { opening_balance: 0, carry_forward: true };
      return (json.data as SupabaseCashFundSettings) || {
        opening_balance: 0,
        carry_forward: true,
      };
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch ALL cash-fund histories for the selected branch (up to 500). Used to
 * populate the "Lịch sử cài đặt" dialog.
 */
function useRawCashFundHistories() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseCashFundHistory[]>({
    queryKey: queryKeys.cashFund.histories(selectedBranchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all") {
        params.set("branch_id", selectedBranchId);
      }
      const res = await fetch(
        `/api/supabase/cash-fund-histories?${params.toString()}`
      );
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseCashFundHistory[]) || [];
    },
    staleTime: 30_000,
  });
}

/** Fetch ALL revenue vouchers for the selected branch (up to 500). */
function useRawRevenueVouchers() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseRevenueVoucher[]>({
    queryKey: ["cashFund", "revenue-vouchers", selectedBranchId ?? "all"],
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

/** Fetch ALL expenditure vouchers for the selected branch (up to 500). */
function useRawExpenditureVouchers() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseExpenditureVoucher[]>({
    queryKey: ["cashFund", "expenditure-vouchers", selectedBranchId ?? "all"],
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

function useRawRevenueCategories() {
  return useQuery<SupabaseRevenueCategory[]>({
    queryKey: ["cashFund", "revenue-categories"],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/revenue-categories?limit=500`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseRevenueCategory[]) || [];
    },
    staleTime: 60_000,
  });
}

function useRawExpenditureCategories() {
  return useQuery<SupabaseExpenditureCategory[]>({
    queryKey: ["cashFund", "expenditure-categories"],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/expenditure-categories?limit=500`);
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

/**
 * The unified Transaction list for the "Sổ quỹ tiền mặt" page — merges
 * revenue vouchers (PT) and expenditure vouchers (PC), newest first.
 */
export function useCashFundTransactions(): {
  data: Transaction[];
  isLoading: boolean;
} {
  const rev = useRawRevenueVouchers();
  const exp = useRawExpenditureVouchers();

  const data: Transaction[] = [];
  for (const v of rev.data || []) data.push(mapRevenueVoucher(v));
  for (const v of exp.data || []) data.push(mapExpenditureVoucher(v));
  // Sort by createdAt desc so the newest vouchers show on top.
  data.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { data, isLoading: rev.isLoading || exp.isLoading };
}

/** Combined revenue + expenditure categories for the category filter dropdown. */
export function useCashFundCategories(): Category[] {
  const rev = useRawRevenueCategories();
  const exp = useRawExpenditureCategories();
  const cats: Category[] = [];
  for (const c of rev.data || []) {
    cats.push({ id: c.id, name: c.name, type: "revenue" });
  }
  for (const c of exp.data || []) {
    cats.push({ id: c.id, name: c.name, type: "expense" });
  }
  return cats;
}

/**
 * Settings for the current branch, normalised to { openingBalance, carryForward }.
 * Falls back to { 0, true } when nothing has been configured yet (the API
 * already does the same, but we re-normalise defensively).
 */
export function useCashFundSettingsValue(): {
  openingBalance: number;
  carryForward: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useRawCashFundSettings();
  return {
    openingBalance: num(data?.opening_balance),
    carryForward: data?.carry_forward !== false,
    isLoading,
  };
}

/** History rows for the "Lịch sử cài đặt" dialog. */
export function useCashFundHistoriesData(): {
  data: CashFundHistory[];
  isLoading: boolean;
} {
  const { data, isLoading } = useRawCashFundHistories();
  return {
    data: (data || []).map(mapHistory),
    isLoading,
  };
}

export interface CashFundSummary {
  openingBalance: number;
  totalRevenue: number;
  totalExpense: number;
  currentBalance: number;
}

/**
 * The single source of truth for the cash-fund page. Mirrors the pattern used
 * by `useLiabilitiesTransactionData()` in `report-liabilities-store.ts`:
 *   - fetches raw data via React Query
 *   - applies the store's current filters
 *   - returns the summary cards + filtered list + loading flag
 */
export function useCashFundData(): {
  data: Transaction[];
  summary: CashFundSummary;
  isLoading: boolean;
} {
  const { search, filterType, filterCategoryId } = useCashFundStore();
  const { data: txns, isLoading } = useCashFundTransactions();
  const { openingBalance } = useCashFundSettingsValue();

  const filtered = filterTransactions(txns, {
    search,
    filterType,
    filterCategoryId,
  });

  const { totalRevenue, totalExpense, currentBalance } = computeSummary(
    txns,
    openingBalance
  );

  return {
    data: filtered,
    summary: { openingBalance, totalRevenue, totalExpense, currentBalance },
    isLoading,
  };
}

// ===========================================================================
// Mutations — POST/PUT to Supabase, then invalidate the React Query cache
// ===========================================================================

export type NewTransactionInput = Omit<
  Transaction,
  "id" | "createdAt" | "voucherCode"
> & { voucherCode?: string };

/**
 * Create a new revenue or expenditure voucher on the server. The voucher code
 * is auto-generated by the API (the `voucherCode` field from the dialog, if
 * provided, is ignored — the server is the source of truth for codes).
 *
 * After a successful POST, invalidates the cash-fund transaction cache so the
 * list + summary refresh.
 */
export function useAddTransaction() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  return async (data: NewTransactionInput): Promise<void> => {
    const endpoint =
      data.type === "revenue"
        ? "/api/supabase/revenue-vouchers"
        : "/api/supabase/expenditure-vouchers";

    const body: Record<string, unknown> = {
      amount: data.amount,
      payment_method: data.paymentMethod,
      reason: data.reason || "",
      created_by: data.createdBy,
      branch_id: selectedBranchId && selectedBranchId !== "all"
        ? selectedBranchId
        : null,
      voucher_date: new Date().toISOString().slice(0, 10),
    };
    if (data.categoryId && data.categoryId !== "cat-0") {
      body.category_id = data.categoryId;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Tạo phiếu thất bại");
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.cashFund.all });
  };
}

/**
 * Update the cash-fund opening balance + carry-forward flag for the current
 * branch. The API automatically inserts a `cash_fund_histories` row when the
 * opening balance changes, so we just invalidate the cash-fund cache after.
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  return async (
    openingBalance: number,
    carryForward: boolean
  ): Promise<void> => {
    const body: Record<string, unknown> = {
      opening_balance: openingBalance,
      carry_forward: carryForward,
      reason: "Cập nhật quỹ đầu ngày",
      mechanism: carryForward ? "auto_carry_forward" : "manual",
    };
    if (selectedBranchId && selectedBranchId !== "all") {
      body.branch_id = selectedBranchId;
    }

    const res = await fetch("/api/supabase/cash-fund-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Cập nhật quỹ thất bại");
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.cashFund.all });
  };
}

// ===========================================================================
// Backward-compatible selectors — keep the old `useFilteredTransactions`,
// `useSummary`, `usePaginatedTransactions` exports working so existing
// components don't need to be rewritten.
// ===========================================================================

export function useFilteredTransactions() {
  const { search, filterType, filterCategoryId } = useCashFundStore();
  const { data: txns } = useCashFundTransactions();
  return filterTransactions(txns, {
    search,
    filterType,
    filterCategoryId,
  });
}

export function useSummary(): CashFundSummary {
  const { data: txns } = useCashFundTransactions();
  const { openingBalance } = useCashFundSettingsValue();
  const { totalRevenue, totalExpense, currentBalance } = computeSummary(
    txns,
    openingBalance
  );
  return { openingBalance, totalRevenue, totalExpense, currentBalance };
}

export function usePaginatedTransactions() {
  const { page, pageSize } = useCashFundStore();
  const filtered = useFilteredTransactions();
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, total, page, pageSize };
}
