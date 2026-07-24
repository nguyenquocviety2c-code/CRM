import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import {
  StaffViewMode,
  RatingSubType,
  StaffCommission,
  StaffProductivity,
  StaffRating,
  StaffRevenue,
} from "@/types/report-staff";
import {
  paginate,
  computeCommissionSummary,
  computeProductivitySummary,
  computeRatingSummary,
  computeRevenueSummary,
  filterCommissionByGroup,
  filterProductivityByGroup,
  filterRatingByGroup,
  filterRevenueByGroup,
} from "@/lib/report-staff-utils";
import { useBranchStore } from "@/stores/branch-store";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

interface ReportStaffState {
  // Filters — branchId comes from the GLOBAL useBranchStore (shared with the
  // BranchSelector in the header), so it is NOT stored here. dateFrom/dateTo
  // default to the current month so real data shows up immediately.
  dateFrom: string; // "dd/MM/yyyy"
  dateTo: string;   // "dd/MM/yyyy"

  // View state
  viewMode: StaffViewMode;

  // Pagination
  page: number;
  pageSize: number;

  // Filter state
  staffGroupFilter: string;
  ratingSubType: RatingSubType;

  // Actions
  setDateRange: (from: string, to: string) => void;
  setViewMode: (mode: StaffViewMode) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  setStaffGroupFilter: (group: string) => void;
  setRatingSubType: (type: RatingSubType) => void;
}

