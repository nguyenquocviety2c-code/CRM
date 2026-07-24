import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import {
  LiabilitiesViewMode,
  DebtTypeFilter,
  DebtTransaction,
  DebtCustomer,
  LiabilitiesSummary,
} from "@/types/report-liabilities";
import {
  paginate,
  filterDebtTransactions,
  filterDebtCustomers,
  sortDebtTransactions,
  sortDebtCustomers,
} from "@/lib/report-liabilities-utils";
import { useBranchStore } from "@/stores/branch-store";

// ===========================================================================
// Real Supabase data shapes (subset we use)
// ===========================================================================
//
// The debts API (SELECT "*, customers(*), branches(*), debt_invoices(*)")
// returns each row with the nested joins as:
//   - customers(*)   → may appear as `customers` (un-aliased) or `customer`
//   - branches(*)    → may appear as `branches` (un-aliased) or `branch`
//   - debt_invoices(*)  → array of child debt_invoices
//
// The debt-invoices API (SELECT "*, debts(*)") returns each row with:
//   - debts(*)  → may appear as `debts` (un-aliased) or `debt`
//
// We defensively read either form so the store keeps working even if the
// SELECT clause is later aliased.
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

/** Convert "dd/MM/yyyy" → ISO date string "yyyy-MM-dd" (or null). */
function ddmmyyyyToIso(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null;
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Coerce a Supabase numeric-ish value to a safe number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Extract "yyyy-MM-dd" from a full ISO datetime string. */
function toISODate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** True when a payment status indicates the debt_invoice has been settled. */
function isPaidStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  return status.toLowerCase() === "paid";
}

/** Read the nested customer object from a debt row, supporting both key forms. */
function getCustomer(debt: SupabaseDebt): SupabaseCustomer | null {
  return debt.customer || debt.customers || null;
}

/** Read the nested parent debt from a debt_invoice row. */
function getParentDebt(di: SupabaseDebtInvoiceWithJoin): SupabaseDebtStub | null {
  return di.debt || di.debts || null;
}

interface CustomerInfo {
  customerId: string;
  customerName: string;
  customerPhone: string;
}

function customerInfoFromDebt(debt: SupabaseDebt): CustomerInfo {
  const customer = getCustomer(debt);
  return {
    customerId: debt.customer_id || customer?.id || "",
    customerName: customer?.name || "Khách lẻ",
    customerPhone: customer?.phone || "—",
  };
}

/** Sum of paid debt_invoices for a single debt. */
function paidSumForDebt(debt: SupabaseDebt): number {
  return (debt.debt_invoices || [])
    .filter((di) => isPaidStatus(di.status))
    .reduce((s, di) => s + num(di.amount), 0);
}

/** Current remaining debt for a single debt (>= 0). */
function remainingForDebt(debt: SupabaseDebt): number {
  return Math.max(0, num(debt.total_amount) - paidSumForDebt(debt));
}

interface DateRange {
  startISO: string | null;
  endISO: string | null;
}

function rangeFromStore(startDate: string, endDate: string): DateRange {
  return {
    startISO: ddmmyyyyToIso(startDate),
    endISO: ddmmyyyyToIso(endDate),
  };
}

/** True when an ISO date string falls inside [start, end] (inclusive). */
function dateInRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  if (range.startISO && dateStr < range.startISO) return false;
  if (range.endISO && dateStr > range.endISO) return false;
  return true;
}

// ===========================================================================
// Store state — filters + pagination only (NO data; that comes from React Query)
// ===========================================================================

interface ReportLiabilitiesState {
  // View mode
  viewMode: LiabilitiesViewMode;

  // Filters
  debtTypeFilter: DebtTypeFilter;
  searchQuery: string;
  /** "dd/MM/yyyy" — kept in sync with the DateRangePicker. */
  startDate: string;
  /** "dd/MM/yyyy" — kept in sync with the DateRangePicker. */
  endDate: string;

  // Pagination
  page: number;
  pageSize: number;

