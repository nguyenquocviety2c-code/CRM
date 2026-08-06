import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import {
  RevenueViewMode,
  TimeUnit,
  InvoiceReport,
  PaymentMethodReport,
  ServiceRevenue,
  PackageRevenue,
  SalesRevenue,
} from "@/types/report";
import {
  paginate,
  computeInvoiceSummary,
  computePaymentMethodSummary,
  computeServiceRevenueTotal,
  filterServiceRevenue,
  filterPackageRevenue,
  computeSalesRevenueTotal,
} from "@/lib/report-utils";
import { useBranchStore } from "@/stores/branch-store";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

// ============================================
// Real Supabase invoice shape (subset we use)
// ============================================
interface SupabaseInvoiceItem {
  name?: string;
  type?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  total?: number;
  staffName?: string;
}
// A single invoice's note JSON may carry `promotions` (array) and `vouchers`
// (array) when the cashier applied multiple of each. The legacy single
// `promotion` field is also still read for backward compatibility.
interface SupabaseAppliedIncentive {
  id?: string;
  code?: string | null;
  name?: string;
  discountValue?: number;
  discountType?: string;
  discountAmount?: number;
}
interface SupabaseInvoice {
  id: string;
  code: string | null;
  created_at: string;
  final_amount: number;
  total_amount: number;
  discount: number;
  tip: number;
  payment_method: string;
  status: string;
  promotion?: SupabaseAppliedIncentive | null;
  promotions?: SupabaseAppliedIncentive[] | null;
  vouchers?: SupabaseAppliedIncentive[] | null;
  customer?: { id?: string; name?: string; phone?: string | null } | null;
  branch?: { id?: string; name?: string } | null;
  items?: SupabaseInvoiceItem[];
}

