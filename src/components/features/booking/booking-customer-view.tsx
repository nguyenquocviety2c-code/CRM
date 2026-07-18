"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, List, Clock, ChevronDown, Columns3, RotateCcw } from "lucide-react";
import { Booking } from "stores/booking-store";
import { BookingStatusLabel, BookingStatusBadgeColors, BookingStatusType } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamDay, toVietnamTime } from "@/lib/utils";
import { parseMultiCustomerNote, getAllSlotCustomers } from "@/lib/multi-customer";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InvoiceDialog } from "./invoice-dialog";
import { PaidInvoiceView } from "./paid-invoice-view";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";

interface BookingCustomerViewProps {
  bookings: Booking[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onStatusChange: (bookingId: string, newStatus: BookingStatusType) => void;
  onEdit: (booking: Booking) => void;
  onDelete: (bookingId: string) => void;
  /** Called after an invoice is successfully paid — typically transitions booking to checkout. */
  onInvoicePaid?: (bookingId: string) => void;
  /** Renders the calendar (Khung giờ) view when the user switches to it. */
  onSwitchToCalendar?: () => React.ReactNode;
  /** List/calendar view mode (controlled by parent — buttons are in BookingFilter). */
  listViewMode?: "list" | "calendar";
  /** Column visibility state (controlled by parent). */
  visibleColumns?: Record<string, boolean>;
  /** Column definitions (controlled by parent). */
  columnDefs?: Array<{ key: string; label: string }>;
  /** Toggle a column's visibility (controlled by parent). */
  onToggleColumn?: (key: string) => void;
  /**
   * Open the invoice dialog for a booking. When provided, the parent owns the
   * InvoiceDialog (used by staff-view / time-grid which don't render it inline).
   * When omitted, THIS view renders its own InvoiceDialog (list-view buttons +
   * the pencil icon for checkin/checkout bookings).
   */
  onShowInvoice?: (booking: Booking) => void;
}

export function BookingCustomerView({
  bookings,
  total,
  page,
  limit,
  onPageChange,
  onStatusChange,
  onEdit,
  onDelete,
  onInvoicePaid,
  onSwitchToCalendar,
  listViewMode = "list",
  visibleColumns: visibleColsProp,
  columnDefs: columnDefsProp,
  onToggleColumn,
  onShowInvoice,
}: BookingCustomerViewProps) {
  const { hasPermission } = useAuthStore();
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  const canCancelPayment = hasPermission("cancel_payment");
  const canEditReminder = hasPermission("edit_reminder");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Tracks which booking's reminder is currently being PATCHed (set → reset)
  // so we can disable the control and prevent double-clicks while in flight.
  const [reminderLoadingId, setReminderLoadingId] = useState<string | null>(null);
  // Customer history dialog state — opened when clicking a customer's name
  // (green link) in the customer column.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
  } | null>(null);

  /**
   * Optimistically update the React Query cache for a booking's reminder_at.
   * Iterates all cached booking queries and patches the matching booking row
   * in-place, so the cell flips immediately without waiting for the refetch.
   */
  const optimisticallyUpdateReminder = (bookingId: string, reminderAt: string | null) => {
    queryClient.setQueriesData<{ data?: Booking[] } | undefined>(
      { queryKey: queryKeys.bookings.all },
      (old) => {
        if (!old?.data || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map((b) =>
            b.id === bookingId ? { ...b, reminder_at: reminderAt } : b
          ),
        };
      }
    );
  };
  // Local invoice dialog state — only used when the parent does NOT pass
  // onShowInvoice (i.e. the list view owns its own dialog). When onShowInvoice
  // is provided (calendar/staff views driven by the page), the parent owns it.
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const openInvoice = (booking: Booking) => {
    if (onShowInvoice) onShowInvoice(booking);
    else setInvoiceBooking(booking);
  };

  // Default column visibility (all visible) if not provided by parent.
  const visibleColumns = visibleColsProp || {
    date: true, time: true, code: true, customer: true,
    note: true, payment: true, reminder: true, status: true,
  };
  const columnDefs = columnDefsProp || [
    { key: "date", label: "Ngày đặt" },
    { key: "time", label: "Giờ" },
    { key: "code", label: "Mã" },
    { key: "customer", label: "Khách hàng" },
    { key: "note", label: "Ghi chú & dịch vụ" },
    { key: "payment", label: "Thanh toán" },
    { key: "reminder", label: "Nhắc lịch" },
    { key: "status", label: "Trạng thái" },
  ];
  const viewMode = listViewMode;