  // Actions
  setViewMode: (mode: LiabilitiesViewMode) => void;
  setDebtTypeFilter: (filter: DebtTypeFilter) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (start: string, end: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  resetFilters: () => void;
}

/**
 * Default date range = the current month (dd/MM/yyyy), so real data shows up
 * immediately on first load. Mirrors the Revenue report's behaviour.
 */
function defaultStartDate(): string {
  const now = new Date();
  return `01/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}
function defaultEndDate(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

export const useReportLiabilitiesStore = create<ReportLiabilitiesState>((set) => ({
  // View mode
  viewMode: "transaction",

  // Filters
  debtTypeFilter: "all",
  searchQuery: "",
  startDate: defaultStartDate(),
  endDate: defaultEndDate(),

  // Pagination
  page: 1,
  pageSize: 20,

  // Actions
  setViewMode: (viewMode) => set({ viewMode, page: 1 }),
  setDebtTypeFilter: (debtTypeFilter) => set({ debtTypeFilter, page: 1 }),
  setSearchQuery: (searchQuery) => set({ searchQuery, page: 1 }),
  setDateRange: (startDate, endDate) => set({ startDate, endDate, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  resetFilters: () =>
    set({
      debtTypeFilter: "all",
      searchQuery: "",
      startDate: defaultStartDate(),
      endDate: defaultEndDate(),
      page: 1,
      pageSize: 20,
    }),
}));

// ===========================================================================
// Real data fetch hooks (React Query)
// ===========================================================================

/**
 * Fetch ALL debts for the selected branch (up to 500). Each debt comes
 * nested with `customers`, `branches`, and its `debt_invoices` array — so
 * this single hook is the source of truth for both the transaction and
 * customer views.
 *
 * Re-runs whenever the branch selection changes.
 */
function useRawDebts() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseDebt[]>({
    queryKey: ["report-liabilities-debts", selectedBranchId ?? "all"],
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
 * Used to build "payment" transactions (debt_invoices with status="paid").
 */
function useRawDebtInvoices() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseDebtInvoiceWithJoin[]>({
    queryKey: ["report-liabilities-debt-invoices", selectedBranchId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      const res = await fetch(`/api/supabase/debt-invoices?${params.toString()}`);
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
// Aggregation helpers
// ===========================================================================

/**
 * Compute the four summary cards from the raw debts list + a date range.
 *
 *  - initialDebt   = current remaining on debts created BEFORE the range
 *                    (i.e. debt carried into the period)
 *  - debtIncurred  = total_amount of debts created INSIDE the range
 *  - payment       = sum of paid debt_invoices' amounts created INSIDE the range
 *  - remainingDebt = current remaining across ALL debts (live outstanding)
 */
function computeLiabilitiesSummary(
  debts: SupabaseDebt[],
  range: DateRange
): LiabilitiesSummary {
  let initialDebt = 0;
  let debtIncurred = 0;
  let payment = 0;
  let remainingDebt = 0;

  for (const debt of debts) {
    const totalAmount = num(debt.total_amount);
    const dateStr = toISODate(debt.created_at);
    const remaining = remainingForDebt(debt);
    remainingDebt += remaining;

    if (range.startISO && dateStr < range.startISO) {
      // Created before the range → contributes to opening debt.
      initialDebt += remaining;
    } else if (dateInRange(dateStr, range)) {
      // Created inside the range → new debt incurred.
      debtIncurred += totalAmount;
    }

    // Payments: paid debt_invoices whose created_at is inside the range.
    for (const di of debt.debt_invoices || []) {
      if (!isPaidStatus(di.status)) continue;
      if (dateInRange(toISODate(di.created_at), range)) {
        payment += num(di.amount);
      }
    }
  }

  return { initialDebt, debtIncurred, payment, remainingDebt };
}

// ===========================================================================
// View 1: Giao dịch công nợ (transaction list)
// ===========================================================================
export function useLiabilitiesTransactionData(): {
  data: DebtTransaction[];
  summary: LiabilitiesSummary;
  page: number;
  pageSize: number;
  total: number;
} {
  const { debtTypeFilter, searchQuery, startDate, endDate, page, pageSize } =
    useReportLiabilitiesStore();
  const { data: rawDebts } = useRawDebts();
  const { data: rawDebtInvoices } = useRawDebtInvoices();

  // Build a lookup of customer info per debt_id (from the debts list, which
  // already has the customer join). Used to enrich payment transactions.
  const customerByDebtId = new Map<string, CustomerInfo>();
  for (const debt of rawDebts || []) {
    customerByDebtId.set(debt.id, customerInfoFromDebt(debt));
  }

  const txns: DebtTransaction[] = [];

  // 1. Each debt → a "debt" transaction (the debt was incurred).
  for (const debt of rawDebts || []) {
    const info = customerInfoFromDebt(debt);
    const date = toISODate(debt.created_at);
    const totalAmount = num(debt.total_amount);
    const remaining = remainingForDebt(debt);

    txns.push({
      id: `debt-${debt.id}`,
      type: "debt",
      date,
      linkId: debt.id,
      linkType: "debt",
      customerId: info.customerId,
      customerName: info.customerName,
      customerPhone: info.customerPhone,
      // Per-row opening debt is hard to reconstruct without history; show 0.
      // The summary card aggregates this correctly across all rows.
      initialDebt: 0,
      amount: totalAmount,
      remainingDebt: remaining,
      createdAt: debt.created_at,
    });
  }

  // 2. Each PAID debt_invoice → a "payment" transaction.
  for (const di of rawDebtInvoices || []) {
    if (!isPaidStatus(di.status)) continue;
    const fallbackInfo: CustomerInfo = {
      customerId: getParentDebt(di)?.customer_id || "",
      customerName: "Khách lẻ",
      customerPhone: "—",
    };
    const info = customerByDebtId.get(di.debt_id) || fallbackInfo;

    // Look up the parent debt's total + remaining so we can show the
    // post-payment remaining debt on the row.
    const parentDebt = (rawDebts || []).find((d) => d.id === di.debt_id);
    const remaining = parentDebt ? remainingForDebt(parentDebt) : 0;
    const initialDebt = parentDebt
      ? num(parentDebt.total_amount)
      : num(di.amount);

    txns.push({
      id: `pay-${di.id}`,
      type: "payment",
      date: toISODate(di.created_at),
      linkId: di.invoice_code || di.id,
      linkType: "payment",
      customerId: info.customerId,
      customerName: info.customerName,
      customerPhone: info.customerPhone,
      initialDebt,
      amount: num(di.amount),
      remainingDebt: remaining,
      createdAt: di.created_at,
    });
  }

  // Filter / sort / paginate using the existing utilities.
  // NOTE: filterDebtTransactions string-compares t.date against the filter
  // bounds, so we convert the dd/MM/yyyy store value to ISO "yyyy-MM-dd".
  const filtered = filterDebtTransactions(txns, {
    type: debtTypeFilter,
    search: searchQuery,
    startDate: ddmmyyyyToIso(startDate) || undefined,
    endDate: ddmmyyyyToIso(endDate) || undefined,
  });
  const sorted = sortDebtTransactions(filtered, "date", "desc");
  const { data, total } = paginate(sorted, page, pageSize);

  const summary = computeLiabilitiesSummary(
    rawDebts || [],
    rangeFromStore(startDate, endDate)
  );

  return { data, summary, page, pageSize, total };
}

// ===========================================================================
// View 2: Công nợ theo khách hàng (group by customer)
// ===========================================================================
export function useLiabilitiesCustomerData(): {
  data: DebtCustomer[];
  summary: LiabilitiesSummary;
  page: number;
  pageSize: number;
  total: number;
} {
  const { searchQuery, startDate, endDate, page, pageSize } =
    useReportLiabilitiesStore();
  const { data: rawDebts } = useRawDebts();
  // NOTE: we don't call useRawDebtInvoices() here — the debts list already
  // contains a nested `debt_invoices` array per customer, which is enough to
  // compute per-customer payments. The transaction view (which needs
  // standalone payment rows) does call useRawDebtInvoices() and React Query
  // shares the cache, so switching views won't trigger duplicate fetches.

  const range = rangeFromStore(startDate, endDate);

  // Group by customer_id (using the debts list as the authoritative source).
  const byCustomer = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      customerPhone: string;
      debts: SupabaseDebt[];
    }
  >();

  for (const debt of rawDebts || []) {
    const info = customerInfoFromDebt(debt);
    const key = info.customerId || debt.id;
    const entry = byCustomer.get(key) || {
      customerId: info.customerId,
      customerName: info.customerName,
      customerPhone: info.customerPhone,
      debts: [],
    };
    entry.debts.push(debt);
    byCustomer.set(key, entry);
  }

  const customers: DebtCustomer[] = Array.from(byCustomer.entries()).map(
    ([customerId, v], idx) => {
      let initialDebt = 0;
      let debtIncurred = 0;
      let payment = 0;
      let txnCount = 0;
      let lastTxnDate = "";

      for (const debt of v.debts) {
        const totalAmount = num(debt.total_amount);
        const dateStr = toISODate(debt.created_at);
        const remaining = remainingForDebt(debt);

        if (range.startISO && dateStr < range.startISO) {
          initialDebt += remaining;
        } else if (dateInRange(dateStr, range)) {
          debtIncurred += totalAmount;
          txnCount += 1;
          if (dateStr > lastTxnDate) lastTxnDate = dateStr;
        }

        for (const di of debt.debt_invoices || []) {
          if (!isPaidStatus(di.status)) continue;
          const diDate = toISODate(di.created_at);
          if (dateInRange(diDate, range)) {
            payment += num(di.amount);
            txnCount += 1;
            if (diDate > lastTxnDate) lastTxnDate = diDate;
          }
        }
      }

      const remainingDebt = v.debts.reduce(
        (s, debt) => s + remainingForDebt(debt),
        0
      );

      return {
        id: `dc-${idx}`,
        customerId,
        customerName: v.customerName,
        customerPhone: v.customerPhone,
        initialDebt,
        debtIncurred,
        payment,
        remainingDebt,
        transactionCount: txnCount,
        lastTransactionDate: lastTxnDate,
      };
    }
  );

  const filtered = filterDebtCustomers(customers, { search: searchQuery });
  const sorted = sortDebtCustomers(filtered, "remainingDebt", "desc");
  const { data, total } = paginate(sorted, page, pageSize);

  const summary = computeLiabilitiesSummary(rawDebts || [], range);

  return { data, summary, page, pageSize, total };
}