// Convert "dd/MM/yyyy" → ISO date string "yyyy-MM-dd" for the API filter.
function ddmmyyyyToIso(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null;
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

interface ReportRevenueState {
  // Filters
  // NOTE: branchId is NOT stored here — it comes from the global
  // useBranchStore (the BranchSelector in the header) so the report stays
  // in sync with the rest of the app. useRawInvoices reads it directly.
  dateFrom: string; // "dd/MM/yyyy"
  dateTo: string;   // "dd/MM/yyyy"

  // View state
  viewMode: RevenueViewMode;
  timeUnit: TimeUnit;

  // Pagination (for invoice + payment-method views)
  page: number;
  pageSize: number;

  // Filter state (service / package / sales views)
  serviceCategoryFilter: string;
  packageSaleTypeFilter: string;
  packageCategoryFilter: string;

  // Actions
  setDateRange: (from: string, to: string) => void;
  setViewMode: (mode: RevenueViewMode) => void;
  setTimeUnit: (unit: TimeUnit) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  setServiceCategoryFilter: (id: string) => void;
  setPackageSaleTypeFilter: (type: string) => void;
  setPackageCategoryFilter: (id: string) => void;
}

export const useReportRevenueStore = create<ReportRevenueState>((set) => ({
  // Filters — default to the current month so real data shows up.
  dateFrom: (() => {
    const now = new Date();
    return `01/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  })(),
  dateTo: (() => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  })(),

  // View state
  viewMode: "invoice",
  timeUnit: "day",

  // Pagination
  page: 1,
  pageSize: 20,

  // Filter state
  serviceCategoryFilter: "all",
  packageSaleTypeFilter: "Tất cả",
  packageCategoryFilter: "all",

  // Actions
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo, page: 1 }),
  setViewMode: (viewMode) => set({ viewMode, page: 1 }),
  setTimeUnit: (timeUnit) => set({ timeUnit }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  setServiceCategoryFilter: (serviceCategoryFilter) => set({ serviceCategoryFilter, page: 1 }),
  setPackageSaleTypeFilter: (packageSaleTypeFilter) => set({ packageSaleTypeFilter, page: 1 }),
  setPackageCategoryFilter: (packageCategoryFilter) => set({ packageCategoryFilter, page: 1 }),
}));

// ============================================
// Real data fetch — completed invoices from Supabase
// ============================================

/**
 * Fetch all completed invoices within the selected date range + branch.
 * This is the single source of truth for all revenue views — each view
 * derives its own shape from this raw invoice list.
 *
 * The query re-runs whenever branchId / dateFrom / dateTo change.
 */
function useRawInvoices() {
  const { dateFrom, dateTo } = useReportRevenueStore();
  // Read the branch from the GLOBAL branch store (shared with the
  // BranchSelector in the header) so the report filters by the same branch
  // the user selected app-wide.
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseInvoice[]>({
    queryKey: ["report-revenue-invoices", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "completed");
      params.set("limit", "1000");
      // lite=true → the API strips the `photos` array (base64 data URLs, up to
      // ~2.6MB each) from each invoice's decoded note. Without this, fetching
      // 1000 invoices returns ~7.7MB and takes 2+ seconds. With lite=true the
      // payload drops to ~200KB (<5% of the original) with zero data loss for
      // the report views (they only need summary fields + items for aggregation,
      // never photos). Detail views (PaidInvoiceView, cashier history) do NOT
      // use lite — they fetch a single invoice and need its photos.
      params.set("lite", "true");
      const fromIso = ddmmyyyyToIso(dateFrom);
      const toIso = ddmmyyyyToIso(dateTo);
      if (fromIso) params.set("date_from", localDayStartUtc(fromIso));
      if (toIso) params.set("date_to", localDayEndUtc(toIso));
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/invoices?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseInvoice[]) || [];
    },
    // 60s stale time so switching between report sub-views (invoice → service →
    // package etc.) doesn't refetch the same 1000-invoice payload. The data is
    // shared across all views via this one query key.
    staleTime: 60_000,
    // Keep previous data visible while a new date range loads — no blank page.
    placeholderData: (prev) => prev,
  });
}

/**
 * Map a Supabase invoice → the InvoiceReport shape the UI expects.
 *
 * Promotion / voucher handling: a single invoice can carry MULTIPLE promotions
 * and MULTIPLE vouchers (stored as `promotions: []` and `vouchers: []` in the
 * invoice note JSON). For backward compatibility we also still read the legacy
 * single `promotion` field — when `promotions` is absent but `promotion` is
 * present, we lift it into `promotions: [promotion]`. The legacy
 * `promotionName` / `promotionDiscountValue` / `promotionDiscountType` /
 * `promotionDiscountAmount` fields are filled from `promotions[0]` so any
 * existing code that reads them keeps working.
 */
function mapInvoiceReport(inv: SupabaseInvoice, stt: number): InvoiceReport {
  const totalAmount = Number(inv.total_amount ?? inv.final_amount ?? 0);
  const tip = Number(inv.tip ?? 0);
  // "Đã thanh toán" = final_amount (what the customer actually paid).
  // For a completed invoice, paidAmount == final_amount.
  const paidAmount = Number(inv.final_amount ?? 0);
  // "Thưởng" = tip (the customer's bonus to staff). The system has no
  // separate surcharge field — tip IS the thưởng.
  const surcharge = tip;
  // Normalize the legacy single `promotion` field into the `promotions` array.
  // The server still stores `promotion` (single object) for invoices created
  // before multi-promotion support; newer invoices store `promotions: [...]`.
  const promotions: NonNullable<InvoiceReport["promotions"]> = [];
  if (Array.isArray(inv.promotions)) {
    for (const p of inv.promotions) {
      if (!p) continue;
      promotions.push({
        id: p.id,
        code: p.code ?? null,
        name: p.name || "",
        discountValue: Number(p.discountValue ?? 0),
        discountType: p.discountType,
        discountAmount: Number(p.discountAmount ?? 0),
      });
    }
  } else if (inv.promotion && inv.promotion.name) {
    promotions.push({
      id: inv.promotion.id,
      code: inv.promotion.code ?? null,
      name: inv.promotion.name,
      discountValue: Number(inv.promotion.discountValue ?? 0),
      discountType: inv.promotion.discountType,
      discountAmount: Number(inv.promotion.discountAmount ?? 0),
    });
  }
  const vouchers: NonNullable<InvoiceReport["vouchers"]> = [];
  if (Array.isArray(inv.vouchers)) {
    for (const v of inv.vouchers) {
      if (!v) continue;
      vouchers.push({
        id: v.id,
        code: v.code ?? null,
        name: v.name || "",
        discountValue: Number(v.discountValue ?? 0),
        discountType: v.discountType,
        discountAmount: Number(v.discountAmount ?? 0),
      });
    }
  }
  // Legacy fields — filled from the first promotion so existing callers that
  // only read `promotionName` etc. keep working.
  const primaryPromo = promotions[0];
  const promotionName = primaryPromo?.name || "";
  const promotionDiscountValue = primaryPromo?.discountValue ?? 0;
  const promotionDiscountType = primaryPromo?.discountType ?? "";
  const promotionDiscountAmount = primaryPromo?.discountAmount ?? 0;
  const discount = Number(inv.discount ?? 0);
  return {
    id: inv.id,
    stt,
    invoiceCode: inv.code || "—",
    createdAt: inv.created_at,
    customerId: (inv as { customer_id?: string }).customer_id || inv.customer?.id || "",
    customerName: inv.customer?.name || "Khách lẻ",
    totalAmount,
    surcharge,
    promotionName,
    promotionDiscountValue,
    promotionDiscountType,
    promotionDiscountAmount,
    promotions,
    vouchers,
    discount,
    paidAmount,
    // debt = totalAmount + surcharge - paidAmount (0 for completed invoices).
    // We expose it via the summary, not per-row, but the type requires it.
  } as InvoiceReport & { debt: number };
}

// ============================================
// View 1: Hóa đơn
// ============================================
export function useInvoiceReportData(): {
  data: InvoiceReport[];
  summary: { count: number; totalRevenue: number; totalPaid: number; totalDebt: number };
  page: number;
  pageSize: number;
  total: number;
} {
  const { page, pageSize } = useReportRevenueStore();
  const { data: raw } = useRawInvoices();
  const all = (raw || []).map((inv, idx) => mapInvoiceReport(inv, idx + 1));
  const { data, total } = paginate(all, page, pageSize);
  const summary = computeInvoiceSummary(all);
  return { data, summary, page, pageSize, total };
}

// ============================================
// View 2: Phương thức thanh toán
// Group invoices by date → sum cash / transfer per day.
// ============================================
export function usePaymentMethodReportData(): {
  data: PaymentMethodReport[];
  summary: { topMethod: { name: string; amount: number } | null; total: number };
  page: number;
  pageSize: number;
  total: number;
} {
  const { page, pageSize } = useReportRevenueStore();
  const { data: raw } = useRawInvoices();
  // Group by date (dd/MM/yyyy).
  const byDate = new Map<string, { cash: number; transfer: number }>();
  for (const inv of raw || []) {
    const d = new Date(inv.created_at);
    if (isNaN(d.getTime())) continue;
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const entry = byDate.get(key) || { cash: 0, transfer: 0 };
    const amount = Number(inv.final_amount ?? 0);
    if (inv.payment_method === "cash") entry.cash += amount;
    else if (inv.payment_method === "transfer") entry.transfer += amount;
    else entry.cash += amount; // default unknown → cash
    byDate.set(key, entry);
  }
  const all: PaymentMethodReport[] = Array.from(byDate.entries())
    .map(([date, v], idx) => ({
      id: `pm-${idx}`,
      date,
      cash: v.cash,
      transfer: v.transfer,
      // The remaining columns are removed from the UI; keep them 0 for
      // type compatibility.
      cardSwipe: 0,
      accountCard: 0,
      loyaltyPoints: 0,
      other: 0,
      debt: 0,
      total: v.cash + v.transfer,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const { data, total } = paginate(all, page, pageSize);
  const summary = computePaymentMethodSummary(all);
  return { data, summary, page, pageSize, total };
}

// ============================================
// View 4: Dịch vụ — aggregate invoice items of type "service".
// ============================================
export function useServiceRevenueData(): {
  data: ServiceRevenue[];
  total: ReturnType<typeof computeServiceRevenueTotal>;
  categoryFilter: string;
} {
  const { serviceCategoryFilter } = useReportRevenueStore();
  const { data: raw } = useRawInvoices();
  // Aggregate service items by name.
  const byService = new Map<string, { quantity: number; originalPrice: number; totalAmount: number; discount: number }>();
  for (const inv of raw || []) {
    for (const it of inv.items || []) {
      if (it.type !== "service") continue;
      const name = it.name || "Dịch vụ";
      const price = Number(it.price ?? 0);
      const qty = Number(it.quantity ?? 1);
      const itemTotal = Number(it.total ?? price * qty);
      // Per-item discount: spread the invoice-level discount proportionally
      // is complex; use the item-level discount if present, else 0.
      const itemDiscount = Number(it.discount ?? 0);
      const entry = byService.get(name) || { quantity: 0, originalPrice: price, totalAmount: 0, discount: 0 };
      entry.quantity += qty;
      entry.originalPrice = price; // last-seen unit price
      entry.totalAmount += itemTotal;
      entry.discount += itemDiscount;
      byService.set(name, entry);
    }
  }
  const all: ServiceRevenue[] = Array.from(byService.entries()).map(([name, v], idx) => ({
    id: `svc-${idx}`,
    serviceName: name,
    categoryId: "all",
    quantity: v.quantity,
    originalPrice: v.originalPrice,
    totalAmount: v.totalAmount,
    discount: v.discount,
    revenue: v.totalAmount - v.discount,
  }));
  const filtered = filterServiceRevenue(all, serviceCategoryFilter);
  const total = computeServiceRevenueTotal(filtered);
  return { data: filtered, total, categoryFilter: serviceCategoryFilter };
}

// ============================================
// View 5: Gói dịch vụ — aggregate invoice items of type "package".
// ============================================
export function usePackageRevenueData(): {
  data: PackageRevenue[];
  page: number;
  pageSize: number;
  total: number;
} {
  const { packageSaleTypeFilter, packageCategoryFilter, page, pageSize } = useReportRevenueStore();
  const { data: raw } = useRawInvoices();
  const byPackage = new Map<string, { quantity: number; unitPrice: number; totalAmount: number; discount: number }>();
  for (const inv of raw || []) {
    for (const it of inv.items || []) {
      if (it.type !== "package") continue;
      const name = it.name || "Gói dịch vụ";
      const price = Number(it.price ?? 0);
      const qty = Number(it.quantity ?? 1);
      const itemTotal = Number(it.total ?? price * qty);
      const itemDiscount = Number(it.discount ?? 0);
      const entry = byPackage.get(name) || { quantity: 0, unitPrice: price, totalAmount: 0, discount: 0 };
      entry.quantity += qty;
      entry.unitPrice = price;
      entry.totalAmount += itemTotal;
      entry.discount += itemDiscount;
      byPackage.set(name, entry);
    }
  }
  const all: PackageRevenue[] = Array.from(byPackage.entries()).map(([name, v], idx) => ({
    id: `pkg-${idx}`,
    packageName: name,
    categoryId: "all",
    saleType: "Bán mới",
    quantity: v.quantity,
    unitPrice: v.unitPrice,
    totalAmount: v.totalAmount,
    discount: v.discount,
    revenue: v.totalAmount - v.discount,
  }));
  const filtered = filterPackageRevenue(all, packageSaleTypeFilter, packageCategoryFilter);
  const { data, total } = paginate(filtered, page, pageSize);
  return { data, page, pageSize, total };
}

// ============================================
// View 7: Bán hàng — aggregate invoice items of type "product".
// ============================================
export function useSalesRevenueData(): {
  data: SalesRevenue[];
  total: ReturnType<typeof computeSalesRevenueTotal>;
} {
  const { data: raw } = useRawInvoices();
  const byProduct = new Map<string, { quantity: number; orderCount: number; unitPrice: number; totalAmount: number; discount: number; code: string }>();
  for (const inv of raw || []) {
    for (const it of inv.items || []) {
      if (it.type !== "product") continue;
      const name = it.name || "Sản phẩm";
      const price = Number(it.price ?? 0);
      const qty = Number(it.quantity ?? 1);
      const itemTotal = Number(it.total ?? price * qty);
      const itemDiscount = Number(it.discount ?? 0);
      const entry = byProduct.get(name) || { quantity: 0, orderCount: 0, unitPrice: price, totalAmount: 0, discount: 0, code: "" };
      entry.quantity += qty;
      entry.orderCount += 1;
      entry.unitPrice = price;
      entry.totalAmount += itemTotal;
      entry.discount += itemDiscount;
      byProduct.set(name, entry);
    }
  }
  const all: SalesRevenue[] = Array.from(byProduct.entries()).map(([name, v], idx) => ({
    id: `prd-${idx}`,
    productCode: v.code || `SP${String(idx + 1).padStart(4, "0")}`,
    productName: name,
    quantity: v.quantity,
    orderCount: v.orderCount,
    unitPrice: v.unitPrice,
    totalAmount: v.totalAmount,
    discount: v.discount,
    revenue: v.totalAmount - v.discount,
  }));
  const total = computeSalesRevenueTotal(all);
  return { data: all, total };
}