  const totalPages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const formatDate = (dateStr: string) => {
    // Use the timezone-safe Vietnam day helper. Supabase normalizes stored
    // date_time offsets to +00:00 (UTC), so naively extracting the "YYYY-MM-DD"
    // prefix returns the UTC day, not the Vietnam day the user entered.
    const iso = toVietnamDay(dateStr).split("-");
    if (iso.length === 3) return `${iso[2]}/${iso[1]}/${iso[0]}`;
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: vi });
  };

  const formatTime = (dateStr: string) => {
    // Use the timezone-safe Vietnam time helper. Supabase normalizes stored
    // date_time offsets to +00:00 (UTC), so the "THH:MM" segment is the UTC
    // time — NOT the Vietnam time the user entered (e.g. 09:30 VN stored as
    // 02:30 UTC would otherwise display as "02:30", outside business hours).
    return toVietnamTime(dateStr) || format(new Date(dateStr), "HH:mm", { locale: vi });
  };

  const getStatusBadgeClass = (status: BookingStatusType) => {
    const colors = BookingStatusBadgeColors[status];
    return `${colors.bg} ${colors.text}`;
  };

  // Determine a booking's display date/time. API returns date_time (ISO);
  // legacy code may populate date/time strings directly.
  const getBookingDate = (booking: Booking): string => {
    if (booking.date) return booking.date;
    if (booking.date_time) return formatDate(booking.date_time);
    return "";
  };
  const getBookingTime = (booking: Booking): string => {
    if (booking.time) return booking.time;
    if (booking.date_time) return formatTime(booking.date_time);
    return "";
  };

  // Extract structured service info from a booking's services array.
  // Handles both the Supabase nested shape (BookingServiceRow) and the legacy
  // flat shape (BookingServiceEntry).
  const getServiceDisplay = (booking: Booking) => {
    const services = booking.services as Array<BookingServiceRow | { serviceId: string; staffId: string; serviceCategoryId: string }>;
    return services.map((s) => {
      // Nested Supabase shape.
      const row = s as BookingServiceRow;
      if (row && row.service && typeof row.service === "object") {
        return {
          serviceName: row.service.name,
          categoryName: row.category?.name || null,
          staffName: row.staff?.name || null,
        };
      }
      // Legacy flat shape — names not available, return IDs.
      const flat = s as { serviceId: string; staffId: string; serviceCategoryId: string };
      return {
        serviceName: flat.serviceId || null,
        categoryName: flat.serviceCategoryId || null,
        staffName: flat.staffId || null,
      };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Calendar (Khung giờ) view */}
      {viewMode === "calendar" && onSwitchToCalendar && (
        <div>{onSwitchToCalendar()}</div>
      )}

      {/* Table (list view only — calendar view uses BookingTimeGrid at page level) */}
      {viewMode === "list" && (
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-xs border-collapse" style={{ lineHeight: "1.3" }}>
          <thead>
            <tr className="border-b-2 border-gray-400 bg-gray-50">
              {visibleColumns.date && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Ngày đặt</th>}
              {visibleColumns.time && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Giờ</th>}
              {visibleColumns.code && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Mã</th>}
              {visibleColumns.customer && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Khách hàng</th>}
              {visibleColumns.note && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Ghi chú & dịch vụ</th>}
              {visibleColumns.payment && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Thanh toán</th>}
              {visibleColumns.reminder && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Nhắc lịch</th>}
              {visibleColumns.status && <th className="border-r border-gray-300 px-3 py-1 text-left font-medium text-gray-700">Trạng thái</th>}
              <th className="px-3 py-1 text-left font-medium text-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const serviceDisplay = getServiceDisplay(booking);
              return (
              <tr key={booking.id} className="border-b border-gray-300 hover:bg-gray-50">
                {visibleColumns.date && (
                <td className="border-r border-gray-300 px-3 py-1 text-gray-600">
                  {getBookingDate(booking)}
                </td>
                )}
                {visibleColumns.time && (
                <td className="border-r border-gray-300 px-3 py-1 text-gray-600">
                  {getBookingTime(booking)}
                </td>
                )}
                {visibleColumns.code && (
                <td className="border-r border-gray-300 px-3 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      const isPaid = booking.status === "checkout";
                      if (isPaid) openInvoice(booking);
                      else onEdit(booking);
                    }}
                    className="font-medium text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
                    title={booking.status === "checkout" ? "Xem hóa đơn" : "Chỉnh sửa lịch hẹn"}
                  >
                    {booking.code}
                  </button>
                </td>
                )}
                {visibleColumns.customer && (
                <td className="border-r border-gray-300 px-3 py-1">
                  {/* Multi-customer "Cùng lịch" booking: list every slot's
                      customer — those with info → name (line 1) + phone (line 2);
                      empty slots → "Khách vãng lai". Single-customer / "Khác
                      lịch" bookings show the booking's one customer as before. */}
                  {(() => {
                    const slotCustomers = getAllSlotCustomers(booking.note);
                    if (slotCustomers && slotCustomers.length > 0) {
                      return (
                        <div className="space-y-0.5">
                          {slotCustomers.map((sc, i) => (
                            <div key={i} className="space-y-0.5">
                              {/* Numbered customer label: "1. Hoàng Vũ" / "2. Khách vãng lai".
                                  Uses the same text size as single-customer bookings
                                  (font-medium, default table text-xs) so the column
                                  reads consistently. Named customers are green
                                  clickable links to the history dialog; walk-in
                                  customers are plain text. */}
                              {sc.walkin || !sc.id ? (
                                <div className="font-medium text-gray-900">
                                  {i + 1}. {sc.walkin ? "Khách vãng lai" : (sc.name || "Khách")}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHistoryCustomer({
                                      id: sc.id,
                                      name: sc.name,
                                      phone: sc.phone || null,
                                    })
                                  }
                                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                                  title="Xem lịch sử khách hàng"
                                >
                                  {i + 1}. {sc.name || "Khách"}
                                </button>
                              )}
                              {!sc.walkin && (
                                <div className="text-xs text-gray-500">
                                  {canViewCustomerPhone ? (sc.phone || "—") : maskPhone(sc.phone)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-0.5">
                        {booking.customer?.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryCustomer({
                                id: booking.customer!.id,
                                name: booking.customer?.name,
                                phone: booking.customer?.phone || null,
                              })
                            }
                            className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                            title="Xem lịch sử khách hàng"
                          >
                            {booking.customer?.name || "—"}
                          </button>
                        ) : (
                          <div className="font-medium text-gray-900">{booking.customer?.name || "—"}</div>
                        )}
                        <div className="text-xs text-gray-500">{canViewCustomerPhone ? (booking.customer?.phone || "—") : maskPhone(booking.customer?.phone)}</div>
                      </div>
                    );
                  })()}
                </td>
                )}
                {visibleColumns.note && (
                <td className="border-r border-gray-300 px-3 py-1">
                  <div className="space-y-0.5">
                    {(() => {
                      // Multi-customer "Cùng lịch" booking: the note carries a
                      // [[MULTI]] JSON block (per-slot customer map). Customer
                      // info is shown in the "Khách hàng" column (not here) —
                      // this column shows ONLY services + staff (+ the cashier's
                      // own typed note if present). Falls back to the regular
                      // layout (ghi chú + services + staff) for plain bookings.
                      const parsed = parseMultiCustomerNote(booking.note);
                      const userNote = parsed ? parsed.userNote : (booking.note || "");
                      return (
                        <>
                          {userNote && (
                            <div className="text-xs text-gray-500">Ghi chú: {userNote}</div>
                          )}
                          {serviceDisplay.length === 0 ? (
                            <div className="text-xs text-gray-400">Chưa có dịch vụ</div>
                          ) : (
                            (() => {
                              const parsed = parseMultiCustomerNote(booking.note);
                              const isMulti = !!(parsed && parsed.slots.length > 0);
                              const entries = serviceDisplay
                                .map((s) => ({ category: s.categoryName, staff: s.staffName }))
                                .filter((e) => e.category || e.staff);
                              if (entries.length === 0) return <div className="text-xs text-gray-400">Chưa có nhóm dịch vụ</div>;
                              return entries.map((e, idx) => (
                                <div key={idx} className="space-y-0.5">
                                  {/* Service name: black (text-gray-900). Staff name:
                                      yellow (text-yellow-600). For multi-customer
                                      bookings, number each service to match the
                                      numbered customers in the customer column. */}
                                  {e.category && (
                                    <div className="text-xs font-medium text-gray-900">
                                      {isMulti ? `${idx + 1}. ` : ""}{e.category}
                                    </div>
                                  )}
                                  {e.staff && <div className="text-xs text-yellow-600">NV: {e.staff}</div>}
                                </div>
                              ));
                            })()
                          )}
                        </>
                      );
                    })()}
                    {/* "Tạo bởi": when created_by is null the booking was placed
                        by a customer via the /dat-lich kiosk → show "Khách hàng".
                        Otherwise show the creator staff's name (resolved by the
                        bookings API); "—" is a fallback for a deleted staff. */}
                    <div className="text-xs text-gray-500">
                      Tạo bởi: {booking.created_by ? (booking.createdBy?.name || "—") : "Khách hàng"}
                    </div>
                  </div>
                </td>
                )}
                {visibleColumns.payment && (
                <td className="border-r border-gray-300 px-3 py-1">
                  {booking.status === "checkin" && (
                    <div className="space-y-0.5">
                      <button className="text-xs text-blue-600 hover:text-blue-800 hover:underline" onClick={() => openInvoice(booking)}>
                        Hóa đơn
                      </button>
                      {booking.invoice?.final_amount != null && (
                        <div className="text-xs font-medium text-emerald-700">
                          {new Intl.NumberFormat("vi-VN").format(Number(booking.invoice.final_amount))}đ
                        </div>
                      )}
                    </div>
                  )}
                  {booking.status === "checkout" && (
                    <div className="space-y-0.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Đã thanh toán</span>
                      <div>
                        <button className="text-xs text-blue-600 hover:text-blue-800 hover:underline" onClick={() => openInvoice(booking)}>
                          Hóa đơn
                        </button>
                      </div>
                      {booking.invoice?.final_amount != null && (
                        <div className="text-xs font-medium text-emerald-700">
                          {new Intl.NumberFormat("vi-VN").format(Number(booking.invoice.final_amount))}đ
                        </div>
                      )}
                    </div>
                  )}
                </td>
                )}
                {visibleColumns.reminder && (
                <td className="border-r border-gray-300 px-3 py-1">
                  {(() => {
                    const formatReminder = (iso: string) => {
                      try {
                        const d = new Date(iso);
                        return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
                      } catch { return ""; }
                    };
                    const isLoading = reminderLoadingId === booking.id;
                    // Case 1: reminder already set.
                    if (booking.reminder_at) {
                      // If the user has "edit_reminder" permission, the text
                      // is a clickable button that resets reminder_at to null
                      // (reverts to the unchecked "Chưa" state). Otherwise
                      // it's plain read-only text.
                      if (canEditReminder) {
                        return (
                          <button
                            type="button"
                            disabled={isLoading}
                            title="Bấm để đặt lại trạng thái chưa nhắc lịch"
                            onClick={async () => {
                              if (!booking.id || isLoading) return;
                              setReminderLoadingId(booking.id);
                              // Optimistic: clear reminder_at in the cache so
                              // the cell flips to the checkbox immediately.
                              optimisticallyUpdateReminder(booking.id, null);
                              try {
                                const res = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ reminder_at: null }),
                                });
                                if (res.ok) {
                                  toast({
                                    title: "Đã đặt lại nhắc lịch",
                                    description: "Trạng thái đã chuyển về \"Chưa\".",
                                  });
                                  // Refetch to confirm with server data.
                                  await queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                                } else {
                                  // Revert optimistic update on failure.
                                  optimisticallyUpdateReminder(booking.id, booking.reminder_at);
                                  toast({
                                    title: "Không thể đặt lại",
                                    description: "Vui lòng thử lại.",
                                    variant: "destructive",
                                  });
                                }
                              } catch {
                                // Revert optimistic update on network error.
                                optimisticallyUpdateReminder(booking.id, booking.reminder_at);
                                toast({
                                  title: "Lỗi mạng",
                                  description: "Không thể kết nối đến server.",
                                  variant: "destructive",
                                });
                              } finally {
                                setReminderLoadingId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3 shrink-0" />
                            {isLoading ? "Đang đặt lại…" : `Đã nhắc lịch ${formatReminder(booking.reminder_at)}`}
                          </button>
                        );
                      }
                      // No edit_reminder permission — read-only text.
                      return (
                        <span className="text-xs font-medium text-emerald-700">
                          Đã nhắc lịch {formatReminder(booking.reminder_at)}
                        </span>
                      );
                    }
                    // Case 2: reminder NOT set — checkbox to mark as reminded.
                    return (
                      <label className={`flex items-center gap-2 ${isLoading ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={isLoading}
                          className="h-4 w-4 rounded border-gray-300"
                          onChange={async (e) => {
                            if (!booking.id) return;
                            e.currentTarget.disabled = true;
                            setReminderLoadingId(booking.id);
                            const now = new Date().toISOString();
                            // Optimistic: set reminder_at in the cache so the
                            // cell flips to "Đã nhắc lịch" immediately.
                            optimisticallyUpdateReminder(booking.id, now);
                            try {
                              const res = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ reminder_at: now }),
                              });
                              if (res.ok) {
                                toast({
                                  title: "Đã ghi nhận nhắc lịch",
                                  description: `Lúc ${formatReminder(now)}`,
                                });
                                // Refetch to confirm with server data.
                                await queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                              } else {
                                // Revert optimistic update on failure.
                                optimisticallyUpdateReminder(booking.id, null);
                                e.currentTarget.disabled = false;
                                toast({
                                  title: "Không thể ghi nhận",
                                  description: "Vui lòng thử lại.",
                                  variant: "destructive",
                                });
                              }
                            } catch {
                              // Revert optimistic update on network error.
                              optimisticallyUpdateReminder(booking.id, null);
                              e.currentTarget.disabled = false;
                              toast({
                                title: "Lỗi mạng",
                                description: "Không thể kết nối đến server.",
                                variant: "destructive",
                              });
                            } finally {
                              setReminderLoadingId(null);
                            }
                          }}
                        />
                        <span className="text-xs text-gray-500">{isLoading ? "Đang lưu…" : "Chưa"}</span>
                      </label>
                    );
                  })()}
                </td>
                )}
                {visibleColumns.status && (
                <td className="border-r border-gray-300 px-3 py-1">
                  <div className="space-y-0.5">
                    <div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(booking.status)}`}>
                        {BookingStatusLabel[booking.status]}
                      </span>
                    </div>
                    {(() => {
                      // "checkout" is intentionally NOT a manual option: a booking
                      // auto-transitions to "checkout" once payment is completed in
                      // the Cashier/Invoice dialog. Manual options are:
                      // - confirmed / new → checkin, no_show, cancelled
                      // - checkin → cancelled (customer showed up but changed mind
                      //   before paying; the slot is freed for a new booking)
                      let nextStatuses: BookingStatusType[] = [];
                      if (booking.status === "confirmed" || booking.status === "new") {
                        nextStatuses = ["checkin", "no_show", "cancelled"];
                      } else if (booking.status === "checkin") {
                        nextStatuses = ["cancelled"];
                      }
                      if (nextStatuses.length === 0) return null;
                      return (
                        <Select value="" onValueChange={(value) => onStatusChange(booking.id, value as BookingStatusType)}>
                          <SelectTrigger className="h-6 w-full min-w-0 text-[11px] border-gray-300 gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue placeholder="Đổi trạng thái" />
                          </SelectTrigger>
                          <SelectContent>
                            {nextStatuses.map((st) => (
                              <SelectItem key={st} value={st} className="text-xs">{BookingStatusLabel[st]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                </td>
                )}
                <td className="px-3 py-1">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-gray-700"
                      // Pencil opens the invoice dialog for checkin/checkout bookings
                      // (pending / paid invoice respectively); for other statuses it
                      // opens the edit-booking dialog as before.
                      onClick={() => {
                        if (booking.status === "checkin" || booking.status === "checkout") {
                          openInvoice(booking);
                        } else {
                          onEdit(booking);
                        }
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed" disabled={!canCancelPayment} title={canCancelPayment ? undefined : "Bạn không có quyền hủy"} onClick={() => canCancelPayment && onDelete(booking.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-sm">
        <div className="text-gray-600">
          Hiển thị từ {startItem} đến {endItem} trên tổng số {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Trước
          </Button>
          <span className="text-gray-600">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Sau
          </Button>
        </div>
      </div>

      {/* Invoice dialog / paid invoice view (local — only rendered when the
          parent does NOT own it). For PAID bookings, show the full-page
          PaidInvoiceView; for unpaid, show the InvoiceDialog. */}
      {!onShowInvoice && invoiceBooking && (
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
              if (onInvoicePaid) onInvoicePaid(invoiceBooking.id);
              setInvoiceBooking(null);
            }}
          />
        )
      )}

      {/* Customer history dialog — opened when clicking a customer's name
          (green link) in the customer column. Shows visit history, spending
          stats, and feedback for the clicked customer. */}
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </div>
  );
}
