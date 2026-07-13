"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LogIn, Calendar as CalendarIcon, Clock, Scissors, User, Phone, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/hooks/use-toast";
import { cn, localDayToUtcRange } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types for the reference data fetched from Supabase.
// ---------------------------------------------------------------------------
interface ServiceCategory {
  id: string;
  name: string;
  branches?: string[];
}
interface Service {
  id: string;
  name: string;
  duration: number;
  price?: number;
  category_id: string | null;
}
interface Staff {
  id: string;
  name: string;
  groupName?: string;
}
interface ExistingBooking {
  id: string;
  date_time: string;
  status: string;
  services: Array<{
    staff_id: string | null;
    duration?: number;
    service?: { duration?: number } | null;
  }>;
}

// Hairdresser groups that can be booked for a service (mirrors booking-dialog).
const HAIRDRESSER_GROUPS = ["Artist", "Creative Director", "Master", "Junior"];

export default function DatLichPage() {
  const { toast } = useToast();
  const { branches, selectedBranchId, setBranches, setSelectedBranchId } = useBranchStore();
  // Whether a staff member is logged in. The /dat-lich page is public
  // (customers book without an account), but staff also use it. When a staff
  // is signed in, the "already has a booking" notice is for internal use, so
  // we omit the customer-facing "contact CSKH to change the booking" line.
  const isLoggedIn = !!useAuthStore((s) => s.user);

  // --- Form state ---------------------------------------------------------
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bookingDate, setBookingDate] = useState(""); // "DD/MM/YYYY"
  const [categoryId, setCategoryId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [bookingTime, setBookingTime] = useState(""); // "HH:MM"
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  // Existing-booking confirmation: when the customer (by phone) already has
  // non-cancelled bookings, we show a confirmation prompt listing them before
  // actually creating a new booking. `pendingExisting` holds the list while
  // the user decides; `skipExistingCheck` is set true after they confirm so
  // the re-submit skips the check.
  const [pendingExisting, setPendingExisting] = useState<
    Array<{ date: string; time: string; status: string; branchName: string; services: Array<{ name: string; staffName: string }> }>
  >([]);
  const [skipExistingCheck, setSkipExistingCheck] = useState(false);
  // Customer autocomplete: when the user types a name OR phone prefix (≥2
  // chars), fetch matching customers and show a dropdown. Selecting a result
  // fills BOTH name + phone. `activeField` tracks which input the user is
  // currently typing in so the dropdown anchors under it.
  const [suggestions, setSuggestions] = useState<
    Array<{ id: string; name: string; phone: string | null; code: string | null }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<"name" | "phone" | null>(null);

  // --- Fetch branches (customer-facing page has no admin BranchSelector) ---
  // The branch list is needed to render the dropdown below. We also populate
  // the store so downstream queries (categories/staff/bookings) can use it.
  useQuery({
    queryKey: ["dat-lich-branches"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches?active=true");
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setBranches(json.data);
        // Auto-select the first active branch if nothing is selected yet.
        if (!selectedBranchId && json.data.length > 0) {
          setSelectedBranchId(json.data[0].id);
        }
      }
      return json.data || [];
    },
  });

  // --- Reference data: service categories ---------------------------------
  const { data: categoriesData } = useQuery<ServiceCategory[]>({
    queryKey: ["dat-lich-categories", selectedBranchId],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories?active=true");
      const json = await res.json();
      const all = (json.data || []) as ServiceCategory[];
      // Keep only categories available at the selected branch.
      if (!selectedBranchId || selectedBranchId === "all") return all;
      return all.filter((c) => (c.branches || []).includes(selectedBranchId));
    },
    enabled: !!selectedBranchId,
  });

  // --- Reference data: services -------------------------------------------
  const { data: servicesData } = useQuery<Service[]>({
    queryKey: ["dat-lich-services"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/services?limit=200");
      const json = await res.json();
      return (json.data || []) as Service[];
    },
  });

  // --- Reference data: staff (hairdressers only) --------------------------
  const { data: staffData } = useQuery<Staff[]>({
    queryKey: ["dat-lich-staff", selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const res = await fetch(
        `/api/supabase/staff?branch_id=${selectedBranchId}&active=true&limit=200`
      );
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<Record<string, unknown>>)
        .filter((s) => {
          const groupName = (s.group as { name?: string } | null)?.name;
          return groupName && HAIRDRESSER_GROUPS.includes(groupName);
        })
        .map((s) => ({
          id: s.id as string,
          name: s.name as string,
          groupName: (s.group as { name?: string } | null)?.name,
        }));
    },
    enabled: !!selectedBranchId,
  });

  // --- Phone lookup: determine if the customer is new or returning -------
  // A "returning" (old) customer is one whose exact phone number already
  // exists in the customers table. This drives the service-category filter
  // (new customers see the "Dành cho khách hàng mới" cut; old customers see
  // the regular "Dịch Vụ Cắt").
  const trimmedPhone = customerPhone.trim();
  const { data: phoneLookup } = useQuery<
    { id: string; phone?: string | null }[] | null
  >({
    queryKey: ["dat-lich-phone-lookup", trimmedPhone],
    queryFn: async () => {
      if (!trimmedPhone) return null;
      const res = await fetch(
        `/api/supabase/customers?search=${encodeURIComponent(trimmedPhone)}&limit=20`
      );
      const json = await res.json();
      if (!json.ok) return null;
      return (json.data || []) as { id: string; phone?: string | null }[];
    },
    enabled: trimmedPhone.length >= 9,
  });
  const isOldCustomer = useMemo(() => {
    if (!trimmedPhone || !phoneLookup) return false;
    return phoneLookup.some((c) => c.phone === trimmedPhone);
  }, [trimmedPhone, phoneLookup]);

  // --- Customer autocomplete ----------------------------------------------
  // Debounced search: when the user types ≥2 chars in EITHER the name or phone
  // field, fetch matching customers (by name prefix OR phone prefix) and show
  // a dropdown. Selecting a suggestion fills both name + phone.
  useEffect(() => {
    // Determine the search term based on which field the user is typing in.
    const term =
      activeField === "phone"
        ? customerPhone.trim()
        : activeField === "name"
          ? customerName.trim()
          : "";
    let cancelled = false;
    const t = setTimeout(async () => {
      if (term.length < 2) {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
        return;
      }
      try {
        const res = await fetch(
          `/api/supabase/customers?search=${encodeURIComponent(term)}&limit=10`
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data)) {
          // Filter to prefix matches on name OR phone (the API's `search`
          // does an ilike contains; we refine to prefix for relevance).
          const lower = term.toLowerCase();
          const matches = (json.data as Array<{ id: string; name: string; phone?: string | null; code?: string | null }>)
            .filter((c) => {
              const nameMatch = (c.name || "").toLowerCase().startsWith(lower);
              const phoneMatch = (c.phone || "").startsWith(term);
              return nameMatch || phoneMatch;
            })
            .map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null, code: c.code ?? null }));
          if (!cancelled) {
            setSuggestions(matches);
            setShowSuggestions(matches.length > 0);
          }
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 250); // 250ms debounce
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerName, customerPhone, activeField]);

  const selectSuggestion = (s: { name: string; phone: string | null }) => {
    setCustomerName(s.name);
    setCustomerPhone(s.phone || "");
    setShowSuggestions(false);
    setActiveField(null);
  };
  const customerType: "new" | "old" = isOldCustomer ? "old" : "new";

  // Categories filtered by branch AND customer type (mirrors booking-dialog):
  // - New customer (phone not in DB): hide "Dịch Vụ Cắt", keep new-customer cut.
  // - Old customer (phone in DB): hide "Dành cho khách hàng mới - DV Cắt".
  const categories = useMemo(() => {
    const all = categoriesData || [];
    const byBranch =
      !selectedBranchId || selectedBranchId === "all"
        ? all
        : all.filter((c) => (c.branches || []).includes(selectedBranchId));
    return byBranch.filter((c) => {
      const name = c.name.toLowerCase();
      const isNewCustomerCut = name.includes("dành cho khách hàng mới");
      const isRegularCut =
        name.includes("dịch vụ cắt") || name === "dịch vụ cắt";
      if (customerType === "new") {
        if (isRegularCut && !isNewCustomerCut) return false;
      } else {
        if (isNewCustomerCut) return false;
      }
      return true;
    });
  }, [categoriesData, selectedBranchId, customerType]);

  const allServices = servicesData || [];
  const allStaff = staffData || [];

  // If the selected category is no longer visible after the customer-type
  // filter changes (e.g. phone typed → old customer → "Dành cho KH mới" hidden),
  // reset the service selection chain to avoid a stale hidden selection.
  useEffect(() => {
    if (categoryId && !categories.some((c) => c.id === categoryId)) {
      setCategoryId("");
      setServiceId("");
      setStaffId("");
      setBookingTime("");
    }
  }, [categories, categoryId]);

  // Services filtered by the selected category.
  const servicesInCategory = useMemo(
    () => allServices.filter((s) => !categoryId || s.category_id === categoryId),
    [allServices, categoryId]
  );

  // Staff filtered by the selected service (name-based narrowing, mirrors
  // booking-dialog: "Creative Director" in name → only that group, etc.).
  const staffForService = useMemo(() => {
    if (!serviceId) return allStaff;
    const svc = allServices.find((s) => s.id === serviceId);
    if (!svc) return allStaff;
    const n = (svc.name || "").toLowerCase();
    if (n.includes("creative director")) {
      return allStaff.filter((s) => s.groupName === "Creative Director");
    }
    if (n.includes("artist")) {
      return allStaff.filter((s) => s.groupName === "Artist");
    }
    return allStaff;
  }, [allStaff, allServices, serviceId]);

  // The selected service (for its duration — needed for feasibility).
  const selectedService = useMemo(
    () => allServices.find((s) => s.id === serviceId),
    [allServices, serviceId]
  );

  // --- Feasible-time computation (mirrors booking-dialog) -----------------
  // Fetch the day's existing bookings (for the branch) and compute which
  // HH:MM start times would overlap the selected staff's existing bookings.
  const isoDay = useMemo(() => {
    const m = bookingDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }, [bookingDate]);

  const { data: dayBookings } = useQuery<ExistingBooking[]>({
    queryKey: ["dat-lich-day-bookings", isoDay, selectedBranchId],
    queryFn: async () => {
      if (!isoDay) return [];
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "200");
      // Timezone-safe: isoDay is a Vietnam calendar day; convert to its UTC
      // range so Supabase filters the correct window (no 7-hour shift).
      const dl = localDayToUtcRange(isoDay);
      params.set("date_from", dl.from);
      params.set("date_to", dl.to);
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data || []) as ExistingBooking[];
    },
    enabled: !!isoDay && !!staffId,
  });

  // Compute hiddenHours + hiddenMinutes for the TimePicker.
  const { hiddenHours, hiddenMinutes } = useMemo(() => {
    const empty = { hiddenHours: new Set<string>(), hiddenMinutes: {} as Record<string, Set<string>> };
    if (!staffId || !isoDay || !selectedService) return empty;
    const intervals: { startMs: number; endMs: number }[] = [];
    for (const b of dayBookings || []) {
      if (b.status === "cancelled" || b.status === "no_show") continue;
      const exStart = new Date(b.date_time).getTime();
      if (isNaN(exStart)) continue;
      for (const s of b.services || []) {
        if (s.staff_id !== staffId) continue;
        const dur =
          (Number(s.duration) || Number(s.service?.duration) || 60) * 60 * 1000;
        intervals.push({ startMs: exStart, endMs: exStart + dur });
      }
    }
    if (intervals.length === 0) return empty;
    const durationMs = (selectedService.duration || 60) * 60 * 1000;
    if (durationMs <= 0) return empty;
    const m = bookingDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return empty;
    // Use the +07:00 offset so dayBase is the correct UTC instant for VN
    // midnight (same fix as the booking dialog + cashier service selector).
    const dayBase = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+07:00`).getTime();
    if (isNaN(dayBase)) return empty;
    const hh = new Set<string>();
    const hm: Record<string, Set<string>> = {};
    const hourHasFeasible: Record<string, boolean> = {};
    for (let h = 0; h < 24; h++) hourHasFeasible[String(h).padStart(2, "0")] = false;
    for (let min = 0; min < 60 * 24; min++) {
      const startMs = dayBase + min * 60 * 1000;
      const endMs = startMs + durationMs;
      const overlaps = intervals.some((iv) => startMs < iv.endMs && iv.startMs < endMs);
      const hStr = String(Math.floor(min / 60)).padStart(2, "0");
      const mStr = String(min % 60).padStart(2, "0");
      if (overlaps) {
        if (!hm[hStr]) hm[hStr] = new Set<string>();
        hm[hStr].add(mStr);
      } else {
        hourHasFeasible[hStr] = true;
      }
    }
    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, "0");
      if (!hourHasFeasible[hStr]) hh.add(hStr);
    }
    return { hiddenHours: hh, hiddenMinutes: hm };
  }, [staffId, isoDay, selectedService, dayBookings, bookingDate]);

  // Reset downstream selections when an upstream one changes.
  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    setServiceId("");
    setStaffId("");
    setBookingTime("");
  };
  const onServiceChange = (id: string) => {
    setServiceId(id);
    setStaffId("");
    setBookingTime("");
  };
  // Changing the branch invalidates the whole service chain — staff and
  // service availability are branch-specific. Reset everything downstream.
  const onBranchChange = (id: string) => {
    setSelectedBranchId(id);
    setCategoryId("");
    setServiceId("");
    setStaffId("");
    setBookingTime("");
  };

  // Part 1 (customer info) must be fully filled before Part 2 (service) opens.
  const part1Complete = !!(
    customerName.trim() &&
    customerPhone.trim() &&
    bookingDate
  );
  // Khung giờ requires Nhóm DV + Dịch vụ + Kỹ thuật viên all selected first.
  const timePickerReady = part1Complete && !!serviceId && !!staffId;

  const canSubmit =
    part1Complete &&
    serviceId &&
    staffId &&
    bookingTime &&
    !!selectedBranchId &&
    !submitting;

  // --- Submit: lookup/create customer, then create booking -----------------
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      // 0. One-time offer check: if the selected category is "Dành cho khách
      //    hàng mới - DV Cắt", the customer (by phone) may only book it ONCE.
      //    If they already have a non-cancelled booking with this category,
      //    block the submit with a message pointing to the existing booking's
      //    date and CSKH for changes.
      const selectedCat = categories.find((c) => c.id === categoryId);
      const isNewCustomerCut =
        !!selectedCat &&
        selectedCat.name.toLowerCase().includes("dành cho khách hàng mới");
      if (isNewCustomerCut && customerPhone.trim()) {
        try {
          const checkRes = await fetch(
            `/api/supabase/bookings/check-new-customer-cut?phone=${encodeURIComponent(customerPhone.trim())}`
          );
          const checkJson = await checkRes.json();
          if (checkJson.ok && checkJson.data?.exists) {
            const existingDate = checkJson.data.existingDate || "";
            // Staff (logged in) see the short internal notice; customers
            // additionally see the CSKH contact line.
            setError(
              `Không thể đặt lịch vì đang có 1 lịch cắt "Dành cho khách hàng mới - DV Cắt" vào ngày ${existingDate}.` +
                (isLoggedIn
                  ? ""
                  : " Để đặt ngày khác vui lòng liên hệ bộ phận CSKH để thay đổi lịch.")
            );
            setSubmitting(false);
            return;
          }
        } catch {
          /* best-effort — don't block on network errors */
        }
      }

      // 0b. Existing-booking confirmation: if the customer (by phone) already
      //     has any non-cancelled booking, show a confirmation prompt listing
      //     them (date/time/services/branch) and ask "are you sure?". Only
      //     proceed when the user confirms. Skipped on the re-submit after
      //     confirmation (skipExistingCheck) or when there's no phone.
      if (!skipExistingCheck && customerPhone.trim()) {
        try {
          const existRes = await fetch(
            `/api/supabase/bookings/by-phone?phone=${encodeURIComponent(customerPhone.trim())}`
          );
          const existJson = await existRes.json();
          if (existJson.ok && Array.isArray(existJson.data) && existJson.data.length > 0) {
            setPendingExisting(existJson.data);
            setSubmitting(false);
            return; // stop — the confirmation UI takes over
          }
        } catch {
          /* best-effort — don't block on network errors */
        }
      }

      // 1. Look up the customer by phone (exact match). If found, reuse id.
      let customerId: string | null = null;
      try {
        const searchRes = await fetch(
          `/api/supabase/customers?search=${encodeURIComponent(customerPhone.trim())}&limit=20`
        );
        const searchJson = await searchRes.json();
        if (searchJson.ok && Array.isArray(searchJson.data)) {
          const exact = searchJson.data.find(
            (c: { phone?: string | null }) =>
              c.phone && c.phone === customerPhone.trim()
          );
          if (exact) customerId = exact.id;
        }
      } catch {
        /* ignore — will create below */
      }

      // 2. If no existing customer, create one (name + phone + branch).
      if (!customerId) {
        const createRes = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName.trim(),
            phone: customerPhone.trim(),
            branch_id: selectedBranchId,
          }),
        });
        const createJson = await createRes.json();
        if (createRes.ok && createJson.ok && createJson.data?.id) {
          customerId = createJson.data.id;
        } else if (createRes.status === 409 && createJson.existing_customer?.id) {
          // Race: phone existed but wasn't returned by the search above.
          customerId = createJson.existing_customer.id;
        } else {
          throw new Error(createJson.error || "Không thể tạo khách hàng");
        }
      }

      // 3. Build the ISO date_time with explicit +07:00 (Vietnam) offset so
      //    Postgres stores the VN time correctly. Without the offset, the
      //    naive string is treated as UTC and evening bookings (≥17:00 VN)
      //    shift to the next day.
      const m = bookingDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) throw new Error("Ngày đặt lịch không hợp lệ");
      const isoDateTime = `${m[3]}-${m[2]}-${m[1]}T${bookingTime}:00+07:00`;

      // 4. Create the booking.
      const bookingRes = await fetch("/api/supabase/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_time: isoDateTime,
          customer_id: customerId,
          branch_id: selectedBranchId,
          status: "confirmed",
          number_of_customers: 1,
          services: [
            {
              service_id: serviceId,
              service_category_id: categoryId || null,
              staff_id: staffId,
            },
          ],
        }),
      });
      const bookingJson = await bookingRes.json();
      if (!bookingRes.ok || !bookingJson.ok) {
        throw new Error(bookingJson.error || "Không thể tạo lịch hẹn");
      }

      setSuccess(true);
      setSkipExistingCheck(false);
      setPendingExisting([]);
      toast({
        title: "Đặt lịch thành công",
        description: `${customerName.trim()} — ${bookingDate} ${bookingTime}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra";
      setError(msg);
      toast({
        title: "Đặt lịch thất bại",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setBookingDate("");
    setCategoryId("");
    setServiceId("");
    setStaffId("");
    setBookingTime("");
    setSuccess(false);
    setSkipExistingCheck(false);
    setPendingExisting([]);
  };

  // --- Booking form -------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      {/* Top bar with brand + login button (top-right corner) */}
      <header className="flex items-center justify-between border-b bg-white/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Scissors className="h-6 w-6 text-emerald-600" />
          <span className="text-lg font-bold text-gray-900">EasySalon</span>
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Đặt lịch
          </span>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <LogIn className="h-4 w-4" />
          Đăng nhập
        </Link>
      </header>

      {/* Form card */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Đặt lịch dịch vụ</h1>
          <p className="mt-1 text-sm text-gray-500">
            Điền thông tin và chọn dịch vụ, kỹ thuật viên, khung giờ phù hợp.
          </p>
        </div>

        <div className="space-y-6">
          {/* Part 1: Customer info */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
              <User className="h-4 w-4 text-emerald-600" />
              Thông tin khách hàng
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Cửa hàng (branch) — staff/services are branch-specific. */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="branch" className="text-sm text-gray-700">
                  <span className="text-red-500">*</span> Cửa hàng
                </Label>
                <Select
                  value={selectedBranchId || ""}
                  onValueChange={onBranchChange}
                >
                  <SelectTrigger className="h-10">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <SelectValue placeholder="Chọn cửa hàng" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {branches.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Không có cửa hàng
                      </SelectItem>
                    ) : (
                      branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm text-gray-700">
                  <span className="text-red-500">*</span> Họ tên khách
                </Label>
                <div className="relative">
                  <Input
                    id="name"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setActiveField("name");
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setActiveField("name");
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      // Delay hide so a click on a suggestion registers first.
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    placeholder="Nhập họ và tên"
                    className="h-10"
                    autoComplete="off"
                  />
                  {showSuggestions && activeField === "name" && suggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion(s);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                        >
                          <span className="font-medium text-gray-800">{s.name}</span>
                          <span className="text-xs text-gray-500">{s.phone || "—"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm text-gray-700">
                  <span className="text-red-500">*</span> Số điện thoại
                </Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="phone"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      setActiveField("phone");
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setActiveField("phone");
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    placeholder="0xxx xxx xxx"
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                  {showSuggestions && activeField === "phone" && suggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion(s);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                        >
                          <span className="font-medium text-gray-800">{s.phone || "—"}</span>
                          <span className="text-xs text-gray-500">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="date" className="text-sm text-gray-700">
                  <span className="text-red-500">*</span> Ngày đặt lịch
                </Label>
                <div className="relative max-w-xs">
                  <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <div className="pl-9">
                    <DatePicker value={bookingDate} onChange={setBookingDate} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Part 2: Service selection (locked until Part 1 is complete) */}
          <section
            className={cn(
              "rounded-xl border bg-white p-6 shadow-sm transition-opacity",
              !part1Complete && "opacity-50"
            )}
          >
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Scissors className="h-4 w-4 text-emerald-600" />
              Dịch vụ
              {!part1Complete && (
                <span className="ml-auto text-xs font-normal text-gray-400">
                  Vui lòng nhập đầy đủ thông tin khách hàng trước
                </span>
              )}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Nhóm dịch vụ */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Nhóm dịch vụ</Label>
                <Select
                  value={categoryId}
                  onValueChange={onCategoryChange}
                  disabled={!part1Complete}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue
                      placeholder={
                        part1Complete ? "Chọn nhóm dịch vụ" : "Nhập thông tin KH trước"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Không có nhóm dịch vụ
                      </SelectItem>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Dịch vụ */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Dịch vụ</Label>
                <Select
                  value={serviceId}
                  onValueChange={onServiceChange}
                  disabled={!part1Complete || !categoryId}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue
                      placeholder={
                        !part1Complete
                          ? "Nhập thông tin KH trước"
                          : categoryId
                            ? "Chọn dịch vụ"
                            : "Chọn nhóm trước"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {servicesInCategory.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Không có dịch vụ
                      </SelectItem>
                    ) : (
                      servicesInCategory.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.price ? ` — ${new Intl.NumberFormat("vi-VN").format(Number(s.price))}đ` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Kỹ thuật viên */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Kỹ thuật viên</Label>
                <Select
                  value={staffId}
                  onValueChange={(v) => { setStaffId(v); setBookingTime(""); }}
                  disabled={!part1Complete || !serviceId}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue
                      placeholder={
                        !part1Complete
                          ? "Nhập thông tin KH trước"
                          : serviceId
                            ? "Chọn kỹ thuật viên"
                            : "Chọn dịch vụ trước"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {staffForService.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Không có kỹ thuật viên
                      </SelectItem>
                    ) : (
                      staffForService.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.groupName ? ` (${s.groupName})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Khung giờ (locked until Nhóm DV + Dịch vụ + Kỹ thuật viên selected) */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Khung giờ</Label>
                <div
                  className={cn(
                    "relative transition-opacity",
                    !timePickerReady && "pointer-events-none opacity-40"
                  )}
                >
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <div className="pl-9">
                    <TimePicker
                      value={bookingTime}
                      onChange={setBookingTime}
                      placeholder={
                        timePickerReady ? "HH:MM" : "Chọn dịch vụ + NV trước"
                      }
                      hiddenHours={hiddenHours}
                      hiddenMinutes={hiddenMinutes}
                    />
                  </div>
                </div>
                {staffId && bookingDate && (dayBookings?.length ?? 0) > 0 && (
                  <p className="text-xs text-gray-400">
                    Các khung giờ bận đã được ẩn.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Submit */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="bg-emerald-600 px-8 py-2 text-base hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Đang đặt lịch..." : "Đặt lịch"}
            </Button>
          </div>

          {/* Existing-booking confirmation — shown when the customer (by
              phone) already has non-cancelled bookings. Lists them and asks
              whether to continue creating the new booking. */}
          {pendingExisting.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-amber-900">
                    Khách hàng có lịch hẹn chưa thanh toán
                  </h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Số điện thoại này có {pendingExisting.length} lịch hẹn chưa thanh toán. Bạn có chắc muốn đặt lịch tiếp không?
                  </p>
                  <div className="mt-3 space-y-2">
                    {pendingExisting.map((b) => (
                      <div key={b.id} className="rounded-lg bg-white/70 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-amber-700">Ngày giờ:</span>
                          <span className="font-medium text-amber-900">{b.date} · {b.time}</span>
                          <span className="text-amber-700">Chi nhánh:</span>
                          <span className="font-medium text-amber-900">{b.branchName || "—"}</span>
                          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {b.status}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-amber-700">Dịch vụ:</span>
                          <span className="font-medium text-amber-900">
                            {b.services.map((s) => s.name + (s.staffName ? ` (${s.staffName})` : "")).join(", ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPendingExisting([]);
                        setSkipExistingCheck(false);
                      }}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="button"
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => {
                        setPendingExisting([]);
                        setSkipExistingCheck(true);
                        handleSubmit();
                      }}
                    >
                      OK, đặt tiếp
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inline success message — shown below the form after a successful
              booking. Displays the booking summary + an OK button that resets
              the form so the customer (or next customer) can book again. */}
          {success && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-emerald-900">
                    Đặt lịch thành công!
                  </h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    Cảm ơn <span className="font-semibold">{customerName}</span> đã đặt lịch.
                  </p>
                  <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">
                    <div className="flex justify-between py-0.5">
                      <span className="text-emerald-700">Ngày giờ:</span>
                      <span className="font-medium text-emerald-900">{bookingDate} · {bookingTime}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-emerald-700">Dịch vụ:</span>
                      <span className="font-medium text-emerald-900">{selectedService?.name}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={resetForm}
                      className="bg-emerald-600 px-8 py-2 hover:bg-emerald-700"
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
