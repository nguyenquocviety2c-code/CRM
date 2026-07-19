"use client";

import { useState, useEffect } from "react";
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
import { BranchSelector } from "@/components/layout/branch-selector";
import { useBranchStore } from "@/stores/branch-store";

export default function BookingPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [listViewMode, setListViewMode] = useState<"list" | "calendar">("list");
  // Shared invoice-dialog state — owned by the page so that the staff-view
  // and the time-grid (which don't render the InvoiceDialog inline) can open
  // it via the onShowInvoice callback. The list view still owns its own copy
  // for its “Hóa đơn” buttons + pencil icon when no onShowInvoice is passed.
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
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
      const res = await fetch(`/api/supabase/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Send the logged-in staff's id as actor_staff_id so the server can
        // attribute the activity to them even when the auth cookie isn't sent
        // (Preview Panel iframe third-party cookie blocking).
        body: JSON.stringify({ status: newStatus, actor_staff_id: useAuthStore.getState().user?.id }),
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
      />

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
            onDelete={handleDelete}
            onInvoicePaid={(bookingId) => {
              // After invoice payment, auto-transition booking to checkout.
              statusMutation.mutate({ bookingId, newStatus: "checkout" as BookingStatusType });
            }}
            listViewMode={listViewMode}
            visibleColumns={visibleColumns}
            columnDefs={columnDefs}
            onToggleColumn={toggleColumn}
            onSwitchToCalendar={() => (
              <BookingTimeGrid
                bookings={bookings}
                onBookingClick={openDialog}
                onStatusChange={handleStatusChange}
                onEdit={openDialog}
                onDelete={handleDelete}
                // Time-grid (Khung giờ): open the invoice dialog for checkin/checkout.
                onShowInvoice={setInvoiceBooking}
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
          onDelete={handleDelete}
          // Staff view (View nhân viên): open the invoice dialog for checkin/checkout.
          onShowInvoice={setInvoiceBooking}
          // Click an empty slot in a staff column → open "Tạo mới lịch hẹn"
          // with the slot's time + staff pre-filled.
          onSlotClick={handleSlotClick}
          // Fetch ALL staff for this branch so every hairdresser has a column,
          // not just those with bookings today.
          branchId={selectedBranchId}
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
        invoiceBooking.status === "checkout" && invoiceBooking.invoice?.id ? (
          <PaidInvoiceView
            invoiceId={invoiceBooking.invoice.id}
            customerName={invoiceBooking.customer?.name}
            customerPhone={invoiceBooking.customer?.phone}
            bookingCode={invoiceBooking.code}
            onClose={() => setInvoiceBooking(null)}
          />
        ) : (
          <InvoiceDialog
            booking={invoiceBooking}
            onClose={() => setInvoiceBooking(null)}
            onPaid={() => {
              statusMutation.mutate({
                bookingId: invoiceBooking.id,
                newStatus: "checkout" as BookingStatusType,
              });
              setInvoiceBooking(null);
            }}
          />
        )
      )}
    </div>
  );
}