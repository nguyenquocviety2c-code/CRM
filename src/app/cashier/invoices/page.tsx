"use client";

import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { History, ChevronLeft, ChevronRight, Camera, Loader2, ChevronDown } from "lucide-react";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";
import { BranchSelector } from "@/components/layout/branch-selector";
import { cn, vietnamToday, vietnamDayRangeDates, localDayStartUtc, localDayEndUtc, toVietnamDay } from "@/lib/utils";
import { parseMultiCustomerNote } from "@/lib/multi-customer";
import { useState, useMemo } from "react";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format as fnsFormat } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadImagesToR2 } from "@/lib/upload";
import { maskPhone } from "@/lib/phone-mask";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";
import { InvoiceDialog } from "@/components/features/booking/invoice-dialog";
import { PaidInvoiceView } from "@/components/features/booking/paid-invoice-view";
import {
  BookingStatusType,
} from "@/lib/constants";
import type { Booking } from "@/stores/booking-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookingService {
  service?: { name?: string; price?: number } | null;
  staff?: { name?: string } | null;
  category?: { name?: string } | null;
}

interface OrderItem {
  name?: string;
  price?: number;
  staffName?: string;
}

interface BookingOrder {
  id: string;
  code: string | null;
  status: string; // booking status: new, confirmed, checkin, checkout, no_show, cancelled
  date_time: string | null;
  created_at: string;
  created_by: string | null;
  /** Enriched creator staff ({ id, name }) — attached by the bookings API's
   *  enrichBookings(). Null when created_by is null (kiosk booking) or when
   *  the staff was deleted. The "Người tạo" column reads THIS, not the raw
   *  created_by UUID. */
  createdBy?: { id: string; name: string } | null;
  number_of_customers?: number;
  note?: string | null;
  customer: { id: string; name: string; phone: string | null; code?: string | null } | null;
  branch: { id: string; name: string } | null;
  source: { id: string; name: string } | null;
  channel: { id: string; name: string } | null;
  services: BookingService[];
  // Joined invoice (if any exists for this booking)
  invoice?: {
    id: string;
    code: string | null;
    status: string; // invoice status: pending, completed, cancelled
    final_amount: number;
    tip: number;
    promotion: {
      id: string;
      code: string | null;
      name: string;
      discountValue: number;
      discountType: string;
      discountAmount: number;
    } | null;
    payment_method: string;
    items: OrderItem[];
    created_at: string;
    photos?: string[];
  } | null;
}

/** Convert a BookingOrder (cashier invoices page shape) to a minimal Booking
 *  object so it can be passed to InvoiceDialog (which expects a Booking). */
function orderToBooking(order: BookingOrder): Booking {
  return {
    id: order.id,
    code: order.code || "",
    date: "",
    time: "",
    date_time: order.date_time || undefined,
    status: order.status as BookingStatusType,
    note: order.note ?? null,
    numberOfCustomers: order.number_of_customers || 1,
    customerSourceId: null,
    customerChannelId: null,
    // Pass the enriched creator so InvoiceDialog + its activity history can
    // show the staff name (not null). Matches the bookings API shape.
    createdBy: order.createdBy ?? null,
    customer: {
      id: order.customer?.id || "",
      name: order.customer?.name || "",
      phone: order.customer?.phone || "",
      code: order.customer?.code || "",
    },
    branch: order.branch ? { id: order.branch.id, name: order.branch.name } : null,
    // InvoiceDialog reads booking.services as BookingServiceRow[] — map the
    // cashier page's BookingService shape into the fields it actually uses.
    services: (order.services || []).map((s, i) => ({
      id: `svc-${i}`,
      booking_id: order.id,
      service_id: "",
      staff_id: null,
      service_category_id: null,
      sort_order: i,
      service: s.service ? { id: "", name: s.service.name || "", code: "", price: s.service.price || 0, duration: 60 } : null,
      category: s.category ? { id: "", name: s.category.name || "" } : null,
      staff: s.staff ? { id: "", name: s.staff.name || "" } : null,
    })),
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          code: order.invoice.code,
          status: order.invoice.status,
          final_amount: order.invoice.final_amount,
          payment_method: order.invoice.payment_method,
        }
      : null,
  } as Booking;
}

