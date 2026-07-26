"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { toVietnamDay, toVietnamTime } from "@/lib/utils";
import { format as fmtDate } from "date-fns";
import { useBookingStore, Booking } from "@/stores/booking-store";
import { useAuthStore } from "@/stores/auth-store";
import dynamic from "next/dynamic";
// Lazy-load BookingDialog — it's only opened when the user creates/edits a
// booking. Loading its 3,000+ lines only when first needed keeps the Booking
// module's initial bundle small.
const BookingDialog = dynamic(
  () => import("@/components/features/booking/booking-dialog").then((m) => m.BookingDialog),
  { ssr: false }
);
import { BookingFilter } from "@/components/features/booking/booking-filter";
import { BookingCustomerView } from "@/components/features/booking/booking-customer-view";
import { BookingStaffView } from "@/components/features/booking/booking-staff-view";
import { BookingTimeGrid } from "@/components/features/booking/booking-time-grid";
import { AssignStaffDialog } from "@/components/features/booking/assign-staff-dialog";
// Lazy-load InvoiceDialog + PaidInvoiceView — only shown when the user clicks
// a checkin/checkout booking. Keeps the Booking module's initial bundle small.
const InvoiceDialog = dynamic(
  () => import("@/components/features/booking/invoice-dialog").then((m) => m.InvoiceDialog),
  { ssr: false }
);
const PaidInvoiceView = dynamic(
  () => import("@/components/features/booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);
import { BookingStatusType } from "@/lib/constants";
import { transitionBookingToCheckout } from "@/lib/booking-checkout";
import { BranchSelector } from "@/components/layout/branch-selector";
import { useBranchStore } from "@/stores/branch-store";
import { StaffReorderDialog } from "@/components/features/booking/staff-reorder-dialog";
import { useToast } from "@/hooks/use-toast";

export default function BookingPage() {
  // useSearchParams must be inside a <Suspense> boundary in Next.js 16, so the
  // real page body lives in BookingPageContent and we wrap it here.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-gray-500">Đang tải...</div>}>
      <BookingPageContent />
    </Suspense>
  );
}

function BookingPageContent() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [listViewMode, setListViewMode] = useState<"list" | "calendar">("list");
  // When the cashier clicks "Xem lịch hẹn" on a confirmed booking, it
  // navigates here with ?flash=BOOKING_ID&search=CODE&view=customer. We read
  // those params once on mount, switch to the customer view, pre-fill the
  // search so the target booking is filtered into view, and widen the date
  // range to 7 days (the booking may not be today). The flashBookingId is
  // passed down to BookingCustomerView which blinks that row in its status
  // badge bg color. Cleared after the animation finishes.
  const searchParams = useSearchParams();
  // Initialize flashBookingId lazily from the URL (?flash=BOOKING_ID) so no
  // synchronous setState-in-effect is needed for the initial value. The store
  // side-effects (view mode + search + date range) are applied in a separate
  // guarded effect below (zustand = external system, allowed in effects).
  const [flashBookingId, setFlashBookingId] = useState<string | null>(
    () => searchParams.get("flash")
  );
  const flashAppliedRef = useRef(false);
  // Shared invoice-dialog state — owned by the page so that the staff-view
  // and the time-grid (which don't render the InvoiceDialog inline) can open
  // it via the onShowInvoice callback. The list view still owns its own copy
  // for its “Hóa đơn” buttons + pencil icon when no onShowInvoice is passed.
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  // When set, the InvoiceDialog opens in PER-CUSTOMER mode — showing only this
  // customer's services and appending to the existing paid invoice on confirm.
  // Set alongside `invoiceBooking` when the user opens the invoice from a
  // checkin slot in a partially-paid multi-customer booking.
  const [invoiceSlotIndex, setInvoiceSlotIndex] = useState<number | undefined>(undefined);
  // The booking whose services are being assigned a staff via the dedicated
  // "Xếp nhân viên" dialog. Set when the user clicks the "Xếp nhân viên"
  // button on a no-staff segment/popover/link. Null → dialog closed.
  const [assignStaffBooking, setAssignStaffBooking] = useState<Booking | null>(null);
  // Pre-filled slot data for the BookingDialog — set when the user clicks an
  // empty time slot in the staff-view or time-grid. Passed to BookingDialog so
  // the first service entry's date/time (and staffId) are pre-filled.
  const [prefillSlot, setPrefillSlot] = useState<
    { date: string; time: string; staffId?: string | null } | null
  >(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    date: true, time: true, code: true, customer: true,
    note: true, payment: true, reminder: true, status: true,
  });
  const limit = 20;

  const columnDefs = [
    { key: "date", label: "Ngày đặt" },
    { key: "time", label: "Giờ" },
    { key: "code", label: "Mã" },
    { key: "customer", label: "Khách hàng" },
    { key: "note", label: "Ghi chú & dịch vụ" },
    { key: "payment", label: "Thanh toán" },
    { key: "reminder", label: "Nhắc lịch" },
    { key: "status", label: "Trạng thái" },
  ];
  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  const {
    dialogOpen,
    selectedBooking,
    filterStaffId,
    statusFilter,
    viewMode,
    dateRange,
    openDialog,
    closeDialog,
    setFilterStaffId,
    setViewMode,
    setDateNav,
    setDateRange,
    setStaffSearch,
    setBranchFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
  } = useBookingStore();

  // Permission: book_past_date lets staff create/edit bookings in the past.
  // Without it, past-date slot clicks + the "Tạo mới" button on a past date
  // are blocked.
  const { hasPermission } = useAuthStore();
  const canBookPastDate = hasPermission("book_past_date");
  const canReorderStaff = hasPermission("reorder_staff");
  const [reorderOpen, setReorderOpen] = useState(false);
  const { toast } = useToast();

  // Apply the "Xem lịch hẹn" deep-link from the Cashier module ONCE on mount.
  // ?view=staff/customer → switch view mode. ?search=CODE → pre-fill the search
  // so the target booking is filtered into view. ?flash=BOOKING_ID → blink that
  // booking row. ?date=YYYY-MM-DD → open ONLY that single day (the booking's
  // Vietnam day) instead of a wide multi-day range, so the user sees just the
  // booking's day. Falls back to a 30-back/7-forward range when flash/code is
  // present but no date is given.
  // Guarded by a ref so React StrictMode / re-renders don't re-apply it.
  // NOTE: only zustand (external) setters are called here — no React setState —
  // so this complies with the set-state-in-effect rule.
  useEffect(() => {
    if (flashAppliedRef.current) return;
    flashAppliedRef.current = true;
    const view = searchParams.get("view");
    const flash = searchParams.get("flash");
    const code = searchParams.get("search");
    const dateParam = searchParams.get("date");
    if (view === "customer") setViewMode("customer");
    if (view === "staff") setViewMode("staff");
    if (code) setSearchQuery(code);
    if (dateParam) {
      // Open ONLY the booking's single day. Parse YYYY-MM-DD into a local
      // midnight → same-day 23:59:59 range so the API returns just that day's
      // bookings.
      const m = dateParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
        const to = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
        setDateRange({ from, to });
      }
    } else if (flash || code) {
      // Fallback (no date param): wide range so the booking is still found.
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      const to = new Date(now);
      to.setDate(to.getDate() + 7);
      to.setHours(23, 59, 59, 999);
      setDateRange({ from, to });
    }
  }, [searchParams, setViewMode, setSearchQuery, setDateRange]);

  // Clear the flash state after the animation finishes (5 cycles × 0.9s ≈ 4.5s)
  // so a later normal visit doesn't re-flash. setState is inside a setTimeout
  // callback (not synchronous), so this complies with the set-state-in-effect rule.
  useEffect(() => {
    if (!flashBookingId) return;
    const t = setTimeout(() => setFlashBookingId(null), 6000);
    return () => clearTimeout(t);
  }, [flashBookingId]);

  // Whether the currently-viewed date is in the past.
  const isViewingPastDate = (() => {
    const d = dateRange.from;
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  })();

  // Debounce the search query so we don't fire an API request on every keystroke.
  // Uses useEffect (NOT useMemo) so the cleanup function actually runs and
  // clears the timeout — useMemo's return value is ignored, causing timer leaks.
  const [debouncedSearchValue, setDebouncedSearchValue] = useState(searchQuery);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchValue(searchQuery);
    }, 300);
    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Reset to page 1 whenever the search changes (so the user doesn't get stuck
  // on a page that may now be empty after filtering).
  const [prevSearch, setPrevSearch] = useState(debouncedSearchValue);
  if (prevSearch !== debouncedSearchValue) {
    setPrevSearch(debouncedSearchValue);
    setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.bookings.all, viewMode, dateRange, filterStaffId, page, selectedBranchId, debouncedSearchValue],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      if (dateRange.from) {
        params.set("date_from", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        params.set("date_to", dateRange.to.toISOString());
      }
      if (filterStaffId) {
        params.set("staff_id", filterStaffId);
      }
      if (selectedBranchId) {
        params.set("branch_id", selectedBranchId);
      }
      // Send the debounced search term so the API can filter by booking code,
      // note, OR customer name/phone (the API handles the customer lookup).
      if (debouncedSearchValue.trim()) {
        params.set("search", debouncedSearchValue.trim());
      }
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      return json;
    },
    // 30s stale time — fresh enough for create/delete to show via invalidation,
    // but re-visits don't force a refetch (instant from cache).
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Sort bookings by date_time ascending (earlier first, later last) so both
  // the list view and the staff/calendar view show appointments in chronological
  // order regardless of the API's default ordering.
  const allBookings: Booking[] = (data?.data || []).slice().sort((a, b) => {
    const ta = a.date_time ? new Date(a.date_time).getTime() : 0;
    const tb = b.date_time ? new Date(b.date_time).getTime() : 0;
    return ta - tb;
  });

  // Listen for "booking-updated" events dispatched by the InvoiceDialog when a
  // service is added or a staff is reassigned (the dialog PUT-updates the
  // booking's services array directly). On this event, refetch the bookings
  // list AND update the `invoiceBooking` state so the dialog re-renders with
  // the fresh booking data (new service list, updated staff names).
  useEffect(() => {
    const onBookingUpdated = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    };
    window.addEventListener("booking-updated", onBookingUpdated);
    return () => window.removeEventListener("booking-updated", onBookingUpdated);
  }, [queryClient]);
  // When the bookings list refetches, sync the `invoiceBooking` state with the
  // fresh booking object (so the InvoiceDialog sees the updated services/staff).
  useEffect(() => {
    if (!invoiceBooking) return;
    const fresh = allBookings.find((b) => b.id === invoiceBooking.id);
    if (fresh && fresh !== invoiceBooking) {
      setInvoiceBooking(fresh);
    }
  }, [allBookings, invoiceBooking]);

  // Filter bookings by selected staff — if a staff is selected, only show
  // bookings that have at least one service assigned to that staff.
  const staffFiltered: Booking[] = filterStaffId
    ? allBookings.filter((b) => {
        const services = b.services as Array<Record<string, unknown>>;
        return (services || []).some((s) => {
          const staffId = s.staff_id || (s.staff as { id?: string } | null)?.id;
          return staffId === filterStaffId;
        });
      })
    : allBookings;
  // Filter by status (staff view's "Tất cả lịch hẹn" dropdown). Applied
  // client-side on top of the staff filter.
  const bookings: Booking[] = statusFilter
    ? staffFiltered.filter((b) => b.status === statusFilter)
    : staffFiltered;
  const total = bookings.length;

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({
      bookingId,
      newStatus,
    }: {
      bookingId: string;
      newStatus: BookingStatusType;
    }) => {
      // For multi-customer "Cùng lịch" bookings, changing status from View
      // khách hàng > Danh sách sets ALL slots to the same status. We send
      // `clearSlotStatuses: true` so the PATCH route wipes the per-customer
      // slotStatuses from the [[MULTI]] note — all slots revert to sharing
      // the booking-level status.
      const res = await fetch(`/api/supabase/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          actor_staff_id: useAuthStore.getState().user?.id,
          clear_slot_statuses: true,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate both the Booking module list and the Cashier day-bookings
      // cache so the booking status stays in sync between the two modules.
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayStandaloneInvoices });
      queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
      // Invalidate the invoice-activities cache so the "Lịch sử thao tác"
      // table refetches after a status change (e.g. checkout after payment →
      // the PAYMENT + CHECKOUT activities appear immediately, not from stale cache).
      queryClient.invalidateQueries({ queryKey: ["invoice-activities"] });
    },
  });

  const handleStatusChange = (bookingId: string, newStatus: BookingStatusType) => {
    statusMutation.mutate({ bookingId, newStatus });

    // When a booking transitions to "checkin", create a PENDING invoice (status
    // "pending") so it appears in the Cashier > Danh sách đơn hàng as
    // "Chưa thanh toán". The invoice is linked to the booking; confirming payment
    // later (in the invoice dialog) updates it to "completed".
    if (newStatus === "checkin") {
      const booking = bookings.find((b) => b.id === bookingId);
      if (booking) {
        createPendingInvoiceForBooking(booking);
      }
    }
  };

  // Best-effort: create a pending invoice for a booking if one doesn't exist yet.
  const createPendingInvoiceForBooking = async (booking: Booking) => {
    try {
      // Check if an invoice already exists for this booking (avoid duplicates).
      const checkRes = await fetch(
        `/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=1`
      );
      const checkJson = await checkRes.json();
      if (checkJson.ok && Array.isArray(checkJson.data) && checkJson.data.length > 0) {
        return; // Invoice already exists — don't create a duplicate.
      }

      // Build service rows from the booking's nested services.
      const serviceRows = (
        booking.services as unknown as Array<Record<string, unknown>>
      ).map((s) => {
        const svc = s.service as { name?: string; price?: number } | null;
        const stf = s.staff as { name?: string } | null;
        return {
          name: svc?.name || "Dịch vụ",
          price: Number(svc?.price) || 0,
          staff: stf?.name || null,
        };
      });
      const servicesTotal = serviceRows.reduce((sum, s) => sum + s.price, 0);

      await fetch("/api/supabase/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: (booking.customer as unknown as { id?: string })?.id,
          branch_id:
            booking.branchId || (booking.branch as { id?: string } | null)?.id || null,
          booking_id: booking.id,
          // Send the logged-in staff's id so the CHECKIN activity is attributed
          // to them even when the auth cookie isn't sent (Preview Panel iframe
          // third-party cookie blocking).
          created_by: useAuthStore.getState().user?.id,
          items: serviceRows.map((s) => ({
            name: s.name,
            itemId: null,
            type: "service",
            quantity: 1,
            price: s.price,
            discount: 0,
            total: s.price,
            staffName: s.staff,
          })),
          subtotal: servicesTotal,
          discount: 0,
          tip: 0,
          final_amount: servicesTotal,
          payment_method: "cash",
          status: "pending", // Chưa thanh toán
        }),
      });

      // Refresh the invoices list so the new pending order appears.
      queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
    } catch {
      // Best-effort; don't block the checkin transition.
    }
  };

  const handleSlotClick = (slot: { date: string; time: string; staffId?: string | null }) => {
    // Permission guard: block slot clicks on past dates when !book_past_date.
    if (!canBookPastDate) {
      const m = slot.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        const slotMs = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const todayMs = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        if (slotMs < todayMs) return; // past date → ignore
      }
    }
    setPrefillSlot(slot);
    openDialog(); // opens the dialog with no booking → "Tạo mới lịch hẹn" mode
  };

  const handleCloseDialog = () => {
    closeDialog();
    setPrefillSlot(null);
  };

  const handleDelete = (bookingId: string) => {
    if (confirm("Bạn có chắc muốn xóa lịch hẹn này?")) {
      // Optimistic update: remove the booking from all cached query data immediately.
      queryClient.setQueriesData<{ data: Booking[]; pagination?: { total: number } }>(
        { queryKey: queryKeys.bookings.all },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return {
            ...old,
            data: old.data.filter((b) => b.id !== bookingId),
            pagination: old.pagination
              ? { ...old.pagination, total: Math.max(0, old.pagination.total - 1) }
              : old.pagination,
          };
        }
      );
      fetch(`/api/supabase/bookings/${bookingId}`, { method: "DELETE" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          // Sync the Cashier module so the deleted booking disappears from
          // the sidebar immediately.
          queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
          queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayStandaloneInvoices });
          queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
        })
        .catch(() => {
          // On failure, refetch to restore the correct state.
          queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
        });
    }
  };

  /**
   * Drag-to-move a CONFIRMED booking to a new time + staff slot (View nhân
   * viên single-day layout). Checks for conflicts: the booking's [new_start,
   * new_start + duration] must not overlap any existing booking for the
   * target staff (excluding the dragged booking itself). If no conflict,
   * PATCHes the booking's date_time (+ services' staff_id when the staff
   * changed for a single-staff booking).
   */
  const handleMoveBooking = async (
    bookingId: string,
    newDateTimeISO: string,
    newStaffId: string | null,
    durationMin: number,
    originalBooking: Booking
  ) => {
    const newStartMs = new Date(newDateTimeISO).getTime();
    const newEndMs = newStartMs + durationMin * 60 * 1000;

    // Conflict check: for the target staff, check if [newStart, newEnd]
    // overlaps any existing booking's service interval (excluding the dragged
    // booking). Uses allBookings (the full unfiltered day's list) so the check
    // isn't affected by the staff/status filter.
    const targetStaffId = newStaffId || originalBooking.services?.[0]?.staff_id || null;
    if (targetStaffId) {
      const conflict = allBookings.some((b) => {
        if (b.id === bookingId) return false;
        if (b.status === "cancelled" || b.status === "no_show") return false;
        const bStart = b.date_time ? new Date(b.date_time).getTime() : NaN;
        if (isNaN(bStart)) return false;
        // Check each service of this booking that belongs to the target staff.
        return (b.services || []).some((s) => {
          const sStaffId = s.staff_id || (s.staff as { id?: string } | null)?.id;
          if (sStaffId !== targetStaffId) return false;
          const sDur = (Number(s.duration) || Number(s.service?.duration) || 60) * 60 * 1000;
          return newStartMs < bStart + sDur && bStart < newEndMs;
        });
      });
      if (conflict) {
        toast({
          title: "Không thể di chuyển",
          description: "Khung giờ này bị trùng với lịch hẹn khác của nhân viên.",
          variant: "destructive",
        });
        return;
      }
    }

    // Build the PATCH body. Always send date_time. If the staff changed AND
    // the booking is single-staff (all services share one staff_id), also
    // send the services array with the new staff_id so syncBookingServices
    // updates all services' staff.
    const patchBody: Record<string, unknown> = {
      date_time: newDateTimeISO,
      actor_staff_id: useAuthStore.getState().user?.id,
    };
    const originalStaffIds = new Set(
      (originalBooking.services || [])
        .map((s) => s.staff_id || (s.staff as { id?: string } | null)?.id)
        .filter(Boolean) as string[]
    );
    const isSingleStaff = originalStaffIds.size <= 1;
    if (newStaffId && targetStaffId && originalStaffIds.has(targetStaffId) === false && isSingleStaff) {
      // Staff changed for a single-staff booking → update all services' staff.
      patchBody.services = (originalBooking.services || []).map((s, idx) => ({
        service_id: s.service_id,
        staff_id: newStaffId,
        service_category_id: s.service_category_id || s.category?.id || null,
        sort_order: s.sort_order ?? idx,
      }));
    }

    try {
      const res = await fetch(`/api/supabase/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
      toast({ title: "Đã di chuyển lịch hẹn" });
    } catch (e) {
      toast({
        title: "Lỗi",
        description: e instanceof Error ? e.message : "Di chuyển thất bại",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    }
  };

  /**
   * Per-customer slot status change (View nhân viên only, multi-customer
   * "Cùng lịch" bookings). PATCHes the slot-status API which stores the
   * per-customer status in the [[MULTI]] note's `slotStatuses` array.
   */
  const handleSlotStatusChange = async (
    bookingId: string,
    slotIndex: number,
    status: BookingStatusType
  ) => {
    try {
      const res = await fetch("/api/supabase/bookings/slot-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          slotIndex,
          status,
          actor_staff_id: useAuthStore.getState().user?.id,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
      toast({ title: `Đã đổi trạng thái khách #${slotIndex + 1}` });
    } catch (e) {
      toast({
        title: "Lỗi",
        description: e instanceof Error ? e.message : "Đổi trạng thái thất bại",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    }
  };

  // Wrapper for opening the invoice dialog — accepts an optional slotIndex
  // for per-customer mode (when a checkin customer in a partially-paid
  // multi-customer booking opens their own invoice).
  const handleShowInvoice = (booking: Booking, slotIndex?: number) => {
    setInvoiceBooking(booking);
    setInvoiceSlotIndex(slotIndex);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Lịch hẹn
            <span className="ml-2 text-base font-normal text-gray-500">
              {fmtDate(dateRange.from, "dd/MM/yyyy")}
              {dateRange.to.getTime() - dateRange.from.getTime() > 86400000
                ? ` - ${fmtDate(dateRange.to, "dd/MM/yyyy")}`
                : ""}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-sm">
            <Download className="mr-2 h-4 w-4" />
            Xuất excel
          </Button>
          <Button
            onClick={() => openDialog()}
            disabled={!canBookPastDate && isViewingPastDate}
            title={!canBookPastDate && isViewingPastDate ? "Không thể tạo lịch hẹn trong quá khứ" : undefined}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo mới
          </Button>
          <BranchSelector />
        </div>
      </div>

      {/* Filter */}
      <BookingFilter
        staffId={filterStaffId}
        onStaffChange={setFilterStaffId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dateNav="today"
        onDateNavChange={setDateNav}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        staffSearch=""
        onStaffSearchChange={setStaffSearch}
        branchFilter={null}
        onBranchFilterChange={setBranchFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        listViewMode={listViewMode}
        onListViewModeChange={setListViewMode}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        columnDefs={columnDefs}
        canReorderStaff={canReorderStaff}
        onReorderStaff={() => setReorderOpen(true)}
      />

      {/* Staff reorder dialog (drag-to-reorder) — rendered at the page level
          so it's accessible from both View khách hàng + View nhân viên. */}
      {canReorderStaff && (
        <StaffReorderDialog
          open={reorderOpen}
          onClose={() => setReorderOpen(false)}
          branchId={selectedBranchId}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-gray-500">
          Đang tải...
        </div>
      ) : viewMode === "customer" ? (
          <BookingCustomerView
            bookings={bookings}
            total={total}
            page={page}
            limit={limit}
            onPageChange={setPage}
            onStatusChange={handleStatusChange}
            onEdit={openDialog}
            onAssignStaff={setAssignStaffBooking}
            onDelete={handleDelete}
            onInvoicePaid={(bookingId) => {
              // After invoice payment, transition the booking to checkout.
              // For multi-customer "Cùng lịch" bookings with per-customer
              // slotStatuses, this updates ONLY the checked-in slots to
              // "checkout" (preserving the other slots' statuses) so the
              // View khách hàng list shows mixed colors when only some
              // customers have paid. The slot-status API auto-updates the
              // booking-level status to "checkout" only when ALL slots
              // become "checkout".
              const booking = bookings.find((b) => b.id === bookingId);
              if (booking) {
                transitionBookingToCheckout(
                  booking,
                  useAuthStore.getState().user?.id
                ).then(() => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                  queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
                  queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayStandaloneInvoices });
                  queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
                  queryClient.invalidateQueries({ queryKey: ["invoice-activities"] });
                });
              } else {
                // Booking not in the local list — fall back to the regular
                // statusMutation (which sends clear_slot_statuses: true).
                statusMutation.mutate({ bookingId, newStatus: "checkout" as BookingStatusType });
              }
            }}
            listViewMode={listViewMode}
            visibleColumns={visibleColumns}
            columnDefs={columnDefs}
            onToggleColumn={toggleColumn}
            flashBookingId={flashBookingId}
            onSwitchToCalendar={() => (
              <BookingTimeGrid
                bookings={bookings}
                onBookingClick={openDialog}
                onStatusChange={handleStatusChange}
                onEdit={openDialog}
                onAssignStaff={setAssignStaffBooking}
                onDelete={handleDelete}
                // Time-grid (Khung giờ): open the invoice dialog for checkin/checkout.
                onShowInvoice={handleShowInvoice}
                // Click an empty hour row → open "Tạo mới lịch hẹn" with the
                // slot's hour pre-filled as the start time.
                onSlotClick={handleSlotClick}
                currentDate={dateRange.from}
                dateRange={dateRange}
              />
            )}
          />
      ) : (
        <BookingStaffView
          bookings={bookings}
          currentDate={dateRange.from}
          dateRange={dateRange}
          daysToShow={7}
          onBookingClick={openDialog}
          onStatusChange={handleStatusChange}
          onEdit={openDialog}
          onAssignStaff={setAssignStaffBooking}
          onDelete={handleDelete}
          // Staff view (View nhân viên): open the invoice dialog for checkin/checkout.
          onShowInvoice={handleShowInvoice}
          // Click an empty slot in a staff column → open "Tạo mới lịch hẹn"
          // with the slot's time + staff pre-filled.
          onSlotClick={handleSlotClick}
          // Fetch ALL staff for this branch so every hairdresser has a column,
          // not just those with bookings today.
          branchId={selectedBranchId}
          flashBookingId={flashBookingId}
          // Multi-day grid: clicking a day column header switches to showing
          // ONLY that single day (00:00 → 23:59:59). Lets the user drill from
          // a week view into one day's schedule without re-opening the date
          // picker.
          onSelectDay={(day) => {
            const from = new Date(day);
            from.setHours(0, 0, 0, 0);
            const to = new Date(day);
            to.setHours(23, 59, 59, 999);
            setDateRange({ from, to });
          }}
          onMoveBooking={handleMoveBooking}
          onSlotStatusChange={handleSlotStatusChange}
        />
      )}

      {/* Dialog */}
      <BookingDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        booking={selectedBooking}
        prefillSlot={prefillSlot}
        // When creating a NEW booking with no prefillSlot AND there's already ≥1
        // booking on the currently-viewed day, default the new booking's start
        // to the EARLIEST existing booking's start (date + time) on that day.
        // This matches the salon workflow: a 2nd+ appointment for the same slot
        // is common (multiple customers served in parallel by different staff).
        // Each service's staff must still be unique vs other bookings at that
        // slot (enforced inside the dialog).
        defaultNewSlot={
          !selectedBooking && !prefillSlot && allBookings.length > 0
            ? (() => {
                // allBookings is sorted ascending by date_time; the first one is
                // the earliest. Derive dd/MM/yyyy + HH:mm from its date_time —
                // use the timezone-safe Vietnam helpers (Supabase stores +00:00,
                // so the ISO segments are UTC, not the VN time the user entered).
                const earliest = allBookings[0];
                if (!earliest?.date_time) return null;
                const isoDay = toVietnamDay(earliest.date_time).split("-");
                if (isoDay.length !== 3) return null;
                return {
                  date: `${isoDay[2]}/${isoDay[1]}/${isoDay[0]}`,
                  time: toVietnamTime(earliest.date_time),
                };
              })()
            : null
        }
      />

      {/* Shared invoice dialog / paid invoice view — opened from the
          staff-view and time-grid via the onShowInvoice callback.
          For PAID bookings, show the full-page PaidInvoiceView; for unpaid,
          show the InvoiceDialog. */}
      {invoiceBooking && (
        (invoiceBooking.status === "checkout" && invoiceBooking.invoice?.id && invoiceSlotIndex === undefined) ? (
          <PaidInvoiceView
            invoiceId={invoiceBooking.invoice.id}
            customerName={invoiceBooking.customer?.name}
            customerPhone={invoiceBooking.customer?.phone}
            bookingCode={invoiceBooking.code}
            onClose={() => { setInvoiceBooking(null); setInvoiceSlotIndex(undefined); }}
          />
        ) : (
          <InvoiceDialog
            booking={invoiceBooking}
            slotIndex={invoiceSlotIndex}
            onClose={() => { setInvoiceBooking(null); setInvoiceSlotIndex(undefined); }}
            onPaid={() => {
              // PER-CUSTOMER MODE: the InvoiceDialog already appended to the
              // existing invoice + set the slot to checkout. Just refetch.
              if (invoiceSlotIndex !== undefined) {
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
                queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
                queryClient.invalidateQueries({ queryKey: ["invoice-activities"] });
                setInvoiceBooking(null);
                setInvoiceSlotIndex(undefined);
                return;
              }
              // NORMAL MODE: transition to checkout using the shared helper so
              // multi-customer bookings preserve per-customer slotStatuses.
              transitionBookingToCheckout(
                invoiceBooking,
                useAuthStore.getState().user?.id
              ).then(() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayBookings });
                queryClient.invalidateQueries({ queryKey: queryKeys.cashier.dayStandaloneInvoices });
                queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
                queryClient.invalidateQueries({ queryKey: ["invoice-activities"] });
              });
              setInvoiceBooking(null);
              setInvoiceSlotIndex(undefined);
            }}
          />
        )
      )}

      {/* Dedicated "Xếp nhân viên" dialog — opened by the "Xếp nhân viên"
          button on no-staff segments/popovers/links in all 3 views. Lets the
          user assign a staff to each of the booking's services without
          opening the full "Chỉnh sửa lịch hẹn" dialog. */}
      <AssignStaffDialog
        open={!!assignStaffBooking}
        onOpenChange={(v) => { if (!v) setAssignStaffBooking(null); }}
        booking={assignStaffBooking}
        branchId={selectedBranchId}
      />
    </div>
  );
}