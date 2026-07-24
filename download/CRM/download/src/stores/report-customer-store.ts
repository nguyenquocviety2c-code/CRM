import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import {
  CustomerViewMode,
  CustomerType,
  FrequencyUnit,
  CustomerInvoice,
  CustomerService,
  CustomerFrequency,
  CustomerSource,
} from "@/types/report-customer";
import {
  paginate,
  computeInvoiceSummary,
  filterCustomerByName,
  filterByCustomerType,
  computeFrequencyTotal,
  getChartData,
} from "@/lib/report-customer-utils";
import { useBranchStore } from "@/stores/branch-store";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

// ============================================
// Real Supabase data shapes (subset we use)
// ============================================
interface SupabaseInvoiceItem {
  name?: string;
  type?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  total?: number;
  staffName?: string;
  staffId?: string;
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
  customer_id?: string | null;
  staff_id?: string | null;
  customer?: {
    id?: string;
    name?: string;
    phone?: string | null;
    code?: string | null;
    source?: { id?: string; name?: string } | null;
    channel?: { id?: string; name?: string } | null;
  } | null;
  staff?: { id?: string; name?: string } | null;
  branch?: { id?: string; name?: string } | null;
  items?: SupabaseInvoiceItem[];
}

interface SupabaseCustomer {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  created_at: string;
  // Computed by the customers API: "old" if has any completed invoice, else "new".
  customer_type?: "old" | "new" | string;
  group_id?: string | null;
  group?: { id?: string; name?: string } | null;
  source_id?: string | null;
  source?: { id?: string; name?: string } | null;
  branch_id?: string | null;
}

interface SupabaseSource {
  id: string;
  name: string;
  active?: boolean;
  sort_order?: number | null;
}

interface SupabaseGroup {
  id: string;
  name: string;
  active?: boolean;
  sort_order?: number | null;
}

interface SupabaseStaff {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  active?: boolean;
  group?: { id?: string; name?: string } | null;
  branch?: { id?: string; name?: string } | null;
}

interface SupabaseServiceCategory {
  id: string;
  name: string;
  active?: boolean;
  sort_order?: number | null;
}

// ============================================
// Date helpers
// ============================================

