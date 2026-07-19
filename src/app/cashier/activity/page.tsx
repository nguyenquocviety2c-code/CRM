"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import dynamic from "next/dynamic";
// Lazy-load InvoiceDialog — only opened on demand.
const InvoiceDialog = dynamic(
  () => import("@/components/features/booking/invoice-dialog").then((m) => m.InvoiceDialog),
  { ssr: false }
);
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ArrowLeft, Camera, Loader2, ChevronDown } from "lucide-react";
import { useBranchStore } from "@/stores/branch-store";
import { BranchSelector } from "@/components/layout/branch-selector";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
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
import Link from "next/link";
import { uploadImagesToR2 } from "@/lib/upload";
import { maskPhone } from "@/lib/phone-mask";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";
const PaidInvoiceView = dynamic(
  () => import("@/components/features/booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);
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

interface InvoiceCustomer {
  id: string;
  name: string;
  phone: string | null;
  code: string | null;
  source?: { id: string; name: string } | null;
  channel?: { id: string; name: string } | null;
}

interface InvoiceBranch {
  id: string;
  name: string;
}

interface InvoiceStaff {
  id: string;
  name: string;
}

interface InvoiceItem {
  name?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  total?: number;
  staffName?: string;
}

interface AppliedPromotion {
  id: string;
  code: string | null;
  name: string;
  discountValue: number;
  discountType: string;
  discountAmount: number;
}

interface Invoice {
  id: string;
  code: string | null;
  status: string;
  final_amount: number;
  total_amount: number;
  discount: number;
  tip: number;
  promotion: AppliedPromotion | null;
  payment_method: string;
  items: InvoiceItem[];
  created_at: string;
  customer: InvoiceCustomer | null;
  branch: InvoiceBranch | null;
  staff: InvoiceStaff | null;
  booking_id: string | null;
  note: string | null;
  photos?: string[];
}

/** Convert an Invoice (activity page shape) to a minimal Booking object so it
 *  can be passed to InvoiceDialog (which expects a Booking). The InvoiceDialog
 *  will fetch the invoice by booking_id, so we just need the id + status. */
function invoiceToBooking(inv: Invoice): Booking {
  return {
    id: inv.booking_id || inv.id, // use booking_id if available, else invoice id
    code: inv.code || "",
    date: "",
    time: "",
    date_time: inv.created_at,
    status: inv.status === "completed" ? "checkout" : "confirmed",
    note: inv.note,
    numberOfCustomers: 1,
    customerSourceId: null,
    customerChannelId: null,
    createdBy: null,
    customer: {
      id: inv.customer?.id || "",
      name: inv.customer?.name || "",
      phone: inv.customer?.phone || "",
      code: inv.customer?.code || "",
    },
    branch: inv.branch ? { id: inv.branch.id, name: inv.branch.name } : null,
    services: [],
    invoice: {
      id: inv.id,
      code: inv.code,
      status: inv.status,
      final_amount: inv.final_amount,
      payment_method: inv.payment_method,
    },
  } as Booking;
}

export default function ActivityPage() {
  const { selectedBranchId } = useBranchStore();
  const { hasPermission } = useAuthStore();
  const canViewAllInvoices = hasPermission("view_all_invoices");
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  const canConfirmOldInvoice = hasPermission("confirm_old_invoice");
  const canCreateInvoice = hasPermission("create_invoice");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  // Date range filter (from-to). Defaults to today (matches the booking module
  // pattern). Quick-range buttons (Hôm nay / 7 ngày / 30 ngày) jump to common
  // windows; the DateRangePicker lets the user pick an arbitrary range. The
  // range is sent to the API as date_from/date_to (ISO strings).
  const [dateNav, setDateNav] = useState<"today" | "7days" | "30days" | "custom">("today");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  });
  // ISO bounds sent to the API: from = start-of-day, to = end-of-day.
  const dateFromISO = useMemo(() => {
    const d = new Date(dateRange.from);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [dateRange.from]);
  const dateToISO = useMemo(() => {
    const d = new Date(dateRange.to);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [dateRange.to]);
  // Invoice dialog state — when set, the InvoiceDialog opens (for confirming
  // payment on unpaid invoices via the "Xác nhận thanh toán" button).
  const [invoiceDialogInvoice, setInvoiceDialogInvoice] = useState<Invoice | null>(null);
  const [paidInvoiceViewData, setPaidInvoiceViewData] = useState<{ invoiceId: string; customerName?: string; customerPhone?: string; code?: string | null } | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  // Column toggle: each data column can be shown/hidden via the "Cột" button.
  const columnDefs: ColumnDef[] = [
    { key: "stt", label: "STT" },
    { key: "code", label: "Mã hóa đơn" },
    { key: "customer", label: "Khách hàng" },
    { key: "phone", label: "SĐT" },
    { key: "source", label: "Nguồn KH" },
    { key: "channel", label: "Kênh liên lạc" },
    { key: "branch", label: "Chi nhánh" },
    { key: "createdAt", label: "Ngày tạo" },
    { key: "status", label: "Trạng thái" },
    { key: "total", label: "Tổng tiền" },
  ];
  const [visibleColumns, setVisibleColumns] = useState(() =>
    buildDefaultVisibleColumns(columnDefs)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Fetch invoices (the "Lịch sử hóa đơn" = list of paid invoices).
  const { data, isLoading } = useQuery({
    queryKey: ["supabase-invoice-history", selectedBranchId, search, status, page, dateFromISO, dateToISO],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(limit));
      if (selectedBranchId && selectedBranchId !== "all") params.append("branch_id", selectedBranchId);
      if (search) params.append("search", search);
      if (status !== "all") params.append("status", status);
      params.append("date_from", dateFromISO);
      params.append("date_to", dateToISO);

      const res = await fetch(`/api/supabase/invoices?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return { data: [] as Invoice[], pagination: { total: 0, totalPages: 0 } };
      return {
        data: (json.data as Invoice[]) || [],
        pagination: json.pagination || { total: 0, totalPages: 0 },
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const invoices = data?.data || [];
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || 0;

  const statusOptions = [
    { value: "all", label: "Tất cả" },
    { value: "completed", label: "Đã thanh toán" },
    { value: "pending", label: "Chưa thanh toán" },
    { value: "cancelled", label: "Đã hủy" },
  ];

  const statusLabels: Record<string, string> = {
    completed: "Đã thanh toán",
    pending: "Chưa thanh toán",
    cancelled: "Đã hủy",
  };

  const statusColors: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/cashier/invoices"
            className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-3 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Đơn hàng
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Lịch sử hóa đơn</h1>
        </div>
        {canViewAllInvoices && <BranchSelector />}
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
              const now = new Date(); now.setHours(23, 59, 59, 999);
              const from = new Date(now); from.setHours(0, 0, 0, 0);
              setDateRange({ from, to: now });
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
              const now = new Date(); now.setHours(23, 59, 59, 999);
              const from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
              setDateRange({ from, to: now });
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
              const now = new Date(); now.setHours(23, 59, 59, 999);
              const from = new Date(now); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
              setDateRange({ from, to: now });
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
              const [d1, m1, y1] = from.split("/").map(Number);
              const [d2, m2, y2] = to.split("/").map(Number);
              const f = new Date(y1, m1 - 1, d1);
              const t = new Date(y2, m2 - 1, d2);
              t.setHours(23, 59, 59, 999);
              setDateRange({ from: f, to: t });
              setDateNav("custom");
              setPage(1);
            }}
          />
        </div>
        {/* Right: search box */}
        <input
          type="text"
          placeholder="Mã hóa đơn, tên KH, SĐT..."
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
                onClick={() => { setStatus(option.value); setPage(1); }}
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
              {visibleColumns.code !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Mã hóa đơn</th>}
              {visibleColumns.customer !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Khách hàng</th>}
              {visibleColumns.phone !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">SĐT</th>}
              {visibleColumns.source !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nguồn KH</th>}
              {visibleColumns.channel !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Kênh liên lạc</th>}
              {visibleColumns.branch !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Chi nhánh</th>}
              {visibleColumns.createdAt !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ngày tạo</th>}
              {visibleColumns.status !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Trạng thái</th>}
              {visibleColumns.total !== false && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tổng tiền</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Đang tải...</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Không có hóa đơn nào</td>
              </tr>
            ) : (
              invoices.map((inv, index) => (
                <tr
                  key={inv.id}
                  className={canViewAllInvoices ? "cursor-pointer hover:bg-gray-50" : ""}
                  onClick={canViewAllInvoices ? () => setDetailInvoice(inv) : undefined}
                  title={canViewAllInvoices ? undefined : "Bạn không có quyền xem chi tiết hóa đơn"}
                >
                  {visibleColumns.stt !== false && <td className="px-4 py-3 text-sm text-gray-900">{(page - 1) * limit + index + 1}</td>}
                  {visibleColumns.code !== false && <td className={cn("px-4 py-3 text-sm font-medium", canViewAllInvoices ? "text-blue-600" : "text-gray-700")}>{inv.code || "-"}</td>}
                  {visibleColumns.customer !== false && <td className="px-4 py-3 text-sm text-gray-900">{inv.customer?.name || "-"}</td>}
                  {visibleColumns.phone !== false && <td className="px-4 py-3 text-sm text-gray-900">{canViewCustomerPhone ? (inv.customer?.phone || "-") : maskPhone(inv.customer?.phone)}</td>}
                  {visibleColumns.source !== false && <td className="px-4 py-3 text-sm text-gray-900">{inv.customer?.source?.name || "-"}</td>}
                  {visibleColumns.channel !== false && <td className="px-4 py-3 text-sm text-gray-900">{inv.customer?.channel?.name || "-"}</td>}
                  {visibleColumns.branch !== false && <td className="px-4 py-3 text-sm text-gray-900">{inv.branch?.name || "-"}</td>}
                  {visibleColumns.createdAt !== false && (
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(() => {
                        try {
                          return format(new Date(inv.created_at), "HH:mm dd/MM/yyyy", { locale: vi });
                        } catch {
                          return "-";
                        }
                      })()}
                    </td>
                  )}
                  {visibleColumns.status !== false && (
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          statusColors[inv.status] || "bg-gray-100 text-gray-700"
                        )}
                      >
                        {statusLabels[inv.status] || inv.status}
                      </span>
                    </td>
                  )}
                  {visibleColumns.total !== false && (
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {new Intl.NumberFormat("vi-VN").format(Number(inv.final_amount || 0))}đ
                    </td>
                  )}
                </tr>
              ))
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

      {/* Invoice dialog — for unpaid invoices, opens the SAME editable
          InvoiceDialog used in the booking module (promotion, tip, payment
          method, confirm button). For paid invoices, opens the full-page
          PaidInvoiceView. */}
      {detailInvoice && detailInvoice.status === "pending" ? (
        <InvoiceDialog
          booking={invoiceToBooking(detailInvoice)}
          onClose={() => setDetailInvoice(null)}
          onPaid={() => {
            setDetailInvoice(null);
            queryClient.invalidateQueries({ queryKey: ["supabase-invoice-history"] });
          }}
        />
      ) : detailInvoice ? (
        <PaidInvoiceView
          invoiceId={detailInvoice.id}
          customerName={(detailInvoice as any).customer?.name}
          customerPhone={(detailInvoice as any).customer?.phone}
          bookingCode={detailInvoice.code}
          onClose={() => setDetailInvoice(null)}
        />
      ) : null}

      {/* Paid invoice full-page view — also opened from InvoiceDetailDialog */}
      {paidInvoiceViewData && (
        <PaidInvoiceView
          invoiceId={paidInvoiceViewData.invoiceId}
          customerName={paidInvoiceViewData.customerName}
          customerPhone={paidInvoiceViewData.customerPhone}
          bookingCode={paidInvoiceViewData.code}
          onClose={() => setPaidInvoiceViewData(null)}
        />
      )}

      {/* Fallback: InvoiceDialog opened from InvoiceDetailDialog's button
          (for paid invoices that the user wants to re-confirm). */}
      {invoiceDialogInvoice && (
        <InvoiceDialog
          booking={invoiceToBooking(invoiceDialogInvoice)}
          onClose={() => setInvoiceDialogInvoice(null)}
          onPaid={() => {
            setInvoiceDialogInvoice(null);
            queryClient.invalidateQueries({ queryKey: ["supabase-invoice-history"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * Read-only invoice detail dialog. Shows the full invoice: customer info,
 * items, promotion, tip, total, payment method, status, creation date.
 */
function InvoiceDetailDialog({
  invoice,
  onClose,
  canConfirmPayment,
  onConfirmPayment,
}: {
  invoice: Invoice;
  onClose: () => void;
  canConfirmPayment: boolean;
  onConfirmPayment: () => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Permissions: "upload_photo" gates the device-upload feature. A single
  // permission covers both unpaid and paid invoices.
  // "delete_past_photos" gates deleting photos on PAID invoices.
  // "view_customer_photo" gates the lightbox (click-to-zoom).
  // "view_customer_phone" gates displaying the customer's phone number.
  const { hasPermission } = useAuthStore();
  const canUpload = hasPermission("upload_photo");
  const canDeletePastPhotos = hasPermission("delete_past_photos");
  const canViewCustomerPhoto = hasPermission("view_customer_photo");
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  // Local copy of photos so uploads appear immediately without a refetch.
  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(invoice.photos) ? invoice.photos : []
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const folder = invoice.code || invoice.id || "invoices";
      const newUrls = await uploadImagesToR2(files, `invoices/${folder}`);
      if (newUrls.length === 0) {
        setUploadError("Không thể tải ảnh lên. Vui lòng thử lại.");
        e.target.value = "";
        return;
      }
      const updated = [...photos, ...newUrls];
      // Persist to the invoice's note JSON via PUT.
      const res = await fetch(`/api/supabase/invoices/${invoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: updated }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Lưu ảnh thất bại");
      setPhotos(updated);
      // Refresh the invoice list so the new photos sync everywhere.
      queryClient.invalidateQueries({ queryKey: ["supabase-invoice-history"] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Tải ảnh lên thất bại");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemovePhoto = async (idx: number) => {
    const updated = photos.filter((_, i) => i !== idx);
    try {
      await fetch(`/api/supabase/invoices/${invoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: updated }),
      });
      setPhotos(updated);
      queryClient.invalidateQueries({ queryKey: ["supabase-invoice-history"] });
    } catch {
      /* best-effort */
    }
  };

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );
  const discount = Number(invoice.discount) || 0;
  const tip = Number(invoice.tip) || 0;
  const promotion = invoice.promotion;
  const finalAmount = Number(invoice.final_amount) || 0;
  const paymentMethod = invoice.payment_method;
  // `photos` is now stateful (see handlePhotoUpload above) so uploads appear
  // immediately. It is initialized from invoice.photos.

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="order-dialog-dense !max-w-[747px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-1.5">
          <DialogTitle className="text-lg font-semibold">
            Hóa đơn {invoice.code ? `· ${invoice.code}` : ""}
          </DialogTitle>
        </DialogHeader>
        {/* Two-column layout: left = invoice detail, right = read-only photo gallery */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* LEFT: invoice detail — scrollable independently */}
        <div className="px-5 pb-4 space-y-2 md:border-r border-gray-100 max-h-[60vh] overflow-y-auto">
          {/* Customer info */}
          <div className="rounded-lg border bg-gray-50 p-2.5 space-y-0 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Khách hàng:</span>
              <span className="font-medium text-gray-900">{invoice.customer?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Số điện thoại:</span>
              <span className="text-gray-900">{canViewCustomerPhone ? (invoice.customer?.phone || "—") : maskPhone(invoice.customer?.phone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nguồn khách hàng:</span>
              <span className="text-gray-900">{invoice.customer?.source?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Kênh đặt lịch:</span>
              <span className="text-gray-900">{invoice.customer?.channel?.name || "—"}</span>
            </div>
            {invoice.branch && (
              <div className="flex justify-between">
                <span className="text-gray-500">Chi nhánh:</span>
                <span className="text-gray-900">{invoice.branch.name}</span>
              </div>
            )}
            {invoice.staff && (
              <div className="flex justify-between">
                <span className="text-gray-500">Nhân viên:</span>
                <span className="text-gray-900">{invoice.staff.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Ngày tạo:</span>
              <span className="text-gray-900">
                {(() => {
                  try {
                    return format(new Date(invoice.created_at), "HH:mm dd/MM/yyyy", { locale: vi });
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
                  invoice.status === "completed" ? "bg-emerald-100 text-emerald-700"
                    : invoice.status === "pending" ? "bg-amber-100 text-amber-700"
                    : invoice.status === "cancelled" ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {invoice.status === "completed" ? "Đã thanh toán"
                  : invoice.status === "pending" ? "Chưa thanh toán"
                  : invoice.status === "cancelled" ? "Đã hủy"
                  : invoice.status}
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
                items.map((s, idx) => (
                  <div key={idx} className="flex items-start justify-between text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{s.name || "Dịch vụ"}</div>
                      {s.staffName && <div className="text-xs text-gray-500">NV: {s.staffName}</div>}
                    </div>
                    <div className="font-medium text-gray-900">
                      {fmt(Number(s.total) || Number(s.price) || 0)}đ
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Thành tiền (subtotal) */}
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-gray-600">Thành tiền</span>
              <span className="font-medium text-gray-900">{fmt(subtotal)}đ</span>
            </div>

            {/* Chương trình khuyến mãi */}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">Chương trình khuyến mãi</span>
              <span className="font-medium text-gray-900 text-right">
                {promotion
                  ? `${promotion.name} (−${fmt(promotion.discountAmount)}đ)`
                  : discount > 0
                  ? `−${fmt(discount)}đ`
                  : "—"}
              </span>
            </div>

            {/* Tip */}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">Thường (thưởng thợ)</span>
              <span className="font-medium text-gray-900">
                {tip > 0 ? `+${fmt(tip)}đ` : "—"}
              </span>
            </div>

            <div className="mt-1.5 flex justify-between border-t pt-1.5 text-sm">
              <span className="font-medium text-gray-700">Tổng tiền</span>
              <span className="font-bold text-emerald-700">{fmt(finalAmount)}đ</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-gray-700">Phương thức thanh toán</div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">
              {paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
            </div>
          </div>

          {/* Note (if any) */}
          {invoice.note && (
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-gray-700">Ghi chú</div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
                {invoice.note}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t pt-2">
            {/* "Xác nhận thanh toán" button — only for unpaid invoices (status
                "pending") when the user has the appropriate permission. Opens
                the InvoiceDialog with editable UI (promotion, tip, payment). */}
            {invoice.status === "pending" && canConfirmPayment && (
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
              <div className="text-sm text-gray-400">
                {canUpload ? "Chưa có ảnh nào được tải lên" : "Chưa có ảnh nào được tải lên"}
              </div>
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
