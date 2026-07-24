"use client";

import { useState, useEffect } from "react";
import {
  type IncentiveShape,
  type AppliedPromotion,
  getActivePromotionsForBooking,
  getPromotionServiceIds,
  calculatePromotionDiscount,
} from "@/lib/promotion-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, PlusCircle, Search, Package } from "lucide-react";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";
import { Booking } from "@/stores/booking-store";
import { useAuthStore } from "@/stores/auth-store";
import { usePaymentReviewStore, useIsReviewing } from "@/stores/payment-review-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamDay, toVietnamTime } from "@/lib/utils";
import { parseMultiCustomerNote } from "@/lib/multi-customer";

/**
 * Read a File as a base64 data URL (for storing photos in the invoice note JSON).
 */
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export interface InvoiceDialogProps {
  booking: Booking;
  onClose: () => void;
  onPaid: () => void;
}

export interface ExistingInvoice {
  id: string;
  code: string | null;
  status: string;
  items: Array<{ name?: string; price?: number; staffName?: string }>;
  tip: number;
  promotion: AppliedPromotion | null;
  payment_method: string;
  final_amount: number;
  created_at: string;
  photos?: string[];
}


interface InvoiceDialogProps {
  booking: Booking;
  onClose: () => void;
  onPaid: () => void;
}

interface ExistingInvoice {
  id: string;
  code: string | null;
  status: string;
  items: Array<{ name?: string; price?: number; staffName?: string }>;
  tip: number;
  promotion: AppliedPromotion | null;
  payment_method: string;
  final_amount: number;
  created_at: string;
  photos?: string[];
}

