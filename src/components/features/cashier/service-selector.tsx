"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, PlusCircle, ChevronLeft, Columns3, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/lib/query-keys";
import { localDayToUtcRange, toVietnamDay, toVietnamTime } from "@/lib/utils";
import { useCashierStore, ItemType, InvoiceItem } from "@/stores/cashier-store";
import { useBranchStore } from "@/stores/branch-store";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";

interface ServiceItem {
  id: string;
  code: string;
  name: string;
  price: number;
  duration?: number;
  category?: { name: string } | null;
  categoryId?: string | null;
  branch_id?: string | null;
}

interface SupabaseService {
  id: string;
  code: string;
  name: string;
  price: number;
  active: boolean;
  duration?: number;
  category: { id: string; name: string } | null;
  branch_id?: string | null;
}

interface SupabaseServiceCategory {
  id: string;
  name: string;
  active: boolean;
  branches: string[];
}

interface SupabaseProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  active: boolean;
  category: { id: string; name: string } | null;
  product_type?: string | null;
}

interface SupabaseProductCategory {
  id: string;
  name: string;
  code?: string;
  active: boolean;
  sort_order?: number;
}

interface SupabasePackage {
  id: string;
  code: string;
  name: string;
  total_price: number;
  discount_price: number;
  active: boolean;
  category: { id: string; name: string } | null;
}

interface SupabaseStaff {
  id: string;
  name: string;
  group?: { name?: string } | null;
}

const tabs = [
  { id: "service" as ItemType, label: "Dịch vụ" },
  { id: "product" as ItemType, label: "Sản phẩm" },
  { id: "package" as ItemType, label: "Gói dịch vụ" },
];

// ID of the "Khách vãng lai" customer source. Used to create guest customer
// records for walk-in tabs (mirrors the booking dialog).
const WALKIN_SOURCE_ID = "779ddad6-01fa-4887-8647-134ce699d643";
const WALKIN_SOURCE_NAME = "Khách vãng lai";

