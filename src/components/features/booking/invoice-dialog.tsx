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
import { parseMultiCustomerNote, buildMultiCustomerNote } from "@/lib/multi-customer";

export interface InvoiceDialogProps {
  booking: Booking;
  onClose: () => void;
  onPaid: () => void;
  /** When set, the dialog opens in PER-CUSTOMER mode for a multi-customer
   *  "Cùng lịch" booking that already has a paid invoice. Only THIS customer's
   *  services are shown; the dialog is editable even when booking.status ===
   *  "checkout". On "Hoàn tất", the customer's services + products are
   *  APPENDED to the existing paid invoice (not a new invoice), and the slot's
   *  status is set to "checkout" via the slot-status API. */
  slotIndex?: number;
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

export function InvoiceDialog({ booking, onClose, onPaid, slotIndex }: InvoiceDialogProps) {
  // A booking with status "checkout" is considered already paid -> read-only view.
  // EXCEPTION 1: when `slotIndex` is set (per-customer mode), the dialog is
  // editable even if the booking is "checkout" — the user is paying for ONE
  // more customer in an already-partially-paid multi-customer booking.
  // EXCEPTION 2: when the booking is multi-customer with [[MULTI]] note and AT
  // LEAST ONE customer slot is still "checkin" (unpaid, being served), the
  // dialog is editable even if the booking-level status is "checkout" — there
  // are still customers waiting to be served/paid. The dialog's serviceRows
  // filter only includes "checkin" slots, so paid/cancelled/no_show slots are
  // excluded from the editable view.
  const multiCustomerForCheckout = parseMultiCustomerNote(booking.note);
  const hasCheckinSlot = multiCustomerForCheckout?.slotStatuses
    ? multiCustomerForCheckout.slotStatuses.some((s) => s === "checkin")
    : false;
  const isCheckout = booking.status === "checkout" && slotIndex === undefined && !hasCheckinSlot;

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
  // in the chosen category. Each service row has a +/- quantity stepper on the
  // right (mirrors the product picker UX). Multiple services can be picked at
  // once. Staff is OPTIONAL — a single staff Select applies to all picked
  // services; if left blank, services are added with staff_id = null.
  // On confirm, ALL picked services (qty × each) are appended to the booking
  // via PUT /api/supabase/bookings/:id (services array). The booking is then
  // REFETCHED directly inside the dialog (not relying on the parent page's
  // "booking-updated" listener, which only exists on /booking) so the new
  // services appear immediately in the Dịch vụ list — works regardless of
  // which page opened the dialog (booking, cashier/activity, cashier/invoices).
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
  // Multi-pick quantity per service id (mirrors productQuantities).
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({});
  // OPTIONAL staff — applied to ALL picked services. Empty = no staff.
  const [pickedServiceStaffId, setPickedServiceStaffId] = useState<string>("");
  const [servicePickerError, setServicePickerError] = useState("");
  const [addingService, setAddingService] = useState(false);
  // When the service picker is opened from a per-customer "+" button (multi-
  // customer mode), this holds the customer's slot index. New services get
  // this slot appended to the [[MULTI]] note's serviceSlots array so they're
  // attributed to the correct customer. Undefined = global add (legacy mode
  // for single-customer bookings or for the section header "+" button).
  const [servicePickerTargetSlot, setServicePickerTargetSlot] = useState<number | undefined>(undefined);
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

  // === Local booking override ===
  // After the service picker PUT-updates the booking, we REFETCH the booking
  // directly here and store it in `localBooking`. This makes the new services
  // appear in the Dịch vụ list IMMEDIATELY — without relying on the parent
  // page's "booking-updated" event listener (which only exists on /booking;
  // cashier/activity and cashier/invoices pages don't listen for it, so the
  // dialog would otherwise never refresh and the user would think the add
  // silently failed). `currentBooking` is what every render reads from.
  const [localBooking, setLocalBooking] = useState<Booking | null>(null);
  const currentBooking: Booking = localBooking ?? booking;

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
  // Uses `currentBooking` (which is `localBooking ?? booking`) so newly-added
  // services show up immediately after the service picker saves.
  const multiCustomer = parseMultiCustomerNote(currentBooking.note);
  const slotStatuses = multiCustomer?.slotStatuses;
  const serviceSlotsMap = multiCustomer?.serviceSlots;
  const allServiceRows = (currentBooking.services as unknown as Array<Record<string, unknown>>).map((s, idx) => {
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
  // Filter: only show services whose customer is CHECKED IN (status "checkin").
  // EXCLUDES "checkout" (paid customers — their services/products are already
  // merged into the PaidInvoiceView full-page receipt, so they shouldn't appear
  // in this editable invoice dialog) and "cancelled" / "no_show" (per the user's
  // requirement: "dialog Hóa đơn không bao gồm dịch vụ, sản phẩm của khách đã
  // thanh toán hoàn tất và khách đã hủy hoặc không đến").
  // When no slotStatuses (non-multi or legacy), show all services (single-
  // customer booking — the slot status IS the booking status).
  // PER-CUSTOMER MODE: when `slotIndex` is set, further filter to ONLY this
  // customer's services (s._slotIdx === slotIndex).
  const serviceRows = (() => {
    let rows = slotStatuses && slotStatuses.length > 0
      ? allServiceRows.filter((s) => {
          const st = slotStatuses[s._slotIdx] || "confirmed";
          return st === "checkin";
        })
      : allServiceRows;
    if (slotIndex !== undefined) {
      rows = rows.filter((s) => s._slotIdx === slotIndex);
    }
    return rows;
  })();
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

  // Total service entries to add: sum of quantities across all picked services
  // in the current group. Drives the "Thêm dịch vụ (N)" button label + enabled
  // state in the service picker.
  const servicesToAddCount = servicesList.reduce(
    (n, s) => n + (serviceQuantities[s.id] || 0),
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
    const services = (currentBooking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
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

  // === Multi-customer service grouping ===
  // For multi-customer "Cùng lịch" bookings, group services by customer so the
  // UI can render each customer as a sub-section with their own yellow "+"
  // button (per the user's request: "+" on same line as customer name, price
  // on same line as service name). When there's only 1 customer (or the
  // booking is not multi-customer), this returns null and the legacy flat
  // layout is used.
  //
  // Only applies to EDITABLE mode (read-only invoices show items[] without
  // per-customer grouping since the saved invoice's items don't carry the
  // customer slot info reliably).
  const serviceGroupsByCustomer = (() => {
    if (effectivelyReadOnly) return null;
    if (!multiCustomer || multiCustomer.slots.length < 2) return null;
    // Group serviceRows by _slotIdx. Preserve slot order so customers appear
    // in the same order as in the booking's [[MULTI]] note.
    const groupsMap = new Map<number, typeof serviceRows>();
    for (const row of serviceRows) {
      const arr = groupsMap.get(row._slotIdx) || [];
      arr.push(row);
      groupsMap.set(row._slotIdx, arr);
    }
    // Only include slots that have at least one checked-in/checkout service.
    // (Slots that are still "confirmed"/"cancelled"/"no_show" are filtered
    // out of serviceRows already, so they won't appear in groupsMap.)
    return multiCustomer.slots
      .map((slot, idx) => ({ slot, idx, services: groupsMap.get(idx) || [] }))
      .filter((g) => g.services.length > 0);
  })();

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
      // === PER-CUSTOMER MODE ===
      // When slotIndex is set, we're paying for ONE customer in a multi-customer
      // booking that already has a paid invoice. Instead of creating/updating an
      // invoice, we APPEND this customer's services + products to the existing
      // paid invoice, then set the slot to "checkout" via the slot-status API.
      if (slotIndex !== undefined && existingInvoice) {
        // Fetch the existing invoice's current items (from its note JSON).
        const invRes = await fetch(
          `/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=1`
        );
        const invJson = await invRes.json();
        const existingInv = invJson.ok && Array.isArray(invJson.data) && invJson.data.length > 0
          ? invJson.data[0]
          : null;
        if (!existingInv) throw new Error("Không tìm thấy hóa đơn hiện tại");

        // Parse existing items from the invoice's note JSON.
        let existingItems: Array<Record<string, unknown>> = [];
        let humanNote: string | null = null;
        let tipAmount = 0;
        let promotionMeta: unknown = null;
        let photosList: string[] = [];
        const rawNote = existingInv.note;
        if (typeof rawNote === "string" && rawNote.includes('"__kind":"invoice_meta"')) {
          try {
            const parsedNote = JSON.parse(rawNote) as {
              items?: unknown[]; note?: string | null; tip?: number;
              promotion?: unknown; photos?: unknown;
            };
            if (Array.isArray(parsedNote.items)) existingItems = parsedNote.items as Array<Record<string, unknown>>;
            humanNote = parsedNote.note ?? null;
            tipAmount = Number(parsedNote.tip) || 0;
            promotionMeta = parsedNote.promotion ?? null;
            if (Array.isArray(parsedNote.photos)) photosList = parsedNote.photos as string[];
          } catch { /* best-effort */ }
        }

        // Build the new items to append (this customer's services + products).
        const newItems = [
          ...serviceRows.map((s) => ({
            name: s.name,
            itemId: null,
            type: "service",
            quantity: 1,
            price: s.price,
            discount: 0,
            discountType: "VND",
            total: s.price,
            staffName: s.staff,
            _slotIdx: s._slotIdx,
          })),
          ...selectedProducts.map((p) => ({
            name: p.name,
            itemId: p.id,
            type: "product",
            quantity: p.quantity,
            price: p.price,
            discount: 0,
            discountType: "VND",
            total: p.price * p.quantity,
            staffName: p.staffName || undefined,
          })),
        ];

        // Merge: existing items + new items.
        const allItems = [...existingItems, ...newItems];
        const newItemsTotal = newItems.reduce(
          (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0
        );
        const oldTotalAmount = Number(existingInv.total_amount) || 0;
        const newTotalAmount = oldTotalAmount + newItemsTotal;
        const discount = Number(existingInv.discount) || 0;
        const newFinalAmount = Math.max(0, newTotalAmount - discount) + tipAmount;

        // Rebuild the note JSON with the merged items.
        const newInvNote = JSON.stringify({
          __kind: "invoice_meta",
          items: allItems,
          note: humanNote,
          tip: tipAmount,
          promotion: promotionMeta,
          photos: photosList,
        });

        // PUT the updated invoice (items + totals).
        const putRes = await fetch(`/api/supabase/invoices/${existingInvoice.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: newInvNote,
            total_amount: newTotalAmount,
            final_amount: newFinalAmount,
            created_by: useAuthStore.getState().user?.id,
          }),
        });
        const putJson = await putRes.json();
        if (!putJson.ok) throw new Error(putJson.error || "Không thể cập nhật hóa đơn");

        // Set this customer's slot to "checkout" via the slot-status API.
        await fetch("/api/supabase/bookings/slot-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: booking.id,
            slotIndex,
            status: "checkout",
            actor_staff_id: useAuthStore.getState().user?.id,
          }),
        });

        onPaid();
        exitReview(booking.id);
        return;
      }

      // === NORMAL MODE (not per-customer) ===
      // This is the combined mode — paying for ALL currently-checked-in
      // customers at once. We APPEND this payment's items (services +
      // products of checkin slots) to the existing invoice's items (which
      // contain items from PREVIOUSLY-paid customers). Each item is tagged
      // with `_slotIdx` so we can later REMOVE a customer's items if their
      // slot reverts from "checkout" to another status.
      //
      // Previously this REPLACED the invoice's items with only the current
      // checkin slots' items — which wiped out previously-paid customers'
      // items from the receipt. That's the bug the user reported: "khách hoàn
      // tất thanh toán trước đó thì bị xóa hết thông tin dịch vụ, sản phẩm".
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
      // Build the NEW items to append (this payment's services + products).
      // Each item carries `_slotIdx` so we can identify which customer it
      // belongs to (used by PaidInvoiceView + slot-status revert to remove
      // a customer's items when their slot reverts from checkout).
      const newItems = [
        ...serviceRows.map((s) => ({
          name: s.name,
          itemId: null,
          type: "service",
          quantity: 1,
          price: s.price,
          discount: 0,
          total: s.price,
          staffName: s.staff,
          _slotIdx: s._slotIdx,
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
      // Fetch the existing invoice's current items so we can APPEND to them
      // (preserving previously-paid customers' items). The `existingInvoice`
      // prop may be stale (loaded when the dialog opened); re-fetch to get
      // the latest state right before saving.
      let existingItems: Array<Record<string, unknown>> = [];
      let humanNote: string | null = null;
      let existingTip = 0;
      let existingPromotion: unknown = null;
      let existingPhotos: string[] = [];
      let existingDiscount = 0;
      if (existingInvoice) {
        try {
          const invRes = await fetch(`/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=1`);
          const invJson = await invRes.json();
          const existingInv = invJson.ok && Array.isArray(invJson.data) && invJson.data.length > 0
            ? invJson.data[0]
            : null;
          if (existingInv) {
            existingDiscount = Number(existingInv.discount) || 0;
            const rawNote = existingInv.note;
            if (typeof rawNote === "string" && rawNote.includes('"__kind":"invoice_meta"')) {
              try {
                const parsedNote = JSON.parse(rawNote) as {
                  items?: unknown[]; note?: string | null; tip?: number;
                  promotion?: unknown; photos?: unknown;
                };
                if (Array.isArray(parsedNote.items)) existingItems = parsedNote.items as Array<Record<string, unknown>>;
                humanNote = parsedNote.note ?? null;
                existingTip = Number(parsedNote.tip) || 0;
                existingPromotion = parsedNote.promotion ?? null;
                if (Array.isArray(parsedNote.photos)) existingPhotos = parsedNote.photos as string[];
              } catch { /* best-effort */ }
            }
          }
        } catch { /* best-effort — if fetch fails, we just append to empty */ }
      }
      // Merge: existing items (previously-paid customers) + new items (this payment).
      const allItems = [...existingItems, ...newItems];
      // Recompute totals: existing items' total + new items' total, then
      // apply discount + tip. The discount/tip come from the existing invoice
      // (preserving what was set when the first customer paid) — the current
      // form's tip/promo are for THIS payment only and are added on top.
      const existingItemsTotal = existingItems.reduce(
        (sum, it) => sum + (Number(it.total ?? it.price) || 0) * (Number(it.quantity) || 1), 0
      );
      const newItemsTotal = newItems.reduce(
        (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0
      );
      const subtotal = existingItemsTotal + newItemsTotal;
      // Use the existing discount + existing promotion (don't override with
      // the current form's promo — that would double-apply). The current
      // form's promo only applies if there was no existing promotion.
      const effectiveDiscount = existingDiscount > 0 ? existingDiscount : promoDiscount;
      const effectivePromotion = existingPromotion || promotionMeta;
      const effectiveTip = existingTip + tip; // sum tips across payments
      const finalAmountMerged = Math.max(0, subtotal - effectiveDiscount) + effectiveTip;
      // Merge photos: existing + new draft photos (deduplicated).
      const mergedPhotos = Array.from(new Set([...existingPhotos, ...draftPhotos]));
      if (existingInvoice) {
        // Update the existing invoice → append items + recompute totals.
        // Status becomes "completed" (paid). The note JSON carries the full
        // items list + the cashier's human-readable note + tip + promotion +
        // photos. PUT with `note` (carrying items) + total_amount + final_amount
        // + status + payment_method (this payment's method — the receipt shows
        // the LAST payment's method; when multiple payments use different
        // methods, PaidInvoiceView already sums cash vs transfer from the
        // merged invoices, but here it's a SINGLE invoice so we use the
        // current form's method).
        const newInvNote = JSON.stringify({
          __kind: "invoice_meta",
          items: allItems,
          note: humanNote,
          tip: effectiveTip,
          promotion: effectivePromotion,
          photos: mergedPhotos,
        });
        const res = await fetch(`/api/supabase/invoices/${existingInvoice.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: newInvNote,
            total_amount: subtotal,
            final_amount: finalAmountMerged,
            discount: effectiveDiscount,
            tip: effectiveTip,
            status: "completed",
            payment_method: paymentMethod,
            photos: mergedPhotos,
            created_by: useAuthStore.getState().user?.id,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể cập nhật hóa đơn");
      } else {
        // Fallback: no pending invoice exists — create a completed one directly.
        const newInvNote = JSON.stringify({
          __kind: "invoice_meta",
          items: allItems,
          note: null,
          tip: effectiveTip,
          promotion: effectivePromotion,
          photos: mergedPhotos,
        });
        const res = await fetch("/api/supabase/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: (booking.customer as unknown as { id?: string })?.id,
            branch_id: booking.branchId || (booking.branch as { id?: string } | null)?.id || null,
            booking_id: booking.id,
            note: newInvNote,
            total_amount: subtotal,
            discount: effectiveDiscount,
            tip: effectiveTip,
            final_amount: finalAmountMerged,
            payment_method: paymentMethod,
            status: "completed",
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
      <DialogContent className="order-dialog-dense max-w-[560px] p-0 overflow-hidden" storageKey="invoice" resizable>
        <DialogHeader className="px-4 pt-3 pb-1.5">
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
            payment method → actions. The outer DialogContent wrapper already
            provides flex-1 + overflow-y-auto, so this inner div just needs
            padding + spacing (no max-h — the dialog's own resize controls the
            scroll area). */}
        <div className="px-4 pb-4 space-y-2">

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
                  staff). Only shown in editable mode for SINGLE-CUSTOMER
                  bookings (or non-multi bookings). For multi-customer bookings,
                  the "+" button is rendered per-customer next to each customer
                  name (see serviceGroupsByCustomer branch below). The button is
                  yellow per the user's request. */}
              {!effectivelyReadOnly && !serviceGroupsByCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setServicePickerStep("groups");
                    setSelectedServiceGroup(null);
                    setServiceQuantities({});
                    setPickedServiceStaffId("");
                    setServicePickerError("");
                    setServicePickerTargetSlot(slotIndex);
                    setServicePickerOpen(true);
                  }}
                  title="Thêm dịch vụ"
                  className="flex h-6 w-6 items-center justify-center rounded border border-yellow-400 bg-yellow-400 text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {effectivelyReadOnly && loadingInvoice ? (
                <div className="text-sm text-gray-400">Đang tải...</div>
              ) : serviceGroupsByCustomer ? (
                // === MULTI-CUSTOMER layout ===
                // Each customer is a sub-section: customer name + yellow "+"
                // button on the same line, then their services below (service
                // name + price on the same line, staff + "Xếp nhân viên"
                // button below). New services added via the "+" button are
                // attributed to that customer (slot index).
                serviceGroupsByCustomer.map((group) => (
                  <div key={group.idx} className="rounded-md border border-gray-200 p-1.5">
                    {/* Customer name + yellow "+" button on the same line */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium text-gray-700 truncate">
                        {group.slot.walkin ? "Khách vãng lai" : group.slot.name}
                        {group.slot.phone && (
                          <span className="ml-1 text-gray-500">· {group.slot.phone}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setServicePickerStep("groups");
                          setSelectedServiceGroup(null);
                          setServiceQuantities({});
                          setPickedServiceStaffId("");
                          setServicePickerError("");
                          setServicePickerTargetSlot(group.idx);
                          setServicePickerOpen(true);
                        }}
                        title={`Thêm dịch vụ cho ${group.slot.walkin ? "khách vãng lai" : group.slot.name}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-yellow-400 bg-yellow-400 text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Services for this customer (name + price on same line) */}
                    <div className="space-y-1">
                      {group.services.map((s, sIdx) => {
                        // Find the matching serviceRow index in the flat
                        // serviceRows array so we can get the bookingServiceId
                        // + staffId for the "Xếp nhân viên" reassign button.
                        const flatIdx = serviceRows.findIndex((r) => r === s);
                        const srvRow = flatIdx >= 0 ? serviceRows[flatIdx] : null;
                        return (
                          <div key={sIdx} className="flex items-start justify-between text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900">{s.name || "Dịch vụ"}</div>
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                {s.staff && <span className="text-xs text-gray-500">NV: {s.staff}</span>}
                              </div>
                            </div>
                            {/* Price on the same line as the service name */}
                            <div className="font-medium text-gray-900 shrink-0 ml-2">
                              {fmt(Number(s.price) || 0)}đ
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : displayItems.length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có dịch vụ</div>
              ) : (
                // === SINGLE-CUSTOMER / READ-ONLY layout (legacy) ===
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
                        const svcs = (currentBooking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
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
                      {/* Line 1 (MAIN LINE): Product name (LEFT, truncate) + Price (RIGHT) + remove.
                          The product name takes the full available width on the left (flex-1 +
                          truncate) so long names are cut with an ellipsis instead of overlapping
                          with the staff info (which now sits on Line 2, below). */}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate flex-1 min-w-0">
                          {p.name}
                          {p.quantity > 1 && <span className="ml-1 text-xs text-gray-500">×{p.quantity}</span>}
                        </span>
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
                      {/* Line 2: "Xếp nhân viên" button (LEFT) + staff name (RIGHT) on the
                          SAME line. When staff is assigned, show "NV: <name>" on the right
                          (truncated if long); when no staff, show only the button on the left.
                          Per the user's request: "sau khi thêm nhân viên thì tên nhân viên đặt
                          bên phải cùng dòng với nút Xếp nhân viên". */}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const current = assignStaffList.find((s) => s.name === p.staffName);
                            setReassignProductIdx(idx);
                            setReassignProductStaffId(current?.id || "");
                          }}
                          title={p.staffName ? `Xếp nhân viên (hiện: ${p.staffName})` : "Xếp nhân viên cho sản phẩm này"}
                          className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-yellow-400 bg-yellow-400 px-1.5 text-[10px] font-medium text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                        >
                          <UserCog className="h-2.5 w-2.5" />
                          Xếp nhân viên
                        </button>
                        {p.staffName && (
                          <span className="text-xs text-gray-500 truncate min-w-0 text-right">NV: {p.staffName}</span>
                        )}
                      </div>
                      {/* Line 3: product code (under the staff/button, when present) */}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" storageKey="invoice-review">
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
            setServiceQuantities({});
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
                    setServiceQuantities({});
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
                        setServiceQuantities({});
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
                  const qty = serviceQuantities[s.id] || 0;
                  const isPicked = qty > 0;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between border rounded-md p-2 transition-colors ${
                        isPicked ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-medium text-sm text-gray-900 truncate">{s.name}</div>
                        <div className="text-xs text-gray-500">
                          {fmt(s.price)}đ{s.duration ? ` · ${s.duration}'` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setServiceQuantities((prev) => ({
                              ...prev,
                              [s.id]: Math.max(0, (prev[s.id] || 0) - 1),
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
                            setServiceQuantities((prev) => ({
                              ...prev,
                              [s.id]: Math.min(99, (prev[s.id] || 0) + 1),
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
                });
              })()}
            </div>
          )}

          {/* Optional staff Select — shown in the services step. NOT required:
              if left blank, picked services are added with staff_id = null.
              A single staff applies to ALL picked services. */}
          {servicePickerStep === "services" && (
            <div className="space-y-1 border-t pt-2">
              <label className="text-[11px] text-gray-600">
                Nhân viên thực hiện (không bắt buộc)
              </label>
              <Select
                value={pickedServiceStaffId}
                onValueChange={(v) => {
                  setPickedServiceStaffId(v);
                  setServicePickerError("");
                }}
              >
                <SelectTrigger className="w-full h-8 text-xs" size="sm">
                  <SelectValue placeholder="Chọn nhân viên (nếu có)" />
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
                setServiceQuantities({});
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
                disabled={servicesToAddCount === 0 || addingService}
                onClick={async () => {
                  if (servicesToAddCount === 0) return;
                  setServicePickerError("");
                  setAddingService(true);
                  try {
                    // === Build the list of new service entries ===
                    // Each picked service with qty N produces N entries.
                    // staff_id is set ONLY when the optional staff was picked;
                    // otherwise null (assigned later via "Xếp nhân viên").
                    const cat = serviceCategories.find((c) => c.name === selectedServiceGroup);
                    const newEntries: Array<{ service_id: string; service_category_id: string | null; staff_id: string | null }> = [];
                    for (const s of servicesList) {
                      const q = serviceQuantities[s.id] || 0;
                      if (q <= 0) continue;
                      for (let i = 0; i < q; i++) {
                        newEntries.push({
                          service_id: s.id,
                          service_category_id: cat?.id || null,
                          staff_id: pickedServiceStaffId || null,
                        });
                      }
                    }
                    if (newEntries.length === 0) {
                      setAddingService(false);
                      return;
                    }

                    // === Staff conflict check (ONLY when staff is picked) ===
                    // If no staff, skip the conflict check entirely — the
                    // service is added unassigned and the user can use
                    // "Xếp nhân viên" later.
                    const pickedDur = (() => {
                      // Use the longest duration among picked services for
                      // the conflict window (worst-case).
                      let max = 0;
                      for (const s of servicesList) {
                        if ((serviceQuantities[s.id] || 0) > 0 && s.duration && s.duration > max) {
                          max = s.duration;
                        }
                      }
                      return max || 60;
                    })();
                    const bookingStartMs = booking.date_time ? new Date(booking.date_time).getTime() : 0;
                    if (pickedServiceStaffId && bookingStartMs && booking.date_time) {
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
                        const dur = pickedDur * 60 * 1000;
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
                                `→ Trùng với dịch vụ mới (${fmtTime(bookingStartMs)}–${fmtTime(newEnd)}). Vui lòng chọn nhân viên khác hoặc bỏ trống để thêm sau.`
                              );
                              setAddingService(false);
                              return;
                            }
                          }
                        }
                      }
                    }

                    // === No conflict (or no staff) → append to the booking ===
                    // Preserve existing services (use currentBooking so any
                    // services added earlier in this dialog session are kept),
                    // then append the new entries.
                    const existingServices = (currentBooking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
                      service_id: (s.service_id as string) || (s.service as { id?: string } | null)?.id || "",
                      service_category_id: (s.service_category_id as string) || null,
                      staff_id: (s.staff_id as string) || null,
                    }));
                    const updatedServices = [...existingServices, ...newEntries];

                    // === Multi-customer: update the [[MULTI]] note's serviceSlots ===
                    // When `servicePickerTargetSlot` is set (the "+" button was
                    // clicked next to a specific customer's name), the new
                    // services must be attributed to that customer. The
                    // booking_services table has no customer_id column — the
                    // per-customer mapping lives in the booking's [[MULTI]] note
                    // as a `serviceSlots` array (serviceSlots[serviceIndex] =
                    // customer slot index). Append the target slot index for
                    // each new service so display sites (Cashier, Staff View,
                    // this dialog) correctly show the new services under that
                    // customer.
                    //
                    // Also handle the case where serviceSlots is missing
                    // (legacy bookings) — if so, build it from scratch so the
                    // existing services keep their slot mapping (1:1 by index)
                    // and the new services get the target slot.
                    let updatedNote: string | null | undefined = undefined;
                    const parsed = parseMultiCustomerNote(currentBooking.note);
                    if (parsed && servicePickerTargetSlot !== undefined) {
                      const existingSlots = parsed.serviceSlots
                        ? [...parsed.serviceSlots]
                        : existingServices.map((_, i) => i);
                      // For each new service, append the target slot index.
                      for (let i = 0; i < newEntries.length; i++) {
                        existingSlots.push(servicePickerTargetSlot);
                      }
                      updatedNote = buildMultiCustomerNote(
                        parsed.slots,
                        parsed.userNote,
                        existingSlots,
                        parsed.slotStatuses
                      );
                    }

                    const putBody: Record<string, unknown> = { services: updatedServices };
                    if (updatedNote !== undefined) putBody.note = updatedNote;
                    const res = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(putBody),
                    });
                    const json = await res.json();
                    if (!json.ok) throw new Error(json.error || "Không thể thêm dịch vụ");
                    // Refetch the booking directly so the dialog re-renders
                    // with the new services IMMEDIATELY — works regardless of
                    // which page opened the dialog (booking/cashier/etc.).
                    try {
                      const refRes = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`);
                      const refJson = await refRes.json();
                      if (refJson.ok && refJson.data) {
                        setLocalBooking(refJson.data as Booking);
                      }
                    } catch { /* best-effort */ }
                    // Legacy event — keeps the parent /booking page in sync
                    // (its own listener will also refetch + update invoiceBooking).
                    window.dispatchEvent(new Event("booking-updated"));
                    setServicePickerOpen(false);
                    setServicePickerStep("groups");
                    setSelectedServiceGroup(null);
                    setServiceQuantities({});
                    setPickedServiceStaffId("");
                    setServicePickerTargetSlot(undefined);
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
                  `Thêm dịch vụ${servicesToAddCount > 0 ? ` (${servicesToAddCount})` : ""}`
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
                  const targetService = (currentBooking.services as unknown as Array<Record<string, unknown>>)
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
                  const updatedServices = (currentBooking.services as unknown as Array<Record<string, unknown>>).map((s) => ({
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
                  // Refetch the booking directly so the dialog re-renders with
                  // the updated staff assignment, regardless of which page
                  // opened the dialog. Also dispatch the legacy event so any
                  // parent page that listens (e.g. /booking) refreshes too.
                  try {
                    const refRes = await fetch(`/api/supabase/bookings/${encodeURIComponent(booking.id)}`);
                    const refJson = await refRes.json();
                    if (refJson.ok && refJson.data) {
                      setLocalBooking(refJson.data as Booking);
                    }
                  } catch { /* best-effort */ }
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
