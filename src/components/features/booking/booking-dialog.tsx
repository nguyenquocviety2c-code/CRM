"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus, Loader2, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Booking } from "@/stores/booking-store";
import { BookingStatusLabel } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { localDayToUtcRange, localDayStartUtc, toVietnamDay, toVietnamTime } from "@/lib/utils";
import { bookingSchema } from "@/lib/validations";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";

const bookingFormSchema = bookingSchema;

type BookingFormValues = z.infer<typeof bookingFormSchema>;

interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  /**
   * Pre-filled slot data (used when the dialog is opened by clicking an empty
   * time slot in the "Khung giờ" / staff-view timeline). When provided AND
   * booking is null (new booking), the first service entry's date/time (and
   * optionally staffId) are pre-set so the user only needs to pick a service.
   * Format: { date: "DD/MM/YYYY", time: "HH:mm", staffId?: string | null }
   */
  prefillSlot?: { date: string; time: string; staffId?: string | null } | null;
  /**
   * Default date/time for a NEW booking (booking === null) when no prefillSlot
   * is provided. When set, the dialog's Ngày/Giờ fields pre-fill with this
   * value so creating a 2nd+ booking on a day defaults to the earliest existing
   * booking's start — the salon's parallel-booking workflow. Each service's
   * staff is still validated for uniqueness vs other bookings at that slot.
   */
  defaultNewSlot?: { date: string; time: string } | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  code: string;
}

interface SupabaseCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  source?: { id: string; name: string } | null;
  channel?: { id: string; name: string } | null;
}

interface ServiceCategory {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
  category_id: string | null;
}

interface Staff {
  id: string;
  name: string;
  groupName?: string;
}

interface CustomerSource {
  id: string;
  name: string;
}

interface CustomerChannel {
  id: string;
  name: string;
}