export function ServiceSelector() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ItemType>("service");
  const [search, setSearch] = useState("");
  // Tab visibility — all 3 tabs visible by default. Unticking one in the
  // "Cột" dropdown hides it from the tab bar. If the active tab is hidden,
  // auto-switch to the first visible tab.
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({
    service: true,
    product: true,
    package: true,
  });
  const toggleTabVisible = (tabId: string) => {
    setVisibleTabs((prev) => {
      const next = { ...prev, [tabId]: prev[tabId] !== false ? false : true };
      // Don't allow hiding all tabs — keep at least 1 visible.
      const visibleCount = Object.values(next).filter(Boolean).length;
      if (visibleCount === 0) return prev;
      // If the active tab was just hidden, switch to the first visible one.
      if (next[tabId] === false && activeTab === tabId) {
        const firstVisible = tabs.find((t) => next[t.id] !== false);
        if (firstVisible) {
          setActiveTab(firstVisible.id);
          setSearch("");
          setExpandedServiceCategoryId(null);
          setExpandedProductCategoryId(null);
        }
      }
      return next;
    });
  };
  const {
    activeTabId,
    activeCustomers,
    addInvoiceItem,
    tabMeta,
    updateTabMeta,
    invoices,
  } = useCashierStore();
  // Resolve the active customer (for phone lookup in the existing-booking
  // confirmation check). activeCustomers is the list of open tabs; find the
  // one whose customerId matches activeTabId.
  const activeCustomer = activeCustomers.find(
    (c) => c.customerId === activeTabId
  );
  const { selectedBranchId } = useBranchStore();
  const { hasPermission } = useAuthStore();
  // Permission: can the logged-in staff assign employees to services?
  // If false, the staff dropdown is hidden and services are booked without
  // a specific staff assignment.
  const canAssignStaff = hasPermission("assign_staff");
  const queryClient = useQueryClient();
  // For the service tab: the currently-expanded service category (click a
  // category to drill into its services). null = show the category list.
  const [expandedServiceCategoryId, setExpandedServiceCategoryId] = useState<string | null>(null);
  // For the product tab: same drill-down idea. null = show the product-group
  // list; a group id = show that group's priced products.
  const [expandedProductCategoryId, setExpandedProductCategoryId] = useState<string | null>(null);

  // Dialog state: picking a service (in the service tab, after drilling into
  // a category) opens this dialog so the cashier can choose staff + date +
  // time. The service is only added to the invoice on OK.
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [addingFromDialog, setAddingFromDialog] = useState(false);
  const [dialogError, setDialogError] = useState<string>("");
  // True when this is the 2nd+ service on the tab — the date/time are derived
  // from the booking's START (parallel: all services start simultaneously) and
  // the date/time inputs are hidden in the dialog so the cashier only picks
  // the staff.
  const [isParallelService, setIsParallelService] = useState(false);
  // Existing-booking confirmation: when adding the first service to a draft
  // tab, if the customer (by phone) already has non-cancelled bookings, show
  // a confirmation prompt listing them. `skipExistingBookingsCheck` is set
  // true after the user confirms so the re-add skips the check.
  const [pendingExistingBookings, setPendingExistingBookings] = useState<
    Array<{ id: string; date: string; time: string; status: string; branchName: string; services: Array<{ name: string; staffName: string }> }>
  >([]);
  const [skipExistingBookingsCheck, setSkipExistingBookingsCheck] = useState(false);

  // Fetch services from Supabase
  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: queryKeys.services.list({ search, active: "true" }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "200");
      if (search) params.set("search", search);
      const res = await fetch(`/api/supabase/services?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return (json.data as SupabaseService[]).map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        price: s.price,
        duration: s.duration,
        category: s.category,
        categoryId: s.category?.id || null,
        branch_id: s.branch_id || null,
      }));
    },
    enabled: activeTab === "service",
  });

  // Fetch service categories (for the service tab's category drill-down).
  // Each category carries a `branches` array; we only show categories whose
  // branches include the selected store.
  const { data: serviceCategoriesData } = useQuery<SupabaseServiceCategory[]>({
    queryKey: ["cashier-service-categories", selectedBranchId],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories?active=true");
      const json = await res.json();
      return (json.data as SupabaseServiceCategory[]) || [];
    },
    enabled: activeTab === "service",
  });
  // Categories available at the selected store (or all when "all" stores).
  // Also filtered by the active tab's "Khách cũ" status so the cut categories
  // match the customer (mirrors the booking dialog):
  // - Khách cũ (old): hide "Dành cho khách hàng mới - DV Cắt", keep "Dịch Vụ Cắt".
  // - Not Khách cũ (new / walk-in / booking with a non-old customer): hide
  //   "Dịch Vụ Cắt", keep "Dành cho khách hàng mới - DV Cắt".
  // The real status (`customerType`) is fetched from the API when a tab is
  // opened; until it resolves we fall back to the tab-type heuristic.
  const activeTabMeta = activeTabId ? tabMeta[activeTabId] : undefined;
  const effectiveCustomerType: "old" | "new" = activeTabMeta?.customerType
    ? activeTabMeta.customerType
    : activeTabMeta?.type === "old"
      ? "old"
      : "new";
  const storeServiceCategories = (serviceCategoriesData || []).filter((c) => {
    if (selectedBranchId && selectedBranchId !== "all") {
      if (!(c.branches || []).includes(selectedBranchId)) return false;
    }
    const name = c.name.toLowerCase();
    const isNewCustomerCut = name.includes("dành cho khách hàng mới");
    const isRegularCut = name.includes("dịch vụ cắt") || name === "dịch vụ cắt";
    if (effectiveCustomerType === "new") {
      // Not a "Khách cũ": hide regular "Dịch Vụ Cắt", keep the new-customer cut.
      if (isRegularCut && !isNewCustomerCut) return false;
    } else {
      // "Khách cũ": hide the new-customer-only cut, keep regular "Dịch Vụ Cắt".
      if (isNewCustomerCut) return false;
    }
    return true;
  });
  // Services of the currently-expanded category (filtered by store too).
  const expandedCategoryServices = (servicesData || []).filter((s) => {
    if (!expandedServiceCategoryId) return false;
    if (s.categoryId !== expandedServiceCategoryId) return false;
    if (!selectedBranchId || selectedBranchId === "all") return true;
    // Services may store multiple branch ids comma-separated in branch_id.
    const svcBranches = (s.branch_id || "").split(",").map((x) => x.trim());
    return svcBranches.includes(selectedBranchId);
  });

  // Fetch staff list (for the service dialog). Mirrors the booking dialog:
  // only hairdresser groups are listed.
  const { data: staffData } = useQuery<SupabaseStaff[]>({
    queryKey: ["cashier-service-dialog-staff", selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId || selectedBranchId === "all") return [];
      const res = await fetch(
        `/api/supabase/staff?branch_id=${selectedBranchId}&active=true&limit=200`
      );
      const json = await res.json();
      if (!json.ok) return [];
      const hairdresserGroups = ["Artist", "Creative Director", "Master", "Junior"];
      return (json.data as SupabaseStaff[]).filter((s) => {
        const groupName = s.group?.name;
        return groupName && hairdresserGroups.includes(groupName);
      });
    },
  });
  const allStaff: SupabaseStaff[] = staffData || [];
  // Filter staff based on the selected service name:
  // - "Artist" in name → only Artist group.
  // - "Creative Director" in name → only Creative Director group.
  // - Otherwise → all hairdresser groups (Artist, Creative Director, Master, Junior).
  const staffList: SupabaseStaff[] = (() => {
    if (!selectedService) return allStaff;
    const svcName = (selectedService.name || "").toLowerCase();
    if (svcName.includes("creative director")) {
      return allStaff.filter((s) => s.group?.name === "Creative Director");
    }
    if (svcName.includes("artist")) {
      return allStaff.filter((s) => s.group?.name === "Artist");
    }
    return allStaff;
  })();

  // ------------------------------------------------------------------
  // Feasible-time computation for the service dialog (mirrors the booking
  // dialog's logic). When the user picks a staff + date + service, we fetch
  // the staff's existing non-cancelled bookings for that day and compute
  // which HH:MM start times would overlap with them. Hours with NO feasible
  // minute are hidden entirely in the TimePicker; otherwise only infeasible
  // minutes within an hour are hidden.
  // ------------------------------------------------------------------
  const [busyIntervals, setBusyIntervals] = useState<
    Record<string, { startMs: number; endMs: number }[]>
  >({});
  // Parse the dialog's date ("DD/MM/YYYY") + selected staff + service duration
  // to build a cache key for fetching busy intervals.
  const feasibleKey = useMemo(() => {
    if (!selectedStaffId || !selectedDate || !selectedService) return "";
    const m = selectedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    return `${selectedStaffId}|${m[3]}-${m[2]}-${m[1]}`;
  }, [selectedStaffId, selectedDate, selectedService]);

  useEffect(() => {
    if (!feasibleKey || busyIntervals[feasibleKey] !== undefined) return;
    let cancelled = false;
    (async () => {
      const [staffId, isoDay] = feasibleKey.split("|");
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "200");
      // Timezone-safe: isoDay is a Vietnam calendar day (from the dialog's
      // DD/MM/YYYY date). Convert to its UTC range so Supabase filters by
      // the correct UTC window (no 7-hour shift).
      const busyDayRange = localDayToUtcRange(isoDay);
      params.set("date_from", busyDayRange.from);
      params.set("date_to", busyDayRange.to);
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      try {
        const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
        const json = await res.json();
        if (!json.ok || cancelled) return;
        const bookings = json.data || [];
        const intervals: { startMs: number; endMs: number }[] = [];
        for (const b of bookings) {
          if (b.status === "cancelled" || b.status === "no_show") continue;
          const exStart = new Date(b.date_time as string).getTime();
          if (isNaN(exStart)) continue;
          for (const s of (b.services as Array<Record<string, unknown>>) || []) {
            if (s.staff_id !== staffId) continue;
            const dur = (Number(s.duration) || Number((s.service as { duration?: number } | null)?.duration) || 60) * 60 * 1000;
            intervals.push({ startMs: exStart, endMs: exStart + dur });
          }
        }
        if (!cancelled) {
          setBusyIntervals((prev) => ({ ...prev, [feasibleKey]: intervals }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [feasibleKey, selectedBranchId, busyIntervals]);

  // Compute hiddenHours + hiddenMinutes for the TimePicker in the dialog.
  const timeFeasibility = useMemo(() => {
    const empty = { hiddenHours: new Set<string>(), hiddenMinutes: {} as Record<string, Set<string>> };
    if (!feasibleKey || !selectedService) return empty;
    const intervals = busyIntervals[feasibleKey];
    if (!intervals || intervals.length === 0) return empty;
    // Service duration from the selected service (default 60 min).
    const durationMs = (Number(selectedService.duration) || 60) * 60 * 1000;
    if (durationMs <= 0) return empty;
    const m = selectedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return empty;
    // Use the +07:00 offset so dayBase is the correct UTC instant for VN
    // midnight. Date.UTC treats VN hours as UTC → 7-hour offset → the
    // feasibility check would never match existing bookings (they're stored
    // with the correct +07:00 offset, so their epoch ms is 7 hours off from
    // a Date.UTC-based dayBase).
    const dayBase = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+07:00`).getTime();
    if (isNaN(dayBase)) return empty;
    const hiddenHours = new Set<string>();
    const hiddenMinutes: Record<string, Set<string>> = {};
    const hourHasFeasible: Record<string, boolean> = {};
    for (let h = 0; h < 24; h++) hourHasFeasible[String(h).padStart(2, "0")] = false;
    for (let min = 0; min < 60 * 24; min++) {
      const startMs = dayBase + min * 60 * 1000;
      const endMs = startMs + durationMs;
      const overlaps = intervals.some((iv) => startMs < iv.endMs && iv.startMs < endMs);
      const hStr = String(Math.floor(min / 60)).padStart(2, "0");
      const mStr = String(min % 60).padStart(2, "0");
      if (overlaps) {
        if (!hiddenMinutes[hStr]) hiddenMinutes[hStr] = new Set<string>();
        hiddenMinutes[hStr].add(mStr);
      } else {
        hourHasFeasible[hStr] = true;
      }
    }
    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, "0");
      if (!hourHasFeasible[hStr]) hiddenHours.add(hStr);
    }
    return { hiddenHours, hiddenMinutes };
  }, [feasibleKey, busyIntervals, selectedService, selectedDate]);

  // Fetch products from Supabase — only show products with price > 0 AND
  // product_type = "trading" (Sản phẩm kinh doanh). Products marked as
  // "consumption" (Sản phẩm tiêu thụ) are internal-use only and hidden
  // from the cashier's product selector.
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: queryKeys.products.list({ search, active: "true" }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "200");
      if (search) params.set("search", search);
      const res = await fetch(`/api/supabase/products?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return (json.data as SupabaseProduct[])
        .filter((p) => p.price > 0 && (p.product_type || "trading") === "trading")
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          price: p.price,
          category: p.category,
        }));
    },
    enabled: activeTab === "product",
  });

  // Fetch product categories/groups (for the product tab's group drill-down).
  // Product categories are NOT branch-scoped (unlike service categories), so
  // no branch filtering is needed here.
  const { data: productCategoriesData } = useQuery<SupabaseProductCategory[]>({
    queryKey: ["cashier-product-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/product-categories?active=true");
      const json = await res.json();
      return (json.data as SupabaseProductCategory[]) || [];
    },
    enabled: activeTab === "product",
  });
  // Product groups that contain AT LEAST ONE trading product with price > 0.
  // (Groups with only 0đ or consumption-only products are hidden.)
  const pricedProductCategories = (productCategoriesData || []).filter((cat) =>
    (productsData || []).some(
      (p) => p.category?.id === cat.id && Number(p.price) > 0
    )
  );
  // Products of the currently-expanded product group (already price > 0 from
  // the queryFn filter, but kept explicit for safety/self-documenting).
  const expandedCategoryProducts = (productsData || []).filter((p) => {
    if (!expandedProductCategoryId) return false;
    if (p.category?.id !== expandedProductCategoryId) return false;
    return Number(p.price) > 0;
  });

  // Fetch packages from Supabase
  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: queryKeys.packages.list({ search, active: "true" }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "200");
      if (search) params.set("search", search);
      const res = await fetch(`/api/supabase/packages?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return (json.data as SupabasePackage[]).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        price: p.discount_price || p.total_price,
        category: p.category,
      }));
    },
    enabled: activeTab === "package",
  });

  const items: ServiceItem[] =
    activeTab === "service"
      ? servicesData || []
      : activeTab === "product"
        // Only show products with a price > 0 (hide 0đ products — they are
        // typically accessories/consumables not for sale, per the business rule
        // that mirrors the booking invoice dialog's product picker).
        ? (productsData || []).filter((p) => Number(p.price) > 0)
        : packagesData || [];

  const isLoading =
    activeTab === "service"
      ? servicesLoading
      : activeTab === "product"
        ? productsLoading
        : packagesLoading;

  const handleAddItem = (
    item: ServiceItem,
    opts?: { staffName?: string; date?: string; time?: string }
  ) => {
    if (!activeTabId) return;
    const invoiceItem: InvoiceItem = {
      id: `${item.id}-${crypto.randomUUID()}`,
      itemId: item.id,
      name: item.name,
      type: activeTab,
      price: Number(item.price),
      quantity: 1,
      discount: 0,
      total: Number(item.price),
      staffName: opts?.staffName,
      date: opts?.date,
      time: opts?.time,
    };
    addInvoiceItem(activeTabId, invoiceItem);
  };

  // Clicking a service in the service tab opens the staff/date/time dialog.
  const handleServiceClick = (item: ServiceItem) => {
    setSelectedService(item);
    setSelectedStaffId("");
    setDialogError("");
    const meta = activeTabId ? tabMeta[activeTabId] : undefined;
    // Service 2+: the tab already has a booking with at least one service.
    // PARALLEL model: default the date/time to the BOOKING's START time (the
    // 1st service's start), NOT the 1st service's end. All services in a
    // booking run simultaneously (each on a different staff). The date/time
    // inputs are hidden in the dialog when isParallelService is true — the
    // cashier only picks the staff.
    //
    // Resilience: `lastServiceStartMs` may be missing when the tabMeta was
    // persisted by an OLDER code version (before this field was added) and
    // the tab was re-opened (the customer-tabs setup only runs once per tab
    // id). In that case, fall back to computing the start from the first
    // service item's date/time fields (stored on the invoice item when the
    // service was added). This ensures the 2nd-service dialog ALWAYS hides
    // the date/time inputs when there's already ≥1 service on the tab.
    const hasExistingService =
      meta?.bookingCreated &&
      (meta.lastServiceStartMs != null ||
        (activeTabId && (invoices[activeTabId]?.items || []).some((it) => it.type === "service")));
    if (hasExistingService) {
      // Prefer the stored start ms; fall back to the first service item's
      // date/time; fall back to the booking's date_time (meta doesn't carry
      // it directly, so the service item fields are the practical fallback).
      let startMs = meta?.lastServiceStartMs;
      if (!startMs) {
        // Derive from the first service item's date ("DD/MM/YYYY") + time
        // ("HH:MM") fields — these are set when the service is added.
        const firstService = (invoices[activeTabId]?.items || []).find(
          (it) => it.type === "service"
        );
        if (firstService?.date && firstService?.time) {
          const m = firstService.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          const tm = firstService.time.match(/^(\d{1,2}):(\d{2})$/);
          if (m && tm) {
            const isoDayFallback = `${m[3]}-${m[2]}-${m[1]}`;
            startMs = new Date(`${isoDayFallback}T${tm[1].padStart(2, "0")}:${tm[2]}:00+07:00`).getTime();
          }
        }
      }
      if (startMs) {
        const vnDay = toVietnamDay(startMs); // "YYYY-MM-DD"
        const vnTime = toVietnamTime(startMs); // "HH:MM"
        const [, mo, d] = vnDay.split("-");
        const y = vnDay.split("-")[0];
        setSelectedDate(`${d}/${mo}/${y}`);
        setSelectedTime(vnTime);
      }
      setIsParallelService(true);
    } else {
      // First service on this tab → default date = today. Time is left EMPTY
      // so the cashier can choose: pick a staff + time to create a booking in
      // Lịch hẹn, or leave them empty to just add the service to the invoice
      // (no booking). See handleDialogConfirm for the conditional logic.
      const now = new Date();
      const d = String(now.getDate()).padStart(2, "0");
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const y = now.getFullYear();
      setSelectedDate(`${d}/${m}/${y}`);
      setSelectedTime("");
      setIsParallelService(false);
    }
    setServiceDialogOpen(true);
  };

  // OK on the service dialog: ALWAYS adds the service to the invoice. A booking
  // in Lịch hẹn is created/updated ONLY when the cashier selected BOTH a staff
  // AND a time — otherwise the service is just a line item (no appointment).
  // When syncing to Lịch hẹn:
  // - First service on a draft tab → create a new booking (POST).
  // - Second+ service: gap ≤ 15 min → add to the SAME booking (PUT);
  //   gap > 15 min → create a SEPARATE booking (POST).
  const handleDialogConfirm = async () => {
    if (!activeTabId || !selectedService) return;
    setDialogError("");
    const meta = activeTabId ? tabMeta[activeTabId] : undefined;
    const staff = selectedStaffId ? staffList.find((s) => s.id === selectedStaffId) : null;
    const staffName = staff?.name;

    // Booking-sync rule: a Lịch hẹn entry is created/updated ONLY when the
    // cashier has selected BOTH a staff AND a time. If either is missing, the
    // service is still added to the invoice (the cashier can checkout without
    // an appointment), but no booking is created in the Lịch hẹn module.
    // This lets the cashier quickly ring up a walk-in product/service sale
    // without scheduling, while still syncing to Lịch hẹn when a real
    // appointment is booked.
    const shouldSyncBooking = !!(selectedStaffId && selectedDate && selectedTime);

    const newCustomerCutCategoryId = "4cb10a73-cc13-496a-baf2-e060ebfa02f8";
    const isNewCustomerCut =
      (selectedService.categoryId || "") === newCustomerCutCategoryId;
    const meta0 = activeTabId ? tabMeta[activeTabId] : undefined;
    const excludeBookingId = meta0?.bookingId || "";
    const phone0 = activeCustomer?.phone?.trim() || "";

    // The new-customer-cut one-time-offer check and the existing-bookings
    // confirmation prompt only apply when we're actually creating a booking.
    // If the cashier is just adding a line item (no staff/time), skip them.
    if (shouldSyncBooking) {
      // 0. One-time offer check: "Dành cho khách hàng mới - DV Cắt" can only be
      //    booked ONCE per phone.
      if (isNewCustomerCut && phone0) {
        try {
          const excludeParam = excludeBookingId
            ? `&excludeBookingId=${encodeURIComponent(excludeBookingId)}`
            : "";
          const checkRes = await fetch(
            `/api/supabase/bookings/check-new-customer-cut?phone=${encodeURIComponent(phone0)}${excludeParam}`
          );
          const checkJson = await checkRes.json();
          if (checkJson.ok && checkJson.data?.exists) {
            const d = checkJson.data;
            // Detailed "cannot book" message — identifies the blocking booking
            // precisely (customer, service, staff, date+time, branch, status)
            // so the cashier understands which existing appointment is blocking
            // the new one. The status is key: a "checkout" (paid) booking no
            // longer appears in the active booking list, so without the status
            // the cashier would think the customer has no booking at all.
            const custName = d.existingCustomerName || "(khách không rõ)";
            const svcName = d.existingServiceName || "Dành cho khách hàng mới - DV Cắt";
            const staffName = d.existingStaffName || "(chưa phân thợ)";
            const dateStr = d.existingDate || "—";
            const timeStr = d.existingTime || "—";
            const branchStr = d.existingBranchName ? `\n• Chi nhánh: ${d.existingBranchName}` : "";
            const statusLabel: Record<string, string> = {
              pending: "Chờ xác nhận",
              confirmed: "Đã xác nhận",
              checkout: "Đã thanh toán",
              cancelled: "Đã huỷ",
              no_show: "Không đến",
            };
            const statusStr = d.existingStatus
              ? `\n• Trạng thái: ${statusLabel[d.existingStatus] || d.existingStatus}`
              : "";
            setDialogError(
              `Không thể đặt lịch vì khách hàng "${custName}" đã có một lịch "${svcName}" đã đặt trước đó.\n` +
              `• Thợ: ${staffName}\n` +
              `• Ngày giờ: ${dateStr} lúc ${timeStr}${branchStr}${statusStr}\n` +
              `Lưu ý: ưu đãi "Dành cho khách hàng mới" chỉ được đặt 1 lần. Vui lòng huỷ/chỉnh sửa lịch cũ hoặc chọn nhóm dịch vụ khác.`
            );
            return;
          }
        } catch {
          /* best-effort — don't block on network errors */
        }
      }

      // 0b. Existing-booking confirmation: when adding the FIRST service to a
      //     draft tab (about to create a new booking), check if the customer
      //     already has non-cancelled bookings. If so, show a confirmation
      //     prompt. Skipped for service 2+ and after the user confirms.
      const isFirstServiceOnTab = !(meta0?.bookingCreated && meta0?.bookingId);
      if (isFirstServiceOnTab && !skipExistingBookingsCheck && phone0) {
        try {
          const existRes = await fetch(
            `/api/supabase/bookings/by-phone?phone=${encodeURIComponent(phone0)}`
          );
          const existJson = await existRes.json();
          if (existJson.ok && Array.isArray(existJson.data) && existJson.data.length > 0) {
            setPendingExistingBookings(existJson.data);
            return; // stop — the confirmation UI takes over
          }
        } catch {
          /* best-effort */
        }
      }
    }

    setAddingFromDialog(true);
    try {
      // Clamp the selected time to business hours (08:30 - 19:30) BEFORE using
      // it. The TimePicker's dropdown only shows 08-19, but the user can TYPE
      // any time directly into the input. The TimePicker's onBlur handler
      // clamps too, but it may NOT fire when the user clicks OK (the button
      // click doesn't blur the input in all cases). This clamp is the
      // client-side safety net; the server also validates.
      if (selectedTime) {
        const tm = selectedTime.match(/^(\d{1,2}):(\d{2})$/);
        if (tm) {
          let h = parseInt(tm[1], 10);
          let m = parseInt(tm[2], 10);
          if (!isNaN(h) && !isNaN(m)) {
            const totalMin = h * 60 + m;
            const OPEN_MIN = 8 * 60 + 30;
            const CLOSE_MIN = 19 * 60 + 30;
            if (totalMin < OPEN_MIN) { h = 8; m = 30; }
            else if (totalMin > CLOSE_MIN) { h = 19; m = 30; }
            const clamped = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            if (clamped !== selectedTime) {
              setSelectedTime(clamped);
              // Show a toast so the cashier knows the time was adjusted.
              toast({
                title: "Đã điều chỉnh giờ",
                description: `Giờ ngoài khung làm việc, đã đặt lại thành ${clamped}`,
              });
            }
          }
        }
      }

      // 1) Always add the invoice item so the cashier sees the line immediately.
      //    staffName/date/time are passed through (may be empty when the cashier
      //    chose not to schedule — that's fine, the line still shows on the invoice).
      handleAddItem(selectedService, {
        staffName,
        date: selectedDate,
        time: selectedTime,
      });

      // If the cashier didn't select both a staff AND a time, we do NOT create
      // or update a booking in Lịch hẹn. The service is just a line item on
      // the invoice. Close the dialog and return.
      if (!shouldSyncBooking) {
        setSelectedService(null);
        setSelectedStaffId("");
        setServiceDialogOpen(false);
        setAddingFromDialog(false);
        return;
      }

      const meta = tabMeta[activeTabId];
      // Compute the new service's start time in epoch ms.
      const m = selectedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const tm = selectedTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!m || !tm) throw new Error("Ngày hoặc giờ không hợp lệ");
      // Compute the new service's start time in epoch ms. MUST use the +07:00
      // offset so the epoch represents the correct UTC instant for the VN
      // wall-clock time (see createBookingForTab for the full explanation).
      const isoDayForStart = `${m[3]}-${m[2]}-${m[1]}`;
      const newStartMs = new Date(`${isoDayForStart}T${tm[1].padStart(2, "0")}:${tm[2]}:00+07:00`).getTime();
      const durationMin = Number(selectedService.duration) || 60;
      const newEndMs = newStartMs + durationMin * 60 * 1000;

      // Staff conflict check (client-side, mirrors the server-side check):
      // the TimePicker hides busy minutes, but the user can TYPE a time
      // directly and bypass the dropdown. This explicit check fires right
      // before the booking is created/updated, fetching the conflicting
      // booking's details so the cashier sees WHICH existing appointment is
      // blocking (code, customer, service, full time range, branch, status).
      // The server still rejects as a safety net; this just gives a richer
      // message without a round-trip to the 400 handler.
      if (selectedStaffId && selectedService) {
        try {
          const params = new URLSearchParams();
          params.set("page", "1");
          params.set("limit", "200");
          const dl = localDayToUtcRange(isoDayForStart);
          params.set("date_from", dl.from);
          params.set("date_to", dl.to);
          if (selectedBranchId) params.set("branch_id", selectedBranchId);
          const cfRes = await fetch(`/api/supabase/bookings?${params.toString()}`);
          const cfJson = await cfRes.json();
          if (cfJson.ok) {
            const exList = (cfJson.data || []) as Array<Record<string, unknown>>;
            for (const ex of exList) {
              if (ex.status === "cancelled" || ex.status === "no_show") continue;
              // When editing a booking in this tab, skip that booking itself.
              if (meta?.bookingId && ex.id === meta.bookingId) continue;
              const exStart = new Date(String(ex.date_time || "")).getTime();
              if (isNaN(exStart)) continue;
              const exServices = (ex.services || []) as Array<{
                staff_id?: string | null;
                staff?: { name?: string } | null;
                service?: { duration?: number; name?: string } | null;
              }>;
              for (const exSvc of exServices) {
                if (exSvc.staff_id !== selectedStaffId) continue;
                const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                const exEnd = exStart + exDur;
                if (newStartMs < exEnd && exStart < newEndMs) {
                  const staffName = exSvc.staff?.name || (staffList.find((s) => s.id === selectedStaffId)?.name) || "nhân viên";
                  const svcName = exSvc.service?.name || "Dịch vụ";
                  const exDurationMin = Math.round(exDur / 60000);
                  const exTimeStr = toVietnamTime(exStart);
                  const exEndTimeStr = toVietnamTime(exEnd);
                  const nsTimeStr = toVietnamTime(newStartMs);
                  const nsEndTimeStr = toVietnamTime(newEndMs);
                  const exDateStr = isoDayForStart.split("-").reverse().join("/");
                  const exCode = (ex.code as string) || "";
                  const exCustName = (ex.customer as { name?: string } | null)?.name || "";
                  const exBranchName = (ex.branch as { name?: string } | null)?.name || "";
                  const statusLabel: Record<string, string> = {
                    pending: "Chờ xác nhận",
                    confirmed: "Đã xác nhận",
                    checkin: "Đang phục vụ",
                    checkout: "Đã thanh toán",
                    cancelled: "Đã huỷ",
                    no_show: "Không đến",
                  };
                  const exStatusLabel = ex.status
                    ? statusLabel[String(ex.status)] || String(ex.status)
                    : "";
                  const codeLine = exCode ? `Lịch ${exCode}` : "Một lịch đã đặt trước đó";
                  const custLine = exCustName ? `• Khách: ${exCustName}\n` : "";
                  const branchLine = exBranchName ? `• Chi nhánh: ${exBranchName}\n` : "";
                  const statusLine = exStatusLabel ? `• Trạng thái: ${exStatusLabel}\n` : "";
                  setDialogError(
                    `Không thể đặt lịch vì trùng thời gian với một lịch đã đặt trước đó.\n` +
                    `${codeLine}:\n` +
                    custLine +
                    `• Thợ: ${staffName}\n` +
                    `• Dịch vụ: ${svcName} (${exDurationMin} phút)\n` +
                    `• Thời gian: ${exTimeStr} - ${exEndTimeStr} ngày ${exDateStr}\n` +
                    branchLine +
                    statusLine +
                    `→ Trùng với dịch vụ mới bạn đang đặt (${nsTimeStr} - ${nsEndTimeStr} ngày ${exDateStr}). ` +
                    `Vui lòng chọn khung giờ hoặc thợ khác.`
                  );
                  setAddingFromDialog(false);
                  return;
                }
              }
            }
          }
        } catch {
          /* best-effort — server still validates */
        }
      }

      if (meta && !meta.bookingCreated) {
        // First service on a draft tab → create a new booking.
        await createBookingForTab({
          tabId: activeTabId,
          meta,
          service: selectedService,
          staffId: selectedStaffId,
          date: selectedDate,
          time: selectedTime,
        });
        // createBookingForTab stores bookingId + bookingServices + lastServiceEndMs.
      } else if (meta && meta.bookingCreated && meta.bookingId) {
        // Second+ service: decide same-booking (PUT) vs new-booking (POST).
        // PARALLEL model: the gap is measured against the BOOKING's START time
        // (lastServiceStartMs), NOT the last service's end. All services in a
        // booking start at the same time — so if the new service's start is
        // within ±15 min of the booking's start, it joins the same booking.
        // A service 2+ hours later → separate booking (POST).
        const GAP_TOLERANCE_MS = 15 * 60 * 1000; // 15 minutes
        const bookingStart = meta.lastServiceStartMs || meta.lastServiceEndMs || 0;
        const gap = newStartMs - bookingStart;
        if (gap >= -GAP_TOLERANCE_MS && gap <= GAP_TOLERANCE_MS) {
          // Gap ≤ 15 min → add to the SAME booking (PUT).
          const newServiceEntry = {
            service_id: selectedService.id,
            staff_id: selectedStaffId,
            service_category_id: selectedService.categoryId || null,
          };
          const updatedServices = [
            ...(meta.bookingServices || []),
            newServiceEntry,
          ];
          const putRes = await fetch(`/api/supabase/bookings/${meta.bookingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ services: updatedServices }),
          });
          const putJson = await putRes.json();
          if (!putJson.ok) {
            throw new Error(putJson.error || "Không thể cập nhật lịch hẹn");
          }
          // Update tabMeta with the new service. Keep lastServiceStartMs
          // pointing at the booking's start (all services share it in the
          // parallel model); update lastServiceEndMs for the max-end tracking.
          updateTabMeta(activeTabId, {
            bookingServices: updatedServices,
            lastServiceEndMs: Math.max(meta.lastServiceEndMs || 0, newEndMs),
            // lastServiceStartMs stays the same (booking's start) — the new
            // service runs in parallel, not consecutively.
          });
        } else {
          // Gap > 15 min → create a SEPARATE booking (POST).
          await createBookingForTab({
            tabId: activeTabId,
            meta,
            service: selectedService,
            staffId: selectedStaffId,
            date: selectedDate,
            time: selectedTime,
            forceNew: true,
          });
        }
      }
      // For "booking" type tabs (opened from the day's list), the booking
      // already exists. If bookingId is set, apply the same gap logic.
      // (Handled by the meta.bookingCreated + meta.bookingId branch above
      // since handlePickBooking sets bookingCreated=true + bookingId.)

      queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setServiceDialogOpen(false);
      setSelectedService(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể thêm dịch vụ";
      setDialogError(msg);
    } finally {
      setAddingFromDialog(false);
    }
  };

  // Create a booking in Supabase for the current draft tab. Walk-in tabs get
  // a guest customer; "new" tabs create the real customer record first; "old"
  // tabs reuse the existing customer_id. After success, the tab's metadata is
  // updated with bookingId + bookingServices + lastServiceEndMs so subsequent
  // service adds can decide same-booking (PUT) vs new-booking (POST).
  // When forceNew is true, the customer creation steps are skipped (the
  // customer was already created for the first booking on this tab).
  const createBookingForTab = async (args: {
    tabId: string;
    meta: NonNullable<typeof tabMeta[string]>;
    service: ServiceItem;
    staffId: string;
    date: string; // "DD/MM/YYYY"
    time: string; // "HH:MM"
    forceNew?: boolean;
  }) => {
    const { tabId, meta, service, staffId, date, time, forceNew } = args;
    let customerId = meta.customerId;
    let sourceId = meta.customerInfo?.sourceId;
    const channelId = meta.customerInfo?.channelId;
    const numberOfCustomers = meta.customerInfo?.numberOfCustomers ?? 1;
    const note = meta.customerInfo?.note ?? "";

    // When forceNew (creating a 2nd+ booking for the same tab because the gap
    // > 15 min), skip customer creation — the customer already exists from the
    // first booking. For "booking" type tabs, also skip (booking already has
    // a customer).
    //
    // ALSO skip when meta.customerId is already set — this happens when the
    // cashier clicked "Thêm khách mới" (which creates the customer via
    // handleAddNewCustomer and stores the id in tabMeta) but the tab's `type`
    // is still "walkin" (handleAddNewCustomer doesn't change the type). Without
    // this check, createBookingForTab would create a DUPLICATE "Khách vãng lai"
    // guest customer, ignoring the real customer the cashier just created →
    // the booking would be linked to the wrong customer and might not appear
    // in Lịch hẹn correctly.
    if (!forceNew && meta.type !== "booking" && !customerId) {
      if (meta.type === "walkin") {
        const custRes = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: WALKIN_SOURCE_NAME,
            phone: "",
            source_id: WALKIN_SOURCE_ID,
            branch_id: selectedBranchId || null,
          }),
        });
        const custJson = await custRes.json();
        if (!custJson.ok || !custJson.data?.id) {
          throw new Error(custJson.error || "Không thể tạo khách vãng lai");
        }
        customerId = custJson.data.id;
        sourceId = WALKIN_SOURCE_ID;
      } else if (meta.type === "new") {
        const custRes = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: meta.customerInfo?.name || "Khách mới",
            phone: meta.customerInfo?.phone || "",
            source_id: sourceId || null,
            branch_id: selectedBranchId || null,
          }),
        });
        const custJson = await custRes.json();
        if (!custRes.ok && custJson.existing_customer?.id) {
          customerId = custJson.existing_customer.id;
        } else if (custJson.ok && custJson.data?.id) {
          customerId = custJson.data.id;
        } else {
          throw new Error(custJson.error || "Không thể tạo khách hàng");
        }
      } else if (meta.type === "old") {
        if (!customerId) {
          throw new Error("Không tìm thấy khách hàng");
        }
      }
    }
    // For "booking" tabs or forceNew: customerId must already be set.
    if (!customerId) {
      throw new Error("Không tìm thấy khách hàng");
    }

    // Convert "DD/MM/YYYY" + "HH:MM" → ISO with explicit +07:00 (Vietnam)
    // offset. Without the offset, Postgres interprets the naive string as UTC,
    // which shifts VN evening times (≥17:00) to the NEXT day — breaking the
    // Lịch hẹn sync (the booking appears on the wrong day in /booking).
    const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const tm = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || !tm) {
      throw new Error("Ngày hoặc giờ không hợp lệ");
    }
    const isoDay = `${m[3]}-${m[2]}-${m[1]}`;
    const hh = tm[1].padStart(2, "0");
    const mm = tm[2];
    const dateTime = `${isoDay}T${hh}:${mm}:00+07:00`;

    const payload = {
      date_time: dateTime,
      customer_id: customerId,
      customer_source_id: sourceId || null,
      customer_channel_id: channelId || null,
      number_of_customers: numberOfCustomers,
      status: "confirmed",
      note: note || null,
      branch_id: selectedBranchId || null,
      services: [
        {
          service_id: service.id,
          service_category_id: service.categoryId || null,
          staff_id: staffId,
        },
      ],
    };
    const res = await fetch("/api/supabase/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok || !json.data?.id) {
      throw new Error(json.error || "Không thể tạo lịch hẹn");
    }
    // Compute the service's start time (epoch ms) for gap checking + tab
    // display. MUST use the +07:00 offset so the epoch represents the correct
    // UTC instant for the VN wall-clock time. Using Date.UTC(...) treats VN
    // hours as UTC hours → the epoch is 7 hours off → toVietnamTime() adds
    // another 7 hours → the tab shows the wrong time (e.g. 18:00 selected →
    // 01:00 displayed next day).
    const startMs = new Date(`${isoDay}T${hh}:${mm}:00+07:00`).getTime();
    const durationMin = Number(service.duration) || 60;
    const endMs = startMs + durationMin * 60 * 1000;
    // Mark the tab's booking as created + store the booking id, code, services
    // array, and last service end time. These are used by subsequent service
    // adds to decide same-booking (PUT, gap ≤ 15 min) vs new-booking (POST).
    updateTabMeta(tabId, {
      bookingCreated: true,
      customerId,
      bookingId: json.data.id,
      bookingCode: (json.data.code as string) || undefined,
      bookingServices: [
        {
          service_id: service.id,
          staff_id: staffId,
          service_category_id: service.categoryId || null,
        },
      ],
      lastServiceEndMs: endMs,
      // PARALLEL model: store the booking's start time so the 2nd service's
      // dialog defaults to the SAME start (parallel), not the 1st service's
      // end (consecutive).
      lastServiceStartMs: startMs,
    });
    // Refresh both the cashier day-bookings cache (tab bar) and the Booking
    // module's list so the new booking appears in both places.
    queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("vi-VN").format(price);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Search + Column toggle */}
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm dịch vụ, sản phẩm hoặc gói..."
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5">
              <Columns3 className="h-4 w-4" />
              Cột
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
              Hiển thị tab
            </div>
            {tabs.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onClick={(e) => {
                  e.preventDefault();
                  toggleTabVisible(tab.id);
                }}
                className="cursor-pointer"
              >
                <Checkbox
                  checked={visibleTabs[tab.id] !== false}
                  onCheckedChange={() => toggleTabVisible(tab.id)}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm">{tab.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Radio tabs — only show tabs that are visible (not unchecked via Cột) */}
      <div className="flex border-b">
        {tabs.filter((tab) => visibleTabs[tab.id] !== false).map((tab) => (
          <label
            key={tab.id}
            className={`flex flex-1 cursor-pointer items-center justify-center border-r px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-emerald-50 text-emerald-600"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="service-type"
              value={tab.id}
              checked={activeTab === tab.id}
              onChange={() => {
                setActiveTab(tab.id);
                setSearch("");
                setExpandedServiceCategoryId(null);
                setExpandedProductCategoryId(null);
              }}
              className="sr-only"
            />
            {tab.label}
          </label>
        ))}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "service" ? (
          // Service tab: category drill-down. Show the list of service
          // categories (for the selected store); clicking one reveals its
          // services. A back button returns to the category list.
          isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Đang tải...
            </div>
          ) : expandedServiceCategoryId ? (
            <div className="space-y-2">
              <button
                onClick={() => setExpandedServiceCategoryId(null)}
                className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại nhóm dịch vụ
              </button>
              {expandedCategoryServices.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Không có dịch vụ trong nhóm này.
                </div>
              ) : (
                expandedCategoryServices.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleServiceClick(item)}
                    className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 block truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatPrice(item.price)}đ
                      </span>
                      <PlusCircle className="h-5 w-5 text-gray-400" />
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : storeServiceCategories.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Không có nhóm dịch vụ cho cửa hàng này.
            </div>
          ) : (
            <div className="space-y-2">
              {storeServiceCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setExpandedServiceCategoryId(cat.id)}
                  className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:shadow-sm"
                >
                  <span className="text-sm font-medium text-gray-900 block truncate">
                    {cat.name}
                  </span>
                  <ChevronLeft className="h-4 w-4 rotate-180 text-gray-400" />
                </button>
              ))}
            </div>
          )
        ) : activeTab === "product" ? (
          // Product tab: group drill-down (mirrors the service tab).
          // Show only product GROUPS that contain at least one product with
          // price > 0. Clicking a group reveals its priced products; a back
          // button returns to the group list. Products with price = 0 are
          // hidden everywhere (they are accessories/consumables not for sale).
          isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Đang tải...
            </div>
          ) : expandedProductCategoryId ? (
            <div className="space-y-2">
              <button
                onClick={() => setExpandedProductCategoryId(null)}
                className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại nhóm sản phẩm
              </button>
              {expandedCategoryProducts.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Không có sản phẩm trong nhóm này.
                </div>
              ) : (
                expandedCategoryProducts.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 block truncate">
                        {item.name}
                      </span>
                      {item.code && (
                        <span className="text-xs text-gray-500">{item.code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatPrice(item.price)}đ
                      </span>
                      <PlusCircle className="h-5 w-5 text-gray-400" />
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : pricedProductCategories.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Không có nhóm sản phẩm nào có sản phẩm.
            </div>
          ) : (
            <div className="space-y-2">
              {pricedProductCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setExpandedProductCategoryId(cat.id)}
                  className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:shadow-sm"
                >
                  <span className="text-sm font-medium text-gray-900 block truncate">
                    {cat.name}
                  </span>
                  <ChevronLeft className="h-4 w-4 rotate-180 text-gray-400" />
                </button>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Đang tải...
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Không có dữ liệu
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAddItem(item)}
                className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-900 block truncate">
                    {item.name}
                  </span>
                  {item.category?.name && (
                    <span className="text-xs text-gray-500">
                      {item.category.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-semibold text-emerald-600">
                    {formatPrice(item.price)}đ
                  </span>
                  <PlusCircle className="h-5 w-5 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Service dialog: pick staff + date + time before adding the service */}
      <Dialog
        open={serviceDialogOpen}
        onOpenChange={(v) => {
          if (!addingFromDialog) setServiceDialogOpen(v);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm dịch vụ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedService && (
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-900">
                  {selectedService.name}
                </span>
                <span className="ml-2 font-semibold text-emerald-600">
                  {formatPrice(selectedService.price)}đ
                </span>
              </div>
            )}

            {canAssignStaff && (
            <div className="space-y-2">
              <Label htmlFor="svc-staff">Nhân viên</Label>
              <Select
                value={selectedStaffId}
                onValueChange={(v) => setSelectedStaffId(v)}
              >
                <SelectTrigger id="svc-staff" className="w-full">
                  <SelectValue placeholder="Chọn nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      Không có nhân viên ở cửa hàng này
                    </div>
                  ) : (
                    staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            )}

            {isParallelService ? (
              // Service 2+: date/time are derived from the BOOKING's start
              // time (parallel — all services start simultaneously, each on a
              // different staff). The date/time are set internally
              // (selectedDate/selectedTime) but NOT shown — the cashier only
              // picks the staff. No visible note per the user's request.
              null
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="svc-date">
                    Ngày{!selectedStaffId && <span className="ml-1 text-xs text-gray-400">(chọn nhân viên trước)</span>}
                  </Label>
                  <div className={selectedStaffId ? "" : "pointer-events-none opacity-60"}>
                    <DatePicker
                      id="svc-date"
                      value={selectedDate}
                      onChange={setSelectedDate}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="svc-time">
                    Giờ{!selectedStaffId && <span className="ml-1 text-xs text-gray-400">(chọn nhân viên trước)</span>}
                  </Label>
                  <div className={selectedStaffId ? "" : "pointer-events-none opacity-60"}>
                    <TimePicker
                      id="svc-time"
                      value={selectedTime}
                      onChange={setSelectedTime}
                      hiddenHours={timeFeasibility.hiddenHours}
                      hiddenMinutes={timeFeasibility.hiddenMinutes}
                    />
                  </div>
                </div>
              </div>
            )}

            {dialogError && (
              <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {dialogError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setServiceDialogOpen(false)}
              disabled={addingFromDialog}
            >
              Hủy
            </Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={addingFromDialog}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {addingFromDialog ? "Đang lưu..." : "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing-booking confirmation — shown when adding the first service
          to a draft tab and the customer (by phone) already has non-cancelled
          bookings. Lists them and asks whether to continue. OK → re-run
          handleDialogConfirm with skipExistingBookingsCheck; Hủy → dismiss. */}
      <Dialog
        open={pendingExistingBookings.length > 0}
        onOpenChange={(v) => {
          if (!v) {
            setPendingExistingBookings([]);
            setSkipExistingBookingsCheck(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Khách hàng có lịch hẹn chưa thanh toán</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            Số điện thoại này có {pendingExistingBookings.length} lịch hẹn chưa thanh toán. Bạn có chắc muốn đặt lịch tiếp không?
          </p>
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {pendingExistingBookings.map((b) => (
              <div key={b.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-amber-700">Ngày giờ:</span>
                  <span className="font-medium text-amber-900">{b.date} · {b.time}</span>
                  <span className="text-amber-700">Chi nhánh:</span>
                  <span className="font-medium text-amber-900">{b.branchName || "—"}</span>
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {b.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-amber-700">Dịch vụ:</span>
                  <span className="font-medium text-amber-900">
                    {b.services.map((s) => s.name + (s.staffName ? ` (${s.staffName})` : "")).join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingExistingBookings([]);
                setSkipExistingBookingsCheck(false);
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setPendingExistingBookings([]);
                setSkipExistingBookingsCheck(true);
                handleDialogConfirm();
              }}
            >
              OK, đặt tiếp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