// Convert "dd/MM/yyyy" → ISO date string "yyyy-MM-dd" for the API filter.
function ddmmyyyyToIso(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null;
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Convert ISO date string → "dd/MM/yyyy" for display (parses the YYYY-MM-DD
// part directly to avoid timezone shifts).
function isoToDdmmyyyy(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Get weekday short name (Mon, Tue, …) from an ISO date string.
// Parses the YYYY-MM-DDTHH:MM part directly to avoid timezone shifts.
function getWeekdayShort(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  let d: Date;
  if (m) {
    d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      m[4] ? Number(m[4]) : 0,
      m[5] ? Number(m[5]) : 0
    );
  } else {
    d = new Date(iso);
  }
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// Detect KOL/KOC customers based on their group name.
function isKolCustomer(c: SupabaseCustomer): boolean {
  const g = c.group?.name || "";
  return /kol|koc/i.test(g);
}

// ============================================
// State Interface
// ============================================
interface ReportCustomerState {
  // NOTE: branchId is NOT stored here — it comes from the global useBranchStore
  // (the BranchSelector in the header) so the report stays in sync with the
  // rest of the app. The data hooks below read it directly.
  dateFrom: string; // "dd/MM/yyyy"
  dateTo: string; // "dd/MM/yyyy"

  // View state
  viewMode: CustomerViewMode;

  // Pagination
  page: number;
  pageSize: number;

  // Filter state
  customerGroupFilter: string;
  customerNameSearch: string;
  staffFilter: string;
  serviceGroupFilter: string;
  customerTypeFilter: CustomerType | "all";
  frequencyUnit: FrequencyUnit;

  // Actions
  setDateRange: (from: string, to: string) => void;
  setViewMode: (mode: CustomerViewMode) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  setCustomerGroupFilter: (group: string) => void;
  setCustomerNameSearch: (search: string) => void;
  setStaffFilter: (staff: string) => void;
  setServiceGroupFilter: (group: string) => void;
  setCustomerTypeFilter: (type: CustomerType | "all") => void;
  setFrequencyUnit: (unit: FrequencyUnit) => void;
}

// Default dates: current month (1st → today) so real data shows up.
function defaultDateFrom(): string {
  const now = new Date();
  return `01/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}
function defaultDateTo(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

// ============================================
// Store
// ============================================
export const useReportCustomerStore = create<ReportCustomerState>((set) => ({
  // Filters — default to the current month so real data shows up.
  dateFrom: defaultDateFrom(),
  dateTo: defaultDateTo(),

  // View state
  viewMode: "invoice",

  // Pagination
  page: 1,
  pageSize: 20,

  // Filter state
  customerGroupFilter: "Tất cả khách hàng",
  customerNameSearch: "",
  staffFilter: "Chọn nhân viên",
  serviceGroupFilter: "Chọn nhóm dịch vụ",
  customerTypeFilter: "all",
  frequencyUnit: "day",

  // Actions
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo, page: 1 }),
  setViewMode: (viewMode) => set({ viewMode, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  setCustomerGroupFilter: (customerGroupFilter) =>
    set({ customerGroupFilter, page: 1 }),
  setCustomerNameSearch: (customerNameSearch) =>
    set({ customerNameSearch, page: 1 }),
  setStaffFilter: (staffFilter) => set({ staffFilter, page: 1 }),
  setServiceGroupFilter: (serviceGroupFilter) =>
    set({ serviceGroupFilter, page: 1 }),
  setCustomerTypeFilter: (customerTypeFilter) =>
    set({ customerTypeFilter, page: 1 }),
  setFrequencyUnit: (frequencyUnit) => set({ frequencyUnit }),
}));

// ============================================
// Raw data fetch hooks (React Query)
// ============================================

/**
 * Fetch all completed invoices within the selected date range + branch.
 * This is the single source of truth for all 4 customer views — each view
 * derives its own shape from this raw invoice list.
 */
function useRawInvoices() {
  const { dateFrom, dateTo } = useReportCustomerStore();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseInvoice[]>({
    queryKey: ["report-customer-invoices", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "completed");
      params.set("limit", "1000");
      const fromIso = ddmmyyyyToIso(dateFrom);
      const toIso = ddmmyyyyToIso(dateTo);
      if (fromIso) params.set("date_from", localDayStartUtc(fromIso));
      if (toIso) params.set("date_to", localDayEndUtc(toIso));
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/invoices?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseInvoice[]) || [];
    },
  });
}

/**
 * Fetch all customers (limit 500) for the selected branch — including
 * walk-in guests (include_guests=true) so their invoices are counted too.
 * Used to: enrich invoice rows with customer info (code, name, phone,
 * created_at, customer_type, group), count customers per source, etc.
 */
function useRawCustomers() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseCustomer[]>({
    queryKey: ["report-customer-customers", selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      params.set("include_guests", "true");
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/customers?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseCustomer[]) || [];
    },
  });
}

/**
 * Fetch customer sources (all). Used by the Source view to know which
 * sources exist (even if they have 0 customers/invoices in the period).
 */
function useRawSources() {
  return useQuery<SupabaseSource[]>({
    queryKey: ["report-customer-sources"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseSource[]) || [];
    },
  });
}

// ============================================
// Dropdown option hooks
// ============================================

/**
 * Customer group options for the "Nhóm khách hàng" dropdown in View 1.
 * Returns group names with the default "Tất cả khách hàng" first.
 */
export function useCustomerGroupOptions(): string[] {
  const { data } = useQuery<SupabaseGroup[]>({
    queryKey: ["report-customer-group-options"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-groups?active=true");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseGroup[]) || [];
    },
  });
  return ["Tất cả khách hàng", ...(data || []).map((g) => g.name)];
}

/**
 * Staff options for the "Nhân viên" dropdown in View 1.
 * Returns staff names with the default "Chọn nhân viên" first.
 */
export function useStaffOptions(): string[] {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const { data } = useQuery<SupabaseStaff[]>({
    queryKey: ["report-customer-staff-options", selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "200");
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/staff?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseStaff[]) || [];
    },
  });
  return ["Chọn nhân viên", ...(data || []).map((s) => s.name)];
}

/**
 * Service group options for the "Nhóm dịch vụ" dropdown in View 2.
 * Returns service category names with the defaults "Chọn nhóm dịch vụ" +
 * "Tất cả" first.
 */
export function useServiceGroupOptions(): string[] {
  const { data } = useQuery<SupabaseServiceCategory[]>({
    queryKey: ["report-customer-service-group-options"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories?active=true");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseServiceCategory[]) || [];
    },
  });
  return ["Chọn nhóm dịch vụ", "Tất cả", ...(data || []).map((c) => c.name)];
}

// ============================================
// View 1: Customer Invoice
// ============================================
/**
 * Build per-customer rows by aggregating invoices + customers.
 *
 * Filters applied:
 *   - customerTypeFilter (old/new/kol/all)
 *   - customerNameSearch (text match on customer name)
 *   - customerGroupFilter (matches customer's group name; "Tất cả khách hàng" = all)
 *   - staffFilter (matches any invoice's staff name; "Chọn nhân viên" = all)
 */
export function useCustomerInvoiceData(): {
  data: CustomerInvoice[];
  summary: ReturnType<typeof computeInvoiceSummary>;
  paginated: CustomerInvoice[];
  page: number;
  pageSize: number;
  total: number;
} {
  const {
    customerTypeFilter,
    customerNameSearch,
    customerGroupFilter,
    staffFilter,
    page,
    pageSize,
  } = useReportCustomerStore();
  const { data: rawInvoices } = useRawInvoices();
  const { data: rawCustomers } = useRawCustomers();

  // Build a customer-id → customer lookup.
  const customerMap = new Map<string, SupabaseCustomer>();
  for (const c of rawCustomers || []) customerMap.set(c.id, c);

  // Pre-compute the set of customer ids whose invoices were served by the
  // selected staff (used by the staffFilter). We match on BOTH the
  // invoice-level staff (`inv.staff.name`) AND any per-item staffName
  // (since the invoice-level staff_id is often null in this dataset —
  // staff is recorded per line item, not on the invoice itself).
  const staffCustomerIds = new Set<string>();
  if (staffFilter && staffFilter !== "Chọn nhân viên") {
    for (const inv of rawInvoices || []) {
      let servedByStaff = inv.staff?.name === staffFilter;
      if (!servedByStaff) {
        for (const it of inv.items || []) {
          if (it.staffName === staffFilter) {
            servedByStaff = true;
            break;
          }
        }
      }
      if (servedByStaff) {
        const cid = inv.customer_id || inv.customer?.id || "";
        if (cid) staffCustomerIds.add(cid);
      }
    }
  }

  // Pre-compute the set of customer ids belonging to the selected group.
  const groupCustomerIds = new Set<string>();
  if (customerGroupFilter && customerGroupFilter !== "Tất cả khách hàng") {
    for (const c of rawCustomers || []) {
      if (c.group?.name === customerGroupFilter) groupCustomerIds.add(c.id);
    }
  }

  // Group invoices by customer_id.
  const byCustomer = new Map<
    string,
    { customer: SupabaseCustomer | null; invoices: SupabaseInvoice[] }
  >();
  for (const inv of rawInvoices || []) {
    const cid = inv.customer_id || inv.customer?.id || "";
    if (!cid) continue; // skip invoices without a customer
    if (!byCustomer.has(cid)) {
      byCustomer.set(cid, {
        customer: customerMap.get(cid) || null,
        invoices: [],
      });
    }
    byCustomer.get(cid)!.invoices.push(inv);
  }

  // Map to CustomerInvoice rows.
  let all: CustomerInvoice[] = Array.from(byCustomer.entries()).map(
    ([cid, { customer, invoices }], idx) => {
      // Counts by item type.
      let serviceCount = 0;
      let productCount = 0;
      let buyPackageCount = 0;
      let usePackageCount = 0;
      let cardCount = 0;
      for (const inv of invoices) {
        for (const it of inv.items || []) {
          const type = (it.type || "").toLowerCase();
          const qty = Number(it.quantity ?? 1);
          switch (type) {
            case "service":
              serviceCount += qty;
              break;
            case "product":
              productCount += qty;
              break;
            case "package":
              buyPackageCount += qty;
              break;
            case "package_used":
            case "use_package":
              usePackageCount += qty;
              break;
            case "card":
            case "topup":
              cardCount += qty;
              break;
          }
        }
      }
      const discount = invoices.reduce(
        (s, i) => s + Number(i.discount ?? 0),
        0
      );
      const payment = invoices.reduce(
        (s, i) => s + Number(i.final_amount ?? 0),
        0
      );

      // Determine customerType:
      //   - If customer's group name contains KOL/KOC → 'kol'
      //   - Else if customer has completed invoices → 'old'
      //   - Else 'new'
      let customerType: CustomerType = "new";
      if (customer && isKolCustomer(customer)) {
        customerType = "kol";
      } else if (customer?.customer_type === "old") {
        customerType = "old";
      } else if (invoices.length > 0) {
        // Has at least one completed invoice in this period → 'old'.
        customerType = "old";
      }

      const fallbackCode = `KH${String(idx + 1).padStart(6, "0")}`;
      const fallbackName =
        invoices[0]?.customer?.name || customer?.name || "Khách lẻ";

      return {
        id: `cust-inv-${cid}`,
        // Tag the row id with the customer id so we can filter below without
        // adding a hidden field to the public type. The id is not displayed.
        customerCode: customer?.code || fallbackCode,
        customerName: customer?.name || fallbackName,
        phone: customer?.phone || invoices[0]?.customer?.phone || "",
        createdDate: customer ? isoToDdmmyyyy(customer.created_at) : "",
        customerType,
        invoiceCount: invoices.length,
        serviceCount,
        productCount,
        buyPackageCount,
        usePackageCount,
        cardCount,
        discount,
        payment,
        // TODO: integrate the /api/supabase/debts endpoint to compute
        // per-customer debt + debt payments. For now both are 0.
        debt: 0,
        debtPayment: 0,
      };
    }
  );

  // === Apply filters ===

  // Customer group filter — match by customer id via the pre-computed set.
  if (customerGroupFilter && customerGroupFilter !== "Tất cả khách hàng") {
    // The row id is `cust-inv-${cid}` — extract cid to test membership.
    all = all.filter((row) => {
      const cid = row.id.replace(/^cust-inv-/, "");
      return groupCustomerIds.has(cid);
    });
  }

  // Staff filter — match by customer id via the pre-computed set.
  if (staffFilter && staffFilter !== "Chọn nhân viên") {
    all = all.filter((row) => {
      const cid = row.id.replace(/^cust-inv-/, "");
      return staffCustomerIds.has(cid);
    });
  }

  // Customer type filter (old/new/kol/all).
  all = filterByCustomerType(all, customerTypeFilter);

  // Customer name search.
  all = filterCustomerByName(all, customerNameSearch);

  const summary = computeInvoiceSummary(all);
  const { data: paginated, total } = paginate(all, page, pageSize);
  return { data: all, summary, paginated, page, pageSize, total };
}

// ============================================
// View 2: Customer Service
// Aggregate invoice items where type='service' → group by name.
// ============================================
export function useCustomerServiceData(): {
  data: CustomerService[];
  paginated: CustomerService[];
  page: number;
  pageSize: number;
  total: number;
} {
  const { page, pageSize } = useReportCustomerStore();
  const { data: rawInvoices } = useRawInvoices();

  // Aggregate service items by name.
  // For each service name, track:
  //   - usageCount: total quantity (sum of item.quantity)
  //   - customerCount: distinct customers who used it
  //   - totalUsage: same as usageCount (the "đơn giá phụ" bonus is not
  //     stored per-item, so we mirror usageCount)
  const byService = new Map<
    string,
    { usageCount: number; customerIds: Set<string> }
  >();
  for (const inv of rawInvoices || []) {
    const custId = inv.customer_id || inv.customer?.id || "";
    for (const it of inv.items || []) {
      if ((it.type || "").toLowerCase() !== "service") continue;
      const name = it.name || "Dịch vụ";
      const qty = Number(it.quantity ?? 1);
      const entry = byService.get(name) || {
        usageCount: 0,
        customerIds: new Set<string>(),
      };
      entry.usageCount += qty;
      if (custId) entry.customerIds.add(custId);
      byService.set(name, entry);
    }
  }

  const all: CustomerService[] = Array.from(byService.entries()).map(
    ([name, v], idx) => ({
      id: `svc-${idx}`,
      serviceName: name,
      usageCount: v.usageCount,
      customerCount: v.customerIds.size,
      totalUsage: v.usageCount,
    })
  );

  // Sort by usageCount desc (most popular first) for a stable, useful order.
  all.sort((a, b) => b.usageCount - a.usageCount);

  const { data: paginated, total } = paginate(all, page, pageSize);
  return { data: all, paginated, page, pageSize, total };
}

// ============================================
// View 3: Customer Frequency
// Group invoices by weekday (Mon–Sun) → count distinct customers + sum revenue.
// ============================================
export function useCustomerFrequencyData(): {
  data: CustomerFrequency[];
  total: ReturnType<typeof computeFrequencyTotal>;
  chartData: ReturnType<typeof getChartData>;
} {
  const { data: rawInvoices } = useRawInvoices();

  // Weekday order: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDay = new Map<string, { customerIds: Set<string>; revenue: number }>();
  for (const d of order) byDay.set(d, { customerIds: new Set(), revenue: 0 });

  for (const inv of rawInvoices || []) {
    const wd = getWeekdayShort(inv.created_at);
    if (!wd || !byDay.has(wd)) continue;
    const entry = byDay.get(wd)!;
    const custId = inv.customer_id || inv.customer?.id || "";
    if (custId) entry.customerIds.add(custId);
    entry.revenue += Number(inv.final_amount ?? 0);
  }

  const frequencyData: CustomerFrequency[] = order.map((d) => ({
    id: `freq-${d.toLowerCase()}`,
    dayOfWeek: d,
    customerCount: byDay.get(d)!.customerIds.size,
    revenue: byDay.get(d)!.revenue,
  }));

  const total = computeFrequencyTotal(frequencyData);
  const chartData = getChartData(frequencyData);
  return { data: frequencyData, total, chartData };
}

// ============================================
// View 4: Customer Source
// For each customer source: count customers + aggregate invoices whose
// customer belongs to that source.
// ============================================
export function useCustomerSourceData(): {
  data: CustomerSource[];
  paginated: CustomerSource[];
  page: number;
  pageSize: number;
  total: number;
} {
  const { page, pageSize } = useReportCustomerStore();
  const { data: rawInvoices } = useRawInvoices();
  const { data: rawCustomers } = useRawCustomers();
  const { data: rawSources } = useRawSources();

  // Build customer-id → source_id map.
  // Priority: customer.source_id (from customer record) > invoice.customer.source.id
  // (the invoices API enriches customer.source from the booking's source).
  const customerSourceIdMap = new Map<string, string | null>();
  for (const c of rawCustomers || []) {
    customerSourceIdMap.set(c.id, c.source_id || c.source?.id || null);
  }

  // Per-source accumulators.
  const bySource = new Map<
    string,
    {
      customerIds: Set<string>;
      invoiceCount: number;
      packageCount: number;
      productCount: number;
      serviceCount: number;
      discount: number;
      revenue: number;
    }
  >();

  // Count customers per source (from rawCustomers, regardless of whether
  // they have an invoice in this period).
  const customersPerSource = new Map<string, Set<string>>();
  for (const c of rawCustomers || []) {
    const sid = customerSourceIdMap.get(c.id) || null;
    if (!sid) continue;
    if (!customersPerSource.has(sid))
      customersPerSource.set(sid, new Set());
    customersPerSource.get(sid)!.add(c.id);
  }

  // Aggregate invoices per source.
  for (const inv of rawInvoices || []) {
    const cid = inv.customer_id || inv.customer?.id || "";
    if (!cid) continue;
    // Determine source: customer.source_id first, then invoice's enriched
    // customer.source.id (from the booking).
    const sid =
      customerSourceIdMap.get(cid) ||
      inv.customer?.source?.id ||
      null;
    if (!sid) continue;
    if (!bySource.has(sid)) {
      bySource.set(sid, {
        customerIds: new Set(),
        invoiceCount: 0,
        packageCount: 0,
        productCount: 0,
        serviceCount: 0,
        discount: 0,
        revenue: 0,
      });
    }
    const entry = bySource.get(sid)!;
    entry.customerIds.add(cid);
    entry.invoiceCount += 1;
    entry.discount += Number(inv.discount ?? 0);
    entry.revenue += Number(inv.final_amount ?? 0);
    for (const it of inv.items || []) {
      const type = (it.type || "").toLowerCase();
      const qty = Number(it.quantity ?? 1);
      switch (type) {
        case "service":
          entry.serviceCount += qty;
          break;
        case "product":
          entry.productCount += qty;
          break;
        case "package":
          entry.packageCount += qty;
          break;
      }
    }
  }

  // Build rows — one per source (from rawSources). Sources with 0 customers
  // still appear with 0 values so the user sees the full picture.
  const all: CustomerSource[] = (rawSources || []).map((s) => {
    const agg = bySource.get(s.id);
    const customerSet = customersPerSource.get(s.id);
    return {
      id: `src-${s.id}`,
      sourceName: s.name,
      customerCount: customerSet?.size || 0,
      invoiceCount: agg?.invoiceCount || 0,
      packageCount: agg?.packageCount || 0,
      productCount: agg?.productCount || 0,
      serviceCount: agg?.serviceCount || 0,
      discount: agg?.discount || 0,
      revenue: agg?.revenue || 0,
    };
  });

  // Sort by revenue desc (most valuable sources first).
  all.sort((a, b) => b.revenue - a.revenue);

  const { data: paginated, total } = paginate(all, page, pageSize);
  return { data: all, paginated, page, pageSize, total };
}