export function InvoiceDialog({ booking, onClose, onPaid }: InvoiceDialogProps) {
  // A booking with status "checkout" is considered already paid -> read-only view.
  const isCheckout = booking.status === "checkout";

  // "Xác nhận đơn hàng và hóa đơn cũ" permission: allows confirming payment on
  // unpaid invoices for bookings whose date has already passed. Without this
  // permission, past-date unpaid invoices are shown read-only.
  const { hasPermission } = useAuthStore();
  const canConfirmOldInvoice = hasPermission("confirm_old_invoice");

  // Determine if this is a "past-date unpaid" booking: the booking's date_time
  // is before today AND the booking is not yet checked out.
  const isPastDateUnpaid = (() => {
    if (isCheckout) return false; // already paid → not "unpaid"
    if (!booking.date_time) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDate = new Date(booking.date_time);
    bookingDate.setHours(0, 0, 0, 0);
    return bookingDate < today;
  })();

  // If the booking is past-date + unpaid AND the user lacks the
  // "confirm_old_invoice" permission → force read-only. With the permission →
  // show the normal editable invoice UI.
  const effectivelyReadOnly = isCheckout || (isPastDateUnpaid && !canConfirmOldInvoice);

  const canUpload = hasPermission("upload_photo");
  const canDeletePastPhotos = hasPermission("delete_past_photos");
  const canViewCustomerPhoto = hasPermission("view_customer_photo");
  const canCreateInvoice = hasPermission("create_invoice");
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  // Promotion selector is enabled when the user has invoice_discount OR
  // confirm_old_invoice (for past-date unpaid orders).
  const canUsePromotion = hasPermission("invoice_discount") || (isPastDateUnpaid && canConfirmOldInvoice);
  const canCancelPayment = hasPermission("cancel_payment");
  // The confirm button is enabled when the user has create_invoice (normal
  // orders) OR confirm_old_invoice (past-date unpaid orders).
  const canConfirmPayment = canCreateInvoice || (isPastDateUnpaid && canConfirmOldInvoice);
  // For UI elements that should ONLY react to actual checkout (not the
  // past-date-unpaid lock), use `isCheckout`. For all gating logic (can
  // edit? can pick promo? show confirm button?), use `effectivelyReadOnly`.
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [tip, setTip] = useState(0);

  // Existing invoice for this booking (pending at checkin, completed at checkout).
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);

  // Two-step payment: clicking "Thanh toán" enters review mode (shared across
  // the Booking + Cashier modules via usePaymentReviewStore). In review mode:
  //   - The invoice dialog CLOSES and the Payment dialog opens (review dialog).
  //   - "Hoàn tất" performs the checkout; "Hủy" returns to the editable unpaid
  //     invoice.
  //   - The review state is keyed by booking.id so both modules stay in sync.
  const { enterReview, exitReview } = usePaymentReviewStore();
  const isReviewing = useIsReviewing(booking.id);
  const showReview = isReviewing && !isCheckout;

  // Promotions (khuyến mãi) fetched from Supabase, filtered to active + branch.
  const [promotions, setPromotions] = useState<IncentiveShape[]>([]);
  const [selectedPromoId, setSelectedPromoId] = useState<string>("");
  const [loadingPromos, setLoadingPromos] = useState(!effectivelyReadOnly);

  // Photos attached to this invoice.
  // - Editable + no invoice yet: hold locally in `draftPhotos`, POSTed on confirm.
  // - Existing invoice (pending or completed): source of truth = the invoice on
  //   Supabase. Add/remove go through PUT /api/supabase/invoices/:id and the
  //   local state mirrors what's on the server.
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Products added to the invoice (multi-select). Each entry is a product the
  // customer is purchasing in addition to the booking's services. Held locally
  // in editable mode; POSTed as invoice items (type="product") on confirm.
  // For read-only (paid) invoices, products are read from existingInvoice.items.
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    id: string;
    name: string;
    price: number;
    code: string | null;
  }>>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productsList, setProductsList] = useState<Array<{
    id: string;
    name: string;
    price: number;
    code: string | null;
    category?: { name: string } | null;
  }>>([]);
  const [productsLoading, setProductsLoading] = useState(!effectivelyReadOnly);

  // Fetch active products from Supabase (editable mode only). Used to populate
  // the "Thêm sản phẩm" picker.
  useEffect(() => {
    if (effectivelyReadOnly) return;
    let cancelled = false;
    fetch("/api/supabase/products?active=true&limit=200")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data)) {
          setProductsList(
            json.data.map((p: Record<string, unknown>) => ({
              id: String(p.id),
              name: String(p.name ?? ""),
              price: Number(p.price ?? 0),
              code: (p.code as string | null) ?? null,
              category: (p.category as { name?: string } | null) ?? null,
            }))
          );
        }
      })
      .catch(() => { /* best-effort */ })
      .finally(() => { if (!cancelled) setProductsLoading(false); });
    return () => { cancelled = true; };
  }, [effectivelyReadOnly]);

  // Build invoice line items from booking services (nested Supabase shape).
  // For multi-customer "Cùng lịch" bookings, attach each service's own
  // customer (parsed from the booking note's [[MULTI]] block) so the services
  // box can show it between the service name and the staff line.
  const multiCustomer = parseMultiCustomerNote(booking.note);
  const serviceRows = (booking.services as unknown as Array<Record<string, unknown>>).map((s, idx) => {
    const svc = s.service as { name?: string; price?: number; duration?: number } | null;
    const stf = s.staff as { name?: string } | null;
    const cat = s.category as { name?: string } | null;
    const sc = multiCustomer?.slots[idx];
    return {
      name: svc?.name || "Dịch vụ",
      price: Number(svc?.price) || 0,
      staff: stf?.name || null,
      category: cat?.name || null,
      customer: sc
        ? sc.walkin
          ? "Khách vãng lai"
          : `${sc.name}${sc.phone ? " " + sc.phone : ""}`
        : null,
    };
  });
  const servicesTotal = serviceRows.reduce((sum, s) => sum + s.price, 0);
  // Products total: editable mode uses selectedProducts; read-only uses the
  // saved invoice's items of type "product".
  const savedProducts = effectivelyReadOnly
    ? (existingInvoice?.items ?? []).filter(
        (it) => (it as { type?: string }).type === "product"
      )
    : [];
  const productsTotal = effectivelyReadOnly
    ? savedProducts.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
    : selectedProducts.reduce((sum, p) => sum + p.price, 0);

  // Fetch the existing invoice for this booking (works for both pending and completed).
  // In editable mode this lets us UPDATE the pending invoice instead of creating a new one.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=1`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
          const inv = json.data[0];
          setExistingInvoice({
            id: inv.id,
            code: inv.code ?? null,
            status: inv.status || "pending",
            items: Array.isArray(inv.items) ? inv.items : [],
            tip: Number(inv.tip) || 0,
            promotion: (inv.promotion as AppliedPromotion | null) ?? null,
            payment_method: inv.payment_method || "cash",
            final_amount: Number(inv.final_amount) || 0,
            created_at: inv.created_at || "",
            photos: Array.isArray(inv.photos) ? (inv.photos as string[]) : [],
          });
          // In editable mode, pre-fill tip and payment method from the pending invoice.
          if (!effectivelyReadOnly) {
            const savedTip = Number(inv.tip) || 0;
            setTip(savedTip);
            setTipInput(savedTip > 0 ? String(savedTip) : "");
            if (inv.payment_method === "transfer" || inv.payment_method === "cash") {
              setPaymentMethod(inv.payment_method);
            }
            // Pre-fill promotion selection if a promotion was saved on the invoice.
            if (inv.promotion && typeof inv.promotion === "object" && (inv.promotion as { id?: string }).id) {
              setSelectedPromoId((inv.promotion as { id: string }).id);
              setPromoDiscount(Number((inv.promotion as { discountAmount?: number }).discountAmount) || 0);
            }
          }
        }
      })
      .catch(() => {
        /* best-effort fetch */
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking.id, effectivelyReadOnly]);

  // Fetch active promotions from Supabase (editable mode only).
  useEffect(() => {
    if (effectivelyReadOnly) return;
    let cancelled = false;
    const branchId = booking.branchId || (booking.branch as { id?: string } | null)?.id || null;
    fetch("/api/supabase/incentives?type=promotion&page=1&limit=100")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && json.data && Array.isArray(json.data.items)) {
          const active = getActivePromotionsForBooking(json.data.items, { branchId });
          setPromotions(active);
        }
      })
      .catch(() => {
        /* best-effort */
      })
      .finally(() => {
        if (!cancelled) setLoadingPromos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivelyReadOnly, booking.branchId, booking.branch]);

  // The selected promotion object (or null).
  const selectedPromo = promotions.find((p) => p.id === selectedPromoId) || null;

  // Compute the discount during render (derived state, no effect needed).
  const promoDiscount = (() => {
    if (!selectedPromo) return 0;
    const serviceIdsMatch = getPromotionServiceIds(selectedPromo);
    const services = (booking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
      service_id: (s.service_id as string) || (s.service as { id?: string } | null)?.id || null,
      // The booking's nested service carries its category id — needed so
      // "Nhóm dịch vụ" (service_category) promotions match the right services.
      category_id:
        (s.service_category_id as string) ||
        (s.service as { category_id?: string } | null)?.category_id ||
        (s.service as { category?: { id?: string } } | null)?.category?.id ||
        null,
      price: Number((s.service as { price?: number } | null)?.price) || 0,
    }));
    return calculatePromotionDiscount(selectedPromo, services, serviceIdsMatch);
  })();

  // Grand total = (services + products - promoDiscount) + tip (editable);
  // read-only uses stored final_amount.
  const grandTotal = Math.max(0, servicesTotal + productsTotal - promoDiscount) + tip;
  const displayTotal = effectivelyReadOnly ? (existingInvoice?.final_amount ?? servicesTotal + productsTotal) : grandTotal;
  const displayTip = effectivelyReadOnly ? (existingInvoice?.tip ?? 0) : tip;
  const displayPromo = effectivelyReadOnly ? (existingInvoice?.promotion ?? null) : (selectedPromo ? { id: selectedPromo.id, code: selectedPromo.code, name: selectedPromo.name, discountValue: selectedPromo.discountValue, discountType: selectedPromo.discountType, discountAmount: promoDiscount } : null);
  const displayPayment = effectivelyReadOnly ? (existingInvoice?.payment_method ?? "cash") : paymentMethod;
  // Read-only (checkout) mode: the invoice's items[] holds BOTH services and
  // products (and packages) in a single array. The "Sản phẩm" box below already
  // renders items whose type === "product", so we MUST exclude them here to
  // avoid products being duplicated across both the "Dịch vụ" and "Sản phẩm"
  // boxes. Packages (type === "package") are kept here since they have no box
  // of their own and are conceptually a service bundle.
  const displayItems = effectivelyReadOnly
    ? (existingInvoice?.items ?? []).filter(
        (it) => (it as { type?: string }).type !== "product"
      )
    : serviceRows.map((s) => ({ name: s.name, price: s.price, staffName: s.staff ?? undefined, customer: s.customer ?? undefined }));

  // Display photos: when there's an existing invoice, the source of truth is
  // the invoice's photos (kept up to date via PUT). Otherwise (editable, no
  // invoice yet) use the local draft photos (POSTed on confirm).
  const displayPhotos = existingInvoice
    ? (Array.isArray(existingInvoice.photos) ? existingInvoice.photos : [])
    : draftPhotos;

  // Persist the photo set to the invoice's note JSON via PUT. Mirrors the
  // state locally so the gallery updates immediately (no need to refetch).
  const savePhotos = async (photos: string[]) => {
    if (!existingInvoice) return;
    try {
      await fetch(`/api/supabase/invoices/${existingInvoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, created_by: useAuthStore.getState().user?.id }),
      });
      setExistingInvoice((prev) => prev ? { ...prev, photos } : prev);
    } catch {
      /* best-effort */
    }
  };

  // Convert selected FileList -> upload to R2 -> get URLs -> append.
  // If an invoice exists, PUT immediately; otherwise keep in local draft state.
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Upload to R2 via /api/upload (multipart).
    const folder = existingInvoice?.code || booking.code || "drafts";
    const formData = new FormData();
    formData.append("folder", `invoices/${folder}`);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f) formData.append("files", f);
    }
    let newPhotos: string[] = [];
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.ok && json.data?.urls) {
        newPhotos = json.data.urls;
      }
    } catch {
      // Fallback: base64 data URLs if R2 fails.
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        try {
          newPhotos.push(await fileToDataUrl(f));
        } catch { /* skip */ }
      }
    }

    if (newPhotos.length === 0) {
      e.target.value = "";
      return;
    }
    if (existingInvoice) {
      const updated = [...displayPhotos, ...newPhotos];
      await savePhotos(updated);
    } else {
      setDraftPhotos((prev) => [...prev, ...newPhotos]);
    }
    e.target.value = "";
  };

  // Remove a photo. Existing invoice -> PUT; draft -> local state.
  const handleRemovePhoto = async (idx: number) => {
    if (existingInvoice) {
      const updated = displayPhotos.filter((_, i) => i !== idx);
      await savePhotos(updated);
    } else {
      setDraftPhotos((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const handleConfirm = async () => {
    setError("");
    setSubmitting(true);
    try {
      const finalAmount = Math.max(0, servicesTotal + productsTotal - promoDiscount) + tip;
      const promotionMeta = selectedPromo
        ? {
            id: selectedPromo.id,
            code: selectedPromo.code,
            name: selectedPromo.name,
            discountValue: selectedPromo.discountValue,
            discountType: selectedPromo.discountType,
            discountAmount: promoDiscount,
          }
        : null;
      // Build the full items list: services + products. Products are appended
      // after services so the invoice's items array reflects everything the
      // customer is paying for (services from the booking + products bought).
      const allItems = [
        ...serviceRows.map((s) => ({
          name: s.name,
          itemId: null,
          type: "service",
          quantity: 1,
          price: s.price,
          discount: 0,
          total: s.price,
          staffName: s.staff,
        })),
        ...selectedProducts.map((p) => ({
          name: p.name,
          itemId: p.id,
          type: "product",
          quantity: 1,
          price: p.price,
          discount: 0,
          total: p.price,
          staffName: undefined,
        })),
      ];
      const subtotal = servicesTotal + productsTotal;
      if (existingInvoice) {
        // Update the existing pending invoice -> completed (paid). Photos were
        // already persisted via PUT as they were added; re-send them so the
        // completed invoice keeps the latest set (no UI to add after confirm).
        const res = await fetch(`/api/supabase/invoices/${existingInvoice.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: allItems,
            subtotal,
            tip,
            discount: promoDiscount,
            promotion: promotionMeta,
            final_amount: finalAmount,
            status: "completed",
            payment_method: paymentMethod,
            photos: displayPhotos,
            // Attribute the PAYMENT/CHECKOUT activity to the logged-in staff
            // (fallback when the auth cookie isn't sent).
            created_by: useAuthStore.getState().user?.id,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể cập nhật hóa đơn");
      } else {
        // Fallback: no pending invoice exists — create a completed one directly.
        const res = await fetch("/api/supabase/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: (booking.customer as unknown as { id?: string })?.id,
            branch_id: booking.branchId || (booking.branch as { id?: string } | null)?.id || null,
            booking_id: booking.id,
            items: allItems,
            subtotal,
            discount: promoDiscount,
            tip,
            promotion: promotionMeta,
            final_amount: finalAmount,
            payment_method: paymentMethod,
            status: "completed",
            photos: draftPhotos,
            // Attribute the CREATE/PAYMENT/CHECKOUT activities to the logged-in staff.
            created_by: useAuthStore.getState().user?.id,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể tạo hóa đơn");
      }
      onPaid();
      // Exit review mode on success — the invoice is now paid.
      exitReview(booking.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

  return (
    <>
    {/* When in payment-review mode, show ONLY the Payment dialog (not the
        invoice dialog). Pressing X closes the whole component (keeps review
        state so re-opening shows the Payment dialog again). "Hủy" exits
        review → the invoice dialog re-appears below. */}
    {!showReview && (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="order-dialog-dense !max-w-[747px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-1.5">
          <DialogTitle className="text-lg font-semibold">
            Hóa đơn
            {isCheckout && existingInvoice?.code ? ` · ${existingInvoice.code}` : ""}
            {isCheckout && <span className="ml-2 text-xs font-normal text-emerald-600">(đã thanh toán)</span>}
            {isPastDateUnpaid && !canConfirmOldInvoice && (
              <span className="ml-2 text-xs font-normal text-amber-600">(hóa đơn cũ — cần quyền xác nhận)</span>
            )}
            {isPastDateUnpaid && canConfirmOldInvoice && (
              <span className="ml-2 text-xs font-normal text-amber-600">(hóa đơn cũ — xác nhận thanh toán)</span>
            )}
          </DialogTitle>
        </DialogHeader>
        {/* Two-column layout: left = invoice info (scrollable independently),
            right = photo upload + gallery. Each column scrolls on its own so the
            customer info + services + products + payment method can all be
            reached by scrolling the left column without affecting the right. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* LEFT: invoice info — scrollable */}
        <div className="px-5 pb-4 space-y-2 md:border-r border-gray-100 max-h-[60vh] overflow-y-auto">

          {/* Customer info */}
          <div className="rounded-lg border bg-gray-50 p-2.5 space-y-0 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Khách hàng:</span>
              <span className="font-medium text-gray-900">{booking.customer?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Số điện thoại:</span>
              <span className="text-gray-900">{canViewCustomerPhone ? (booking.customer?.phone || "—") : maskPhone(booking.customer?.phone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nguồn khách hàng:</span>
              <span className="text-gray-900">{booking.source?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Kênh đặt lịch:</span>
              <span className="text-gray-900">{booking.channel?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mã lịch hẹn:</span>
              <span className="text-gray-900">{booking.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ngày giờ:</span>
              <span className="text-gray-900">
                {booking.date_time
                  ? (() => {
                      // Use the timezone-safe Vietnam helpers. Supabase
                      // stores date_time normalized to +00:00 (UTC), so the
                      // raw "THH:MM" segment is the UTC time — NOT the VN
                      // time the user entered. Parsing the raw segment
                      // directly would display "03:30" for a 10:30 VN
                      // booking (off by 7h).
                      const isoDayParts = toVietnamDay(booking.date_time).split("-");
                      if (isoDayParts.length !== 3) return "—";
                      return `${toVietnamTime(booking.date_time)} ${isoDayParts[2]}/${isoDayParts[1]}/${isoDayParts[0]}`;
                    })()
                  : "—"}
              </span>
            </div>
            {isCheckout && existingInvoice?.created_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày thanh toán:</span>
                <span className="text-gray-900">
                  {(() => {
                    try {
                      return format(new Date(existingInvoice.created_at), "HH:mm dd/MM/yyyy", { locale: vi });
                    } catch {
                      return "—";
                    }
                  })()}
                </span>
              </div>
            )}
          </div>

          {/* Services + Tip + Total (all inside one box; tip sits under the services) */}
          <div className="rounded-lg border p-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Dịch vụ
            </div>
            <div className="space-y-1.5">
              {effectivelyReadOnly && loadingInvoice ? (
                <div className="text-sm text-gray-400">Đang tải...</div>
              ) : displayItems.length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có dịch vụ</div>
              ) : (
                displayItems.map((s, idx) => (
                  <div key={idx} className="flex items-start justify-between text-sm">
                    <div>
                      {/* Multi-customer (Cashier module): 3-line layout —
                          line 1: customer (name+phone or "Khách vãng lai")
                          line 2: service name
                          line 3: staff name
                          Regular bookings keep the 2-line layout (service + staff). */}
                      {(s as { customer?: string }).customer && (
                        <div className="text-xs text-gray-600">{(s as { customer?: string }).customer}</div>
                      )}
                      <div className="font-medium text-gray-900">{s.name || "Dịch vụ"}</div>
                      {s.staffName && <div className="text-xs text-gray-500">NV: {s.staffName}</div>}
                    </div>
                    <div className="font-medium text-gray-900">
                      {fmt(Number(s.price) || 0)}đ
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chương trình khuyến mãi (promotion) — inside the services box, between services and tip.
                Gated by invoice_discount: without it, the select is replaced by read-only text. */}
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-gray-600">Chương trình khuyến mãi</span>
              {effectivelyReadOnly || !canUsePromotion ? (
                <span className="font-medium text-gray-900 text-right">
                  {displayPromo
                    ? `${displayPromo.name} (−${fmt(displayPromo.discountAmount)}đ)`
                    : "—"}
                </span>
              ) : loadingPromos ? (
                <span className="text-xs text-gray-400">Đang tải...</span>
              ) : promotions.length === 0 ? (
                <span className="text-xs text-gray-400">Chưa có chương trình khuyến mãi</span>
              ) : (
                <div className="w-48">
                  <Select
                    value={selectedPromoId || "none"}
                    onValueChange={(v) => {
                      const id = v === "none" ? "" : v;
                      if (id) {
                        // Compute the discount this promotion would yield for the
                        // booking's services. If it applies to none of them, warn
                        // the user and don't select it.
                        const p = promotions.find((x) => x.id === id);
                        const ids = p ? getPromotionServiceIds(p) : null;
                        const svcs = (booking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
                          service_id: (s.service_id as string) || (s.service as { id?: string } | null)?.id || null,
                          category_id:
                            (s.service_category_id as string) ||
                            (s.service as { category_id?: string } | null)?.category_id ||
                            (s.service as { category?: { id?: string } } | null)?.category?.id ||
                            null,
                          price: Number((s.service as { price?: number } | null)?.price) || 0,
                        }));
                        const d = p ? calculatePromotionDiscount(p, svcs, ids) : 0;
                        if (d <= 0) {
                          alert("Chương trình khuyến mãi không được áp dụng cho dịch vụ hiện tại");
                          return;
                        }
                      }
                      setSelectedPromoId(id);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Không áp dụng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Không áp dụng</SelectItem>
                      {promotions.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} ({p.discountValue}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Discount-amount summary line — shown in BOTH modes when a promotion
                applies, so the user sees the computed discount (editable mode) and
                the used promotion's discount (read-only/paid mode). */}
            {!effectivelyReadOnly && promoDiscount > 0 && (
              <div className="mt-1 flex items-center justify-between text-xs text-emerald-600">
                <span>→ Giảm giá áp dụng</span>
                <span className="font-medium">−{fmt(promoDiscount)}đ</span>
              </div>
            )}

            {/* Tip (Thưởng) — inside the services box, right below the promotion */}
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-gray-600">Thường (thưởng thợ)</span>
              {effectivelyReadOnly ? (
                <span className="font-medium text-gray-900">
                  {displayTip > 0 ? `${fmt(displayTip)}đ` : "—"}
                </span>
              ) : (
                <div className="w-32">
                  <Input
                    id="invoice-tip"
                    type="number"
                    min={0}
                    value={tipInput}
                    onChange={(e) => {
                      setTipInput(e.target.value);
                      setTip(Math.max(0, parseFloat(e.target.value) || 0));
                    }}
                    placeholder="0"
                    className="h-8 text-right"
                    aria-label="Tiền thưởng cho thợ"
                  />
                </div>
              )}
            </div>

            <div className="mt-1.5 flex justify-between border-t pt-1.5 text-sm">
              <span className="font-medium text-gray-700">Tổng tiền</span>
              <span className="font-bold text-emerald-700">{fmt(displayTotal)}đ</span>
            </div>
          </div>

          {/* Products section — below services. In editable mode shows a
              "Thêm sản phẩm" button that opens a picker popover; each selected
              product appears as a row with a remove button, and another
              "Thêm sản phẩm" button appears so the customer can buy more.
              In read-only mode shows the saved invoice's product items. */}
          <div className="rounded-lg border p-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              <Package className="h-3.5 w-3.5" />
              Sản phẩm
            </div>
            <div className="space-y-1.5">
              {effectivelyReadOnly ? (
                savedProducts.length === 0 ? (
                  <div className="text-sm text-gray-400">Không có sản phẩm</div>
                ) : (
                  savedProducts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="font-medium text-gray-900">{p.name || "Sản phẩm"}</div>
                      <div className="font-medium text-gray-900">
                        {fmt(Number(p.price) || 0)}đ
                      </div>
                    </div>
                  ))
                )
              ) : (
                <>
                  {selectedProducts.map((p, idx) => (
                    <div key={`${p.id}-${idx}`} className="flex items-center justify-between text-sm rounded-md border bg-gray-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate">{p.name}</div>
                        {p.code && <div className="text-xs text-gray-500">{p.code}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-medium text-gray-900">{fmt(p.price)}đ</span>
                        <button
                          type="button"
                          onClick={() => setSelectedProducts((prev) => prev.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          aria-label="Xóa sản phẩm"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* "Thêm sản phẩm" button — opens the product picker popover.
                      Always visible in editable mode so the customer can add
                      multiple products (re-appears after each selection). */}
                  <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Thêm sản phẩm
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="border-b p-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            placeholder="Tìm sản phẩm..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="h-8 pl-8 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {productsLoading ? (
                          <div className="px-3 py-4 text-center text-sm text-gray-400">Đang tải...</div>
                        ) : (
                          (() => {
                            const term = productSearch.toLowerCase().trim();
                            // Only show products that have a price > 0 (hide
                            // 0đ products per the business rule — they are
                            // typically accessories/consumables not for sale).
                            const priced = productsList.filter((p) => p.price > 0);
                            const filtered = term
                              ? priced.filter(
                                  (p) =>
                                    p.name.toLowerCase().includes(term) ||
                                    (p.code || "").toLowerCase().includes(term)
                                )
                              : priced;
                            if (filtered.length === 0) {
                              return (
                                <div className="px-3 py-4 text-center text-sm text-gray-400">
                                  Không tìm thấy sản phẩm
                                </div>
                              );
                            }
                            return filtered.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProducts((prev) => [...prev, { id: p.id, name: p.name, price: p.price, code: p.code }]);
                                  setProductSearch("");
                                  // Keep the popover open so the user can add more
                                  // products (per the requirement: "sau khi chọn 1
                                  // sản phẩm sẽ lại hiện thêm nút Thêm sản phẩm").
                                  // The popover stays open; the product is appended
                                  // to the list below.
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50 transition-colors border-b last:border-b-0"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-gray-900 truncate">{p.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {p.code || "—"}
                                    {p.category?.name ? ` · ${p.category.name}` : ""}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="font-semibold text-emerald-600">{fmt(p.price)}đ</span>
                                  <PlusCircle className="h-4 w-4 text-gray-400" />
                                </div>
                              </button>
                            ));
                          })()
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-gray-700">Phương thức thanh toán</div>
            {effectivelyReadOnly ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900">
                {displayPayment === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    paymentMethod === "cash"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Tiền mặt
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    paymentMethod === "transfer"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Chuyển khoản
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions: read-only shows only "Đóng"; editable shows Hủy + Xác nhận */}
          <div className="flex justify-end gap-2 border-t pt-2">
            {effectivelyReadOnly ? (
              <Button type="button" variant="outline" onClick={onClose}>
                Đóng
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                  Hủy
                </Button>
                <Button
                  type="button"
                  onClick={() => enterReview(booking.id)}
                  disabled={submitting || loadingInvoice || serviceRows.length === 0 || !canConfirmPayment}
                  title={!canConfirmPayment ? "Bạn không có quyền xác nhận thanh toán" : undefined}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {submitting ? "Đang xử lý..." : "Thanh toán"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: photo upload + gallery — scrollable independently */}
        <div className="px-5 pb-4 space-y-3 bg-gray-50/50 max-h-[60vh] overflow-y-auto">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Ảnh đính kèm
            </div>
            {canUpload && (
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer w-fit bg-white">
                <Camera className="h-4 w-4" />
                Tải ảnh lên
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>
            )}
          </div>
          {displayPhotos.length === 0 ? (
            <div className="text-sm text-gray-400">Chưa có ảnh nào được tải lên</div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {displayPhotos.map((src, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square overflow-hidden rounded-lg border bg-white"
                >
                  <button
                    type="button"
                    onClick={() => canViewCustomerPhoto && setLightboxPhoto(src)}
                    className="h-full w-full"
                    disabled={!canViewCustomerPhoto}
                    title={canViewCustomerPhoto ? undefined : "Bạn không có quyền xem ảnh"}
                  >
                    <img
                      src={src}
                      alt={`Ảnh ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  {(!effectivelyReadOnly || canDeletePastPhotos) && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label="Xóa ảnh"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Lịch sử thao tác — always shown when the invoice exists so the staff
            can see every action (create / edit / checkin / payment) and who did
            it at what time. Hidden when no invoice exists yet (new booking). */}
        {existingInvoice?.id && (
          <div className="border-t p-3">
            <InvoiceActivityTable invoiceId={existingInvoice.id} />
          </div>
        )}
      </DialogContent>
    </Dialog>
    )}

      {/* Payment review dialog — shown when the staff pressed "Thanh toán" (or
          re-opened the booking while review mode is active). This is a TOP-LEVEL
          dialog (not nested in the invoice dialog) so closing it via X closes
          the whole component (review state preserved → re-opening shows this
          dialog again). "Hủy" exits review → the invoice dialog re-appears.
          "Hoàn tất" performs the checkout. */}
      <Dialog open={showReview} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thanh toán</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Items: services + products being paid */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Dịch vụ & sản phẩm</div>
              <div className="rounded-lg border border-gray-200 divide-y">
                {serviceRows.length === 0 && selectedProducts.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-400">Chưa có mặt hàng</div>
                )}
                {serviceRows.map((s, idx) => (
                  <div key={`svc-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{s.name}</div>
                      {s.customer && <div className="text-xs text-gray-600">{s.customer}</div>}
                      {s.staff && <div className="text-xs text-gray-500">NV: {s.staff}</div>}
                    </div>
                    <div className="text-gray-700">{fmt(s.price)}đ</div>
                  </div>
                ))}
                {selectedProducts.map((p, idx) => (
                  <div key={`prod-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    <div className="text-gray-700">{fmt(p.price)}đ</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Thành tiền</span><span className="font-medium">{fmt(servicesTotal + productsTotal)}đ</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Chương trình khuyến mãi</span><span className="font-medium">{selectedPromo ? `${selectedPromo.name} (−${fmt(promoDiscount)}đ)` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Thưởng (thưởng thợ)</span><span className="font-medium">{tip > 0 ? `+${fmt(tip)}đ` : "—"}</span></div>
              <div className="flex justify-between font-medium border-t pt-1.5"><span>Tổng tiền</span><span>{fmt(grandTotal)}đ</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>Phương thức thanh toán</span><span>{paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt"}</span></div>
            </div>

            {/* Photos */}
            {displayPhotos.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Ảnh khách hàng</div>
                <div className="grid grid-cols-4 gap-2">
                  {displayPhotos.map((src, idx) => (
                    <div key={idx} className="aspect-square overflow-hidden rounded-lg border">
                      <img src={src} alt={`Ảnh ${idx + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity history */}
            {existingInvoice?.id && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Lịch sử thao tác</div>
                <InvoiceActivityTable invoiceId={existingInvoice.id} />
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => exitReview(booking.id)} disabled={submitting}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? "Đang xử lý..." : "Hoàn tất"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
