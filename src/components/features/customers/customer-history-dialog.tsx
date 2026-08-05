"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  Star,
  Pencil,
  Plus,
  FileText,
  Package,
  Calendar,
  Receipt,
  Gift,
  Headset,
  Image as ImageIcon,
  Phone,
  Hash,
  CalendarPlus,
  ChevronLeft,
  Upload,
  Trash2,
  Store,
  Clock,
  TrendingUp,
  User,
  Scissors,
  MapPin,
  Wallet,
  X,
  CheckSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamDay, toVietnamTime, formatVND } from "@/lib/utils";

// Lazy-load the edit dialog + invoice full-page view so this component stays light.
const CustomerDialog = dynamic(
  () => import("./customer-dialog").then((m) => m.CustomerDialog),
  { ssr: false }
);
// Lazy-load GiftPromotionDialog — only opened on demand (clicking "Tặng
// khuyến mãi"). Shows eligible promotions/vouchers for this customer.
const GiftPromotionDialog = dynamic(
  () => import("./gift-promotion-dialog").then((m) => m.GiftPromotionDialog),
  { ssr: false }
);
const PaidInvoiceView = dynamic(
  () => import("../booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);

/** Minimal customer shape this dialog needs. Any caller (Customer module,
 * Booking module, Cashier module, Report module) can pass a partial customer
 * object as long as it has an `id`. */
export interface HistoryCustomer {
  id: string;
  name?: string | null;
  phone?: string | null;
  code?: string | null;
  note?: string | null;
  birthday?: string | null;
  email?: string | null;
  gender?: string | null;
  address?: string | null;
  group?: { id: string; name: string } | null;
  rank?: { id: string; name: string } | null;
  source?: { id: string; name: string } | null;
  totalSpent?: number;
  total_spent?: number;
  debt?: number;
  created_at?: string | null;
  createdAt?: string | null;
}

interface InvoiceItem {
  name?: string;
  staffName?: string | null;
  staffId?: string | null;
  price?: number;
  quantity?: number;
  type?: string;
}

interface Invoice {
  id: string;
  code?: string;
  created_at?: string;
  createdAt?: string;
  tip?: number;
  items?: InvoiceItem[];
  final_amount?: number;
  total_amount?: number;
  discount?: number;
  promotion?: { id?: string; name?: string; discountAmount?: number } | null;
  payment_method?: string | null;
  status?: string;
  branch?: { id?: string; name?: string } | null;
  booking_id?: string | null;
  /** Photos uploaded to this invoice (base64 data URLs or R2 URLs). */
  photos?: string[];
}

interface Booking {
  id: string;
  code?: string;
  created_at?: string;
  /** The appointment date/time the customer booked (Supabase field `date_time`). */
  date_time?: string;
  start_time?: string;
  number_of_customers?: number;
  customer_count?: number;
  guest_count?: number;
  total_amount?: number;
  final_amount?: number;
  status?: string;
  note?: string | null;
  branch?: { id?: string; name?: string } | null;
  services?: Array<{
    id: string;
    service?: { name?: string; price?: number; duration?: number } | null;
    staff?: { name?: string } | null;
  }>;
  invoices?: Array<{ id: string; code?: string; status?: string; final_amount?: number }>;
}

interface Feedback {
  id: string;
  rating: number;
  content?: string | null;
  createdAt?: string;
}

/** Format an ISO date string → "dd/MM/yyyy" using Vietnam timezone. */
function formatShortDate(iso?: string | null): string {
  if (!iso) return "—";
  const dayStr = toVietnamDay(iso);
  if (!dayStr || dayStr.length < 10) return "—";
  const [yyyy, mm, dd] = dayStr.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** Format an ISO date string → "HH:mm dd/MM/yyyy" using Vietnam timezone. */
function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return `${toVietnamTime(iso)} ${formatShortDate(iso)}`;
}

const TABS = [
  { key: "packages", label: "Gói dịch vụ", icon: Package },
  { key: "bookings", label: "Lịch hẹn", icon: Calendar },
  { key: "invoices", label: "Hóa đơn", icon: Receipt },
  { key: "promotions", label: "Khuyến mãi", icon: Gift },
  { key: "care", label: "Lịch sử chăm sóc", icon: Headset },
  { key: "images", label: "Hình ảnh", icon: ImageIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Customer information interface — "Thông tin khách hàng".
 *
 * This is a DROP-IN REPLACEMENT for the old history dialog. It keeps the same
 * export name (`CustomerHistoryDialog`) and the same props (`{customer, open,
 * onClose}`), so all 10+ call sites across the Customer, Booking, Cashier,
 * and Report modules work without any change — clicking a customer name
 * anywhere now opens this full customer-info interface instead of the old
 * compact history dialog.
 *
 * Layout (matches the user's uploaded design):
 *  - Header: avatar + name + phone + code + created date (left),
 *            total-spending badge + "Tăng Khuyến mãi" + "Cập nhật" (right).
 *  - 8 tabs: Gói dịch vụ · Lịch hẹn · Hóa đơn · Công nợ · Khuyến mãi ·
 *            Lịch sử chăm sóc · Lịch sử tích điểm · Hình ảnh.
 *  - "Lịch hẹn" tab (default) shows a table of the customer's bookings with
 *    columns: Mã lịch hẹn · Ngày tạo · Ngày đặt lịch · Số khách · Tổng tiền ·
 *    Thông tin hóa đơn ("Xem hóa đơn" link).
 *  - Other tabs show their relevant data or a clean empty-state.
 *
 * Two exports:
 *  - `CustomerInfoView` — the inline (fixed) interface, rendered as a full
 *    page card. Used by the `/customers/[id]` route. Takes `customerId` +
 *    optional `onBack` (back button). This is the "fixed interface" the user
 *    requested — no Dialog overlay.
 *  - `CustomerHistoryDialog` — a thin Dialog wrapper around the same view,
 *    kept for backward compatibility. New code should navigate to
 *    `/customers/[id]` instead.
 */

/**
 * Inline (fixed) customer information interface. Renders as a full card —
 * NOT inside a Dialog. Used by the `/customers/[id]` page route so clicking
 * a customer name anywhere navigates to a dedicated, fixed page (like the
 * Hóa đơn page) instead of opening an overlay.
 */
export function CustomerInfoView({
  customerId,
  onBack,
}: {
  customerId: string;
  onBack?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("bookings");
  const [editOpen, setEditOpen] = useState(false);
  // "Tặng khuyến mãi" dialog state — opens the GiftPromotionDialog which
  // shows promotions/vouchers suitable for this customer.
  const [giftPromoOpen, setGiftPromoOpen] = useState(false);
  // State for the full-page invoice view. Set when the user clicks a booking
  // code or invoice code — opens the PaidInvoiceView (the fixed invoice
  // interface), NOT a dialog.
  const [paidInvoice, setPaidInvoice] = useState<{
    invoiceId: string;
    customerName?: string;
    customerPhone?: string;
    bookingCode?: string | null;
  } | null>(null);
  const canViewPhone = useAuthStore.getState().hasPermission("view_customer_phone");

  // Fetch the FULL customer detail by id.
  const { data: infoRaw, isLoading: loadingCustomer } = useQuery({
    queryKey: ["customer-info-detail", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/customers/${encodeURIComponent(customerId)}`);
      const json = await res.json();
      return json.ok ? (json.data as HistoryCustomer) : null;
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });
  const info: HistoryCustomer | null = infoRaw || null;

  // Fetch bookings for this customer (for the "Lịch hẹn" tab).
  const { data: bookingsData, isLoading: loadingBookings } = useQuery({
    queryKey: ["customer-info-bookings", customerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/bookings?customer_id=${encodeURIComponent(customerId)}&limit=100`
      );
      const json = await res.json();
      return (json.data || []) as Booking[];
    },
    enabled: !!customerId,
  });

  // Fetch invoices for this customer (for the "Hóa đơn" + "Khuyến mãi" tabs).
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ["customer-info-invoices", customerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/invoices?customer_id=${encodeURIComponent(customerId)}&limit=100`
      );
      const json = await res.json();
      return (json.data || []) as Invoice[];
    },
    enabled: !!customerId,
  });

  // Fetch feedbacks for the "Lịch sử chăm sóc" tab.
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery({
    queryKey: ["customer-info-feedback", customerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/customer-feedback?customer_id=${encodeURIComponent(customerId)}&limit=100`
      );
      const json = await res.json();
      return (json.data?.feedbacks || []) as Feedback[];
    },
    enabled: !!customerId,
  });

  const bookings: Booking[] = bookingsData || [];
  const invoices: Invoice[] = invoicesData || [];
  const feedbacks: Feedback[] = feedbackData || [];

  // Aggregated stats for the header.
  const totalSpent = useMemo(() => {
    const s = Number(info?.totalSpent ?? info?.total_spent ?? 0);
    if (s > 0) return s;
    return invoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
  }, [info, invoices]);

  const avgRating = useMemo(() => {
    if (feedbacks.length === 0) return null;
    return feedbacks.reduce((s, f) => s + (Number(f.rating) || 0), 0) / feedbacks.length;
  }, [feedbacks]);

  const promotionSavings = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const saving = Number(inv.promotion?.discountAmount) || Number(inv.discount) || 0;
      return sum + saving;
    }, 0);
  }, [invoices]);

  const displayName = info?.name || "Khách hàng";
  const initial = (displayName || "?").charAt(0).toUpperCase();
  const createdDate = formatShortDate(info?.created_at ?? info?.createdAt);

  if (loadingCustomer && !info) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500" />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <p className="text-sm">Không tìm thấy thông tin khách hàng.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {/* ---------- Header: title bar + back button ---------- */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Quay lại"
              aria-label="Quay lại"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-gray-900">Thông tin khách hàng</h1>
        </div>

        {/* ---------- Customer profile section ---------- */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Left: avatar + name + meta */}
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
                {initial}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-900 truncate">
                  {displayName}
                </h2>
                <div className="mt-1.5 flex flex-col gap-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    Số điện thoại:{" "}
                    <span className="font-medium text-gray-800">
                      {info.phone ? (canViewPhone ? info.phone : maskPhone(info.phone)) : "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                    Mã khách hàng:{" "}
                    <span className="font-medium text-gray-800">{info.code || "—"}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarPlus className="h-3.5 w-3.5 text-gray-400" />
                    Ngày khởi tạo hồ sơ:{" "}
                    <span className="font-medium text-gray-800">{createdDate}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right: total spending + buttons */}
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
                <div className="text-xs font-medium text-emerald-700">Tổng chi tiêu</div>
                <div className="text-lg font-bold text-emerald-900">
                  {formatVND(totalSpent)}đ
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => setGiftPromoOpen(true)}
                >
                  <Gift className="mr-1 h-4 w-4" />
                  Tặng khuyến mãi
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Cập nhật
                </Button>
              </div>
            </div>
          </div>

          {/* Secondary badges */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {info.group && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                {info.group.name}
              </span>
            )}
            {info.rank && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                {info.rank.name}
              </span>
            )}
            {info.source && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                Nguồn: {info.source.name}
              </span>
            )}
            {avgRating !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {avgRating.toFixed(1)} ({feedbacks.length})
              </span>
            )}
            {info.note && (
              <span className="text-xs text-gray-500 italic truncate max-w-xs">
                Ghi chú: {info.note}
              </span>
            )}
          </div>
        </div>

        {/* ---------- Tabs ---------- */}
        <div className="px-6 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Tab content ---------- */}
        <div className="px-6 py-4">
          {activeTab === "bookings" && (
            <BookingsTab
              bookings={bookings}
              invoices={invoices}
              customer={info}
              loading={loadingBookings}
              onViewInvoice={(payload) => setPaidInvoice(payload)}
            />
          )}
          {activeTab === "invoices" && (
            <InvoicesTab
              invoices={invoices}
              bookings={bookings}
              customer={info}
              loading={loadingInvoices}
              onViewInvoice={(payload) => setPaidInvoice(payload)}
            />
          )}
          {activeTab === "packages" && <PackagesTab invoices={invoices} />}
          {activeTab === "promotions" && (
            <PromotionsTab invoices={invoices} savings={promotionSavings} />
          )}
          {activeTab === "care" && (
            <CareTab
              invoices={invoices}
              feedbacks={feedbacks}
              loading={loadingInvoices || loadingFeedback}
              customerId={info.id}
            />
          )}
          {activeTab === "images" && (
            <ImagesTab customerId={info.id} invoices={invoices} />
          )}
        </div>
      </div>

      {/* Edit dialog — opened by the "Cập nhật" button */}
      <CustomerDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={info as never}
      />

      {/* "Tặng khuyến mãi" dialog — opened by the "Tặng khuyến mãi" button.
          Shows promotions/vouchers suitable for this customer's type (new/
          vip/member), still within the active period and with remaining
          quantity, sourced from the CSKH > Chương trình khuyến mãi module. */}
      <GiftPromotionDialog
        open={giftPromoOpen}
        onOpenChange={setGiftPromoOpen}
        customer={{
          id: info.id,
          name: info.name,
          group: info.group,
          rank: info.rank,
          totalSpent,
          created_at: info.created_at,
        }}
      />

      {/* Full-page invoice view — opened by clicking a booking code or invoice
          code. This is the FIXED invoice interface (PaidInvoiceView), NOT a
          dialog. Renders as an overlay panel covering the customer info page. */}
      {paidInvoice && (
        <PaidInvoiceView
          invoiceId={paidInvoice.invoiceId}
          customerName={paidInvoice.customerName}
          customerPhone={paidInvoice.customerPhone}
          bookingCode={paidInvoice.bookingCode}
          onClose={() => setPaidInvoice(null)}
        />
      )}
    </>
  );
}