// Default date range = current month (1st → today), mirroring the revenue
// report store so real completed invoices appear without manual date entry.
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `01/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const to = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  return { from, to };
}
const INITIAL_RANGE = currentMonthRange();

export const useReportStaffStore = create<ReportStaffState>((set) => ({
  // Filters
  dateFrom: INITIAL_RANGE.from,
  dateTo: INITIAL_RANGE.to,

  // View state
  viewMode: "commission",

  // Pagination
  page: 1,
  pageSize: 20,

  // Filter state
  staffGroupFilter: "Tất cả nhóm nhân viên",
  ratingSubType: "score",

  // Actions
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo, page: 1 }),
  setViewMode: (viewMode) => set({ viewMode, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  setStaffGroupFilter: (staffGroupFilter) => set({ staffGroupFilter, page: 1 }),
  setRatingSubType: (ratingSubType) => set({ ratingSubType }),
}));

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
}
interface SupabaseInvoice {
  id: string;
  code: string | null;
  created_at: string;
  final_amount: number;
  tip: number;
  status: string;
  items?: SupabaseInvoiceItem[];
}
interface SupabaseStaff {
  id: string;
  name: string;
  group?: { name?: string } | null;
}

/** Commission config from Supabase `commissions` table. Each row applies to
 *  either a specific staff (staff_id) or a group (group_id). commission_percent
 *  = percentage of serviceRevenue; fixed_amount = flat per-service fee. */
interface SupabaseCommission {
  id: string;
  staff_id: string | null;
  staff?: { id: string; name: string } | null;
  group_id: string | null;
  group?: { id: string; name: string } | null;
  service_type: string | null;
  commission_percent: number;
  fixed_amount: number;
  active: boolean;
}

/** Booking with nested services — used to count "customer-requested staff"
 *  (booking_services.staff_id) for the productivity view. */
interface SupabaseBookingService {
  staff_id: string | null;
  staff?: { id: string; name: string } | null;
  service?: { id: string; name: string; price?: number; duration?: number } | null;
}
interface SupabaseBooking {
  id: string;
  date_time: string;
  services: SupabaseBookingService[];
}

// Convert "dd/MM/yyyy" → ISO date string "yyyy-MM-dd" for the API filter.
function ddmmyyyyToIso(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null;
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ============================================
// Real data fetch — completed invoices + active staff
// ============================================

/**
 * Fetch all completed invoices within the selected date range + branch.
 * Single source of truth for all staff-report views. Re-runs when the global
 * branch or the date range changes.
 */
function useRawInvoices() {
  const { dateFrom, dateTo } = useReportStaffStore();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseInvoice[]>({
    queryKey: ["report-staff-invoices", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "completed");
      params.set("limit", "1000");
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
  });
}

/**
 * Fetch active staff for the selected branch, with their group name.
 * Used to (a) enrich per-staff rows with staffGroup, and (b) build the
 * group filter options.
 */
function useStaffList() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseStaff[]>({
    queryKey: ["report-staff-list", selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/staff?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseStaff[]) || [];
    },
  });
}

// ============================================
// Per-staff aggregation from real invoices
// ============================================
interface StaffAgg {
  staffName: string;
  staffGroup: string;
  serviceCount: number;
  serviceRevenue: number;
  tipTotal: number;
}

/**
 * Aggregate completed invoices into per-staff metrics. A staff member is
 * credited for an invoice when they performed at least one service item on it
 * (`items[].type === "service"` and `items[].staffName === staff.name`):
 *   - serviceCount  += the service item's quantity (≥1)
 *   - serviceRevenue += the service item's total (price × qty after item discount)
 *   - tipTotal      += the invoice's tip (Option A: full tip to every staff
 *                      who performed a service on that invoice — matches the
 *                      salon mental model where the customer tips whoever
 *                      served them; for the common single-staff invoice this
 *                      equals the actual tip).
 *
 * Staff group is enriched from the active staff list (fallback "—" when the
 * staff is no longer active or not found). Only staff with ≥1 service in the
 * period appear — staff who did nothing are omitted to keep the report useful.
 */
function aggregateStaff(
  invoices: SupabaseInvoice[],
  staffList: SupabaseStaff[]
): StaffAgg[] {
  // Build staffName → group map from the active staff list.
  const groupByName = new Map<string, string>();
  for (const s of staffList) {
    if (s.name) groupByName.set(s.name, s.group?.name || "—");
  }

  const agg = new Map<string, StaffAgg>();
  for (const inv of invoices) {
    const tip = Number(inv.tip ?? 0);
    const items = inv.items || [];
    // Staff who performed a service on THIS invoice (for tip attribution).
    const serviceStaffOnInv = new Set<string>();
    for (const it of items) {
      if (it.type !== "service") continue;
      const name = (it.staffName || "").trim();
      if (!name) continue;
      serviceStaffOnInv.add(name);
      const price = Number(it.price ?? 0);
      const qty = Number(it.quantity ?? 1);
      const itemTotal = Number(it.total ?? price * qty);
      const entry = agg.get(name) || { staffName: name, staffGroup: groupByName.get(name) || "—", serviceCount: 0, serviceRevenue: 0, tipTotal: 0 };
      entry.serviceCount += qty;
      entry.serviceRevenue += itemTotal;
      agg.set(name, entry);
    }
    // Attribute the invoice tip to every staff who did a service on it.
    if (tip > 0) {
      for (const name of serviceStaffOnInv) {
        const entry = agg.get(name);
        if (entry) entry.tipTotal += tip;
      }
    }
  }

  return Array.from(agg.values()).sort((a, b) => b.serviceRevenue - a.serviceRevenue);
}

/**
 * Group filter options derived from the active staff list (replaces the old
 * hardcoded mockStaffGroupOptions). Always includes "Tất cả nhóm nhân viên"
 * as the first option.
 */
export function useStaffGroupOptions(): string[] {
  const { data: staffList } = useStaffList();
  const groups = new Set<string>();
  for (const s of staffList || []) {
    const g = s.group?.name;
    if (g) groups.add(g);
  }
  return ["Tất cả nhóm nhân viên", ...Array.from(groups).sort()];
}

/**
 * Fetch commission configs from Supabase. Each row applies to either a
 * specific staff (staff_id) or a group (group_id). Used by the commission
 * view to compute serviceCommission = serviceRevenue × percent / 100
 * (or serviceCount × fixed_amount).
 */
function useCommissions() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseCommission[]>({
    queryKey: ["report-staff-commissions", selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/commissions?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseCommission[]) || [];
    },
  });
}

/**
 * Fetch bookings (with nested booking_services) within the date range.
 * Used by the productivity view to count "customer-requested staff" — i.e.
 * how many times a customer specifically requested this staff member for
 * their booking (booking_services.staff_id).
 */
function useRawBookings() {
  const { dateFrom, dateTo } = useReportStaffStore();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  return useQuery<SupabaseBooking[]>({
    queryKey: ["report-staff-bookings", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      const fromIso = ddmmyyyyToIso(dateFrom);
      const toIso = ddmmyyyyToIso(dateTo);
      if (fromIso) params.set("date_from", localDayStartUtc(fromIso));
      if (toIso) params.set("date_to", localDayEndUtc(toIso));
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseBooking[]) || [];
    },
  });
}

// ============================================
// Computed selectors (derive from real data)
// ============================================

export function useCommissionReportData(): {
  data: StaffCommission[];
  summary: ReturnType<typeof computeCommissionSummary>;
  page: number;
  pageSize: number;
  total: number;
} {
  const { staffGroupFilter, page, pageSize } = useReportStaffStore();
  const { data: invoices } = useRawInvoices();
  const { data: staffList } = useStaffList();
  const { data: commissions } = useCommissions();
  const agg = aggregateStaff(invoices || [], staffList || []);

  // Build commission lookup: staffName → { percent, fixed }.
  // A commission row may target a specific staff (staff_id → staff.name) or
  // a group (group_id → group.name). We match by staff name first, then fall
  // back to group name from the staff list.
  const staffNameToGroup = new Map<string, string>();
  for (const s of staffList || []) {
    if (s.name) staffNameToGroup.set(s.name, s.group?.name || "");
  }
  const commissionByStaffName = new Map<string, { percent: number; fixed: number }>();
  for (const c of commissions || []) {
    if (!c.active) continue;
    if (c.staff?.name) {
      // Staff-specific commission takes priority.
      commissionByStaffName.set(c.staff.name, {
        percent: Number(c.commission_percent) || 0,
        fixed: Number(c.fixed_amount) || 0,
      });
    }
  }
  // Group-level commission as fallback (only if no staff-specific one exists).
  for (const c of commissions || []) {
    if (!c.active || !c.group?.name) continue;
    const groupName = c.group.name;
    for (const s of staffList || []) {
      const sGroup = s.group?.name || "";
      if (sGroup === groupName && s.name && !commissionByStaffName.has(s.name)) {
        commissionByStaffName.set(s.name, {
          percent: Number(c.commission_percent) || 0,
          fixed: Number(c.fixed_amount) || 0,
        });
      }
    }
  }

  const all: StaffCommission[] = agg.map((a, idx) => {
    const config = commissionByStaffName.get(a.staffName) || { percent: 0, fixed: 0 };
    // Commission = max(percent-based, fixed-based). If percent > 0, use
    // serviceRevenue × percent / 100. If fixed > 0, use serviceCount × fixed.
    const percentBased = config.percent > 0 ? (a.serviceRevenue * config.percent) / 100 : 0;
    const fixedBased = config.fixed > 0 ? a.serviceCount * config.fixed : 0;
    const serviceCommission = Math.round(Math.max(percentBased, fixedBased));
    const extraBonus = a.tipTotal;
    return {
      id: `sc-${idx}`,
      staffGroup: a.staffGroup,
      staffName: a.staffName,
      serviceCommission,
      extraBonus,
      total: serviceCommission + extraBonus,
    };
  });
  const filtered = filterCommissionByGroup(all, staffGroupFilter);
  const { data, total } = paginate(filtered, page, pageSize);
  const summary = computeCommissionSummary(filtered);
  return { data, summary, page, pageSize, total };
}

export function useProductivityReportData(): {
  data: StaffProductivity[];
  summary: ReturnType<typeof computeProductivitySummary>;
  page: number;
  pageSize: number;
  total: number;
} {
  const { staffGroupFilter, page, pageSize } = useReportStaffStore();
  const { data: invoices } = useRawInvoices();
  const { data: staffList } = useStaffList();
  const { data: bookings } = useRawBookings();
  const agg = aggregateStaff(invoices || [], staffList || []);

  // Count "customer-requested staff" from bookings: each booking_service that
  // has a staff_id = the customer specifically requested that staff.
  // Aggregate count + estimated value (service.price) per staff name.
  const requestCountByName = new Map<string, number>();
  const requestValueByName = new Map<string, number>();
  for (const b of bookings || []) {
    for (const bs of b.services || []) {
      const name = bs.staff?.name;
      if (!name) continue;
      requestCountByName.set(name, (requestCountByName.get(name) || 0) + 1);
      const price = Number(bs.service?.price) || 0;
      requestValueByName.set(name, (requestValueByName.get(name) || 0) + price);
    }
  }

  const all: StaffProductivity[] = agg.map((a, idx) => ({
    id: `sp-${idx}`,
    staffName: a.staffName,
    staffGroup: a.staffGroup,
    serviceCount: a.serviceCount,
    customerRequestCount: requestCountByName.get(a.staffName) || 0,
    serviceValue: a.serviceRevenue,
    customerRequestValue: requestValueByName.get(a.staffName) || 0,
  }));
  const filtered = filterProductivityByGroup(all, staffGroupFilter);
  const { data, total } = paginate(filtered, page, pageSize);
  const summary = computeProductivitySummary(filtered);
  return { data, summary, page, pageSize, total };
}

export function useRatingReportData(): {
  data: StaffRating[];
  summary: ReturnType<typeof computeRatingSummary>;
  page: number;
  pageSize: number;
  total: number;
} {
  const { staffGroupFilter, page, pageSize } = useReportStaffStore();
  // No customer-rating data source exists yet in the system → empty (which is
  // real: zero reviews). The summary returns all-zero totals.
  const all: StaffRating[] = [];
  const filtered = filterRatingByGroup(all, staffGroupFilter);
  const { data, total } = paginate(filtered, page, pageSize);
  const summary = computeRatingSummary(filtered);
  return { data, summary, page, pageSize, total };
}

export function useRevenueReportData(): {
  data: StaffRevenue[];
  summary: ReturnType<typeof computeRevenueSummary>;
  page: number;
  pageSize: number;
  total: number;
} {
  const { staffGroupFilter, page, pageSize } = useReportStaffStore();
  const { data: invoices } = useRawInvoices();
  const { data: staffList } = useStaffList();
  const agg = aggregateStaff(invoices || [], staffList || []);
  // Revenue view: only service revenue + tip are tracked (the sale columns
  // were removed from the UI per spec). total = serviceRevenue + tipTotal.
  const all: StaffRevenue[] = agg.map((a, idx) => ({
    id: `sr-${idx}`,
    staffName: a.staffName,
    staffGroup: a.staffGroup,
    serviceCount: a.serviceCount,
    serviceRevenue: a.serviceRevenue,
    tipTotal: a.tipTotal,
    // Removed-from-UI columns kept at 0 for type/summary compatibility.
    serviceSaleCount: 0,
    productSaleCount: 0,
    productRevenue: 0,
    topupCount: 0,
    topupRevenue: 0,
    packageCount: 0,
    packageRevenue: 0,
    treatmentCount: 0,
    treatmentRevenue: 0,
    otherIncome: 0,
    otherCount: 0,
    total: a.serviceRevenue + a.tipTotal,
  }));
  const filtered = filterRevenueByGroup(all, staffGroupFilter);
  const { data, total } = paginate(filtered, page, pageSize);
  const summary = computeRevenueSummary(filtered);
  return { data, summary, page, pageSize, total };
}