export function BookingDialog({ open, onClose, booking, prefillSlot, defaultNewSlot }: BookingDialogProps) {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  // Minimize/expand state — when true the dialog collapses to a thin bar at
  // the bottom of the screen (only the title + expand button visible). Resets
  // to expanded every time the dialog opens.
  const [minimized, setMinimized] = useState(false);
  useEffect(() => { if (!open) setMinimized(false); }, [open]);
  // Permission: can the logged-in staff assign employees to services?
  // If false, the per-service "Chọn nhân viên" dropdown is hidden and services
  // are booked without a specific staff assignment (staffId left empty).
  const { hasPermission, user } = useAuthStore();
  const canAssignStaff = hasPermission("assign_staff");
  const canBookPastDate = hasPermission("book_past_date");

  // Fetch customers from Supabase (server-side search)
  const [phoneSearch, setPhoneSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Quick-add customer dialog state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddPhone, setQuickAddPhone] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [quickAddChecking, setQuickAddChecking] = useState(false);

  // ID of the "Khách vãng lai" customer source. When this source is selected,
  // the booking is treated as a walk-in: no phone/name required, the customer
  // name defaults to "Khách vãng lai", and a lightweight guest customer record
  // (customer_type="guest") is created on submit. Guest customers are hidden
  // from the Customers module and only promoted to a real customer when an
  // invoice is paid.
  const WALKIN_SOURCE_ID = "779ddad6-01fa-4887-8647-134ce699d643";
  const WALKIN_SOURCE_NAME = "Khách vãng lai";

  const { data: customersData } = useQuery({
    queryKey: [queryKeys.customers.all, phoneSearch, nameSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      // Suggest ALL customers who registered with a phone number (both "khách
      // cũ" with paid invoices AND "khách mới" who only registered name+phone).
      // Walk-in guests (no phone) are excluded by the API's default behavior.
      const combined = [phoneSearch, nameSearch].filter(Boolean).join(" ");
      if (combined) params.set("search", combined);
      const res = await fetch(`/api/supabase/customers?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as SupabaseCustomer[]).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        code: c.code,
        source: c.source ?? null,
        channel: c.channel ?? null,
      }));
    },
    enabled: open && (!!phoneSearch || !!nameSearch),
    // Keep previous results visible while the new query loads so the
    // autocomplete feels real-time (no flicker/disappear between keystrokes).
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  // Check if a phone number belongs to a customer who already exists.
  // Returns the existing customer if found (so caller can pre-fill), or null.
  const checkPhoneUsedService = async (
    phone: string
  ): Promise<{ blocked: boolean; customer: Customer | null; reason: string }> => {
    const trimmed = phone.trim();
    if (!trimmed) return { blocked: false, customer: null, reason: "" };
    // Find customers whose phone exactly matches — regardless of whether they
    // have a paid invoice yet. A match means this phone is already registered,
    // so the caller should pick the existing customer instead of creating a new one.
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("search", trimmed);
    const res = await fetch(`/api/supabase/customers?${params.toString()}`);
    const json = await res.json();
    if (!json.ok) return { blocked: false, customer: null, reason: "" };
    const matches: SupabaseCustomer[] = (json.data || []).filter(
      (c: SupabaseCustomer) => (c.phone || "") === trimmed
    );
    if (matches.length === 0) return { blocked: false, customer: null, reason: "" };
    // A matching old customer (with a paid invoice) blocks new-customer creation.
    const m = matches[0];
    return {
      blocked: true,
      customer: { id: m.id, name: m.name, phone: m.phone || "", code: m.code || "" },
      reason: "Số điện thoại đã tồn tại, không phải khách mới",
    };
  };

  // Submit handler for the quick-add customer dialog.
  const handleQuickAddSubmit = async () => {
    setQuickAddError("");
    const name = quickAddName.trim();
    const phone = quickAddPhone.trim();
    if (!name) {
      setQuickAddError("Vui lòng nhập tên khách hàng");
      return;
    }
    if (!phone) {
      setQuickAddError("Vui lòng nhập số điện thoại");
      return;
    }
    setQuickAddChecking(true);
    try {
      const dup = await checkPhoneUsedService(phone);
      if (dup.blocked) {
        setQuickAddError(dup.reason);
        return;
      }
      // No matching old customer — create a new customer record.
      const res = await fetch("/api/supabase/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          branch_id: selectedBranchId || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setQuickAddError(json.error || "Không thể tạo khách hàng");
        return;
      }
      const created: Customer = {
        id: json.data.id,
        name: json.data.name,
        phone: json.data.phone || "",
        code: json.data.code || "",
      };
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      // Select the customer in the booking form.
      setValue("customerId", created.id);
      setPhoneSearch(created.phone);
      setNameSearch(created.name);
      setShowCustomerDropdown(false);
      setQuickAddOpen(false);
      setQuickAddName("");
      setQuickAddPhone("");
    } catch (e) {
      setQuickAddError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setQuickAddChecking(false);
    }
  };

  const { data: serviceCategoriesData } = useQuery({
    queryKey: ["serviceCategories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories");
      const json = await res.json();
      return json.data || [];
    },
    // Only fetch when the dialog is open — avoids 5 unnecessary API calls on
    // every /booking page mount when the dialog is closed.
    enabled: open,
    staleTime: 60_000,
  });

  const { data: servicesData } = useQuery({
    queryKey: queryKeys.services.all,
    queryFn: async () => {
      const res = await fetch("/api/supabase/services?limit=200");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: staffData } = useQuery({
    queryKey: ["booking-dialog-staff", selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const res = await fetch(
        `/api/supabase/staff?branch_id=${selectedBranchId}&active=true&limit=200`
      );
      const json = await res.json();
      if (!json.ok) return [];
      // Only show hairdresser groups: Artist, Creative Director, Master, Junior
      const hairdresserGroups = ["Artist", "Creative Director", "Master", "Junior"];
      return (json.data as Array<Record<string, unknown>>)
        .filter((s) => {
          const groupName = (s.group as { name?: string } | null)?.name;
          return groupName && hairdresserGroups.includes(groupName);
        })
        .map((s) => ({
          id: s.id as string,
          name: s.name as string,
          groupName: (s.group as { name?: string } | null)?.name,
        }));
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: sourcesData } = useQuery({
    queryKey: ["customerSources"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: channelsData } = useQuery({
    queryKey: ["bookingChannels"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/booking-channels");
      const json = await res.json();
      return (json.data || []).filter((c: { active?: boolean }) => c.active !== false);
    },
    enabled: open,
    staleTime: 60_000,
  });

  const customers: Customer[] = customersData || [];
  const serviceCategories: ServiceCategory[] = serviceCategoriesData || [];
  const services: Service[] = (servicesData || []).map((s: { id: string; name: string; duration: number; price?: number; category_id: string | null }) => ({
    id: s.id,
    name: s.name,
    duration: s.duration,
    price: Number(s.price) || 0,
    categoryId: s.category_id,
  }));
  const allStaffList: Staff[] = staffData || [];
  // Filter staff per service entry based on the service name:
  // - "Artist" in name → only Artist group.
  // - "Creative Director" in name → only Creative Director group.
  // - Otherwise → all hairdresser groups.
  const staffList: Staff[] = allStaffList; // kept for backward-compat references
  // Returns the staff eligible for a service entry. Excludes:
  //   - staff already assigned to ANOTHER booking at the SAME (date, time)
  //     slot (one staff can't serve two bookings in the same slot);
  //   - staff already picked by a SIBLING service entry in THIS booking (so
  //     the 2nd+ service must use a different staff).
  // `entryIndex` (when provided) is the calling entry's index — its own
  // staffId is NOT excluded (so re-opening the Select keeps the current value).
  const getStaffForService = (
    serviceId: string | undefined,
    entryIndex?: number
  ): Staff[] => {
    let list = allStaffList;
    if (serviceId) {
      const svc = services.find((s) => s.id === serviceId);
      if (svc) {
        const svcName = (svc.name || "").toLowerCase();
        if (svcName.includes("creative director")) {
          list = allStaffList.filter((s) => s.groupName === "Creative Director");
        } else if (svcName.includes("artist")) {
          list = allStaffList.filter((s) => s.groupName === "Artist");
        }
      }
    }
    // Exclude staff blocked by other bookings at the same slot.
    const afterBlocked = list.filter((s) => !staffBlockedAtSameSlot.has(s.id));
    // Exclude staff already chosen by sibling entries in THIS booking.
    let result = afterBlocked;
    if (typeof entryIndex === "number") {
      const siblings = (watchedServicesForFeasibility || watchedServices) || [];
      const takenBySiblings = new Set<string>();
      siblings.forEach((s, i) => {
        if (i !== entryIndex && s.staffId) takenBySiblings.add(s.staffId);
      });
      result = afterBlocked.filter((s) => !takenBySiblings.has(s.id));
    }
    // FALLBACK: if the sibling-exclusion filter empties the list (e.g. the only
    // Artist-group staff was already picked by a sibling service), DON'T show
    // an empty dropdown — that's confusing. Instead, show the group-filtered
    // staff (minus blocked-by-other-bookings) so the user can SEE who's
    // available and choose. The server-side conflict check will still reject
    // a true double-booking. This handles the common case: a salon with only
    // 1 Artist-group staff, where the cashier wants Artist Cut + another
    // service that already used that same staff.
    if (result.length === 0 && afterBlocked.length > 0) {
      result = afterBlocked;
    }
    return result;
  };
  const sources: CustomerSource[] = sourcesData || [];
  const channels: CustomerChannel[] = channelsData || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      customerId: "",
      customerSourceId: "",
      customerChannelId: "",
      numberOfCustomers: 1,
      status: "confirmed",
      note: "",
      // Booking-level start date/time (set in the "Thông tin lịch hẹn" section).
      date: "",
      time: "",
      services: [
        {
          serviceCategoryId: "",
          serviceId: "",
          staffId: "",
          showNote: false,
        },
      ],
    } as BookingFormValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "services",
  });

  // Walk-in detection: when the customer source is "Khách vãng lai", the
  // phone/name fields are hidden and a guest customer record is created on
  // submit instead of requiring an existing customer.
  const watchedCustomerSourceId = watch("customerSourceId");
  const isWalkIn = watchedCustomerSourceId === WALKIN_SOURCE_ID;

  // Customer autocomplete.
  // Phone field shows customers whose phone STARTS WITH the typed prefix
  // (for old-customer lookups). Name field shows all matches.
  const filteredCustomers = useMemo(() => {
    if (!phoneSearch && !nameSearch) return customers;
    // When only phone is being typed, filter to phone-prefix matches.
    if (phoneSearch && !nameSearch) {
      return customers.filter((c) =>
        (c.phone || "").startsWith(phoneSearch.trim())
      );
    }
    return customers;
  }, [customers, phoneSearch, nameSearch]);

  // Duration calculation
  const watchedServices = watch("services");
  const totalDuration = useMemo(() => {
    return watchedServices.reduce((sum, entry) => {
      const service = services.find((s) => s.id === entry.serviceId);
      return sum + (service?.duration || 0);
    }, 0);
  }, [watchedServices, services]);

  const formatDuration = (minutes: number) => {
    const days = Math.floor(minutes / 1440);
    const remainingMinutes = minutes % 1440;
    return `${days} d | ${remainingMinutes} Phút`;
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("vi-VN").format(price) + "đ";

  // ------------------------------------------------------------------
  // Feasible-time computation for a service entry.
  // We fetch the bookings for the FIRST entry's selected staff+date (single
  // useQuery) and compute which HH:MM start times would overlap with that
  // staff's existing bookings. For multi-entry forms, each entry fetches its
  // own day's bookings via the dayBookingsByEntry map below.
  // Hours with NO feasible minute are hidden entirely; otherwise only
  // infeasible minutes within an hour are hidden.
  // ------------------------------------------------------------------
  // useWatch gives a reactive snapshot of the services array (watch() returns
  // a value but doesn't reliably trigger re-renders for nested field updates
  // under the React Compiler). This is used for the feasibility computation.
  const watchedServicesForFeasibility = useWatch({
    control,
    name: "services",
  }) as BookingFormValues["services"] | undefined;

  // Fetch the day's bookings (for the booking-level date) so we can block
  // staff who are already assigned to ANOTHER booking that starts at the SAME
  // (date, time) — one staff can't serve two bookings in the same slot. The
  // existing `busyIntervals` map (per staff/day) is for OVERLAP feasibility on
  // the TimePicker; this set is for SAME-SLOT uniqueness on the staff Select.
  const watchedDateForSlot = watch("date");
  const watchedTimeForSlot = watch("time");
  const { data: dayBookingsForSlot } = useQuery<Array<{
    id: string;
    date_time: string;
    status: string;
    services: Array<{ staff_id?: string | null }>;
  }>>({
    queryKey: ["booking-dialog-day-bookings", watchedDateForSlot, selectedBranchId],
    queryFn: async () => {
      if (!watchedDateForSlot) return [];
      const m = watchedDateForSlot.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return [];
      const isoDay = `${m[3]}-${m[2]}-${m[1]}`;
      const bd = localDayToUtcRange(isoDay);
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "200");
      params.set("date_from", bd.from);
      params.set("date_to", bd.to);
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      return (json.data || []) as Array<{
        id: string;
        date_time: string;
        status: string;
        services: Array<{ staff_id?: string | null }>;
      }>;
    },
    enabled: open && !!watchedDateForSlot,
    staleTime: 15_000,
  });
  // Staff IDs already assigned to ANOTHER booking that starts at the SAME
  // (date, time) as the current form. These staff are BLOCKED in every service
  // entry's staff Select. The current editing booking is excluded.
  const staffBlockedAtSameSlot = useMemo(() => {
    const blocked = new Set<string>();
    if (!watchedDateForSlot || !watchedTimeForSlot) return blocked;
    const m = watchedDateForSlot.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return blocked;
    const dayKey = `${m[3]}-${m[2]}-${m[1]}`;
    const tm = watchedTimeForSlot.match(/^(\d{1,2}):(\d{2})$/);
    if (!tm) return blocked;
    const timeKey = `${tm[1].padStart(2, "0")}:${tm[2]}`;
    for (const b of dayBookingsForSlot || []) {
      if (b.status === "cancelled" || b.status === "no_show") continue;
      if (booking && b.id === booking.id) continue; // exclude self when editing
      if (!b.date_time) continue;
      // Compare the booking's VIETNAM day + time (timezone-safe) to the form's
      // (date, time). Supabase stores date_time with +00:00 offset, so the ISO
      // segments are UTC — naively matching them to the form's VN time missed
      // every booking (offset by 7 hours).
      const bDay = toVietnamDay(b.date_time);
      const bTime = toVietnamTime(b.date_time);
      if (bDay !== dayKey) continue;
      if (bTime !== timeKey) continue;
      for (const s of b.services || []) {
        if (s.staff_id) blocked.add(s.staff_id);
      }
    }
    return blocked;
  }, [watchedDateForSlot, watchedTimeForSlot, dayBookingsForSlot, booking]);

  // Collect the unique (staffId|isoDay) keys referenced by the form entries.
  const staffDayKeys = useMemo(() => {
    const set = new Set<string>();
    const entries = watchedServicesForFeasibility || watchedServices;
    for (const entry of entries) {
      if (!entry.staffId || !entry.date) continue;
      const m = entry.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) continue;
      set.add(`${entry.staffId}|${m[3]}-${m[2]}-${m[1]}`);
    }
    return [...set];
  }, [watchedServicesForFeasibility, watchedServices]);

  // Fetch bookings for each unique staff+day. Use a single useQuery per key
  // via a small custom hook pattern: store results in a ref map keyed by
  // staffDayKey, fetched on demand.
  const [busyIntervals, setBusyIntervals] = useState<
    Record<string, { startMs: number; endMs: number }[]>
  >({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Group keys by isoDay so we fetch a day's bookings once.
      const byDay = new Map<string, string[]>(); // isoDay -> staffIds
      for (const key of staffDayKeys) {
        const [staffId, isoDay] = key.split("|");
        if (!byDay.has(isoDay)) byDay.set(isoDay, []);
        byDay.get(isoDay)!.push(staffId);
      }
      const updates: Record<string, { startMs: number; endMs: number }[]> = {};
      for (const [isoDay, staffIds] of byDay) {
        // Skip if all staff for this day are already loaded.
        const allLoaded = staffIds.every((sid) => busyIntervals[`${sid}|${isoDay}`] !== undefined);
        if (allLoaded) continue;
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "200");
        // Timezone-safe: isoDay is a Vietnam calendar day; convert to its
        // UTC range so Supabase filters the correct window (no 7-hour shift).
        const bd = localDayToUtcRange(isoDay);
        params.set("date_from", bd.from);
        params.set("date_to", bd.to);
        if (selectedBranchId) params.set("branch_id", selectedBranchId);
        try {
          const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
          const json = await res.json();
          if (!json.ok) continue;
          const bookings = json.data || [];
          for (const sid of staffIds) {
            if (busyIntervals[`${sid}|${isoDay}`] !== undefined) continue;
            const intervals: { startMs: number; endMs: number }[] = [];
            for (const b of bookings) {
              if (b.status === "cancelled" || b.status === "no_show") continue;
              if (booking && b.id === booking.id) continue;
              const exStart = new Date(b.date_time as string).getTime();
              if (isNaN(exStart)) continue;
              for (const s of (b.services as Array<Record<string, unknown>>) || []) {
                if (s.staff_id !== sid) continue;
                const dur = (Number(s.duration) || Number((s.service as { duration?: number } | null)?.duration) || 60) * 60 * 1000;
                intervals.push({ startMs: exStart, endMs: exStart + dur });
              }
            }
            updates[`${sid}|${isoDay}`] = intervals;
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled || Object.keys(updates).length === 0) return;
      setBusyIntervals((prev) => ({ ...prev, ...updates }));
    })();
    return () => {
      cancelled = true;
    };
  }, [staffDayKeys, selectedBranchId, booking, busyIntervals]);

  // Compute hiddenHours + hiddenMinutes for a given entry.
  const computeFeasible = (
    entry: { staffId?: string; date?: string; serviceId?: string }
  ): { hiddenHours: Set<string>; hiddenMinutes: Record<string, Set<string>> } => {
    const empty = { hiddenHours: new Set<string>(), hiddenMinutes: {} };
    if (!entry.staffId || !entry.date || !entry.serviceId) return empty;
    const m = entry.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return empty;
    const isoDay = `${m[3]}-${m[2]}-${m[1]}`;
    const intervals = busyIntervals[`${entry.staffId}|${isoDay}`];
    if (!intervals || intervals.length === 0) return empty;
    const svc = services.find((s) => s.id === entry.serviceId);
    const durationMs = (svc?.duration || 60) * 60 * 1000;
    if (durationMs <= 0) return empty;
    // dayBase = Vietnam midnight (00:00 VN) as a UTC ms epoch. The loop below
    // advances `min` minutes from dayBase to enumerate every VN wall-clock
    // minute of the day; min=540 → 09:00 VN (epoch). The busy intervals are
    // also UTC-ms epochs (from `new Date(b.date_time).getTime()`), so the
    // overlap comparison is apples-to-apples. Previously dayBase used
    // Date.UTC(...,0,0,0) which is UTC midnight — that mapped min=540 to
    // 09:00 UTC (= 16:00 VN), so a 16:00-VN booking (stored as 09:00 UTC)
    // collided with the user's intended 09:00 VN slot. Fixed to VN midnight.
    const dayBase = new Date(localDayStartUtc(isoDay)).getTime();
    if (isNaN(dayBase)) return empty;
    const hiddenHours = new Set<string>();
    const hiddenMinutes: Record<string, Set<string>> = {};
    const hourHasFeasible: Record<string, boolean> = {};
    for (let h = 0; h < 24; h++) hourHasFeasible[String(h).padStart(2, "0")] = false;
    for (let min = 0; min < 60 * 24; min++) {
      const startMs = dayBase + min * 60 * 1000;
      const endMs = startMs + durationMs;
      const overlaps = intervals.some(
        (iv) => startMs < iv.endMs && iv.startMs < endMs
      );
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
  };

  // Determine the selected customer's "Khách cũ" status. A customer is "old"
  // when they have at least one completed invoice OR belong to a customer
  // group whose name contains "khách cũ". Drives which service categories are
  // visible. Mirrors the cashier module's determination so both modules stay
  // consistent.
  const watchedCustomerId = watch("customerId");

  // --- Past-time blocking for the booking-level TimePicker ---
  // When the staff lacks book_past_date AND the selected date is today,
  // compute hiddenHours + hiddenMinutes for all times already passed so the
  // TimePicker hides them (same mechanism used for staff-busy intervals).
  const watchedDate = watch("date");
  const pastTimeHidden = useMemo(() => {
    const empty = { hiddenHours: new Set<string>(), hiddenMinutes: {} as Record<string, Set<string>> };
    if (canBookPastDate || !watchedDate) return empty;
    const m = watchedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return empty;
    const selectedDay = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    selectedDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Only block past times when the selected date IS today. Past dates are
    // already blocked by the DatePicker (minDate); future dates have no past
    // times to block.
    if (selectedDay.getTime() !== today.getTime()) return empty;
    const now = new Date();
    const curHour = now.getHours();
    const curMinute = now.getMinutes();
    const hiddenHours = new Set<string>();
    const hiddenMinutes: Record<string, Set<string>> = {};
    // Business hours: 08:30–19:30 (mirror time-picker constants).
    for (let h = 8; h <= 19; h++) {
      const hStr = String(h).padStart(2, "0");
      if (h < curHour) {
        // Whole hour already passed → hide entirely.
        hiddenHours.add(hStr);
      } else if (h === curHour) {
        // Current hour → hide minutes already passed (and business-rule ones).
        const mins = new Set<string>();
        for (let mi = 0; mi <= 59; mi++) {
          // Hide if before now (same hour, earlier minute) OR outside business
          // hours (08:30 open, 19:30 last booking).
          if (h === 8 && mi < 30) mins.add(String(mi).padStart(2, "0"));
          if (h === 19 && mi > 30) mins.add(String(mi).padStart(2, "0"));
          if (mi < curMinute) mins.add(String(mi).padStart(2, "0"));
        }
        if (mins.size > 0) hiddenMinutes[hStr] = mins;
      }
    }
    return { hiddenHours, hiddenMinutes };
  }, [canBookPastDate, watchedDate]);

  const { data: selectedCustomerDetail } = useQuery({
    queryKey: ["booking-customer-type", watchedCustomerId],
    queryFn: async () => {
      if (!watchedCustomerId) return null;
      const res = await fetch(
        `/api/supabase/customers/${encodeURIComponent(watchedCustomerId)}`
      );
      const json = await res.json();
      if (!json.ok) return null;
      const groupName = (json.data.group?.name || "").toLowerCase();
      const isOld =
        json.data.customer_type === "old" || groupName.includes("khách cũ");
      return {
        id: json.data.id,
        customer_type: isOld ? "old" : ("new" as "old" | "new"),
      };
    },
    enabled: !!watchedCustomerId,
  });
  const selectedCustomerType: "old" | "new" =
    selectedCustomerDetail?.customer_type === "old" ? "old" : "new";

  // Filter service categories based on customer type:
  // - New customer: hide "Dịch Vụ Cắt" (only the "Dành cho khách hàng mới" cut is offered).
  // - Old customer: hide "Dành cho khách hàng mới - DV Cắt" (new-customer-only cut).
  // When editing, always include the currently-selected category so the existing
  // booking's category remains visible/selectable even if it would be filtered out.
  const visibleServiceCategories = useMemo(() => {
    // Collect category IDs already selected in the form (edit mode pre-fill).
    const selectedCatIds = new Set(
      (watchedServices || [])
        .map((s) => s.serviceCategoryId)
        .filter(Boolean) as string[]
    );
    return serviceCategories.filter((cat) => {
      // Always show a category that's already selected (edit mode).
      if (selectedCatIds.has(cat.id)) return true;
      const name = cat.name.toLowerCase();
      const isNewCustomerCut = name.includes("dành cho khách hàng mới");
      // "Dịch Vụ Cắt" = the regular cut category. Must NOT be the new-customer
      // cut (which also contains "cắt" in its name). We check isNewCustomerCut
      // FIRST and exclude it, so a category name containing both phrases is
      // classified as new-customer-cut only (not both).
      const isRegularCut = !isNewCustomerCut && (name.includes("dịch vụ cắt") || name === "dịch vụ cắt");
      if (selectedCustomerType === "new") {
        // New customer: hide regular "Dịch Vụ Cắt", keep new-customer cut.
        if (isRegularCut) return false;
      } else {
        // Old customer: hide new-customer-only cut, keep regular.
        if (isNewCustomerCut) return false;
      }
      return true;
    });
  }, [serviceCategories, selectedCustomerType, watchedServices]);

  // Pre-fill form when editing
  useEffect(() => {
    if (booking) {
      // API returns snake_case top-level fields + nested booking_services.
      const b = booking as unknown as {
        customer_id?: string;
        customer_source_id?: string | null;
        customer_channel_id?: string | null;
        number_of_customers?: number;
        date_time?: string;
        note?: string | null;
      };
      // Derive the booking-level start date/time from booking.date_time (ISO).
      // IMPORTANT: parse the time directly from the ISO string (the "HH:MM"
      // segment after "T") instead of using new Date().getHours(). The stored
      // date_time uses the local time the user entered but Postgres tags it
      // with the server's UTC offset; getHours() then shifts it again, causing
      // 08:30 to display as 15:30 in UTC+7. Reading the raw "HH:MM" preserves
      // the user's original input.
      let startDate = booking.date || "";
      let startTime = booking.time || "";
      if (b.date_time) {
        // ISO formats: "2026-07-01T08:30:00+00:00" or "2026-07-01T08:30:00Z"
        const isoMatch = b.date_time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (isoMatch) {
          if (!startDate) {
            startDate = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
          }
          if (!startTime) {
            startTime = `${isoMatch[4]}:${isoMatch[5]}`;
          }
        }
      }
      // Map booking services to form shape. Per-service date/time are no longer
      // user-edited — they are derived on submit from the booking-level start.
      const mapService = (s: Record<string, unknown>) => {
        const row = s as {
          service_id?: string;
          serviceId?: string;
          staff_id?: string | null;
          staffId?: string;
          service_category_id?: string | null;
          serviceCategoryId?: string;
        };
        return {
          serviceCategoryId: row.service_category_id || row.serviceCategoryId || "",
          serviceId: row.service_id || row.serviceId || "",
          staffId: row.staff_id || row.staffId || "",
          showNote: false,
        };
      };
      reset({
        customerId:
          (booking.customer as unknown as { id?: string })?.id ||
          b.customer_id ||
          "",
        customerSourceId: booking.customerSourceId || b.customer_source_id || "",
        customerChannelId: booking.customerChannelId || b.customer_channel_id || "",
        numberOfCustomers: booking.numberOfCustomers || b.number_of_customers || 1,
        status: booking.status || "confirmed",
        note: booking.note || "",
        date: startDate,
        time: startTime,
        services:
          booking.services && booking.services.length > 0
            ? (booking.services as unknown as Array<Record<string, unknown>>).map(mapService)
            : [
                {
                  serviceCategoryId: "",
                  serviceId: "",
                  staffId: "",
                  showNote: false,
                },
              ],
      });
    } else {
      // New booking. Precedence for the default date/time:
      //   1. prefillSlot (opened by clicking an empty time slot in the
      //      "Khung giờ" / staff-view timeline) → date/time (+ staffId) filled.
      //   2. defaultNewSlot (opened via "Tạo mới" when there's already ≥1
      //      booking on the viewed day) → default to the EARLIEST existing
      //      booking's start so a 2nd+ appointment shares the same slot.
      //   3. "" (blank) — no default.
      // Permission guard: if the staff lacks book_past_date, a past-date slot
      // is replaced with today's date (the slot click itself should already be
      // blocked upstream, but this is a safety net).
      let preDate = prefillSlot?.date || defaultNewSlot?.date || "";
      let preTime = prefillSlot?.time || defaultNewSlot?.time || "";
      if (!canBookPastDate && preDate) {
        const m = preDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          // Use the +07:00 offset so slotMs is the correct UTC instant for VN
          // midnight. Date.UTC treats VN midnight as UTC midnight → 7-hour
          // offset → today's VN date would be considered "past" when the UTC
          // time is already past VN midnight.
          const slotMs = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+07:00`).getTime();
          if (slotMs < Date.now()) {
            // Past slot + no permission → fall back to today.
            const now = new Date();
            preDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
            preTime = "";
          }
        }
      }
      const preStaffId = prefillSlot?.staffId || "";
      reset({
        customerId: "",
        customerSourceId: "",
        customerChannelId: "",
        numberOfCustomers: 1,
        status: "confirmed",
        note: "",
        date: preDate,
        time: preTime,
        services: [
          {
            serviceCategoryId: "",
            serviceId: "",
            staffId: preStaffId,
            showNote: false,
          },
        ],
      });
    }
  }, [booking, reset, prefillSlot, defaultNewSlot, canBookPastDate]);

  // When editing, pre-fill the phone/name search fields so the customer is visible.
  useEffect(() => {
    if (booking?.customer) {
      setPhoneSearch(booking.customer.phone || "");
      setNameSearch(booking.customer.name || "");
      setShowCustomerDropdown(false);
    } else {
      setPhoneSearch("");
      setNameSearch("");
    }
  }, [booking]);

  const createMutation = useMutation({
    mutationFn: async (data: BookingFormValues) => {
      // Services no longer carry their own date/time. The booking-level
      // (date, time) is the START of the FIRST service; each subsequent
      // service starts right after the previous one ends (consecutive). All
      // services therefore form a SINGLE booking (no more time-gap grouping).
      const validServices = data.services.filter((s) => s.serviceId);
      if (validServices.length === 0) {
        throw new Error("Vui lòng chọn ít nhất 1 dịch vụ");
      }
      if (!data.date || !data.time) {
        throw new Error("Vui lòng chọn ngày và giờ bắt đầu");
      }

      // Parse the booking-level start (dd/MM/yyyy + HH:mm) into ms (UTC, to
      // match how the API stores date_time).
      const m = data.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const tm = data.time.match(/^(\d{1,2}):(\d{2})$/);
      if (!m || !tm) {
        throw new Error("Định dạng ngày/giờ không hợp lệ");
      }
      // Compute the booking's start time in epoch ms for client-side conflict
      // checking. MUST use the +07:00 offset so the epoch matches the VN
      // wall-clock time (Date.UTC treats VN hours as UTC → 7-hour offset).
      const firstDateForMs = data.date.split("/").reverse().join("-");
      const bookingStart = new Date(
        `${firstDateForMs}T${data.time.padStart(5, "0")}:00+07:00`
      ).getTime();
      const parsed = validServices.map((entry) => {
        const svc = services.find((s) => s.id === entry.serviceId);
        const duration = (svc?.duration || 60) * 60 * 1000;
        const start = bookingStart;
        const end = start + duration;
        return { start, end, entry };
      });

      // All services start at the same time → ONE booking (parallel staff).
      const firstEntry = parsed[0].entry;
      const firstDate = data.date.split("/").reverse().join("-");
      // +07:00 offset so Postgres stores the VN time correctly (not as UTC).
      const dateTime = `${firstDate}T${data.time}:00+07:00`;
      const payload = {
        date_time: dateTime,
        customer_id: data.customerId,
        customer_source_id: data.customerSourceId || null,
        customer_channel_id: data.customerChannelId || null,
        number_of_customers: data.numberOfCustomers,
        status: data.status,
        note: data.note || null,
        branch_id: selectedBranchId || null,
        // Explicitly send the logged-in staff's id so the server records who
        // created this booking — don't rely solely on the httpOnly cookie (which
        // may not be forwarded through the preview gateway proxy). The server
        // still falls back to getCurrentStaffId(request) when this is absent
        // (e.g. kiosk /dat-lich has no logged-in user).
        created_by: user?.id || null,
        services: parsed.map((g) => ({
          service_id: g.entry.serviceId,
          service_category_id: g.entry.serviceCategoryId || null,
          staff_id: g.entry.staffId || null,
        })),
      };
      // Suppress unused-warning for firstEntry (kept for clarity / future use).
      void firstEntry;
      const res = await fetch("/api/supabase/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Không thể tạo lịch hẹn");
      }
      return { ok: true, data: [json.data] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      onClose();
    },
    onError: (error: Error) => {
      // Server-side conflict validation returns a 400 with a conflict message.
      // Show it in the conflict dialog instead of a plain alert.
      setConflictMessage(error.message || "Không thể tạo lịch hẹn");
    },
  });

  // Update mutation for edit mode — PUT the single booking with all services
  // running consecutively from the booking-level start (date, time). There is
  // no more time-gap splitting: every service follows the previous one.
  const updateMutation = useMutation({
    mutationFn: async (data: BookingFormValues) => {
      if (!booking) throw new Error("Không tìm thấy lịch hẹn để cập nhật");

      const validServices = data.services.filter((s) => s.serviceId);
      if (validServices.length === 0) {
        throw new Error("Vui lòng chọn ít nhất 1 dịch vụ");
      }
      if (!data.date || !data.time) {
        throw new Error("Vui lòng chọn ngày và giờ bắt đầu");
      }

      // Parse the booking-level start into ms (UTC).
      const m = data.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const tm = data.time.match(/^(\d{1,2}):(\d{2})$/);
      if (!m || !tm) {
        throw new Error("Định dạng ngày/giờ không hợp lệ");
      }
      // Compute the booking's start time in epoch ms for client-side conflict
      // checking (same +07:00 offset as createMutation — see above).
      const firstDateForMs = data.date.split("/").reverse().join("-");
      const bookingStart = new Date(
        `${firstDateForMs}T${data.time.padStart(5, "0")}:00+07:00`
      ).getTime();

      // PARALLEL model: every service starts at the SAME booking-level start
      // time (parallel staff). See createMutation for the rationale.
      const parsed = validServices.map((entry) => {
        const svc = services.find((s) => s.id === entry.serviceId);
        const duration = (svc?.duration || 60) * 60 * 1000;
        const start = bookingStart;
        const end = start + duration;
        return { start, end, entry };
      });

      const firstDate = data.date.split("/").reverse().join("-");
      // +07:00 offset so Postgres stores the VN time correctly (not as UTC).
      const dateTime = `${firstDate}T${data.time}:00+07:00`;
      const putPayload = {
        date_time: dateTime,
        customer_id: data.customerId,
        customer_source_id: data.customerSourceId || null,
        customer_channel_id: data.customerChannelId || null,
        number_of_customers: data.numberOfCustomers,
        status: data.status,
        note: data.note || null,
        branch_id: selectedBranchId || null,
        services: parsed.map((g) => ({
          service_id: g.entry.serviceId,
          service_category_id: g.entry.serviceCategoryId || null,
          staff_id: g.entry.staffId || null,
        })),
      };
      const putRes = await fetch(`/api/supabase/bookings/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(putPayload),
      });
      const putJson = await putRes.json();
      if (!putJson.ok) {
        throw new Error(putJson.error || "Không thể cập nhật lịch hẹn");
      }
      return { ok: true, data: [putJson.data] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      onClose();
    },
    onError: (error: Error) => {
      // Server-side conflict validation returns a 400 with a conflict message.
      // Show it in the conflict dialog instead of a plain alert.
      setConflictMessage(error.message || "Không thể cập nhật lịch hẹn");
    },
  });

  const [conflictMessage, setConflictMessage] = useState<string>("");
  // Existing-booking confirmation: when the customer (by phone) already has
  // non-cancelled bookings, show a confirmation prompt listing them before
  // actually creating/updating. `pendingExistingBookings` holds the list;
  // `skipExistingCheck` is set true after the user confirms so the re-submit
  // skips the check. `lastValidatedData` holds the form data between the
  // initial submit and the confirmed re-submit.
  const [pendingExistingBookings, setPendingExistingBookings] = useState<
    Array<{ id: string; date: string; time: string; status: string; branchName: string; services: Array<{ name: string; staffName: string }> }>
  >([]);
  const [skipExistingCheck, setSkipExistingCheck] = useState(false);
  const [lastValidatedData, setLastValidatedData] = useState<BookingFormValues | null>(null);

  /**
   * Validate the booking before submitting:
   * 1. No service may be scheduled in the past.
   * 2. A staff member cannot have overlapping bookings — each service entry
   *    occupies [start, start + duration], where start is derived from the
   *    booking-level (date, time) running CONSECUTIVELY across services. It
   *    must not overlap with another existing (non-cancelled) booking's
   *    service for the same staff on the same day. It also must not overlap
   *    with another service entry in THIS same form (same staff, same day).
   *
   * Returns an error message string, or "" if everything is valid.
   */
  const validateBooking = async (data: BookingFormValues): Promise<string> => {
    const now = Date.now();
    if (!data.date || !data.time) {
      return "Vui lòng chọn ngày và giờ bắt đầu";
    }
    const entries = data.services.filter((s) => s.serviceId && s.staffId);

    // 0. One-time offer check: "Dành cho khách hàng mới - DV Cắt" can only be
    //    booked ONCE per phone. If any service entry's category is the new-
    //    customer cut, check the customer's phone against existing bookings.
    //    Skip when editing the same booking (excludeBookingId) so editing the
    //    existing cut booking (e.g. change time) doesn't block itself.
    const newCustomerCutCategoryId = "4cb10a73-cc13-496a-baf2-e060ebfa02f8";
    const hasNewCustomerCut = entries.some(
      (e) => e.serviceCategoryId === newCustomerCutCategoryId
    );
    const phone = phoneSearch.trim();
    if (hasNewCustomerCut && phone) {
      try {
        const excludeParam = booking ? `&excludeBookingId=${encodeURIComponent(booking.id)}` : "";
        const checkRes = await fetch(
          `/api/supabase/bookings/check-new-customer-cut?phone=${encodeURIComponent(phone)}${excludeParam}`
        );
        const checkJson = await checkRes.json();
        if (checkJson.ok && checkJson.data?.exists) {
          const d = checkJson.data;
          // Build a detailed "cannot book" message that identifies the
          // blocking booking precisely: which customer, which service, which
          // staff, exact date + time, branch, and status. Without these the
          // staff cannot tell which existing appointment is blocking the new
          // one (especially when the existing booking is already "checkout"
          // — paid/done — so it no longer shows in the active booking list).
          const custName = d.existingCustomerName || "(khách không rõ)";
          const svcName = d.existingServiceName || "Dành cho khách hàng mới - DV Cắt";
          const staffName = d.existingStaffName || "(chưa phân thợ)";
          const dateStr = d.existingDate || "—";
          const timeStr = d.existingTime || "—";
          const branchStr = d.existingBranchName ? `\n• Chi nhánh: ${d.existingBranchName}` : "";
          // Translate the raw booking status into a human-readable VN label so
          // the staff understands whether the existing booking is pending,
          // confirmed, or already paid/checkout.
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
          return (
            `Không thể đặt lịch vì khách hàng "${custName}" đã có một lịch "${svcName}" đã đặt trước đó.\n` +
            `• Thợ: ${staffName}\n` +
            `• Ngày giờ: ${dateStr} lúc ${timeStr}${branchStr}${statusStr}\n` +
            `Lưu ý: ưu đãi "Dành cho khách hàng mới" chỉ được đặt 1 lần. Vui lòng huỷ/chỉnh sửa lịch cũ hoặc chọn nhóm dịch vụ khác.`
          );
        }
      } catch {
        /* best-effort — don't block on network errors */
      }
    }

    // Parse the booking-level start (dd/MM/yyyy + HH:mm) into ms (UTC).
    const startM = data.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const startTm = data.time.match(/^(\d{1,2}):(\d{2})$/);
    if (!startM || !startTm) {
      return "Định dạng ngày/giờ không hợp lệ";
    }
    // Parse the booking-level start (dd/MM/yyyy + HH:mm VN) into a UTC ms epoch.
    // The form's date/time is a VIETNAM wall-clock value (the user enters 09:00
    // meaning 09:00 VN). `Date.UTC(...,9,0,0)` would parse it as 09:00 UTC (= 16:00
    // VN), causing false conflicts with bookings stored at 09:00 UTC (= 16:00 VN).
    // Correct: build the epoch for the VN instant, i.e. UTC midnight of the VN
    // day + the VN hour/minute, then SUBTRACT 7h so the epoch is the true UTC
    // instant of that VN wall-clock time.
    const vnMidnightUtc = new Date(localDayStartUtc(`${startM[3]}-${startM[2]}-${startM[1]}`)).getTime();
    const cursor = vnMidnightUtc
      + Number(startTm[1]) * 60 * 60 * 1000
      + Number(startTm[2]) * 60 * 1000;
    if (isNaN(cursor)) {
      return "Định dạng ngày/giờ không hợp lệ";
    }

    // Build the list of "slots" the user is trying to book now (same-form),
    // running consecutively from the booking-level start.
    type Slot = {
      staffId: string;
      staffName: string;
      start: number; // epoch ms
      end: number; // epoch ms
      serviceName: string;
      timeLabel: string;
      dateLabel: string;
    };
    const newSlots: Slot[] = [];
    // PARALLEL model (matches Task 18's submit + server): every service starts
    // at the SAME booking-level start time. `cursor` here is just the booking
    // start (constant); each slot's start = cursor.
    for (const entry of entries) {
      const svc = services.find((s) => s.id === entry.serviceId);
      const stf = staffList.find((st) => st.id === entry.staffId);
      const start = cursor;
      const duration = (svc?.duration || 60) * 60 * 1000; // ms
      const end = start + duration;

      // 1. Past-time check — skipped when the staff has the book_past_date
      //    permission (lets them back-date a booking + pay for it).
      if (!canBookPastDate && start < now) {
        return `Không thể đặt lịch vào thời điểm đã qua (${data.time} ${data.date}). Vui lòng chọn thời gian trong tương lai.`;
      }
      // Format this slot's time label in VIETNAM time (the user entered a VN
      // time; `start` is the true UTC epoch of that VN instant, so convert back
      // to VN wall-clock for display).
      const slotDate = data.date;
      const slotTime = toVietnamTime(start);
      newSlots.push({
        staffId: entry.staffId,
        staffName: stf?.name || entry.staffId,
        start,
        end,
        serviceName: svc?.name || "Dịch vụ",
        timeLabel: slotTime,
        dateLabel: slotDate,
      });
    }

    // 2a. Within-form conflict: two new entries for the same staff overlapping.
    // (Consecutive services for the SAME staff touch end-to-start but don't
    // overlap, so this only fires for genuinely overlapping same-staff slots.)
    for (let i = 0; i < newSlots.length; i++) {
      for (let j = i + 1; j < newSlots.length; j++) {
        const a = newSlots[i];
        const b = newSlots[j];
        if (a.staffId === b.staffId && a.start < b.end && b.start < a.end) {
          return (
            `Không thể đặt lịch vì trùng thời gian trong cùng phiếu.\n` +
            `• Thợ: ${a.staffName}\n` +
            `• Dịch vụ 1: ${a.serviceName} (${toVietnamTime(a.start)} - ${toVietnamTime(a.end)} ngày ${a.dateLabel})\n` +
            `• Dịch vụ 2: ${b.serviceName} (${toVietnamTime(b.start)} - ${toVietnamTime(b.end)} ngày ${b.dateLabel})\n` +
            `Trong một lịch hẹn, mỗi dịch vụ phải dùng một thợ khác nhau. Vui lòng chọn thợ khác cho 1 trong 2 dịch vụ.`
          );
        }
      }
    }

    // 2b. Conflict with existing bookings in Supabase.
    // All services share the booking-level date, so fetch that one day.
    const isoDay = `${startM[3]}-${startM[2]}-${startM[1]}`;
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "200");
    // Timezone-safe: isoDay is a Vietnam calendar day (parsed from the form's
    // DD/MM/YYYY date). Convert to its UTC range so Supabase filters by the
    // correct window (no 7-hour shift).
    const vd = localDayToUtcRange(isoDay);
    params.set("date_from", vd.from);
    params.set("date_to", vd.to);
    if (selectedBranchId) params.set("branch_id", selectedBranchId);
    try {
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        const existingBookings = json.data || [];
        for (const existing of existingBookings) {
          // Skip cancelled / no_show bookings.
          const status = existing.status as string;
          if (status === "cancelled" || status === "no_show") continue;
          // When editing, skip the booking being edited itself.
          if (booking && existing.id === booking.id) continue;
          const exDateTime = existing.date_time as string;
          if (!exDateTime) continue;
          const exStart = new Date(exDateTime).getTime();
          if (isNaN(exStart)) continue;
          const exServices = (existing.services || []) as Array<{
            staff_id?: string | null;
            staff?: { name?: string } | null;
            service?: { duration?: number; name?: string } | null;
            service_id?: string;
          }>;
          for (const exSvc of exServices) {
            const exStaffId = exSvc.staff_id;
            if (!exStaffId) continue;
            const exDuration = (exSvc.service?.duration || 60) * 60 * 1000;
            const exEnd = exStart + exDuration;
            // Check overlap against each new slot for the same staff.
            for (const ns of newSlots) {
              if (ns.staffId === exStaffId && ns.start < exEnd && exStart < ns.end) {
                // Build a detailed conflict message that identifies the
                // blocking booking precisely — booking code, customer,
                // service, staff, the FULL time range (start → end) of the
                // existing booking, branch, status, AND the new service's
                // time range that overlaps it. Without the end time + duration
                // the staff can't tell how long the existing appointment runs,
                // which is the exact scenario the user described (a 9:30 90-min
                // service would overlap a 10:30-12:00 booking).
                const stf = staffList.find((s) => s.id === exStaffId);
                const staffName = stf?.name || exSvc.staff?.name || exStaffId;
                const svcName = exSvc.service?.name || "Dịch vụ";
                const exDurationMin = Math.round(exDuration / 60000);
                const exTimeStr = toVietnamTime(exStart);
                const exEndTimeStr = toVietnamTime(exEnd);
                const nsTimeStr = toVietnamTime(ns.start);
                const nsEndTimeStr = toVietnamTime(ns.end);
                const exDateStr = isoDay.split("-").reverse().join("/");
                const exCode = (existing.code as string) || "";
                const exCustName = (existing.customer as { name?: string } | null)?.name || "";
                const exBranchName = (existing.branch as { name?: string } | null)?.name || "";
                const statusLabel: Record<string, string> = {
                  pending: "Chờ xác nhận",
                  confirmed: "Đã xác nhận",
                  checkin: "Đang phục vụ",
                  checkout: "Đã thanh toán",
                  cancelled: "Đã huỷ",
                  no_show: "Không đến",
                };
                const exStatusLabel = status
                  ? statusLabel[status] || status
                  : "";
                const codeLine = exCode ? `Lịch ${exCode}` : "Một lịch đã đặt trước đó";
                const custLine = exCustName ? `• Khách: ${exCustName}\n` : "";
                const branchLine = exBranchName ? `• Chi nhánh: ${exBranchName}\n` : "";
                const statusLine = exStatusLabel ? `• Trạng thái: ${exStatusLabel}\n` : "";
                return (
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
              }
            }
          }
        }
      }
    } catch {
      // Network/parse error — don't block the submit; the server may still reject.
    }

    return "";
  };

  // A booking is LOCKED (read-only) when it's in a terminal state:
  // - checkin: customer is currently being served → locked until checkout.
  // - checkout: already paid → immutable historical record.
  // - cancelled: the appointment was cancelled → view-only, no edits.
  // - no_show: the customer didn't show up → view-only, no edits.
  // The dialog still opens so the user can review the details, but every
  // field becomes read-only and the Save button is disabled.
  // (Terminal statuses also free up the time slot — a NEW booking can be
  // created at the same time, since validateBooking skips cancelled/no_show
  // bookings in the conflict check.)
  const isLocked =
    booking?.status === "checkin" ||
    booking?.status === "checkout" ||
    booking?.status === "cancelled" ||
    booking?.status === "no_show";
  const lockReason =
    booking?.status === "checkin"
      ? "Lịch hẹn đã checkin không thể chỉnh sửa. Vui lòng checkout trước khi thay đổi thông tin."
      : booking?.status === "checkout"
        ? "Lịch hẹn đã thanh toán không thể chỉnh sửa."
        : booking?.status === "cancelled"
          ? "Lịch hẹn đã hủy không thể chỉnh sửa. Bạn có thể tạo lịch hẹn mới cho khung giờ này vì slot đã được giải phóng."
          : booking?.status === "no_show"
            ? "Lịch hẹn đánh dấu 'Không đến' không thể chỉnh sửa. Bạn có thể tạo lịch hẹn mới cho khung giờ này vì slot đã được giải phóng."
            : "";

  const onSubmit = async (data: BookingFormValues) => {
    if (isLocked) {
      setConflictMessage(lockReason);
      return;
    }
    // Permission guard: only staff with `assign_staff` may pick an employee.
    // When granted, each service MUST have a staff assigned (enforced here
    // since the schema-level staffId is optional to allow no-staff bookings).
    // When NOT granted, staffId is left empty (booking has no specific employee).
    if (canAssignStaff) {
      const missing = data.services.some((s) => !s.staffId);
      if (missing) {
        setConflictMessage("Vui lòng chọn nhân viên cho tất cả dịch vụ");
        return;
      }
    }
    // Walk-in booking: ensure a guest customer record exists. Guest records
    // (customer_type="guest") are hidden from the Customers module until an
    // invoice is paid. We create one per walk-in booking so the booking has a
    // valid customer_id (required by the API) without polluting Customers.
    if (isWalkIn && !data.customerId) {
      try {
        const res = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: WALKIN_SOURCE_NAME,
            phone: "",
            customer_type: "guest",
            source_id: WALKIN_SOURCE_ID,
            branch_id: selectedBranchId || null,
          }),
        });
        const json = await res.json();
        if (json.ok && json.data?.id) {
          data.customerId = json.data.id;
        } else {
          setConflictMessage(json.error || "Không thể tạo khách vãng lai");
          return;
        }
      } catch {
        setConflictMessage("Không thể tạo khách vãng lai");
        return;
      }
    }
    // Non-walk-in bookings still require a customer. If the staff TYPED a
    // phone + name but didn't pick from the dropdown (customerId still empty),
    // auto-resolve: match an existing customer by exact phone, else create a
    // new customer with the typed phone + name. This lets the staff just type
    // and save without forcing a dropdown click (matches the kiosk flow).
    if (!isWalkIn && !data.customerId) {
      const typedPhone = phoneSearch.trim();
      const typedName = nameSearch.trim();
      if (!typedPhone && !typedName) {
        setConflictMessage("Vui lòng chọn khách hàng");
        return;
      }
      try {
        // 1. Try to match an existing customer by exact phone (or name when no phone).
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (typedPhone) params.set("search", typedPhone);
        else params.set("search", typedName);
        const matchRes = await fetch(`/api/supabase/customers?${params.toString()}`);
        const matchJson = await matchRes.json();
        let matchedId: string | null = null;
        if (matchJson.ok && Array.isArray(matchJson.data)) {
          const exact = (matchJson.data as Array<{ id: string; phone?: string | null; name?: string }>).find(
            (c) => (typedPhone ? (c.phone || "") === typedPhone : (c.name || "") === typedName)
          );
          if (exact) matchedId = exact.id;
        }
        if (matchedId) {
          data.customerId = matchedId;
        } else {
          // 2. No match → create a new customer with the typed phone + name.
          const createRes = await fetch("/api/supabase/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: typedName || typedPhone,
              phone: typedPhone || undefined,
              branch_id: selectedBranchId || null,
            }),
          });
          const createJson = await createRes.json();
          if (createJson.ok && createJson.data?.id) {
            data.customerId = createJson.data.id;
            queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
          } else {
            setConflictMessage(createJson.error || "Không thể tạo khách hàng");
            return;
          }
        }
      } catch {
        setConflictMessage("Không thể tạo khách hàng");
        return;
      }
    }
    const error = await validateBooking(data);
    if (error) {
      setConflictMessage(error);
      return;
    }
    // Existing-booking confirmation: if the customer (by phone) already has
    // non-cancelled bookings (excluding the one being edited), show a
    // confirmation prompt listing them. Only proceed when the user confirms.
    // Skipped on the re-submit after confirmation (skipExistingCheck).
    const phone = phoneSearch.trim();
    if (!skipExistingCheck && phone) {
      try {
        const excludeParam = booking ? `&excludeBookingId=${encodeURIComponent(booking.id)}` : "";
        const existRes = await fetch(
          `/api/supabase/bookings/by-phone?phone=${encodeURIComponent(phone)}${excludeParam}`
        );
        const existJson = await existRes.json();
        if (existJson.ok && Array.isArray(existJson.data) && existJson.data.length > 0) {
          setPendingExistingBookings(existJson.data);
          setLastValidatedData(data);
          return; // stop — the confirmation dialog takes over
        }
      } catch {
        /* best-effort — don't block on network errors */
      }
    }
    if (booking) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddService = () => {
    append({
      serviceCategoryId: "",
      serviceId: "",
      staffId: "",
      showNote: false,
      date: "",
      time: "",
    });
  };

  const handleRemoveService = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={minimized
          ? "!max-w-[280px] !w-[280px] !min-w-0 p-0 overflow-hidden"
          : "!max-w-[780px] w-full !min-w-[600px] !max-h-[min(480px,calc(100vh-2rem))] p-0 overflow-hidden flex flex-col"}
        minimized={minimized}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Minimize / expand button — top-LEFT corner (the X close button stays
            top-right). Click to dock the dialog to the bottom as a thin bar;
            click again to restore. When minimized the button shrinks so the
            bar stays compact (height halved, width folded to 1/3). */}
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          className={minimized
            ? "absolute top-1 left-1 z-10 flex h-5 w-5 items-center justify-center rounded-xs text-gray-500 hover:bg-gray-100"
            : "absolute top-4 left-4 z-10 flex h-7 w-7 items-center justify-center rounded-xs text-gray-500 transition-opacity hover:opacity-100 hover:bg-gray-100"}
          aria-label={minimized ? "Phóng to" : "Thu nhỏ"}
          title={minimized ? "Phóng to" : "Thu nhỏ"}
        >
          {minimized ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <DialogHeader className={minimized ? "px-2 py-1 pl-8" : "px-4 pt-4 pb-2 pl-12 shrink-0"}>
          <DialogTitle className={minimized ? "text-xs font-semibold truncate" : "text-base font-semibold"}>
            {booking ? "Chỉnh sửa lịch hẹn" : "Tạo mới lịch hẹn"}
          </DialogTitle>
        </DialogHeader>

        {/* Form body — hidden when minimized so the dialog becomes a thin
            title bar docked at the bottom. The header (with the expand
            button) stays visible so the user can restore it. */}
        {!minimized && (
        <>
        {/* Scoped CSS — shrink every font size and button/input height inside
            the dialog so the whole form is more compact. Multiple rounds of
            reductions applied (text-sm 14→12px, h-9 36→28px, etc.). Also
            tightens input/select padding so the controls themselves are
            physically smaller, not just shorter. */}
        <style>{`
          .booking-dialog-form .text-sm { font-size: 12px !important; }
          .booking-dialog-form .text-xs { font-size: 10px !important; }
          .booking-dialog-form .text-base { font-size: 14px !important; }
          .booking-dialog-form .text-lg { font-size: 16px !important; }
          .booking-dialog-form .text-\[10px\] { font-size: 8px !important; }
          .booking-dialog-form .text-\[11px\] { font-size: 9px !important; }
          /* Responsive variants (md:text-sm etc.) — the Input/Textarea/Select
             components use md:text-sm at desktop width; override it too so the
             scoped font reduction actually takes effect. */
          .booking-dialog-form .md\\:text-sm { font-size: 12px !important; }
          .booking-dialog-form .md\\:text-base { font-size: 14px !important; }
          .booking-dialog-form input,
          .booking-dialog-form textarea,
          .booking-dialog-form [data-slot="select-trigger"],
          .booking-dialog-form [data-slot="label"] { font-size: 12px !important; }
          /* Input/select heights — physically smaller controls. */
          .booking-dialog-form .h-9 { height: 28px !important; min-height: 28px !important; }
          .booking-dialog-form .h-8 { height: 26px !important; min-height: 26px !important; }
          .booking-dialog-form .h-7 { height: 22px !important; min-height: 22px !important; }
          .booking-dialog-form .h-10 { height: 32px !important; min-height: 32px !important; }
          /* Tighten vertical padding inside inputs + selects so they look
             compact, not just short. */
          .booking-dialog-form input,
          .booking-dialog-form textarea { padding-top: 2px !important; padding-bottom: 2px !important; }
          .booking-dialog-form [data-slot="select-trigger"] { padding-top: 2px !important; padding-bottom: 2px !important; min-height: 28px !important; height: 28px !important; }
          /* Square icon buttons (quick-add, trash) — smaller. */
          .booking-dialog-form .h-9.w-9 { height: 26px !important; width: 26px !important; min-height: 26px !important; }
          .booking-dialog-form .h-8.w-8 { height: 22px !important; width: 22px !important; min-height: 22px !important; }
          /* Footer buttons — slightly smaller + tighter padding. */
          .booking-dialog-form button[type="submit"],
          .booking-dialog-form button[type="button"] { padding-left: 10px !important; padding-right: 10px !important; padding-top: 2px !important; padding-bottom: 2px !important; }
        `}</style>
        <form onSubmit={handleSubmit(onSubmit)} className="booking-dialog-form px-4 pb-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          {isLocked && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 shrink-0">
              <span className="font-medium">{lockReason}</span>
            </div>
          )}
          <fieldset disabled={isLocked} className="contents">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 min-h-0 flex-1 overflow-hidden">
            {/* LEFT COLUMN — scrollable so the dialog stays compact on short
                viewports. Both Thông tin khách hàng and Thông tin lịch hẹn
                sections live here and scroll together. */}
            <div className="space-y-4 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              {/* Section 1: Thông tin khách hàng */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Thông tin khách hàng
                </h3>
                {isWalkIn ? (
                  // Walk-in customer: no phone/name needed. The customer name
                  // defaults to "Khách vãng lai" and a guest record is created
                  // on submit (hidden from the Customers module until paid).
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                    Khách vãng lai
                  </div>
                ) : (
                <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Số điện thoại</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="phone"
                        placeholder="Số điện thoại"
                        value={phoneSearch}
                        onChange={(e) => {
                          setPhoneSearch(e.target.value);
                          // Editing the phone invalidates any previously selected
                          // customer AND its name — clearing nameSearch so the
                          // lookup query searches by phone ONLY (not a stale
                          // "phone + oldName" combo that returns 0 results).
                          setNameSearch("");
                          setValue("customerId", "");
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        // Disable the BROWSER's native autocomplete (the small
                        // black-text dropdown that shows only saved phone numbers).
                        // We have our own rich dropdown (phone + name + code)
                        // below — the native one is redundant and confusing.
                        // "off" is ignored by Chrome; a non-standard value like
                        // "nope" reliably disables it across browsers.
                        autoComplete="off"
                        name="phone-off"
                        className={watch("customerId") ? "pr-8" : ""}
                      />
                      {/* X clear button — VISIBLE whenever a customer is
                          selected (not just on hover). Clicking it clears the
                          phone, name, customerId, and auto-filled source/channel
                          so the cashier can start over. */}
                      {watch("customerId") && (
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneSearch("");
                            setNameSearch("");
                            setValue("customerId", "");
                            setValue("customerSourceId", "");
                            setValue("customerChannelId", "");
                            setShowCustomerDropdown(false);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-3 w-3 !p-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 hover:text-gray-900 [&_svg]:shrink-0"
                          title="Xóa để nhập lại"
                          aria-label="Xóa khách hàng đã chọn"
                        >
                          <X className="h-2 w-2" style={{ width: 8, height: 8 }} />
                        </button>
                      )}
                      {/* Phone-prefix autocomplete for old customers.
                          The dropdown shows whenever the phone field has text
                          AND there are matching customers — independently of
                          the showCustomerDropdown flag, so that editing the
                          phone AFTER a selection (deleting digits to correct a
                          typo, or typing a different number) still shows live
                          suggestions. The flag is only used to OPEN the
                          dropdown on focus and CLOSE it on item pick / blur. */}
                      {phoneSearch.trim() && filteredCustomers.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-y-auto">
                          {filteredCustomers.map((customer) => (
                            <div
                              key={customer.id}
                              className="cursor-pointer px-4 py-2 hover:bg-gray-100"
                              onClick={() => {
                                setValue("customerId", customer.id);
                                setPhoneSearch(customer.phone);
                                setNameSearch(customer.name);
                                // Auto-fill source + channel from the customer's
                                // existing data (if present) so the staff doesn't
                                // have to re-select them for returning customers.
                                if (customer.source?.id) {
                                  setValue("customerSourceId", customer.source.id);
                                }
                                if (customer.channel?.id) {
                                  setValue("customerChannelId", customer.channel.id);
                                }
                                setShowCustomerDropdown(false);
                              }}
                            >
                              <div className="font-medium">{customer.phone}</div>
                              <div className="text-sm text-gray-500">
                                {customer.name} | {customer.code}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Quick-add customer button (small square) */}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Thêm khách hàng mới"
                      onClick={() => {
                        setQuickAddError("");
                        // Pre-fill phone if the user already typed one.
                        setQuickAddPhone(phoneSearch.trim());
                        setQuickAddOpen(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  <input type="hidden" {...register("customerId")} />
                  {errors.customerId && (
                    <p className="text-sm text-red-500">
                      {errors.customerId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerName">Tên KH hoặc Mã KH</Label>
                  <div className="relative">
                    <Input
                      id="customerName"
                      placeholder="Tên KH hoặc Mã KH"
                      value={nameSearch}
                      onChange={(e) => {
                        setNameSearch(e.target.value);
                        // Editing the name invalidates any previously selected
                        // customer AND its phone — clearing phoneSearch so the
                        // lookup query searches by name ONLY (not a stale
                        // "oldPhone + name" combo that returns 0 results).
                        setPhoneSearch("");
                        setValue("customerId", "");
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      autoComplete="off"
                      name="customer-name-off"
                      className={watch("customerId") ? "pr-8" : ""}
                    />
                    {/* X clear button on the NAME field too — visible whenever
                        a customer is selected, mirrors the phone field's X. */}
                    {watch("customerId") && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneSearch("");
                          setNameSearch("");
                          setValue("customerId", "");
                          setValue("customerSourceId", "");
                          setValue("customerChannelId", "");
                          setShowCustomerDropdown(false);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex h-3 w-3 !p-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 hover:text-gray-900 [&_svg]:shrink-0"
                        title="Xóa để nhập lại"
                        aria-label="Xóa khách hàng đã chọn"
                      >
                        <X className="h-2 w-2" style={{ width: 8, height: 8 }} />
                      </button>
                    )}
                    {nameSearch && filteredCustomers.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="cursor-pointer px-4 py-2 hover:bg-gray-100"
                            onClick={() => {
                              setValue("customerId", customer.id);
                              setPhoneSearch(customer.phone);
                              setNameSearch(customer.name);
                              // Auto-fill source + channel from the customer's
                              // existing data (if present).
                              if (customer.source?.id) {
                                setValue("customerSourceId", customer.source.id);
                              }
                              if (customer.channel?.id) {
                                setValue("customerChannelId", customer.channel.id);
                              }
                              setShowCustomerDropdown(false);
                            }}
                          >
                            <div className="font-medium">{customer.name}</div>
                            <div className="text-sm text-gray-500">
                              {customer.phone} | {customer.code}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                </>
                )}
              </div>

              {/* Section 2: Thông tin lịch hẹn */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Thông tin lịch hẹn
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="customerSourceId">Nguồn khách hàng</Label>
                    <Select
                      value={watch("customerSourceId") || ""}
                      onValueChange={(value) => {
                        setValue("customerSourceId", value);
                        if (value === WALKIN_SOURCE_ID) {
                          // Walk-in: clear phone/name search + any selected
                          // customer — the booking will use a guest record.
                          setPhoneSearch("");
                          setNameSearch("");
                          setValue("customerId", "");
                          setShowCustomerDropdown(false);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                        <SelectValue placeholder="Chọn" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((source) => (
                          <SelectItem key={source.id} value={source.id} className="max-w-full">
                            <span className="truncate block">{source.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerChannelId">Kênh đặt lịch</Label>
                    <Select
                      value={watch("customerChannelId") || ""}
                      onValueChange={(value) =>
                        setValue("customerChannelId", value)
                      }
                    >
                      <SelectTrigger className="w-full min-w-0 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                        <SelectValue placeholder="chọn" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id} className="max-w-full">
                            <span className="truncate block">{channel.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="numberOfCustomers">Số khách</Label>
                    <Input
                      id="numberOfCustomers"
                      type="number"
                      min={1}
                      {...register("numberOfCustomers", { valueAsNumber: true })}
                    />
                    {errors.numberOfCustomers && (
                      <p className="text-sm text-red-500">
                        {errors.numberOfCustomers.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Trạng thái</Label>
                    <Select
                      onValueChange={(value) => setValue("status", value as "new" | "confirmed" | "checkin" | "checkout" | "no_show" | "cancelled")}
                      defaultValue={watch("status")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(BookingStatusLabel)
                          .filter(([key]) => key !== "checkout")
                          .map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {errors.status && (
                      <p className="text-sm text-red-500">
                        {errors.status.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ngày & Giờ — booking-level start. This is the start of the
                    FIRST service; subsequent services run consecutively after it.
                    Moved here from the per-service section so the cashier sets
                    one start time for the whole appointment. The Giờ picker is
                    disabled until a Ngày is selected — past-time blocking
                    depends on the chosen date, so the date must come first. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="date">Ngày</Label>
                    <DatePicker
                      id="date"
                      value={watch("date") || ""}
                      onChange={(value) => setValue("date", value)}
                      minDate={!canBookPastDate ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined}
                    />
                    {errors.date && (
                      <p className="text-sm text-red-500">{errors.date.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Giờ</Label>
                    <TimePicker
                      id="time"
                      value={watch("time") || ""}
                      onChange={(value) => setValue("time", value)}
                      disabled={!watch("date")}
                      placeholder={watch("date") ? "HH:MM" : "Chọn ngày trước"}
                      hiddenHours={pastTimeHidden.hiddenHours}
                      hiddenMinutes={pastTimeHidden.hiddenMinutes}
                      // NOTE: no minuteStep here — the minute column shows ALL
                      // values 00-59 so the user can pick any minute. The slot
                      // click in View nhân viên already pre-snaps the prefill to
                      // 00 or 30 (per the user's request), but the picker stays
                      // fully selectable so the user can override it.
                    />
                    {errors.time && (
                      <p className="text-sm text-red-500">{errors.time.message}</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  {watch("date")
                    ? "Tất cả dịch vụ sẽ cùng bắt đầu vào giờ này (mỗi dịch vụ 1 thợ khác nhau)."
                    : "Vui lòng chọn Ngày trước, sau đó mới chọn Giờ."}
                </p>

                <div className="space-y-2">
                  <Label htmlFor="note">Ghi chú</Label>
                  <Textarea
                    id="note"
                    {...register("note")}
                    placeholder="Nhập ghi chú..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - Section 3: Dịch vụ — scrollable so many services
                don't grow the dialog. */}
            <div className="space-y-3 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Dịch vụ
              </h3>

              <div className="space-y-3">
                {/* Scrollable services list: when the customer adds many services
                    the list scrolls vertically instead of growing the dialog unboundedly. */}
                <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="rounded-lg border bg-gray-50 p-4 space-y-3"
                  >
                    {fields.length > 1 && (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveService(index)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`services.${index}.serviceCategoryId`}>
                          Nhóm dịch vụ
                        </Label>
                        <Select
                          value={watch(`services.${index}.serviceCategoryId`) || ""}
                          onValueChange={(value) => {
                            setValue(`services.${index}.serviceCategoryId`, value);
                            setValue(`services.${index}.serviceId`, "");
                          }}
                        >
                          <SelectTrigger className="w-full min-w-0 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue placeholder="Chọn nhóm dịch vụ" />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleServiceCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id} className="max-w-full">
                                <span className="truncate block">{cat.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`services.${index}.serviceId`}>
                          Chọn dịch vụ
                        </Label>
                        <Select
                          value={watch(`services.${index}.serviceId`) || ""}
                          onValueChange={(value) =>
                            setValue(`services.${index}.serviceId`, value)
                          }
                          disabled={!watch(`services.${index}.serviceCategoryId`)}
                        >
                          <SelectTrigger className="w-full min-w-0 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue placeholder={
                              watch(`services.${index}.serviceCategoryId`)
                                ? "Chọn dịch vụ"
                                : "Chọn nhóm dịch vụ trước"
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {services
                              .filter(
                                (s) =>
                                  s.categoryId ===
                                  watch(`services.${index}.serviceCategoryId`)
                              )
                              .map((service) => (
                                <SelectItem key={service.id} value={service.id} className="max-w-full">
                                  <span className="truncate block">{service.name}</span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {canAssignStaff && (
                        <div className="space-y-2">
                          <Label htmlFor={`services.${index}.staffId`}>
                            Chọn nhân viên
                          </Label>
                          <Select
                            value={watch(`services.${index}.staffId`) || ""}
                            onValueChange={(value) =>
                              setValue(`services.${index}.staffId`, value)
                            }
                          >
                            <SelectTrigger className="w-full min-w-0 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                              <SelectValue placeholder="Chọn nhân viên" />
                            </SelectTrigger>
                            <SelectContent>
                              {getStaffForService(watch(`services.${index}.serviceId`), index).map((staff) => (
                                <SelectItem key={staff.id} value={staff.id} className="max-w-full">
                                  <span className="truncate block">{staff.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Per-service date/time inputs were removed. The booking-
                        level Ngày/Giờ (in "Thông tin lịch hẹn" above) is the
                        start of the FIRST service; subsequent services run
                        consecutively after it. */}
                  </div>
                ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddService}
                  className="w-full border-dashed"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm dịch vụ
                </Button>

                {/* Consolidated summary of all selected services. Each service's
                    start time is derived from the booking-level (date, time)
                    running consecutively, so the cashier can see the schedule
                    even though per-service date/time inputs no longer exist. */}
                {(() => {
                  const entries = watchedServices
                    .map((entry, idx) => {
                      const svc = services.find((s) => s.id === entry.serviceId);
                      if (!svc) return null;
                      const staff = entry.staffId
                        ? staffList.find((st) => st.id === entry.staffId)
                        : null;
                      return { idx, svc, staff, entry };
                    })
                    .filter(
                      (e): e is { idx: number; svc: Service; staff: Staff | null; entry: (typeof watchedServices)[number] } =>
                        e !== null
                    );
                  if (entries.length === 0) return null;
                  const totalPrice = entries.reduce((sum, e) => sum + e.svc.price, 0);
                  // All services start at the SAME booking-level time (parallel
                  // model — each service runs on a different staff). Previously
                  // they ran consecutively; now every service shows the same
                  // "HH:mm" start label.
                  const bookingDate = watch("date") || "";
                  const bookingTime = watch("time") || "";
                  const startM = bookingDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                  const startTm = bookingTime.match(/^(\d{1,2}):(\d{2})$/);
                  const hasStart = !!(startM && startTm);
                  // The single shared start "HH:mm" (= the booking-level time).
                  const sharedStartTime = hasStart
                    ? `${String(Number(startTm![1])).padStart(2, "0")}:${startTm![2]}`
                    : "";
                  // Every entry shares the same start label.
                  const timeLabels: Record<number, string> = {};
                  if (hasStart) {
                    for (const e of entries) {
                      timeLabels[e.idx] = sharedStartTime;
                    }
                  }
                  return (
                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Dịch vụ đã chọn ({entries.length})
                      </div>
                      <div className="space-y-1.5">
                        {entries.map((e) => (
                          <div
                            key={e.idx}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="font-medium text-gray-800">
                              {e.svc.name}
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="text-emerald-700">
                              {formatDuration(e.svc.duration)}
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="font-semibold text-emerald-700">
                              {formatPrice(e.svc.price)}
                            </span>
                            {e.staff && (
                              <>
                                <span className="text-gray-400">|</span>
                                <span className="font-medium text-emerald-700">
                                  {e.staff.name}
                                </span>
                              </>
                            )}
                            {hasStart && timeLabels[e.idx] && (
                              <>
                                <span className="text-gray-400">|</span>
                                <span className="text-gray-600">{timeLabels[e.idx]}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-emerald-200 pt-2 text-sm">
                        <span className="text-gray-600">
                          Thời gian dài nhất:{" "}
                          <span className="font-medium text-gray-900">
                            {formatDuration(Math.max(...entries.map((e) => e.svc.duration || 0)))}
                          </span>
                        </span>
                        <span className="text-gray-600">
                          Tổng tiền:{" "}
                          <span className="font-semibold text-emerald-700">
                            {formatPrice(totalPrice)}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          </fieldset>

          {/* Footer */}
          <div className="mt-3 flex justify-end gap-3 border-t pt-3 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={
                isLocked ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              title={
                isLocked
                  ? "Lịch hẹn ở trạng thái không thể chỉnh sửa"
                  : undefined
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Đang lưu..."
                : isLocked
                ? "Không thể lưu"
                : "Lưu"}
            </Button>
          </div>
        </form>
        </>
        )}
      </DialogContent>

      {/* Quick-add customer dialog */}
      <Dialog open={quickAddOpen} onOpenChange={(v) => { setQuickAddOpen(v); if (!v) setQuickAddError(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="quickAddName">
                Tên khách hàng <span className="text-red-500">*</span>
              </Label>
              <Input
                id="quickAddName"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                placeholder="Nhập tên khách hàng"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickAddPhone">
                Số điện thoại <span className="text-red-500">*</span>
              </Label>
              <Input
                id="quickAddPhone"
                value={quickAddPhone}
                onChange={(e) => {
                  setQuickAddPhone(e.target.value);
                  setQuickAddError("");
                }}
                placeholder="Nhập số điện thoại"
              />
            </div>
            {quickAddError && (
              <p className="text-sm text-red-500">{quickAddError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setQuickAddOpen(false); setQuickAddError(""); }}
              disabled={quickAddChecking}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleQuickAddSubmit}
              disabled={quickAddChecking}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {quickAddChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : (
                "Lưu"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict / validation error dialog */}
      <Dialog open={conflictMessage !== ""} onOpenChange={(v) => { if (!v) setConflictMessage(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Không thể đặt lịch</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-line text-sm text-gray-700">{conflictMessage}</p>
          <DialogFooter>
            <Button type="button" onClick={() => setConflictMessage("")}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing-booking confirmation — shown when the customer (by phone)
          already has non-cancelled bookings. Lists them and asks whether to
          continue creating/updating. OK → re-submit with skipExistingCheck;
          Hủy → dismiss and keep the form open. */}
      <Dialog
        open={pendingExistingBookings.length > 0}
        onOpenChange={(v) => {
          if (!v) {
            setPendingExistingBookings([]);
            setSkipExistingCheck(false);
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
                setSkipExistingCheck(false);
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setPendingExistingBookings([]);
                setSkipExistingCheck(true);
                if (lastValidatedData) onSubmit(lastValidatedData);
              }}
            >
              OK, đặt tiếp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}