/**
 * Dialog wrapper around `CustomerInfoView` — kept for backward compatibility.
 * New call sites should navigate to `/customers/[id]` (a fixed page) instead
 * of opening this dialog overlay.
 */
export function CustomerHistoryDialog({
  customer,
  open,
  onClose,
}: {
  customer: HistoryCustomer | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-lg font-bold text-gray-900">
            Thông tin khách hàng
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {customer?.id ? (
            <CustomerInfoView customerId={customer.id} />
          ) : (
            <div className="py-16 text-center text-gray-400 text-sm">
              Không có dữ liệu khách hàng.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function BookingsTab({
  bookings,
  invoices,
  customer,
  loading,
  onViewInvoice,
}: {
  bookings: Booking[];
  invoices: Invoice[];
  customer: HistoryCustomer;
  loading: boolean;
  onViewInvoice: (payload: {
    invoiceId: string;
    customerName?: string;
    customerPhone?: string;
    bookingCode?: string | null;
  }) => void;
}) {
  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">Đang tải...</div>;
  }
  if (bookings.length === 0) {
    return (
      <EmptyTab icon={Calendar} label="Lịch hẹn" />
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Mã lịch hẹn</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Ngày tạo</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Ngày đặt lịch</th>
            <th className="px-4 py-2.5 text-center font-medium text-gray-600">Số khách</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-600">Tổng tiền</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Chương trình khuyến mãi</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-600">Giảm giá</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bookings.map((b) => {
            // The bookings API does NOT embed invoices; instead, each invoice
            // has a `booking_id`. Find the linked completed invoice (prefer
            // completed; fall back to the first linked invoice).
            const linkedInvoices = invoices.filter(
              (inv) => inv.booking_id && inv.booking_id === b.id
            );
            const completedInv =
              linkedInvoices.find((inv) => inv.status === "completed") || linkedInvoices[0];
            const total = Number(completedInv?.final_amount ?? b.final_amount ?? b.total_amount ?? 0);
            const guestCount = b.number_of_customers ?? b.customer_count ?? b.guest_count ?? 1;
            const promoName = completedInv?.promotion?.name || "—";
            const discountAmount =
              Number(completedInv?.promotion?.discountAmount) ||
              Number(completedInv?.discount) ||
              0;
            const handleClick = () => {
              if (!completedInv) return;
              onViewInvoice({
                invoiceId: completedInv.id,
                customerName: customer.name || undefined,
                customerPhone: customer.phone || undefined,
                bookingCode: b.code || null,
              });
            };
            return (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  <button
                    type="button"
                    onClick={handleClick}
                    disabled={!completedInv}
                    className={
                      completedInv
                        ? "text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        : "text-gray-900 cursor-default"
                    }
                    title={completedInv ? "Xem chi tiết lịch hẹn" : "Chưa có hóa đơn"}
                  >
                    {b.code || "—"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{formatDateTime(b.created_at)}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {formatDateTime(b.date_time ?? b.start_time)}
                </td>
                <td className="px-4 py-2.5 text-center text-gray-700">{guestCount}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                  {total > 0 ? `${formatVND(total)}đ` : "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate" title={promoName}>
                  {promoName}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-orange-600">
                  {discountAmount > 0 ? `${formatVND(discountAmount)}đ` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab({
  invoices,
  customer,
  loading,
  onViewInvoice,
}: {
  invoices: Invoice[];
  customer: HistoryCustomer;
  loading: boolean;
  onViewInvoice: (payload: {
    invoiceId: string;
    customerName?: string;
    customerPhone?: string;
    bookingCode?: string | null;
  }) => void;
}) {
  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">Đang tải...</div>;
  }
  if (invoices.length === 0) {
    return <EmptyTab icon={Receipt} label="Hóa đơn" />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Mã hóa đơn</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Ngày tạo</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Dịch vụ</th>
            <th className="px-4 py-2.5 text-center font-medium text-gray-600">Trạng thái</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-600">Tổng tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {invoices.map((inv) => {
            const handleClick = () => {
              onViewInvoice({
                invoiceId: inv.id,
                customerName: customer.name || undefined,
                customerPhone: customer.phone || undefined,
                bookingCode: inv.code || null,
              });
            };
            return (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  <button
                    type="button"
                    onClick={handleClick}
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    title="Xem chi tiết hóa đơn"
                  >
                    {inv.code || "—"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{formatDateTime(inv.created_at ?? inv.createdAt)}</td>
                <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                  {(inv.items || []).map((it) => it.name).filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      inv.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : inv.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {inv.status === "completed" ? "Đã thanh toán" : inv.status === "cancelled" ? "Đã hủy" : "Chờ"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                  {Number(inv.final_amount) > 0 ? `${formatVND(Number(inv.final_amount))}đ` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PackagesTab({ invoices }: { invoices: Invoice[] }) {
  // Extract package-type items from invoices.
  const packages = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        if (it.type === "package" && it.name) {
          const existing = map.get(it.name);
          if (existing) {
            existing.count += 1;
            existing.total += Number(it.price) || 0;
          } else {
            map.set(it.name, { name: it.name, count: 1, total: Number(it.price) || 0 });
          }
        }
      }
    }
    return Array.from(map.values());
  }, [invoices]);

  if (packages.length === 0) {
    return <EmptyTab icon={Package} label="Gói dịch vụ" />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Tên gói</th>
            <th className="px-4 py-2.5 text-center font-medium text-gray-600">Số lần mua</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-600">Tổng giá trị</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {packages.map((p) => (
            <tr key={p.name} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-2.5 text-center text-gray-700">{p.count}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                {p.total > 0 ? `${formatVND(p.total)}đ` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromotionsTab({
  invoices,
  savings,
}: {
  invoices: Invoice[];
  savings: number;
}) {
  const promos = useMemo(() => {
    const map = new Map<string, { name: string; count: number; saving: number }>();
    for (const inv of invoices) {
      const name = inv.promotion?.name;
      if (!name) continue;
      const saving = Number(inv.promotion?.discountAmount) || Number(inv.discount) || 0;
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.saving += saving;
      } else {
        map.set(name, { name, count: 1, saving });
      }
    }
    return Array.from(map.values());
  }, [invoices]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-orange-700">Tổng tiền tiết kiệm</span>
        <span className="text-lg font-bold text-orange-900">{formatVND(savings)}đ</span>
      </div>
      {promos.length === 0 ? (
        <EmptyTab icon={Gift} label="Khuyến mãi" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Chương trình</th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-600">Số lần dùng</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Tiết kiệm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {promos.map((p) => (
                <tr key={p.name} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700">{p.count}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-orange-600">
                    {p.saving > 0 ? `${formatVND(p.saving)}đ` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * "Lịch sử chăm sóc" (Care History) tab — comprehensive customer analytics
 * computed in REAL-TIME from the customer's completed invoices + feedbacks.
 *
 * Shows:
 *  - Summary stat cards: số lượt ghé (visit count), thời gian TB giữa các lần
 *    (avg gap days), chi tiêu TB / lượt (avg spend per visit), tiền thưởng TB
 *    (avg tip).
 *  - Cửa hàng thường đến nhất (most-visited branch).
 *  - Nhân viên được sử dụng nhiều nhất (most-used staff).
 *  - Dịch vụ sử dụng nhiều nhất (most-used service).
 *  - Lịch sử dịch vụ đã thực hiện (full service history table): ngày, dịch vụ,
 *    thực hiện bởi ai, cửa hàng, số tiền.
 *  - Lịch sử đánh giá (feedback cards with star ratings).
 *
 * All data is fetched live from /api/supabase/invoices + /api/supabase/
 * customer-feedback (passed in as props from the parent CustomerInfoView which
 * runs the useQuery hooks). No mock data — everything is real-time.
 */
function CareTab({
  invoices,
  feedbacks,
  loading,
  customerId,
}: {
  invoices: Invoice[];
  feedbacks: Feedback[];
  loading: boolean;
  customerId: string;
}) {
  // Only count COMPLETED invoices for the analytics (matches the revenue/
  // spending semantics used elsewhere in the app).
  const completed = useMemo(
    () => invoices.filter((i) => i.status === "completed"),
    [invoices]
  );

  // ---- Aggregated analytics (all from real invoice data) ----
  const stats = useMemo(() => {
    // Visit timestamps (sorted ascending) for the avg-gap calculation.
    const times = completed
      .map((inv) => new Date(inv.created_at || inv.createdAt || "").getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    const visitCount = completed.length;

    // Avg gap between visits (days). Needs >= 2 visits.
    let avgGapDays: number | null = null;
    if (times.length >= 2) {
      let totalDays = 0;
      for (let i = 1; i < times.length; i++) {
        totalDays += (times[i] - times[i - 1]) / (1000 * 60 * 60 * 24);
      }
      avgGapDays = totalDays / (times.length - 1);
    }

    // Avg spend per visit (final_amount, excludes tip).
    const totalSpend = completed.reduce((s, inv) => s + (Number(inv.final_amount) || 0), 0);
    const avgSpend = visitCount > 0 ? totalSpend / visitCount : 0;

    // Avg tip per visit.
    const totalTip = completed.reduce((s, inv) => s + (Number(inv.tip) || 0), 0);
    const avgTip = visitCount > 0 ? totalTip / visitCount : 0;

    return { visitCount, avgGapDays, avgSpend, avgTip, totalSpend, totalTip };
  }, [completed]);

  // Most-visited branch (store). From invoice.branch.name.
  const topBranch = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of completed) {
      const name = inv.branch?.name?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return arr.length > 0 ? { name: arr[0][0], count: arr[0][1], total: completed.length } : null;
  }, [completed]);

  // Most-used staff. From invoice.items[].staffName.
  const topStaff = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of completed) {
      for (const it of inv.items || []) {
        const name = it.staffName?.trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return arr;
  }, [completed]);

  // Most-used service. From invoice.items[].name.
  const topService = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of completed) {
      for (const it of inv.items || []) {
        const name = it.name?.trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return arr;
  }, [completed]);

  // Flat service-history rows for the table: one row per (invoice, item).
  const historyRows = useMemo(() => {
    const rows: Array<{
      key: string;
      date: string;
      serviceName: string;
      staffName: string;
      branchName: string;
      amount: number;
      invCode: string;
    }> = [];
    for (const inv of completed) {
      const items = inv.items || [];
      const date = inv.created_at || inv.createdAt || "";
      const branchName = inv.branch?.name || "—";
      const amount = Number(inv.final_amount) || 0;
      const invCode = inv.code || "—";
      if (items.length === 0) {
        rows.push({
          key: inv.id,
          date,
          serviceName: "—",
          staffName: "—",
          branchName,
          amount,
          invCode,
        });
      } else {
        items.forEach((it, idx) => {
          rows.push({
            key: `${inv.id}-${idx}`,
            date,
            serviceName: it.name || "—",
            staffName: it.staffName || "—",
            branchName,
            amount: idx === 0 ? amount : 0, // show amount only on first row of the invoice
            invCode,
          });
        });
      }
    }
    // Most recent first.
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return rows;
  }, [completed]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">Đang tải...</div>;
  }

  if (completed.length === 0 && feedbacks.length === 0) {
    return <EmptyTab icon={Headset} label="Lịch sử chăm sóc" />;
  }

  const fmtVND = (n: number) => `${formatVND(n)}đ`;

  return (
    <div className="space-y-4">
      {/* ---- Summary stat cards ---- */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Số lượt ghé"
          value={String(stats.visitCount)}
          color="emerald"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Thời gian TB / lần"
          value={stats.avgGapDays !== null ? `${stats.avgGapDays.toFixed(1)} ngày` : "—"}
          color="teal"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Chi tiêu TB / lượt"
          value={stats.visitCount > 0 ? fmtVND(stats.avgSpend) : "—"}
          color="cyan"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Tiền thưởng TB / lượt"
          value={stats.visitCount > 0 ? fmtVND(stats.avgTip) : "—"}
          color="amber"
        />
      </section>

      {/* ---- Top branch + top staff + top service ---- */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InsightCard
          icon={<Store className="h-4 w-4" />}
          label="Cửa hàng thường đến nhất"
          value={topBranch?.name || "—"}
          subtitle={
            topBranch
              ? `${topBranch.count}/${topBranch.total} lượt (${Math.round((topBranch.count / Math.max(topBranch.total, 1)) * 100)}%)`
              : "Chưa có dữ liệu"
          }
          color="emerald"
        />
        <InsightCard
          icon={<User className="h-4 w-4" />}
          label="Nhân viên dùng nhiều nhất"
          value={topStaff[0]?.[0] || "—"}
          subtitle={
            topStaff[0]
              ? `${topStaff[0][1]} lần`
              : "Chưa có dữ liệu"
          }
          color="violet"
        />
        <InsightCard
          icon={<Scissors className="h-4 w-4" />}
          label="Dịch vụ dùng nhiều nhất"
          value={topService[0]?.[0] || "—"}
          subtitle={
            topService[0]
              ? `${topService[0][1]} lần`
              : "Chưa có dữ liệu"
          }
          color="cyan"
        />
      </section>

      {/* ---- Top 3 staff + services lists (if more than 1) ---- */}
      {(topStaff.length > 1 || topService.length > 1) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topStaff.length > 1 && (
            <RankList title="Top nhân viên" items={topStaff} color="violet" />
          )}
          {topService.length > 1 && (
            <RankList title="Top dịch vụ" items={topService} color="cyan" />
          )}
        </section>
      )}

      {/* ---- Full service history table ---- */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span className="inline-block h-3 w-1 rounded-full bg-emerald-500" />
          Lịch sử dịch vụ đã thực hiện
          <span className="ml-1 text-xs font-normal text-gray-400">
            ({historyRows.length} mục)
          </span>
        </h3>
        {historyRows.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">Chưa có lịch sử dịch vụ</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Dịch vụ</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Thực hiện bởi</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Cửa hàng</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyRows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {formatDateTime(row.date)}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{row.serviceName}</td>
                    <td className="px-3 py-2 text-gray-700">{row.staffName}</td>
                    <td className="px-3 py-2 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {row.branchName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {row.amount > 0 ? fmtVND(row.amount) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Customer feedback ---- */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span className="inline-block h-3 w-1 rounded-full bg-amber-500" />
          Lịch sử đánh giá
          {feedbacks.length > 0 && (
            <span className="ml-1 text-xs font-normal text-gray-400">
              ({feedbacks.length} đánh giá)
            </span>
          )}
        </h3>
        {feedbacks.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400">Chưa có đánh giá</div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((fb) => (
              <div
                key={fb.id}
                className="rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3"
              >
                <div className="flex items-center gap-1 mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={
                        "h-3.5 w-3.5 " +
                        (i < fb.rating ? "fill-amber-400 text-amber-400" : "text-gray-300")
                      }
                    />
                  ))}
                  <span className="ml-2 text-xs text-gray-400">
                    {formatShortDate(fb.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-gray-700">{fb.content || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Small stat card used in the Care tab summary grid. */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "teal" | "cyan" | "amber";
}) {
  const colorClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    teal: "border-teal-200 bg-teal-50 text-teal-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  const valueColors = {
    emerald: "text-emerald-900",
    teal: "text-teal-900",
    cyan: "text-cyan-900",
    amber: "text-amber-900",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-lg font-bold ${valueColors[color]}`}>{value}</div>
    </div>
  );
}

/** Insight card for top branch / staff / service. */
function InsightCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  color: "emerald" | "violet" | "cyan";
}) {
  const colorClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };
  const valueColors = {
    emerald: "text-emerald-900",
    violet: "text-violet-900",
    cyan: "text-cyan-900",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-base font-bold truncate ${valueColors[color]}`} title={value}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

/** Ranked list (top 3) for staff or services. */
function RankList({
  title,
  items,
  color,
}: {
  title: string;
  items: Array<[string, number]>;
  color: "violet" | "cyan";
}) {
  const dotColor = color === "violet" ? "bg-violet-400" : "bg-cyan-400";
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-xs font-semibold text-gray-600 mb-2">{title}</div>
      <div className="space-y-1">
        {items.map(([name, count], idx) => (
          <div key={name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 truncate">
              <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
              <span className="text-gray-700 truncate">{idx + 1}. {name}</span>
            </span>
            <span className="text-gray-500 shrink-0 ml-2">{count} lần</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Hình ảnh" (Images) tab — displays ALL photos of the customer.
 *
 * Two sources of photos, synced in real-time:
 *  1. **Customer photos** — uploaded directly to this tab. Stored as URL
 *     arrays encoded in the customer's `note` TEXT column (via the
 *     /api/supabase/customers/[id]/photos endpoint). These can be uploaded +
 *     deleted from this tab.
 *  2. **Invoice photos** — photos uploaded inside each of the customer's
 *     invoices (stored in each invoice's encoded `note` as a `photos` array —
 *     base64 data URLs or R2 URLs). These are READ-ONLY here (they belong to
 *     the invoice, not the customer record); they're displayed so this tab is
 *     the single place to see ALL of the customer's photos.
 *
 * All data is real-time: customer photos via useQuery + useMutation (refetched
 * after upload/delete); invoice photos via the parent's invoices useQuery.
 */
function ImagesTab({
  customerId,
  invoices,
}: {
  customerId: string;
  invoices: Invoice[];
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // URL of the photo the user is about to delete (opens the confirm dialog).
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  // URL of the photo to show enlarged (lightbox).
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Selected photo IDs for bulk delete (checkbox mechanism, like the invoice).
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  // Fetch the customer's own photo URLs (real-time).
  const { data: photosData, isLoading } = useQuery({
    queryKey: ["customer-photos", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/customers/${encodeURIComponent(customerId)}/photos`);
      const json = await res.json();
      return (json.data?.photos || []) as string[];
    },
    enabled: !!customerId,
  });
  const customerPhotos = photosData || [];

  // Aggregate invoice photos: one entry per photo, tagged with the invoice
  // code AND invoice id (the id is needed for deletion). Invoice photos may be
  // base64 data URLs (stored in the invoice note) or R2 URLs.
  const invoicePhotos = useMemo(() => {
    const result: Array<{ url: string; invoiceCode: string; invoiceId: string }> = [];
    for (const inv of invoices) {
      const photos = Array.isArray(inv.photos) ? inv.photos : [];
      for (const url of photos) {
        if (typeof url === "string" && url.length > 0) {
          result.push({ url, invoiceCode: inv.code || "—", invoiceId: inv.id });
        }
      }
    }
    return result;
  }, [invoices]);

  // Unified photo list: combines customer photos + invoice photos into one
  // array with metadata. Each photo has a unique `id` (used for checkbox
  // selection) and `source` (customer / invoice) so the bulk-delete handler
  // knows which API to call.
  const allPhotos = useMemo(() => {
    const list: Array<{
      id: string;
      url: string;
      source: "customer" | "invoice";
      invoiceId?: string;
      invoiceCode?: string;
    }> = [];
    customerPhotos.forEach((url, idx) => {
      list.push({ id: `cust-${idx}-${url.substring(0, 20)}`, url, source: "customer" });
    });
    invoicePhotos.forEach((p, idx) => {
      list.push({
        id: `inv-${p.invoiceId}-${idx}`,
        url: p.url,
        source: "invoice",
        invoiceId: p.invoiceId,
        invoiceCode: p.invoiceCode,
      });
    });
    return list;
  }, [customerPhotos, invoicePhotos]);

  // Add a photo URL to the customer's own photos (fallback when no invoice).
  const addPhoto = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/supabase/customers/${encodeURIComponent(customerId)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to add photo");
      return json.data?.photos || [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-photos", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-info-detail", customerId] });
    },
  });

  // Add a photo URL to a specific invoice's photos array. Used when the
  // customer has at least one invoice — the photo is stored in the invoice's
  // encoded note so it shows in BOTH the invoice (PaidInvoiceView) AND this
  // Images tab (under "Ảnh từ hóa đơn").
  const addPhotoToInvoice = useMutation({
    mutationFn: async ({ invoiceId, existingPhotos, url }: { invoiceId: string; existingPhotos: string[]; url: string }) => {
      const updated = [...existingPhotos, url];
      const res = await fetch(`/api/supabase/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: updated }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to add photo to invoice");
      return updated;
    },
    onSuccess: () => {
      // Refetch the customer-info-invoices query so this Images tab picks up
      // the new invoice photo immediately.
      queryClient.invalidateQueries({ queryKey: ["customer-info-invoices"] });
      // Also refetch any open PaidInvoiceView so it shows the new photo.
      queryClient.invalidateQueries({ queryKey: ["paid-invoice-view"] });
    },
  });

  // Remove a photo URL.
  const removePhoto = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/supabase/customers/${encodeURIComponent(customerId)}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to remove photo");
      return json.data?.photos || [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-photos", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-info-detail", customerId] });
    },
  });

  // Handle file selection → upload to R2 → add URL to the customer's most
  // recent invoice (so it shows in both the invoice AND this Images tab). If
  // the customer has no invoices, fall back to adding to the customer's own
  // photos.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      // Find the customer's most recent invoice (prefer completed; fall back
      // to the most recent by created_at). The `invoices` prop is already
      // fetched by the parent CustomerInfoView.
      const sortedInvoices = [...invoices].sort((a, b) => {
        const aTime = new Date(a.created_at || a.createdAt || "").getTime();
        const bTime = new Date(b.created_at || b.createdAt || "").getTime();
        return bTime - aTime;
      });
      const targetInvoice =
        sortedInvoices.find((inv) => inv.status === "completed") || sortedInvoices[0];

      for (const file of files) {
        // Upload to R2 via multipart form.
        const formData = new FormData();
        formData.append("files", file);
        formData.append("folder", `customers/${customerId}`);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadJson = await uploadRes.json();
        if (!uploadJson.ok || !uploadJson.data?.urls?.length) {
          throw new Error(uploadJson.error || `Upload failed for ${file.name}`);
        }
        // Add each returned URL to the target invoice (or customer photos as
        // fallback).
        for (const url of uploadJson.data.urls) {
          if (targetInvoice) {
            await addPhotoToInvoice.mutateAsync({
              invoiceId: targetInvoice.id,
              existingPhotos: targetInvoice.photos || [],
              url,
            });
            // Update the local reference so subsequent uploads in the same
            // batch accumulate on the same invoice.
            targetInvoice.photos = [...(targetInvoice.photos || []), url];
          } else {
            await addPhoto.mutateAsync(url);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải ảnh lên thất bại");
    } finally {
      setUploading(false);
      // Reset the input so the same file can be selected again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Bulk delete: removes all selected photos. Customer photos are deleted via
  // /customers/[id]/photos; invoice photos are removed by PUTting the invoice
  // with the updated photos array (grouped by invoice id). This matches the
  // invoice module's checkbox + "Chọn tất cả" + "Xóa" mechanism.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const handleBulkDelete = async () => {
    const selected = allPhotos.filter((p) => selectedPhotoIds.includes(p.id));
    if (selected.length === 0) return;
    setBulkDeleting(true);
    try {
      // Split selected photos by source.
      const customerUrls = selected
        .filter((p) => p.source === "customer")
        .map((p) => p.url);
      const invoiceGroups = new Map<string, string[]>();
      for (const p of selected.filter((p) => p.source === "invoice")) {
        const arr = invoiceGroups.get(p.invoiceId!) || [];
        arr.push(p.url);
        invoiceGroups.set(p.invoiceId!, arr);
      }
      // Delete customer photos (one DELETE per URL).
      for (const url of customerUrls) {
        await fetch(`/api/supabase/customers/${encodeURIComponent(customerId)}/photos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      }
      // Delete invoice photos (group by invoice, one PUT per invoice).
      for (const [invId, urlsToDelete] of invoiceGroups) {
        const inv = invoices.find((i) => i.id === invId);
        const existing = inv?.photos || [];
        const remaining = existing.filter((u) => !urlsToDelete.includes(u));
        await fetch(`/api/supabase/invoices/${invId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: remaining }),
        });
      }
      setSelectedPhotoIds([]);
      // Refetch all affected queries.
      queryClient.invalidateQueries({ queryKey: ["customer-photos", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-info-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["paid-invoice-view"] });
      queryClient.invalidateQueries({ queryKey: ["customer-info-detail", customerId] });
    } catch {
      setError("Xóa ảnh thất bại. Vui lòng thử lại.");
    } finally {
      setBulkDeleting(false);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Đang tải...</div>;
  }

  const totalPhotos = customerPhotos.length + invoicePhotos.length;

  return (
    <div className="space-y-4">
      {/* Upload + select-all + delete buttons + summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Hình ảnh khách hàng</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalPhotos > 0
              ? `${totalPhotos} ảnh (${customerPhotos.length} ảnh khách, ${invoicePhotos.length} ảnh từ hóa đơn)`
              : "Chưa có ảnh nào. Tải lên ảnh khách hàng để lưu trữ."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="customer-photo-upload"
          />
          <Button
            type="button"
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {uploading ? "Đang tải..." : "Tải ảnh lên"}
          </Button>
          {totalPhotos > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const allSelected =
                    selectedPhotoIds.length === allPhotos.length && allPhotos.length > 0;
                  setSelectedPhotoIds(allSelected ? [] : allPhotos.map((p) => p.id));
                }}
                className="gap-1.5"
              >
                <CheckSquare className="h-4 w-4" />
                Chọn tất cả
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                disabled={selectedPhotoIds.length === 0 || bulkDeleting}
                className={
                  selectedPhotoIds.length > 0
                    ? "border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
                    : "border-gray-200 text-gray-300 gap-1.5"
                }
                title={selectedPhotoIds.length === 0 ? "Chọn ảnh để xóa" : `Xóa ${selectedPhotoIds.length} ảnh đã chọn`}
              >
                <X className="h-4 w-4" />
                {bulkDeleting ? "Đang xóa..." : `Xóa${selectedPhotoIds.length > 0 ? ` (${selectedPhotoIds.length})` : ""}`}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Customer photos (uploadable + deletable) */}
      {customerPhotos.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">
            Ảnh khách hàng ({customerPhotos.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {customerPhotos.map((url, idx) => {
              const photoId = `cust-${idx}-${url.substring(0, 20)}`;
              const isSelected = selectedPhotoIds.includes(photoId);
              return (
                <div
                  key={photoId}
                  className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-50 transition-colors ${
                    isSelected ? "border-blue-500" : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      setSelectedPhotoIds((prev) =>
                        e.target.checked
                          ? [...prev, photoId]
                          : prev.filter((id) => id !== photoId)
                      );
                    }}
                    className="absolute left-1.5 top-1.5 z-10 h-5 w-5"
                  />
                  <img
                    src={url}
                    alt={`Ảnh khách ${idx + 1}`}
                    className="h-full w-full object-cover cursor-zoom-in"
                    loading="lazy"
                    onClick={() => setLightboxUrl(url)}
                  />
                  {/* Small X delete button — always visible. Opens a
                      confirmation dialog before deleting. */}
                  <button
                    type="button"
                    onClick={() => setDeletingUrl(url)}
                    disabled={removePhoto.isPending}
                    title="Xóa ảnh"
                    aria-label="Xóa ảnh"
                    className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice photos (deletable via bulk-select, labeled with invoice code) */}
      {invoicePhotos.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">
            Ảnh từ hóa đơn ({invoicePhotos.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {invoicePhotos.map((p, idx) => {
              const photoId = `inv-${p.invoiceId}-${idx}`;
              const isSelected = selectedPhotoIds.includes(photoId);
              return (
                <div
                  key={photoId}
                  className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-50 transition-colors ${
                    isSelected ? "border-blue-500" : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      setSelectedPhotoIds((prev) =>
                        e.target.checked
                          ? [...prev, photoId]
                          : prev.filter((id) => id !== photoId)
                      );
                    }}
                    className="absolute left-1.5 top-1.5 z-10 h-5 w-5"
                  />
                  <img
                    src={p.url}
                    alt={`Ảnh hóa đơn ${p.invoiceCode} ${idx + 1}`}
                    className="h-full w-full object-cover cursor-zoom-in"
                    loading="lazy"
                    onClick={() => setLightboxUrl(p.url)}
                  />
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {p.invoiceCode}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — no photos at all */}
      {totalPhotos === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <ImageIcon className="h-12 w-12 mb-3 text-gray-300" />
          <p className="text-sm font-medium">Chưa có ảnh nào</p>
          <p className="text-xs mt-1">Bấm "Tải ảnh lên" để thêm hình ảnh.</p>
        </div>
      )}

      {/* Delete confirmation dialog — opens when the user clicks the X on a
          customer photo. OK deletes the photo; Cancel closes the dialog. */}
      <AlertDialog
        open={!!deletingUrl}
        onOpenChange={(v) => !v && setDeletingUrl(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa ảnh?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa ảnh này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingUrl) {
                  removePhoto.mutate(deletingUrl);
                }
                setDeletingUrl(null);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox — click any photo to view it enlarged. Click outside or the
          close button to dismiss. */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            title="Đóng"
            aria-label="Đóng"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Ảnh phóng to"
            className="max-h-full max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function EmptyTab({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon className="h-12 w-12 mb-3 text-gray-300" />
      <p className="text-sm font-medium">Chưa có dữ liệu {label.toLowerCase()}</p>
      <p className="text-xs mt-1">Dữ liệu sẽ hiển thị ở đây khi có thông tin.</p>
    </div>
  );
}