export default function InvoicesPage() {
  const { selectedBranchId } = useBranchStore();
  const { hasPermission } = useAuthStore();
  // Permission: can the staff see invoices from ALL branches?
  // If false, force-filter to the staff's selected branch only.
  const canViewAllInvoices = hasPermission("view_all_invoices");
  const canConfirmOldInvoice = hasPermission("confirm_old_invoice");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<BookingOrder | null>(null);
  const [paidInvoiceView, setPaidInvoiceView] = useState<{ invoiceId: string; customerName?: string; customerPhone?: string; code?: string | null } | null>(null);
  // Date range filter (from-to). Defaults to today (matches the booking module
  // pattern). Quick-range buttons (Hôm nay / 7 ngày / 30 ngày) jump to common
  // windows; the DateRangePicker lets the user pick an arbitrary range. The
  // range is sent to the API as date_from/date_to (ISO strings).
  const [dateNav, setDateNav] = useState<"today" | "7days" | "30days" | "custom">("today");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    // Timezone-safe: anchor to the Vietnam calendar day (UTC+7) so the
    // default "today" range is correct regardless of the host machine's
    // timezone. The Date objects are UTC instants marking VN-day boundaries.
    return vietnamDayRangeDates(vietnamToday());
  });
  // ISO bounds sent to the API: from = start-of-VN-day (UTC), to = end-of-VN-day (UTC).
  const dateFromISO = useMemo(() => localDayStartUtc(toVietnamDay(dateRange.from)), [dateRange.from]);
  const dateToISO = useMemo(() => localDayEndUtc(toVietnamDay(dateRange.to)), [dateRange.to]);
  // Invoice dialog state — when set, the InvoiceDialog opens (for confirming
  // payment on unpaid past-date orders via the "Xác nhận thanh toán" button).
  const [invoiceDialogOrder, setInvoiceDialogOrder] = useState<BookingOrder | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  // Status mutation: PATCH booking status (checkin / no_show / cancelled).
  // When a booking transitions to "checkin", a pending invoice is created (so
  // it shows up in the cashier list + invoice history). The booking page
  // already does this via createPendingInvoiceForBooking; here we replicate
  // the status PATCH + let the next refetch pick up the new invoice.
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
        body: JSON.stringify({ status: newStatus }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supabase-orders"] });
    },
  });

  // Column toggle: each data column can be shown/hidden via the "Cột" button.
  const columnDefs: ColumnDef[] = [
    { key: "stt", label: "STT" },
    { key: "code", label: "Mã đơn hàng" },
    { key: "customer", label: "Tên khách hàng" },
    { key: "source", label: "Nguồn khách hàng" },
    { key: "channel", label: "Kênh đặt lịch" },
    { key: "createdAt", label: "Ngày tạo" },
    { key: "createdBy", label: "Người tạo" },
    { key: "status", label: "Trạng thái" },
    { key: "total", label: "Tổng tiền" },
  ];
  const [visibleColumns, setVisibleColumns] = useState(() =>
    buildDefaultVisibleColumns(columnDefs)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Fetch ALL bookings (an "order" = a booking; payment status is derived from
  // its linked invoice). Per the user's logic: "chỉ cần lên lịch hẹn là phải có
  // trong danh sách đơn hàng" — every booking appears here regardless of status.
  const { data, isLoading } = useQuery({
    queryKey: ["supabase-orders", selectedBranchId, search, page, canViewAllInvoices, dateFromISO, dateToISO],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(limit));
      // If the staff doesn't have "view_all_invoices" permission, force-filter
      // to their selected branch (ignore "all"). If they do have the permission,
      // respect the branch selector (including "all").
      if (canViewAllInvoices) {
        if (selectedBranchId && selectedBranchId !== "all") params.append("branch_id", selectedBranchId);
      } else {
        if (selectedBranchId && selectedBranchId !== "all") {
          params.append("branch_id", selectedBranchId);
        }
      }
      if (search) params.append("search", search);
      params.append("date_from", dateFromISO);
      params.append("date_to", dateToISO);

      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return { data: [] as BookingOrder[], pagination: { total: 0, totalPages: 0 } };
      const bookings: BookingOrder[] = json.data || [];

      // The bookings API already attaches a linked invoice summary (id, code,
      // status, final_amount, payment_method, booking_id) to each booking via
      // its enrichBookings() batch lookup. Use that directly instead of doing
      // N+1 per-booking invoice fetches here — that was the main source of the
      // slow load (20 parallel requests adding ~900ms).
      const withInvoices: BookingOrder[] = bookings.map((b) => {
        const inv = (b as { invoice?: Record<string, unknown> | null }).invoice;
        if (inv && inv.id) {
          return {
            ...b,
            invoice: {
              id: String(inv.id),
              code: (inv.code as string | null) ?? null,
              status: (inv.status as string) || "pending",
              final_amount: Number(inv.final_amount) || 0,
              tip: 0,
              promotion: null,
              payment_method: (inv.payment_method as string) || "cash",
              items: [],
              created_at: "",
              photos: [],
            },
          };
        }
        return { ...b, invoice: null };
      });

      return {
        data: withInvoices,
        pagination: json.pagination || { total: 0, totalPages: 0 },
      };
    },
    // Cache the result so re-visiting the page (or switching tabs back) shows
    // the list INSTANTLY from cache while a background refetch updates if stale.
    staleTime: 30_000, // 30s — fresh enough for an order list, fast re-visit.
    gcTime: 5 * 60_000, // keep cached for 5min after unmount.
  });

  // Derive payment status for an order:
  // - booking cancelled/no_show → "Đã hủy"
  // - invoice status === "completed" → "Đã thanh toán"
  // - otherwise (no invoice, or invoice pending) → "Chưa thanh toán"
  const getOrderStatus = (order: BookingOrder): string => {
    if (order.status === "cancelled" || order.status === "no_show") return "cancelled";
    if (order.invoice?.status === "completed") return "completed";
    return "pending";
  };

  const allOrders = data?.data || [];
  // Apply the status filter client-side (since payment status is derived).
  const orders = status === "all" ? allOrders : allOrders.filter((o) => getOrderStatus(o) === status);
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || 0;

  const statusOptions = [
    { value: "all", label: "Tất cả" },
    { value: "completed", label: "Đã thanh toán" },
    { value: "pending", label: "Chưa thanh toán" },
    { value: "cancelled", label: "Hủy" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách đơn hàng</h1>
        <div className="flex items-center gap-2">
          {canViewAllInvoices && <BranchSelector />}
          <Link
            href="/cashier/activity"
            className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Lịch sử hóa đơn
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 flex flex-col gap-3 rounded-lg bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Left: date nav (Hôm nay / 7 ngày / 30 ngày + from-to range picker) —
            mirrors the booking module's filter layout. */}
        <div className="flex items-center gap-2">
          <Button
            variant={dateNav === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setDateRange(vietnamDayRangeDates(vietnamToday()));
              setDateNav("today");
              setPage(1);
            }}
            className={dateNav === "today" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            Hôm nay
          </Button>
          <Button
            variant={dateNav === "7days" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              // Timezone-safe: 7-day window ending today (Vietnam days).
              const today = vietnamToday();
              const to = new Date(`${today}T23:59:59.999+07:00`);
              const todayMs = to.getTime();
              const fromDay = toVietnamDay(todayMs - 6 * 24 * 60 * 60 * 1000);
              const from = new Date(`${fromDay}T00:00:00+07:00`);
              setDateRange({ from, to });
              setDateNav("7days");
              setPage(1);
            }}
            className={dateNav === "7days" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            7 ngày
          </Button>
          <Button
            variant={dateNav === "30days" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              // Timezone-safe: 30-day window ending today (Vietnam days).
              const today = vietnamToday();
              const to = new Date(`${today}T23:59:59.999+07:00`);
              const todayMs = to.getTime();
              const fromDay = toVietnamDay(todayMs - 29 * 24 * 60 * 60 * 1000);
              const from = new Date(`${fromDay}T00:00:00+07:00`);
              setDateRange({ from, to });
              setDateNav("30days");
              setPage(1);
            }}
            className={dateNav === "30days" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            30 ngày
          </Button>
          <DateRangePicker
            size="sm"
            dateFrom={fnsFormat(dateRange.from, "dd/MM/yyyy")}
            dateTo={fnsFormat(dateRange.to, "dd/MM/yyyy")}
            onChange={(from, to) => {
              // from/to are "DD/MM/YYYY" (Vietnam calendar days). Build UTC
              // instants at VN-day boundaries so the range is timezone-safe.
              const [d1, m1, y1] = from.split("/").map(Number);
              const [d2, m2, y2] = to.split("/").map(Number);
              const fDay = `${y1}-${String(m1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
              const tDay = `${y2}-${String(m2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
              const f = new Date(`${fDay}T00:00:00+07:00`);
              const t = new Date(`${tDay}T23:59:59.999+07:00`);
              setDateRange({ from: f, to: t });
              setDateNav("custom");
              setPage(1);
            }}
          />
        </div>
        {/* Right: search box */}
        <input
          type="text"
          placeholder="Mã đơn hàng, tên KH..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Status Filter Dropdown + Column Toggle */}
      <div className="mb-4 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-4 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              {statusOptions.find((o) => o.value === status)?.label || "Tất cả"}
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {statusOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => { setStatus(option.value); }}
                className={cn("cursor-pointer text-xs", status === option.value && "font-bold")}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto">
          <ColumnToggle
            columnDefs={columnDefs}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
          />
        </div>
      </div>

      {/* Table */}
      <div className="cashier-table flex-1 overflow-auto rounded-lg bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {visibleColumns.stt !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">STT</th>}
              {visibleColumns.code !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Mã đơn hàng</th>}
              {visibleColumns.customer !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tên khách hàng</th>}
              {visibleColumns.source !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nguồn khách hàng</th>}
              {visibleColumns.channel !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Kênh đặt lịch</th>}
              {visibleColumns.createdAt !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ngày tạo</th>}
              {visibleColumns.createdBy !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Người tạo</th>}
              {visibleColumns.status !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Trạng thái</th>}
              {visibleColumns.total !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tổng tiền</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Đang tải...</td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Không có đơn hàng nào</td>
              </tr>
            ) : (
              orders.map((order, index) => {
                const servicesTotal = (order.services || []).reduce(
                  (sum, s) => sum + (Number(s.service?.price) || 0),
                  0
                );
                const totalAmount = order.invoice?.final_amount ?? servicesTotal;
                // Derive payment status for the row: invoice completed wins
                // over booking status (covers paid-but-not-checked-out orders).
                const rowOrderStatus =
                  order.status === "cancelled" || order.status === "no_show"
                    ? "cancelled"
                    : order.invoice?.status === "completed"
                      ? "completed"
                      : "pending";
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    {visibleColumns.stt !== false && <td className="px-4 py-3 text-sm text-gray-900">{(page - 1) * limit + index + 1}</td>}
                    {visibleColumns.code !== false && (
                      <td className="px-4 py-3 text-sm font-medium">
                        {canViewAllInvoices ? (
                          <button
                            onClick={() => {
                              if (order.invoice?.status === "completed" && order.invoice?.id) {
                                setPaidInvoiceView({
                                  invoiceId: order.invoice.id,
                                  customerName: order.customer?.name,
                                  customerPhone: order.customer?.phone,
                                  code: order.code,
                                });
                              } else {
                                setDetailOrder(order);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {order.code || "-"}
                          </button>
                        ) : (
                          <span className="text-gray-700" title="Bạn không có quyền xem chi tiết hóa đơn">
                            {order.code || "-"}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.customer !== false && <td className="px-4 py-3 text-sm text-gray-900">{order.customer?.name || "-"}</td>}
                    {visibleColumns.source !== false && <td className="px-4 py-3 text-sm text-gray-900">{order.source?.name || "-"}</td>}
                    {visibleColumns.channel !== false && <td className="px-4 py-3 text-sm text-gray-900">{order.channel?.name || "-"}</td>}
                    {visibleColumns.createdAt !== false && (
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {(() => {
                          try {
                            return format(new Date(order.created_at), "HH:mm dd/MM/yyyy", { locale: vi });
                          } catch {
                            return "-";
                          }
                        })()}
                      </td>
                    )}
                    {visibleColumns.createdBy !== false && (
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {order.createdBy?.name || "Khách hàng"}
                      </td>
                    )}
                    {visibleColumns.status !== false && (
                      <td className="px-4 py-3">
                        {(() => {
                          const bs = order.status as BookingStatusType;
                          // Payment status takes PRIORITY over booking status:
                          // if the invoice is "completed", the order IS paid
                          // regardless of the booking's status (checkin /
                          // confirmed). This fixes orders that were paid before
                          // the booking→checkout auto-sync was added.
                          if (rowOrderStatus === "completed") {
                            return (
                              <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Đã thanh toán
                              </span>
                            );
                          }
                          // cancelled → single badge "Đã hủy" in red
                          if (bs === "cancelled") {
                            return (
                              <span className="inline-flex w-fit rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                Đã hủy
                              </span>
                            );
                          }
                          // no_show → single badge
                          if (bs === "no_show") {
                            return (
                              <span className="inline-flex w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                Không đến
                              </span>
                            );
                          }
                          // checkin (invoice not completed) → "Chưa thanh toán" badge only (no action button)
                          if (bs === "checkin") {
                            return (
                              <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                Chưa thanh toán
                              </span>
                            );
                          }
                          // new / confirmed → "chưa Checkin" + action dropdown (Checkin, Không đến, Hủy)
                          return (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                chưa Checkin
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-0.5 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
                                  >
                                    Chọn <ChevronDown className="h-2.5 w-2.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ bookingId: order.id, newStatus: "checkin" })}
                                    className="cursor-pointer text-xs"
                                  >
                                    Checkin
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ bookingId: order.id, newStatus: "no_show" })}
                                    className="cursor-pointer text-xs"
                                  >
                                    Không đến
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ bookingId: order.id, newStatus: "cancelled" })}
                                    className="cursor-pointer text-xs text-red-600"
                                  >
                                    Hủy
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    {visibleColumns.total !== false && (
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {new Intl.NumberFormat("vi-VN").format(Number(totalAmount || 0))}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Hiển thị từ {(page - 1) * limit + 1} đến {Math.min(page * limit, total)} trên tổng số {total}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-700">Trang {page} / {totalPages || 1}</span>
          <button
            onClick={() => setPage(Math.min(totalPages || 1, page + 1))}
            disabled={page >= (totalPages || 1)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Order detail dialog */}
      {detailOrder && (
        <OrderDetailDialog
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          canConfirmOldInvoice={canConfirmOldInvoice}
          onConfirmPayment={() => {
            setInvoiceDialogOrder(detailOrder);
            setDetailOrder(null);
          }}
        />
      )}

      {/* Invoice dialog — opened from OrderDetailDialog's "Xác nhận thanh toán"
          button for unpaid past-date orders (requires confirm_old_invoice perm). */}
      {invoiceDialogOrder && (
        <InvoiceDialog
          booking={orderToBooking(invoiceDialogOrder)}
          onClose={() => setInvoiceDialogOrder(null)}
          onPaid={() => {
            setInvoiceDialogOrder(null);
            queryClient.invalidateQueries({ queryKey: ["supabase-orders"] });
          }}
        />
      )}

      {/* Paid invoice full-page view — opened when clicking a completed invoice
          code in the list. Replaces the old dialog for paid invoices. */}
      {paidInvoiceView && (
        <PaidInvoiceView
          invoiceId={paidInvoiceView.invoiceId}
          customerName={paidInvoiceView.customerName}
          customerPhone={paidInvoiceView.customerPhone}
          bookingCode={paidInvoiceView.code}
          onClose={() => setPaidInvoiceView(null)}
        />
      )}
    </div>
  );
}

/**
 * Read-only detail dialog. Shows booking + invoice content:
 * - Customer info, booking code, date/time, branch
 * - Services (from booking), tip + total (from invoice if present)
 * - Payment status (derived), payment method (from invoice if present)
 */
function OrderDetailDialog({
  order,
  onClose,
  canConfirmOldInvoice,
  onConfirmPayment,
}: {
  order: BookingOrder;
  onClose: () => void;
  canConfirmOldInvoice: boolean;
  onConfirmPayment: () => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Permission: "upload_photo" gates the device-upload feature. A single
  // permission covers both unpaid and paid invoices. Upload is only possible
  // when a saved invoice exists (photos live on the invoice's note JSON);
  // no-invoice orders (e.g. cancelled) can't hold photos.
  // "delete_past_photos" gates deleting photos on PAID invoices.
  // "view_customer_photo" gates the lightbox (click-to-zoom).
  // "view_customer_phone" gates displaying the customer's phone number.
  const { hasPermission } = useAuthStore();
  const invoiceId = order.invoice?.id ?? null;
  const canUpload = !!invoiceId && hasPermission("upload_photo");
  const canDeletePastPhotos = hasPermission("delete_past_photos");
  const canViewCustomerPhoto = hasPermission("view_customer_photo");
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  // Local copy of photos so uploads appear immediately without a refetch.
  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(order.invoice?.photos) ? (order.invoice!.photos as string[]) : []
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!invoiceId) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const folder = order.invoice?.code || invoiceId || "invoices";
      const newUrls = await uploadImagesToR2(files, `invoices/${folder}`);
      if (newUrls.length === 0) {
        setUploadError("Không thể tải ảnh lên. Vui lòng thử lại.");
        e.target.value = "";
        return;
      }
      const updated = [...photos, ...newUrls];
      const res = await fetch(`/api/supabase/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: updated }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Lưu ảnh thất bại");
      setPhotos(updated);
      queryClient.invalidateQueries({ queryKey: ["supabase-orders"] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Tải ảnh lên thất bại");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemovePhoto = async (idx: number) => {
    if (!invoiceId) return;
    const updated = photos.filter((_, i) => i !== idx);
    try {
      await fetch(`/api/supabase/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: updated }),
      });
      setPhotos(updated);
      queryClient.invalidateQueries({ queryKey: ["supabase-orders"] });
    } catch {
      /* best-effort */
    }
  };

  // Derive payment status.
  let orderStatus = "pending";
  if (order.status === "cancelled" || order.status === "no_show") orderStatus = "cancelled";
  else if (order.invoice?.status === "completed") orderStatus = "completed";

  // Services: prefer invoice items (saved), fall back to booking services.
  const items: OrderItem[] =
    order.invoice && Array.isArray(order.invoice.items) && order.invoice.items.length > 0
      ? order.invoice.items
      : (order.services || []).map((s) => ({
          name: s.service?.name || "Dịch vụ",
          price: Number(s.service?.price) || 0,
          staffName: s.staff?.name || undefined,
        }));

  const servicesTotal = (order.services || []).reduce(
    (sum, s) => sum + (Number(s.service?.price) || 0),
    0
  );
  const tip = order.invoice?.tip ?? 0;
  const promotion = order.invoice?.promotion ?? null;
  const finalAmount = order.invoice?.final_amount ?? servicesTotal;
  const paymentMethod = order.invoice?.payment_method;
  // `photos` is now stateful (see handlePhotoUpload above).

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="order-dialog-dense !max-w-[747px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-1.5">
          <DialogTitle className="text-lg font-semibold">
            Đơn hàng {order.code ? `· ${order.code}` : ""}
          </DialogTitle>
        </DialogHeader>
        {/* Two-column layout: left = order detail (scrolls independently),
            right = read-only photo gallery (scrolls independently). Each
            column scrolls on its own so the photo column stays in view while
            the user scrolls through the order detail on the left. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* LEFT: order detail — scrollable independently */}
        <div className="px-5 pb-4 space-y-2 md:border-r border-gray-100 max-h-[60vh] overflow-y-auto">
          {/* Customer info */}
          <div className="rounded-lg border bg-gray-50 p-2.5 space-y-0 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Khách hàng:</span>
              <span className="font-medium text-gray-900">{order.customer?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Số điện thoại:</span>
              <span className="text-gray-900">{canViewCustomerPhone ? (order.customer?.phone || "—") : maskPhone(order.customer?.phone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nguồn khách hàng:</span>
              <span className="text-gray-900">{order.source?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Kênh đặt lịch:</span>
              <span className="text-gray-900">{order.channel?.name || "—"}</span>
            </div>
            {order.branch && (
              <div className="flex justify-between">
                <span className="text-gray-500">Chi nhánh:</span>
                <span className="text-gray-900">{order.branch.name}</span>
              </div>
            )}
            {order.date_time && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày giờ hẹn:</span>
                <span className="text-gray-900">
                  {(() => {
                    try {
                      return format(new Date(order.date_time), "HH:mm dd/MM/yyyy", { locale: vi });
                    } catch {
                      return "—";
                    }
                  })()}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Ngày tạo:</span>
              <span className="text-gray-900">
                {(() => {
                  try {
                    return format(new Date(order.created_at), "HH:mm dd/MM/yyyy", { locale: vi });
                  } catch {
                    return "—";
                  }
                })()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Trạng thái:</span>
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                  orderStatus === "completed" ? "bg-emerald-100 text-emerald-700"
                    : orderStatus === "pending" ? "bg-amber-100 text-amber-700"
                    : orderStatus === "cancelled" ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {orderStatus === "completed" ? "Đã thanh toán"
                  : orderStatus === "pending" ? "Chưa thanh toán"
                  : orderStatus === "cancelled" ? "Đã hủy"
                  : orderStatus}
              </span>
            </div>
          </div>

          {/* Services + Tip + Total */}
          <div className="rounded-lg border p-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Dịch vụ
            </div>
            <div className="space-y-1.5">
              {items.length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có dịch vụ</div>
              ) : (
                (() => {
                  // Multi-customer "Cùng lịch" booking (numberOfCustomers >= 2):
                  // each service slot shows 3 lines —
                  //   line 1: customer name + phone (or "Khách vãng lai" if empty)
                  //   line 2: service name
                  //   line 3: staff name
                  // This 3-line layout is CASHIER-MODULE ONLY. Regular bookings
                  // keep the existing 2-line layout (service name + staff).
                  const multi = parseMultiCustomerNote(order.note);
                  const isMulti = !!multi && (order.number_of_customers ?? 1) >= 2;
                  return items.map((s, idx) => {
                    const sc = isMulti ? multi!.slots[idx] : undefined;
                    return (
                      <div key={idx} className="flex items-start justify-between text-sm">
                        <div>
                          {isMulti && (
                            <div className="text-xs text-gray-600">
                              {sc && sc.walkin
                                ? "Khách vãng lai"
                                : sc
                                  ? `${sc.name}${sc.phone ? " " + sc.phone : ""}`
                                  : "Khách vãng lai"}
                            </div>
                          )}
                          <div className="font-medium text-gray-900">{s.name || "Dịch vụ"}</div>
                          {s.staffName && <div className="text-xs text-gray-500">NV: {s.staffName}</div>}
                        </div>
                        <div className="font-medium text-gray-900">
                          {fmt(Number(s.price) || 0)}đ
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Chương trình khuyến mãi */}
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-gray-600">Chương trình khuyến mãi</span>
              <span className="font-medium text-gray-900 text-right">
                {promotion
                  ? `${promotion.name} (−${fmt(promotion.discountAmount)}đ)`
                  : "—"}
              </span>
            </div>

            {/* Tip */}
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-gray-600">Thường (thưởng thợ)</span>
              <span className="font-medium text-gray-900">
                {tip > 0 ? `${fmt(tip)}đ` : "—"}
              </span>
            </div>

            <div className="mt-1.5 flex justify-between border-t pt-1.5 text-sm">
              <span className="font-medium text-gray-700">Tổng tiền</span>
              <span className="font-bold text-emerald-700">{fmt(finalAmount)}đ</span>
            </div>
          </div>

          {/* Payment method (only if invoice exists) */}
          {order.invoice && (
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-gray-700">Phương thức thanh toán</div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900">
                {paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
              </div>
            </div>
          )}

          {/* Activity history — Khởi tạo / Chỉnh sửa (one row per edit) /
              Checkin / Thanh toán. Only shown when a saved invoice exists
              (activities are tied to invoices). Edit rows show a hover tooltip
              with the change description. */}
          {invoiceId && <InvoiceActivityTable invoiceId={invoiceId} />}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t pt-2">
            {/* "Xác nhận thanh toán" button — only for unpaid orders (pending).
                Shows when the user has either create_invoice (normal orders) or
                confirm_old_invoice (past-date orders) permission. Opens the
                InvoiceDialog which has promotion selection, tip input, and
                payment confirmation. */}
            {orderStatus === "pending" && (canConfirmOldInvoice || hasPermission("create_invoice")) && (
              <Button
                type="button"
                onClick={onConfirmPayment}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Xác nhận thanh toán
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>

        {/* RIGHT: photo gallery + upload (upload gated by upload_photo permission) */}
        <div className="px-5 pb-4 space-y-3 bg-gray-50/50 max-h-[60vh] overflow-y-auto">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Ảnh đính kèm
            </div>
            {canUpload && (
              <label className="mb-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer w-fit">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {uploading ? "Đang tải..." : "Tải ảnh lên"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={handlePhotoUpload}
                />
              </label>
            )}
            {uploadError && (
              <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {uploadError}
              </div>
            )}
            {photos.length === 0 ? (
              <div className="text-sm text-gray-400">Chưa có ảnh nào được tải lên</div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((src, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => canViewCustomerPhoto && setLightboxPhoto(src)}
                    disabled={!canViewCustomerPhoto}
                    title={canViewCustomerPhoto ? undefined : "Bạn không có quyền xem ảnh"}
                    className="relative aspect-square overflow-hidden rounded-lg border bg-white"
                  >
                    <img
                      src={src}
                      alt={`Ảnh ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {canDeletePastPhotos && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleRemovePhoto(idx); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleRemovePhoto(idx); } }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        aria-label="Xóa ảnh"
                      >
                        <span className="text-xs">×</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </DialogContent>

      {/* Photo lightbox — clicking a thumbnail opens the full-size image. */}
      {lightboxPhoto && (
        <Dialog open onOpenChange={(v) => !v && setLightboxPhoto(null)}>
          <DialogContent className="max-w-4xl">
            <img
              src={lightboxPhoto}
              alt="Ảnh hóa đơn"
              className="w-full h-auto"
            />
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
