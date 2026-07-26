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
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, PlusCircle, Package, ChevronLeft, Minus, Plus, UserCog, Loader2 } from "lucide-react";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";
import { Booking } from "@/stores/booking-store";
import { useAuthStore } from "@/stores/auth-store";
import { usePaymentReviewStore, useIsReviewing } from "@/stores/payment-review-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamDay, toVietnamTime } from "@/lib/utils";
import { parseMultiCustomerNote } from "@/lib/multi-customer";

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
  // NOTE: The "Ảnh đính kèm" UI section was removed per request — photos can
  // no longer be uploaded from this dialog. The draft/photos state + PUT
  // helpers remain so EXISTING invoice photos (already on the server) still
  // render in the read-only review summary and are re-sent on confirm.
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);

  // Products added to the invoice (multi-select). Each entry is a product the
  // customer is purchasing in addition to the booking's services. Held locally
  // in editable mode; POSTed as invoice items (type="product") on confirm.
  // For read-only (paid) invoices, products are read from existingInvoice.items.
  // Each entry carries a `quantity` so the cashier can buy >1 of the same SKU
  // in one go (the redesigned "Thêm sản phẩm" picker lets them set quantity
  // per product before adding to the invoice).
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    id: string;
    name: string;
    price: number;
    code: string | null;
    quantity: number;
    staffName?: string | null;
  }>>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  // Two-step picker: "groups" = list of product categories; "products" = the
  // products inside the selected category, each with its own quantity stepper.
  // Selecting a group drills into its products; the back arrow returns to the
  // groups list. Quantity state is reset whenever the dialog closes or the
  // group changes so old selections don't leak between sessions.
  const [productPickerStep, setProductPickerStep] = useState<"groups" | "products">("groups");
  const [selectedProductGroup, setSelectedProductGroup] = useState<string | null>(null);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
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

  // === Service picker dialog state ===
  // Opened by the "+" button next to "DỊCH VỤ". Two-step picker (like the
  // product picker): "groups" = service categories; "services" = the services
  // in the chosen category, each with a staff Select. On confirm, the picked
  // service + staff is appended to the booking via PUT /api/supabase/bookings/:id
  // (services array). The booking is then refetched so the new service appears
  // in the Dịch vụ list.
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [servicePickerStep, setServicePickerStep] = useState<"groups" | "services">("groups");
  const [selectedServiceGroup, setSelectedServiceGroup] = useState<string | null>(null);
  const [serviceCategories, setServiceCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [servicesList, setServicesList] = useState<Array<{
    id: string;
    name: string;
    price: number;
    duration?: number;
    categoryId?: string | null;
  }>>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  // The picked service (from the services step) + the staff for it.
  const [pickedService, setPickedService] = useState<{
    id: string;
    name: string;
    price: number;
    duration?: number;
  } | null>(null);
  const [pickedServiceStaffId, setPickedServiceStaffId] = useState<string>("");
  const [servicePickerError, setServicePickerError] = useState("");
  const [addingService, setAddingService] = useState(false);
  // Staff list for the service picker's staff Select (active staff at the
  // booking's branch). Also reused by the per-service "Xếp nhân viên" buttons.
  const [assignStaffList, setAssignStaffList] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch service categories + services + branch staff (editable mode only).
  // Loaded once when the dialog first opens; reused by both the service picker
  // and the per-service "Xếp nhân viên" buttons.
  useEffect(() => {
    if (effectivelyReadOnly) return;
    let cancelled = false;
    // Service categories.
    fetch("/api/supabase/service-categories?active=true")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data)) {
          setServiceCategories(
            (json.data as Array<{ id: string; name: string }>).map((c) => ({ id: c.id, name: c.name }))
          );
        }
      })
      .catch(() => { /* best-effort */ });
    // Services.
    setServicesLoading(true);
    fetch("/api/supabase/services?active=true&limit=200")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data)) {
          setServicesList(
            (json.data as Array<Record<string, unknown>>).map((s) => ({
              id: String(s.id ?? ""),
              name: String(s.name ?? ""),
              price: Number(s.price ?? 0),
              duration: s.duration ? Number(s.duration) : undefined,
              categoryId: (s.category as { id?: string } | null)?.id || null,
            }))
          );
        }
      })
      .catch(() => { /* best-effort */ })
      .finally(() => { if (!cancelled) setServicesLoading(false); });
    // Branch staff (for the staff Select in the service picker + "Xếp nhân viên").
    const branchId = booking.branchId || (booking.branch as { id?: string } | null)?.id || null;
    if (branchId) {
      fetch(`/api/supabase/staff?branch_id=${encodeURIComponent(branchId)}&active=true&limit=200`)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json.ok && Array.isArray(json.data)) {
            setAssignStaffList(
              (json.data as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name }))
            );
          }
        })
        .catch(() => { /* best-effort */ });
    }
    return () => { cancelled = true; };
  }, [effectivelyReadOnly, booking.branchId, booking.branch]);

  // === Per-service "Xếp nhân viên" dialog state ===
  // Opened by the yellow "Xếp nhân viên" button next to each service's staff
  // name. Lets the user reassign the staff for ONE service. Includes a staff
  // conflict check: if the picked staff is already booked at this service's
  // date/time (excluding this booking itself), the save is BLOCKED with a
  // detailed conflict message.
  const [reassignStaffServiceId, setReassignStaffServiceId] = useState<string | null>(null);
  const [reassignStaffPickStaffId, setReassignStaffPickStaffId] = useState<string>("");
  const [reassignStaffError, setReassignStaffError] = useState("");
  const [reassignStaffChecking, setReassignStaffChecking] = useState(false);
  const [reassignStaffSaving, setReassignStaffSaving] = useState(false);

  // === Per-product "Xếp nhân viên" dialog state ===
  // Opened by the "Xếp nhân viên" button in each product row. Products don't
  // have a staff in the booking_services sense (they're retail items), so this
  // just records the staff who sold/advised on the product — stored in the
  // selectedProducts entry's new `staffName` field (used only for display).
  const [reassignProductIdx, setReassignProductIdx] = useState<number | null>(null);
  const [reassignProductStaffId, setReassignProductStaffId] = useState<string>("");

  // Build invoice line items from booking services (nested Supabase shape).
  // For multi-customer "Cùng lịch" bookings, attach each service's own
  // customer (parsed from the booking note's [[MULTI]] block) so the services
  // box can show it between the service name and the staff line.
  // Also FILTER services by per-customer slotStatuses: only services whose
  // customer is "checkin" or "checkout" are included. Services of customers
  // who are still "confirmed", "cancelled", or "no_show" are excluded.
  const multiCustomer = parseMultiCustomerNote(booking.note);
  const slotStatuses = multiCustomer?.slotStatuses;
  const serviceSlotsMap = multiCustomer?.serviceSlots;
  const allServiceRows = (booking.services as unknown as Array<Record<string, unknown>>).map((s, idx) => {
    const svc = s.service as { id?: string; name?: string; price?: number; duration?: number } | null;
    const stf = s.staff as { id?: string; name?: string } | null;
    const cat = s.category as { name?: string } | null;
    // Use serviceSlots to find the correct customer slot for this service.
    const slotIdx = serviceSlotsMap && idx < serviceSlotsMap.length
      ? serviceSlotsMap[idx]
      : idx;
    const sc = multiCustomer?.slots[slotIdx];
    return {
      bookingServiceId: String(s.id ?? ""),
      serviceId: svc?.id || (s.service_id as string) || "",
      staffId: stf?.id || (s.staff_id as string) || "",
      staffName: stf?.name || null,
      name: svc?.name || "Dịch vụ",
      price: Number(svc?.price) || 0,
      duration: svc?.duration,
      staff: stf?.name || null,
      category: cat?.name || null,
      customer: sc
        ? sc.walkin
          ? "Khách vãng lai"
          : `${sc.name}${sc.phone ? " " + sc.phone : ""}`
        : null,
      _slotIdx: slotIdx,
    };
  });
  // Filter: only show services whose customer is checked in (or checkout/paid).
  // When no slotStatuses (non-multi or legacy), show all services.
  const serviceRows = slotStatuses && slotStatuses.length > 0
    ? allServiceRows.filter((s) => {
        const st = slotStatuses[s._slotIdx] || "confirmed";
        return st === "checkin" || st === "checkout";
      })
    : allServiceRows;
  // Per-customer service count for numbering (1a, 1b, 2, etc.).
  const checkedInSlotCount: Record<number, number> = {};
  serviceRows.forEach((s) => {
    checkedInSlotCount[s._slotIdx] = (checkedInSlotCount[s._slotIdx] || 0) + 1;
  });
  const slotLetterIdx: Record<number, number> = {};
  const servicesTotal = serviceRows.reduce((sum, s) => sum + s.price, 0);
  // Products total: editable mode uses selectedProducts (price × quantity);
  // read-only uses the saved invoice's items of type "product".
  const savedProducts = effectivelyReadOnly
    ? (existingInvoice?.items ?? []).filter(
        (it) => (it as { type?: string }).type === "product"
      )
    : [];
  const productsTotal = effectivelyReadOnly
    ? savedProducts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number((p as { quantity?: number }).quantity) || 1), 0)
    : selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

  // Product groups (categories) derived from the products list. Each group is
  // shown as a card in the picker's first step; clicking it drills into the
  // group's products. Products with no category fall under "Khác" so they're
  // still reachable. Only priced products (>0đ) are grouped — 0đ items are
  // accessories/consumables not for sale (same rule as the old popover).
  const productGroups = (() => {
    const priced = productsList.filter((p) => p.price > 0);
    const map = new Map<string, number>();
    for (const p of priced) {
      const name = p.category?.name?.trim() || "Khác";
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  })();
  const productsInGroup = (() => {
    if (!selectedProductGroup) return [];
    return productsList.filter((p) => {
      if (p.price <= 0) return false;
      const name = p.category?.name?.trim() || "Khác";
      return name === selectedProductGroup;
    });
  })();
  // Count of products in the current group with quantity > 0 — drives the
  // "Thêm N sản phẩm vào đơn" button label + enabled state.
  const productsToAddCount = productsInGroup.reduce(
    (n, p) => n + ((productQuantities[p.id] || 0) > 0 ? 1 : 0),
    0
  );

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

  // (handlePhotoUpload / handleRemovePhoto were removed along with the
  //  "Ảnh đính kèm" UI section — photos can no longer be added or removed
  //  from this dialog. Existing invoice photos remain on the server and are
  //  still re-sent on confirm via `displayPhotos` / `draftPhotos`.)

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
          quantity: p.quantity,
          price: p.price,
          discount: 0,
          total: p.price * p.quantity,
          staffName: p.staffName || undefined,
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
        {/* Single-column layout: the photo attachment section that used to
            live on the right was removed per request — the dialog is now one
            scrollable column with customer info → services → products →
            payment method → actions. */}
        <div className="px-5 pb-4 space-y-2 max-h-[60vh] overflow-y-auto">

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
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Dịch vụ
              </div>
              {/* "+" button — opens the service picker dialog (group → service →
                  staff). Only shown in editable mode. The square yellow button
                  matches the cashier module's "Xếp nhân viên" styling so the
                  two modules stay visually consistent. */}
              {!effectivelyReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setServicePickerStep("groups");
                    setSelectedServiceGroup(null);
                    setPickedService(null);
                    setPickedServiceStaffId("");
                    setServicePickerError("");
                    setServicePickerOpen(true);
                  }}
                  title="Thêm dịch vụ"
                  className="flex h-6 w-6 items-center justify-center rounded border border-emerald-400 bg-emerald-400 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-500 hover:text-emerald-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {effectivelyReadOnly && loadingInvoice ? (
                <div className="text-sm text-gray-400">Đang tải...</div>
              ) : displayItems.length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có dịch vụ</div>
              ) : (
                displayItems.map((s, idx) => {
                  // Find the matching serviceRow (by index in displayItems ↔
                  // serviceRows) to get the bookingServiceId + staffId for the
                  // "Xếp nhân viên" reassign button. displayItems is built from
                  // serviceRows in the editable branch, so the index matches.
                  const srvRow = !effectivelyReadOnly ? serviceRows[idx] : null;
                  return (
                  <div key={idx} className="flex items-start justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      {/* Multi-customer (Cashier module): 3-line layout —
                          line 1: customer (name+phone or "Khách vãng lai")
                          line 2: service name
                          line 3: staff name + yellow "Xếp nhân viên" button
                          Regular bookings keep the 2-line layout (service + staff). */}
                      {(s as { customer?: string }).customer && (
                        <div className="text-xs text-gray-600">{(s as { customer?: string }).customer}</div>
                      )}
                      <div className="font-medium text-gray-900">{s.name || "Dịch vụ"}</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Yellow "Xếp nhân viên" button — placed to the LEFT of
                            the staff name (per user request). Opens the per-
                            service reassign dialog. Mirrors the cashier module's
                            button (h-5, text-[10px], yellow bg). Includes a
                            staff conflict check on confirm. Only shown in
                            editable mode (a paid invoice's services can't be
                            reassigned). */}
                        {!effectivelyReadOnly && srvRow && (
                          <button
                            type="button"
                            onClick={() => {
                              setReassignStaffServiceId(srvRow.bookingServiceId);
                              setReassignStaffPickStaffId(srvRow.staffId || "");
                              setReassignStaffError("");
                              setReassignStaffChecking(false);
                            }}
                            title={srvRow.staffName ? `Xếp nhân viên (hiện: ${srvRow.staffName})` : "Xếp nhân viên cho dịch vụ này"}
                            className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-yellow-400 bg-yellow-400 px-1.5 text-[10px] font-medium text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                          >
                            <UserCog className="h-2.5 w-2.5" />
                            Xếp nhân viên
                          </button>
                        )}
                        {s.staffName && <span className="text-xs text-gray-500">NV: {s.staffName}</span>}
                      </div>
                    </div>
                    <div className="font-medium text-gray-900 shrink-0 ml-2">
                      {fmt(Number(s.price) || 0)}đ
                    </div>
                  </div>
                  );
                })
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
                  savedProducts.map((p, idx) => {
                    const qty = Number((p as { quantity?: number }).quantity) || 1;
                    return (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="font-medium text-gray-900">
                          {p.name || "Sản phẩm"}
                          {qty > 1 && <span className="ml-1 text-xs text-gray-500">×{qty}</span>}
                        </div>
                        <div className="font-medium text-gray-900">
                          {fmt((Number(p.price) || 0) * qty)}đ
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <>
                  {selectedProducts.map((p, idx) => (
                    <div key={`${p.id}-${idx}`} className="text-sm rounded-md border bg-gray-50 px-3 py-2">
                      {/* Line 1 (MAIN LINE — everything centered between name + price):
                          - Product name (LEFT, truncate)
                          - [center area] When NO staff: "Xếp nhân viên" button CENTERED.
                            When staff IS assigned: "NV: <name>" + "Xếp nhân viên" button,
                            both CENTERED together.
                          - Price (RIGHT) + remove button.
                          Per user request: staff name + button must be on the SAME LINE
                          as the product name + price (not below). The center area uses
                          flex-1 + justify-center so the staff/button group sits in the
                          true middle of the row. */}
                      <div className="flex items-center gap-2">
                        {/* Product name (LEFT) */}
                        <span className="font-medium text-gray-900 truncate shrink-0 max-w-[40%]">
                          {p.name}
                          {p.quantity > 1 && <span className="ml-1 text-xs text-gray-500">×{p.quantity}</span>}
                        </span>
                        {/* Center area (flex-1 → fills the middle, content centered) */}
                        <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
                          {p.staffName ? (
                            <>
                              <span className="text-xs text-gray-500 shrink-0">NV: {p.staffName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = assignStaffList.find((s) => s.name === p.staffName);
                                  setReassignProductIdx(idx);
                                  setReassignProductStaffId(current?.id || "");
                                }}
                                title={`Xếp nhân viên (hiện: ${p.staffName})`}
                                className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-yellow-400 bg-yellow-400 px-1.5 text-[10px] font-medium text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                              >
                                <UserCog className="h-2.5 w-2.5" />
                                Xếp nhân viên
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const current = assignStaffList.find((s) => s.name === p.staffName);
                                setReassignProductIdx(idx);
                                setReassignProductStaffId(current?.id || "");
                              }}
                              title="Xếp nhân viên cho sản phẩm này"
                              className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-yellow-400 bg-yellow-400 px-1.5 text-[10px] font-medium text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                            >
                              <UserCog className="h-2.5 w-2.5" />
                              Xếp nhân viên
                            </button>
                          )}
                        </div>
                        {/* Price (RIGHT) + remove button */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium text-gray-900">{fmt(p.price * p.quantity)}đ</span>
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
                      {/* Line 2: product code (LEFT, under the product name, when present) */}
                      {p.code && (
                        <div className="text-xs text-gray-400 mt-0.5">{p.code}</div>
                      )}
                    </div>
                  ))}
                  {/* "Thêm sản phẩm" button — opens a separate Dialog showing
                      product GROUPS first, then the chosen group's products
                      with per-product quantity steppers. The button's height
                      matches the "Thanh toán" button (h-9) so the action row
                      stays visually aligned. Always visible in editable mode
                      so the cashier can add multiple products across groups. */}
                  <button
                    type="button"
                    onClick={() => {
                      setProductPickerStep("groups");
                      setSelectedProductGroup(null);
                      setProductQuantities({});
                      setProductPickerOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 h-9 px-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Thêm sản phẩm
                  </button>
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
                  className={`rounded-lg border h-9 px-3 text-sm font-medium transition-colors ${
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
                  className={`rounded-lg border h-9 px-3 text-sm font-medium transition-colors ${
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
                {serviceRows.map((s, idx) => {
                  // Numbering: customer #N with 1 service → "N." ;
                  // with 2+ services → "Na.", "Nb.", ...
                  let prefix = "";
                  if (slotStatuses && slotStatuses.length > 0) {
                    const total = checkedInSlotCount[s._slotIdx] || 1;
                    if (total <= 1) {
                      prefix = `${s._slotIdx + 1}. `;
                    } else {
                      slotLetterIdx[s._slotIdx] = (slotLetterIdx[s._slotIdx] || 0) + 1;
                      const letter = String.fromCharCode(96 + slotLetterIdx[s._slotIdx]);
                      prefix = `${s._slotIdx + 1}${letter}. `;
                    }
                  }
                  return (
                  <div key={`svc-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{prefix}{s.name}</div>
                      {s.customer && <div className="text-xs text-gray-600">{s.customer}</div>}
                      {s.staff && <div className="text-xs text-gray-500">NV: {s.staff}</div>}
                    </div>
                    <div className="text-gray-700">{fmt(s.price)}đ</div>
                  </div>
                  );
                })}
                {selectedProducts.map((p, idx) => (
                  <div key={`prod-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="font-medium text-gray-900">
                      {p.name}
                      {p.quantity > 1 && <span className="ml-1 text-xs text-gray-500">×{p.quantity}</span>}
                    </div>
                    <div className="text-gray-700">{fmt(p.price * p.quantity)}đ</div>
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

      {/* Product picker dialog — opened by the "Thêm sản phẩm" button. Two
          steps: (1) GROUPS list — each card shows the category name + product
          count; clicking a card drills into its products. (2) PRODUCTS list —
          each product row has a quantity stepper (− / qty / +) so the cashier
          can pick how many of that SKU to add. The footer's "Thêm N sản phẩm
          vào đơn" button is enabled only when at least one product has qty > 0;
          clicking it appends every selected product (with its qty) to the
          invoice and closes the dialog. "Đóng" cancels without adding. The
          back arrow (←) on the title returns to the GROUPS step without
          losing the quantities already typed (they reset only on dialog
          close or group change). */}
      <Dialog
        open={productPickerOpen}
        onOpenChange={(v) => {
          setProductPickerOpen(v);
          if (!v) {
            setProductPickerStep("groups");
            setSelectedProductGroup(null);
            setProductQuantities({});
          }
        }}
      >
        <DialogContent className="max-w-md sm:max-w-md p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              {productPickerStep === "products" && (
                <button
                  type="button"
                  onClick={() => {
                    setProductPickerStep("groups");
                    setSelectedProductGroup(null);
                    setProductQuantities({});
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Quay lại danh sách nhóm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {productPickerStep === "groups"
                ? "Chọn nhóm sản phẩm"
                : selectedProductGroup || "Chọn sản phẩm"}
            </DialogTitle>
          </DialogHeader>

          {productPickerStep === "groups" ? (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-0.5">
              {productsLoading ? (
                <div className="col-span-2 px-3 py-6 text-center text-sm text-gray-400">Đang tải...</div>
              ) : productGroups.length === 0 ? (
                <div className="col-span-2 px-3 py-6 text-center text-sm text-gray-400">Chưa có sản phẩm nào</div>
              ) : (
                productGroups.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => {
                      setSelectedProductGroup(g.name);
                      setProductQuantities({});
                      setProductPickerStep("products");
                    }}
                    className="rounded-lg border p-3 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                  >
                    <Package className="h-5 w-5 text-emerald-600 mb-1" />
                    <div className="font-medium text-sm text-gray-900 truncate">{g.name}</div>
                    <div className="text-xs text-gray-500">{g.count} sản phẩm</div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5">
              {productsInGroup.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400">
                  Không có sản phẩm trong nhóm này
                </div>
              ) : (
                productsInGroup.map((p) => {
                  const qty = productQuantities[p.id] || 0;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between border rounded-md p-2 transition-colors ${
                        qty > 0 ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-medium text-sm text-gray-900 truncate">{p.name}</div>
                        <div className="text-xs text-gray-500">
                          {fmt(p.price)}đ{p.code ? ` · ${p.code}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setProductQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, (prev[p.id] || 0) - 1),
                            }))
                          }
                          disabled={qty === 0}
                          className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Giảm số lượng"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{qty}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setProductQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.min(99, (prev[p.id] || 0) + 1),
                            }))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          aria-label="Tăng số lượng"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setProductPickerOpen(false);
                setProductPickerStep("groups");
                setSelectedProductGroup(null);
                setProductQuantities({});
              }}
            >
              Đóng
            </Button>
            {productPickerStep === "products" && (
              <Button
                type="button"
                size="sm"
                disabled={productsToAddCount === 0}
                onClick={() => {
                  const newProducts = productsInGroup
                    .filter((p) => (productQuantities[p.id] || 0) > 0)
                    .map((p) => ({
                      id: p.id,
                      name: p.name,
                      price: p.price,
                      code: p.code,
                      quantity: productQuantities[p.id] || 0,
                    }));
                  if (newProducts.length > 0) {
                    setSelectedProducts((prev) => [...prev, ...newProducts]);
                  }
                  setProductQuantities({});
                  setProductPickerStep("groups");
                  setSelectedProductGroup(null);
                  setProductPickerOpen(false);
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {productsToAddCount > 0
                  ? `Thêm ${productsToAddCount} sản phẩm vào đơn`
                  : "Thêm vào đơn"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Service picker dialog ===
          Opened by the "+" button next to "DỊCH VỤ". Two-step picker:
          step 1 = service GROUPS (categories); step 2 = the services in the
          chosen category, each with a staff Select. On confirm, the picked
          service + staff is appended to the booking via PUT
          /api/supabase/bookings/:id (services array). Includes a staff conflict
          check: if the picked staff is already booked at this booking's
          date/time (excluding this booking itself), the save is BLOCKED with a
          detailed conflict message (mirrors the AssignStaffDialog check). */}
      <Dialog
        open={servicePickerOpen}
        onOpenChange={(v) => {
          setServicePickerOpen(v);
          if (!v) {
            setServicePickerStep("groups");
            setSelectedServiceGroup(null);
            setPickedService(null);
            setPickedServiceStaffId("");
            setServicePickerError("");
          }
        }}
      >
        <DialogContent className="max-w-md sm:max-w-md p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              {servicePickerStep === "services" && (
                <button
                  type="button"
                  onClick={() => {
                    setServicePickerStep("groups");
                    setSelectedServiceGroup(null);
                    setPickedService(null);
                    setPickedServiceStaffId("");
                    setServicePickerError("");
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Quay lại danh sách nhóm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {servicePickerStep === "groups"
                ? "Chọn nhóm dịch vụ"
                : selectedServiceGroup || "Chọn dịch vụ"}
            </DialogTitle>
          </DialogHeader>

          {servicePickerStep === "groups" ? (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-0.5">
              {servicesLoading ? (
                <div className="col-span-2 px-3 py-6 text-center text-sm text-gray-400">Đang tải...</div>
              ) : serviceCategories.length === 0 ? (
                <div className="col-span-2 px-3 py-6 text-center text-sm text-gray-400">Chưa có nhóm dịch vụ</div>
              ) : (
                serviceCategories.map((c) => {
                  const count = servicesList.filter((s) => s.categoryId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceGroup(c.name);
                        setPickedService(null);
                        setPickedServiceStaffId("");
                        setServicePickerError("");
                        setServicePickerStep("services");
                      }}
                      className="rounded-lg border p-3 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                    >
                      <Package className="h-5 w-5 text-emerald-600 mb-1" />
                      <div className="font-medium text-sm text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-500">{count} dịch vụ</div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
              {(() => {
                const cat = serviceCategories.find((c) => c.name === selectedServiceGroup);
                const servicesInGroup = cat
                  ? servicesList.filter((s) => s.categoryId === cat.id)
                  : [];
                if (servicesInGroup.length === 0) {
                  return <div className="px-3 py-6 text-center text-sm text-gray-400">Không có dịch vụ trong nhóm này</div>;
                }
                return servicesInGroup.map((s) => {
                  const isPicked = pickedService?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setPickedService({ id: s.id, name: s.name, price: s.price, duration: s.duration });
                        setPickedServiceStaffId("");
                        setServicePickerError("");
                      }}
                      className={`flex w-full items-center justify-between border rounded-md p-2 text-left transition-colors ${
                        isPicked ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-medium text-sm text-gray-900 truncate">{s.name}</div>
                        <div className="text-xs text-gray-500">
                          {fmt(s.price)}đ{s.duration ? ` · ${s.duration}'` : ""}
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          )}

          {/* Staff Select — only shown when a service is picked. */}
          {servicePickerStep === "services" && pickedService && (
            <div className="space-y-1 border-t pt-2">
              <label className="text-[11px] text-gray-600">
                Nhân viên thực hiện
              </label>
              <Select
                value={pickedServiceStaffId}
                onValueChange={(v) => {
                  setPickedServiceStaffId(v);
                  setServicePickerError("");
                }}
              >
                <SelectTrigger className="w-full h-8 text-xs" size="sm">
                  <SelectValue placeholder="Chọn nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {assignStaffList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">Không có nhân viên ở cửa hàng này</div>
                  ) : (
                    assignStaffList.map((st) => (
                      <SelectItem key={st.id} value={st.id} className="text-xs">
                        {st.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {!pickedServiceStaffId && (
                <p className="text-[11px] text-red-500">Vui lòng chọn nhân viên</p>
              )}
            </div>
          )}

          {servicePickerError && (
            <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {servicePickerError}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setServicePickerOpen(false);
                setServicePickerStep("groups");
                setSelectedServiceGroup(null);
                setPickedService(null);
                setPickedServiceStaffId("");
                setServicePickerError("");
              }}
              disabled={addingService}
            >
              Hủy
            </Button>
            {servicePickerStep === "services" && (
              <Button
                type="button"
                size="sm"
                disabled={!pickedService || !pickedServiceStaffId || addingService}
                onClick={async () => {
                  if (!pickedService || !pickedServiceStaffId) return;
                  setServicePickerError("");
                  setAddingService(true);
                  try {
                    // === Staff conflict check ===
                    // Fetch all bookings for the same day + branch, then verify
                    // the picked staff isn't already booked at this booking's
                    // time window (excluding this booking itself). Mirrors the
                    // AssignStaffDialog check. If a conflict is found, block
                    // the add with a detailed message.
                    const bookingStartMs = booking.date_time ? new Date(booking.date_time).getTime() : 0;
                    if (bookingStartMs && booking.date_time) {
                      const params = new URLSearchParams({ page: "1", limit: "200" });
                      const d = new Date(booking.date_time);
                      const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      params.set("date_from", `${isoDay}T00:00:00+07:00`);
                      params.set("date_to", `${isoDay}T23:59:59+07:00`);
                      const branchId = booking.branchId || (booking.branch as { id?: string } | null)?.id || null;
                      if (branchId) params.set("branch_id", branchId);
                      const cfRes = await fetch(`/api/supabase/bookings?${params.toString()}`);
                      const cfJson = await cfRes.json();
                      if (cfJson.ok) {
                        const exList = (cfJson.data?.items || cfJson.data || []) as Array<{
                          id: string;
                          code?: string | null;
                          status?: string | null;
                          date_time?: string | null;
                          customer?: { name?: string } | null;
                          services?: Array<{
                            staff_id?: string | null;
                            staff?: { name?: string } | null;
                            service?: { name?: string; duration?: number } | null;
                          }>;
                        }>;
                        const dur = (Number(pickedService.duration) || 60) * 60 * 1000;
                        const newEnd = bookingStartMs + dur;
                        for (const ex of exList) {
                          if (ex.id === booking.id) continue;
                          if (ex.status === "cancelled" || ex.status === "no_show") continue;
                          const exStart = new Date(String(ex.date_time || "")).getTime();
                          if (isNaN(exStart)) continue;
                          for (const exSvc of ex.services || []) {
                            if (exSvc.staff_id !== pickedServiceStaffId) continue;
                            const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                            const exEnd = exStart + exDur;
                            if (bookingStartMs < exEnd && exStart < newEnd) {
                              const staffName = exSvc.staff?.name ||
                                assignStaffList.find((s) => s.id === pickedServiceStaffId)?.name ||
                                "nhân viên";
                              const svcName = exSvc.service?.name || "Dịch vụ";
                              const exCode = ex.code || "";
                              const exCust = ex.customer?.name || "Khách";
                              const fmtTime = (ms: number) => {
                                const dt = new Date(ms);
                                return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                              };
                              setServicePickerError(
                                `Không thể thêm dịch vụ vì trùng thời gian với lịch đã có.\n` +
                                `${exCode ? `Lịch ${exCode}` : "Một lịch"}:\n` +
                                `• Khách: ${exCust}\n` +
                                `• Thợ: ${staffName}\n` +
                                `• Dịch vụ: ${svcName}\n` +
                                `• Thời gian: ${fmtTime(exStart)}–${fmtTime(exEnd)}\n` +
                                `→ Trùng với dịch vụ mới (${fmtTime(bookingStartMs)}–${fmtTime(newEnd)}). Vui lòng chọn nhân viên khác.`
                              );
                              setAddingService(false);
                              return;
                            }
                          }
                        }
                      }
                    }

                    // === No conflict → append the service to the booking ===
                    // Build the updated services array: existing services + the
                    // new one. The booking's existing services (with their staff)
                    // are preserved; the new service gets the picked staff.
                    const existingServices = (booking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
                      service_id: (s.service_id as string) || (s.service as { id?: string } | null)?.id || "",
                      service_category_id: (s.service_category_id as string) || null,
                      staff_id: (s.staff_id as string) || null,
                    }));
                    const newServiceEntry = {
                      service_id: pickedService.id,
                      service_category_id: serviceCategories.find((c) => c.name === selectedServiceGroup)?.id || null,
                      staff_id: pickedServiceStaffId,
                    };
                    const updatedServices = [...existingServices, newServiceEntry];
                    const res = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ services: updatedServices }),
                    });
                    const json = await res.json();
                    if (!json.ok) throw new Error(json.error || "Không thể thêm dịch vụ");
                    // Refresh the bookings list so the dialog re-renders with
                    // the new service. The parent page owns the refetch.
                    window.dispatchEvent(new Event("booking-updated"));
                    setServicePickerOpen(false);
                    setServicePickerStep("groups");
                    setSelectedServiceGroup(null);
                    setPickedService(null);
                    setPickedServiceStaffId("");
                  } catch (e) {
                    setServicePickerError(e instanceof Error ? e.message : "Lỗi không xác định");
                  } finally {
                    setAddingService(false);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {addingService ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu…
                  </>
                ) : (
                  "Thêm dịch vụ"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Per-service "Xếp nhân viên" reassign dialog ===
          Opened by the yellow "Xếp nhân viên" button next to each service's
          staff name. Lets the user reassign the staff for ONE service. Includes
          a staff conflict check: if the picked staff is already booked at this
          service's date/time (excluding this booking itself), the save is
          BLOCKED with a detailed conflict message. On confirm, the booking's
          services array is PUT-updated with the new staff_id for this one
          service (others unchanged). */}
      <Dialog
        open={!!reassignStaffServiceId}
        onOpenChange={(v) => {
          if (!v) {
            setReassignStaffServiceId(null);
            setReassignStaffPickStaffId("");
            setReassignStaffError("");
          }
        }}
      >
        <DialogContent className="max-w-sm sm:max-w-sm p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm font-semibold">Xếp nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              Chọn nhân viên thực hiện dịch vụ này. Bắt buộc.
            </p>
            <Select
              value={reassignStaffPickStaffId}
              onValueChange={(v) => {
                setReassignStaffPickStaffId(v);
                setReassignStaffError("");
              }}
            >
              <SelectTrigger className="w-full h-8 text-xs" size="sm">
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {assignStaffList.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">Không có nhân viên ở cửa hàng này</div>
                ) : (
                  assignStaffList.map((st) => (
                    <SelectItem key={st.id} value={st.id} className="text-xs">
                      {st.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!reassignStaffPickStaffId && (
              <p className="text-[11px] text-red-500">Vui lòng chọn nhân viên</p>
            )}
            {reassignStaffError && (
              <div className="whitespace-pre-line mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {reassignStaffError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReassignStaffServiceId(null);
                setReassignStaffPickStaffId("");
                setReassignStaffError("");
              }}
              disabled={reassignStaffSaving}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!reassignStaffPickStaffId || reassignStaffSaving}
              onClick={async () => {
                if (!reassignStaffServiceId || !reassignStaffPickStaffId) return;
                setReassignStaffError("");
                setReassignStaffSaving(true);
                try {
                  // === Staff conflict check ===
                  // Find the service being reassigned to get its duration.
                  const targetService = (booking.services as unknown as Array<Record<string, unknown>>)
                    .find((s) => String(s.id ?? "") === reassignStaffServiceId);
                  const duration = Number(
                    (targetService?.service as { duration?: number } | null)?.duration || 60
                  );
                  const bookingStartMs = booking.date_time ? new Date(booking.date_time).getTime() : 0;
                  if (bookingStartMs && booking.date_time) {
                    const params = new URLSearchParams({ page: "1", limit: "200" });
                    const d = new Date(booking.date_time);
                    const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    params.set("date_from", `${isoDay}T00:00:00+07:00`);
                    params.set("date_to", `${isoDay}T23:59:59+07:00`);
                    const branchId = booking.branchId || (booking.branch as { id?: string } | null)?.id || null;
                    if (branchId) params.set("branch_id", branchId);
                    const cfRes = await fetch(`/api/supabase/bookings?${params.toString()}`);
                    const cfJson = await cfRes.json();
                    if (cfJson.ok) {
                      const exList = (cfJson.data?.items || cfJson.data || []) as Array<{
                        id: string;
                        code?: string | null;
                        status?: string | null;
                        date_time?: string | null;
                        customer?: { name?: string } | null;
                        services?: Array<{
                          staff_id?: string | null;
                          staff?: { name?: string } | null;
                          service?: { name?: string; duration?: number } | null;
                        }>;
                      }>;
                      const newEnd = bookingStartMs + duration * 60 * 1000;
                      for (const ex of exList) {
                        if (ex.id === booking.id) continue;
                        if (ex.status === "cancelled" || ex.status === "no_show") continue;
                        const exStart = new Date(String(ex.date_time || "")).getTime();
                        if (isNaN(exStart)) continue;
                        for (const exSvc of ex.services || []) {
                          if (exSvc.staff_id !== reassignStaffPickStaffId) continue;
                          const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                          const exEnd = exStart + exDur;
                          if (bookingStartMs < exEnd && exStart < newEnd) {
                            const staffName = exSvc.staff?.name ||
                              assignStaffList.find((s) => s.id === reassignStaffPickStaffId)?.name ||
                              "nhân viên";
                            const svcName = exSvc.service?.name || "Dịch vụ";
                            const exCode = ex.code || "";
                            const exCust = ex.customer?.name || "Khách";
                            const fmtTime = (ms: number) => {
                              const dt = new Date(ms);
                              return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                            };
                            setReassignStaffError(
                              `Không thể xếp nhân viên vì trùng thời gian với lịch đã có.\n` +
                              `${exCode ? `Lịch ${exCode}` : "Một lịch"}:\n` +
                              `• Khách: ${exCust}\n` +
                              `• Thợ: ${staffName}\n` +
                              `• Dịch vụ: ${svcName}\n` +
                              `• Thời gian: ${fmtTime(exStart)}–${fmtTime(exEnd)}\n` +
                              `→ Trùng với dịch vụ này (${fmtTime(bookingStartMs)}–${fmtTime(newEnd)}). Vui lòng chọn nhân viên khác.`
                            );
                            setReassignStaffSaving(false);
                            return;
                          }
                        }
                      }
                    }
                  }

                  // === No conflict → PUT the updated services array ===
                  // Replace ONLY this service's staff_id; keep all others.
                  const updatedServices = (booking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
                    service_id: (s.service_id as string) || (s.service as { id?: string } | null)?.id || "",
                    service_category_id: (s.service_category_id as string) || null,
                    staff_id: String(s.id ?? "") === reassignStaffServiceId
                      ? reassignStaffPickStaffId
                      : (s.staff_id as string) || null,
                  }));
                  const res = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ services: updatedServices }),
                  });
                  const json = await res.json();
                  if (!json.ok) throw new Error(json.error || "Không thể cập nhật nhân viên");
                  window.dispatchEvent(new Event("booking-updated"));
                  setReassignStaffServiceId(null);
                  setReassignStaffPickStaffId("");
                  setReassignStaffError("");
                } catch (e) {
                  setReassignStaffError(e instanceof Error ? e.message : "Lỗi không xác định");
                } finally {
                  setReassignStaffSaving(false);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {reassignStaffSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu…
                </>
              ) : (
                "Lưu"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Per-product "Xếp nhân viên" dialog ===
          Opened by the "Xếp nhân viên" button in each product row. Products
          don't have a staff in the booking_services sense — this just records
          the staff who sold/advised on the product (stored in the
          selectedProducts entry's `staffName` field, used only for display +
          sent as staffName in the invoice item on confirm). No conflict check
          (products have no time slot). */}
      <Dialog
        open={reassignProductIdx !== null}
        onOpenChange={(v) => {
          if (!v) {
            setReassignProductIdx(null);
            setReassignProductStaffId("");
          }
        }}
      >
        <DialogContent className="max-w-sm sm:max-w-sm p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm font-semibold">Xếp nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              Chọn nhân viên tư vấn/bán sản phẩm này.
            </p>
            <Select
              value={reassignProductStaffId}
              onValueChange={setReassignProductStaffId}
            >
              <SelectTrigger className="w-full h-8 text-xs" size="sm">
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {assignStaffList.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">Không có nhân viên ở cửa hàng này</div>
                ) : (
                  assignStaffList.map((st) => (
                    <SelectItem key={st.id} value={st.id} className="text-xs">
                      {st.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReassignProductIdx(null);
                setReassignProductStaffId("");
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!reassignProductStaffId}
              onClick={() => {
                if (reassignProductIdx === null) return;
                const staffName = assignStaffList.find((s) => s.id === reassignProductStaffId)?.name || null;
                setSelectedProducts((prev) => prev.map((p, i) =>
                  i === reassignProductIdx ? { ...p, staffName } : p
                ));
                setReassignProductIdx(null);
                setReassignProductStaffId("");
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
