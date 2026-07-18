"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  Printer,
  Check,
  Smile,
  Camera,
  Loader2,
  X,
  CheckSquare,
  UserCog,
} from "lucide-react";
import { useCashierStore } from "@/stores/cashier-store";
import { usePaymentReviewStore, useIsReviewing } from "@/stores/payment-review-store";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";
import { queryKeys } from "@/lib/query-keys";
import { isPromotionActive } from "@/lib/promotion-utils";
import { localDayToUtcRange, toVietnamTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";
import { PaidInvoiceView } from "@/components/features/booking/paid-invoice-view";
import { parseMultiCustomerNote, type SlotCustomer } from "@/lib/multi-customer";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";

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

export function InvoiceSummary({ selectedDate }: { selectedDate: string }) {
  const {
    activeTabId,
    activeCustomers,
    invoices,
    updateInvoiceItemDiscount,
    removeInvoiceItem,
    setInvoiceItemStaff,
    setDiscountAmount,
    setTipAmount,
    getSubtotal,
    getInvoiceTotal,
    getTipAmount,
    closeCustomerTab,
    tabMeta,
    updateTabMeta,
  } = useCashierStore();
  const { selectedBranchId } = useBranchStore();
  // Permission: "upload_photo" gates the device-upload feature. A single
  // permission covers both unpaid and paid invoices.
  // "delete_past_photos" gates deleting photos on PAID invoices (unpaid
  // invoices can always be edited, including photo deletion).
  // "view_customer_photo" gates the lightbox (click-to-zoom) on photos.
  // "create_invoice" gates the "Hoàn tất" (checkout) button.
  // "edit_unpaid_invoice" gates editing an UNPAID invoice's items/discount/tip
  // (without it, an unpaid invoice renders read-only like a paid one).
  // "invoice_discount" gates selecting a promotion (CTKM) on an invoice.
  // "cancel_payment" gates the "Hủy thanh toán" button (cancel an unpaid order).
  const { hasPermission } = useAuthStore();
  const canUploadPhoto = hasPermission("upload_photo");
  const canDeletePastPhotos = hasPermission("delete_past_photos");
  const canViewCustomerPhoto = hasPermission("view_customer_photo");
  const canCreateInvoice = hasPermission("create_invoice");
  const canEditUnpaidInvoice = hasPermission("edit_unpaid_invoice");
  const canUsePromotion = hasPermission("invoice_discount");
  const canCancelPayment = hasPermission("cancel_payment");
  const queryClient = useQueryClient();

  const invoice = activeTabId ? invoices[activeTabId] : null;
  const [discountInput, setDiscountInput] = useState("");
  const [tipInput, setTipInput] = useState("");
  // Payment method chosen during checkout review ("cash" | "transfer").
  // Default "cash". Sent as `payment_method` in the checkout payload.
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  // The promotion selected for this invoice (id of an incentives row, or ""
  // for none). When set, the discount amount auto-fills from the promotion's
  // percentage and the promotion metadata is sent with the checkout so the
  // CSKH promotion's used_count increments.
  const [selectedPromoId, setSelectedPromoId] = useState<string>("");

  // Photos attached to the active invoice. Stored as base64 data URLs so they
  // can be embedded in the invoice's `note` JSON (alongside items/tip/promotion).
  // For draft (checkin) tabs we keep them locally until checkout (POST invoice).
  // For paid (checkout) tabs the source of truth is the saved invoice (server)
  // — we don't keep a local copy, instead we PUT changes immediately and let the
  // queryClient refetch refresh the display. Draft photos are kept per-tab so
  // they don't bleed across tabs.
  const [draftPhotosByTab, setDraftPhotosByTab] = useState<Record<string, string[]>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [paidInvoiceOpen, setPaidInvoiceOpen] = useState(false);
  // Per-item discount input draft. Keyed by item id so each line tracks its
  // own text independently. The draft is committed to the store on blur or
  // Enter; while the user types, we keep the raw string so they can clear /
  // retype freely without the number snapping on every keystroke.
  const [itemDiscountDrafts, setItemDiscountDrafts] = useState<
    Record<string, string>
  >({});
  // Inline success banner shown after a successful checkout. Stores the paid
  // invoice code + booking code so the cashier can see EXACTLY which order was
  // paid (not all orders — only the selected one). Auto-dismisses after 6s.
  const [paidSuccess, setPaidSuccess] = useState<{
    tabId: string;
    invoiceCode: string;
    bookingCode: string | null;
    syncedBooking: boolean;
  } | null>(null);
  useEffect(() => {
    if (!paidSuccess) return;
    const timer = setTimeout(() => setPaidSuccess(null), 6000);
    return () => clearTimeout(timer);
  }, [paidSuccess]);

  const activeCustomer = activeCustomers.find((c) => c.customerId === activeTabId);

  // Fetch the selected date's bookings (same query/key as CustomerTabs —
  // TanStack Query dedupes the request) so we can read the active tab's
  // booking status. The active tab id is the booking id (tabs opened from a
  // booking) OR a customer id (tabs opened via "Thêm khách hàng") OR an
  // invoice id (tabs opened from a standalone product-only invoice).
  interface DayBooking {
    id: string;
    status: string;
    note: string | null;
    number_of_customers: number | null;
    customer: { id: string; name: string; phone: string | null } | null;
  }
  const { data: dayBookings } = useQuery<DayBooking[]>({
    queryKey: ["cashier-day-bookings", selectedDate, selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");
      // Timezone-safe: convert the selected Vietnam day to its UTC range so
      // Supabase filters by the correct UTC window (no 7-hour shift).
      const dayRange = localDayToUtcRange(selectedDate);
      params.set("date_from", dayRange.from);
      params.set("date_to", dayRange.to);
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/bookings?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as DayBooking[]) || [];
    },
  });

  // Fetch the selected date's standalone (product-only) invoices so we can
  // read the active tab's invoice status when the tab was opened from a
  // standalone invoice (no booking link). Same query/key as CustomerTabs.
  interface StandaloneInvoiceRow {
    id: string;
    code: string | null;
    status: string;
    booking_id: string | null;
    final_amount: number;
    customer: { id: string; name: string; phone: string | null } | null;
  }
  const { data: dayStandaloneInvoices } = useQuery<StandaloneInvoiceRow[]>({
    queryKey: ["cashier-day-standalone-invoices", selectedDate, selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");
      // Timezone-safe: same Vietnam-day → UTC range conversion as bookings.
      const invDayRange = localDayToUtcRange(selectedDate);
      params.set("date_from", invDayRange.from);
      params.set("date_to", invDayRange.to);
      if (selectedBranchId && selectedBranchId !== "all") params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/invoices?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) return [];
      const all = (json.data as StandaloneInvoiceRow[]) || [];
      return all.filter((inv) => !inv.booking_id);
    },
  });

  // The active tab's booking status (if the tab was opened from a booking).
  // null when the tab is a manual customer (no booking) — those are treated
  // as editable+not-paid (no status restriction).
  const activeBooking = (dayBookings || []).find((b) => b.id === activeTabId) || null;
  const bookingStatus = activeBooking?.status || null;
  // The active tab's standalone-invoice status (if the tab was opened from a
  // product-only invoice, OR a draft tab that was just paid/cancelled and
  // linked to a standalone invoice via meta.invoiceId). A standalone invoice's
  // status is "completed" (paid) or "cancelled".
  const activeTabMetaForInvoice = activeTabId ? tabMeta[activeTabId] : undefined;
  const activeStandaloneInvoice = (dayStandaloneInvoices || []).find(
    (inv) =>
      inv.id === activeTabId ||
      (activeTabMetaForInvoice?.invoiceId && inv.id === activeTabMetaForInvoice.invoiceId)
  ) || null;
  const standaloneInvoiceStatus = activeStandaloneInvoice?.status || null;
  // A tab is "paid" if EITHER the booking is checkout OR the standalone
  // invoice is completed OR the local paidSuccess flag is set (immediate
  // feedback after clicking "Hoàn tất" — don't wait for the query refetch
  // to flip the status, which would leave the button clickable for a few
  // seconds). A tab is "cancelled" if EITHER the booking is
  // cancelled/no_show OR the standalone invoice is cancelled.
  // Read the tab's paid/cancelled status from the persisted store (survives
  // page navigation — switching to Lịch hẹn and back doesn't reset it).
  const activeTabPaidFlag = activeTabMetaForInvoice?.paid;
  const activeTabCancelledFlag = activeTabMetaForInvoice?.cancelled;
  const isPaid = bookingStatus === "checkout" || standaloneInvoiceStatus === "completed" || !!activeTabPaidFlag;
  const isCancelled =
    bookingStatus === "cancelled" ||
    bookingStatus === "no_show" ||
    standaloneInvoiceStatus === "cancelled" ||
    !!activeTabCancelledFlag;
  // Whether the invoice is editable: an UNPAID, non-cancelled invoice is
  // editable ONLY when the staff has the edit_unpaid_invoice permission.
  // Paid/cancelled invoices are always read-only. Used to gate the quantity
  // +/- controls, discount/tip inputs, promotion select, item remove, etc.
  const editable = !isPaid && !isCancelled && canEditUnpaidInvoice;
  // Two-step payment: after pressing "Thanh toán", the summary enters a review
  // mode where inputs (discount/tip/promo/item-remove) become read-only and the
  // action bar switches to [Hủy][Hoàn tất]. "Hủy" exits review (back to
  // editable); "Hoàn tất" performs the checkout. Only applies to editable
  // (unpaid, non-cancelled) invoices.
  //
  // The review state is SHARED across the Booking and Cashier modules via
  // usePaymentReviewStore so pressing Thanh toán in one module reflects in the
  // other. The key is the active tab id (= booking.id for booking-type tabs).
  const activeBookingId = activeTabId ? tabMeta[activeTabId]?.bookingId : undefined;
  const reviewKey = activeBookingId || activeTabId || "";
  const { enterReview, exitReview } = usePaymentReviewStore();
  const isReviewing = useIsReviewing(reviewKey);
  const reviewMode = editable && isReviewing;
  // Render inputs only when editable AND NOT in review mode.
  const editableDisplay = editable && !reviewMode;
  // Allow checkout from ANY non-terminal status: new / confirmed / checkin, or
  // no booking at all (manual walk-in / product-only tabs). Only paid
  // (checkout) / cancelled / no_show bookings are blocked. This means the
  // cashier can complete payment the moment a customer walks in, without
  // having to first mark the booking as "checkin" in the Booking module.
  const TERMINAL_STATUSES = ["checkout", "cancelled", "no_show"];
  const canCheckout =
    (bookingStatus === null || !TERMINAL_STATUSES.includes(bookingStatus)) &&
    standaloneInvoiceStatus !== "completed" &&
    standaloneInvoiceStatus !== "cancelled" &&
    !activeTabPaidFlag;

  // For PAID orders, fetch the saved invoice from Supabase so the summary
  // displays the actual paid items / promotion / tip / total (read-only)
  // instead of the empty in-memory draft. The active tab id IS the booking id
  // for tabs opened from a booking.
  interface SavedInvoiceItem {
    name?: string;
    type?: string;
    price?: number;
    quantity?: number;
    discount?: number;
    total?: number;
    staffName?: string;
  }
  interface SavedInvoice {
    id: string;
    code: string | null;
    final_amount: number;
    discount: number;
    tip: number;
    promotion: {
      id: string;
      code: string | null;
      name: string;
      discountValue: number;
      discountAmount: number;
    } | null;
    items: SavedInvoiceItem[];
    photos?: string[];
  }
  const { data: savedInvoice } = useQuery<SavedInvoice | null>({
    queryKey: ["cashier-saved-invoice", activeTabId, isPaid, isCancelled],
    queryFn: async () => {
      // Load the saved invoice for paid OR cancelled orders so the summary
      // shows the actual items/totals that were paid or cancelled.
      if (!activeTabId || (!isPaid && !isCancelled)) return null;
      const meta = tabMeta[activeTabId];
      // For a standalone-invoice tab (product-only order, no booking), the
      // active tab id IS the invoice id — fetch it directly by id. Otherwise
      // the tab id is the booking id, so fetch the invoice linked to that
      // booking.
      if (meta?.invoiceId) {
        const res = await fetch(`/api/supabase/invoices/${encodeURIComponent(meta.invoiceId)}`);
        const json = await res.json();
        if (!json.ok || !json.data) return null;
        return json.data as SavedInvoice;
      }
      const res = await fetch(`/api/supabase/invoices?booking_id=${encodeURIComponent(activeTabId)}&limit=1`);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data) || json.data.length === 0) return null;
      return json.data[0] as SavedInvoice;
    },
    enabled: !!activeTabId && (isPaid || isCancelled),
  });

  // Display photos: for paid orders, use the saved invoice's photos (server
  // is the source of truth); for draft orders, use the per-tab local draft state.
  const draftPhotos = activeTabId ? (draftPhotosByTab[activeTabId] || []) : [];
  const displayPhotos = isPaid
    ? (Array.isArray(savedInvoice?.photos) ? (savedInvoice!.photos as string[]) : [])
    : draftPhotos;

  // Persist the current photo set to the invoice's note JSON. Only used when an
  // invoice already exists (paid orders + the Booking module's pending invoice
  // at checkin). For pure draft (checkin) tabs without an invoice, photos are
  // held locally and POSTed on checkout.
  const savePhotos = async (invoiceId: string, photos: string[]) => {
    try {
      await fetch(`/api/supabase/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, created_by: useAuthStore.getState().user?.id }),
      });
      queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["cashier-saved-invoice"] });
    } catch {
      /* best-effort */
    }
  };

  // Convert selected FileList -> upload to R2 -> get URLs -> append to gallery.
  // For draft tabs (no saved invoice): append URLs to local state (sent at checkout).
  // For paid tabs (saved invoice exists): append + PUT immediately so the change
  // persists and syncs to the Booking module's dialogs.
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Upload each file to R2 and get the public URL.
    const folder = savedInvoice?.code || activeTabId || "drafts";
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
      // Fallback: use base64 data URLs if R2 upload fails.
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
    if (isPaid && savedInvoice?.id) {
      const updated = [...displayPhotos, ...newPhotos];
      await savePhotos(savedInvoice.id, updated);
    } else if (activeTabId) {
      setDraftPhotosByTab((prev) => ({
        ...prev,
        [activeTabId]: [...(prev[activeTabId] || []), ...newPhotos],
      }));
    }
    e.target.value = "";
  };

  // Remove a photo from the gallery. Draft -> local state; paid -> PUT.
  const handleRemovePhoto = async (idx: number) => {
    if (isPaid && savedInvoice?.id) {
      const updated = displayPhotos.filter((_, i) => i !== idx);
      await savePhotos(savedInvoice.id, updated);
    } else if (activeTabId) {
      setDraftPhotosByTab((prev) => ({
        ...prev,
        [activeTabId]: (prev[activeTabId] || []).filter((_, i) => i !== idx),
      }));
    }
  };

  // Fetch the active promotions created in CSKH so they can be selected here
  // (synced with the same source as the booking invoice dialog).
  const { data: promotionsData } = useQuery<{
    items: Array<{
      id: string;
      code: string | null;
      name: string;
      discountValue: number;
      discountType: string;
      serviceIds: string | null;
    }>;
  }>({
    queryKey: ["cashier-promotions"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/incentives?type=promotion&page=1&limit=100");
      const json = await res.json();
      return json.data || { items: [] };
    },
  });
  // Only show CURRENTLY USABLE promotions in the selector: filter out expired
  // (endDate in the past), not-yet-started (startDate in the future), and
  // fully-used (usedCount >= usageLimit) ones. Mirrors the Booking module's
  // getActivePromotionsForBooking so both selectors stay consistent.
  const promotions = (promotionsData?.items || []).filter((p) =>
    isPromotionActive(p)
  );
  const selectedPromo = promotions.find((p) => p.id === selectedPromoId) || null;

  // Fetch ALL active staff (no branch filter) so the "Xếp nhân viên" dialog
  // list is never empty when the branch selector is on "Tất cả cửa hàng".
  // We filter client-side by CHỨC DANH (staff group name) AND by the selected
  // branch (using each staff's `branches` array). Only stylist titles are
  // eligible for product advisory assignment — office/admin/reception groups
  // are excluded.
  const ELIGIBLE_STAFF_TITLES = new Set([
    "Artist",
    "Creative Director",
    "Customer Service / CS",
    "Junior",
    "Master",
  ]);
  const { data: branchStaff } = useQuery<
    Array<{ id: string; name: string; branch_id?: string | null; branches?: string[]; group?: { name?: string } | null }>
  >({
    queryKey: ["cashier-staff-for-product"],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/staff?active=true&limit=500`);
      const json = await res.json();
      return (json.data as Array<{
        id: string;
        name: string;
        branch_id?: string | null;
        branches?: string[];
        group?: { name?: string } | null;
      }>) || [];
    },
  });
  // Apply the two filters: eligible chức danh AND belongs to the selected
  // branch (or "all"/none = no branch filter).
  const eligibleBranchStaff = (branchStaff || []).filter((s) => {
    const title = s.group?.name || "";
    if (!ELIGIBLE_STAFF_TITLES.has(title)) return false;
    if (!selectedBranchId || selectedBranchId === "all") return true;
    return (
      s.branch_id === selectedBranchId ||
      (Array.isArray(s.branches) && s.branches.includes(selectedBranchId))
    );
  });
  // Per-item "change staff" dialog state. Opens when the cashier clicks the
  // small square button next to a line item's staff name. Tracks WHICH item
  // id is being edited (so OK only updates that one line) and the picked
  // staff id. The dialog is REQUIRED — OK is disabled until a staff is picked.
  // `changeStaffError` holds the conflict message when the picked staff is
  // already booked at this item's date/time — the change is then BLOCKED.
  const [changeStaffItemId, setChangeStaffItemId] = useState<string | null>(null);
  const [changeStaffPickStaffId, setChangeStaffPickStaffId] = useState<string>("");
  const [changeStaffError, setChangeStaffError] = useState<string>("");
  // True while the change-staff conflict check is running (disables OK + shows
  // "Đang kiểm tra..." so the cashier knows the click registered).
  const [changeStaffChecking, setChangeStaffChecking] = useState(false);
  // Customer history dialog state — opened when clicking a per-slot customer
  // name (green link) in a multi-customer booking's invoice summary.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
  } | null>(null);

  // Parse the promotion's serviceIds JSON string into a list (or null = all).
  // For "service_category" type these are category ids; otherwise service ids.
  const getPromoTargetIds = (promo: { serviceIds: string | null }): string[] | null => {
    if (!promo.serviceIds) return null;
    try {
      const ids = JSON.parse(promo.serviceIds) as string[];
      if (!Array.isArray(ids) || ids.length === 0) return null;
      return ids;
    } catch {
      return null;
    }
  };

  // Fetch the service list so we can resolve each invoice item's service id
  // -> category id. Needed for "service_category" promotions whose targetIds
  // are CATEGORY ids (the invoice item only stores the service id).
  const { data: servicesForCategory } = useQuery<Array<{
    id: string;
    category_id: string | null;
  }>>({
    queryKey: ["cashier-services-for-category"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/services?limit=200");
      const json = await res.json();
      return (json.data as Array<{ id: string; category_id: string | null }>) || [];
    },
  });

  // Whether a given invoice line is eligible for a promotion, mirroring the
  // scope logic from the Booking module: null scope = all items; otherwise
  // match by service id, or by category id for "service_category" promos.
  // Used by handlePromoSelect to apply the promo per-line to services.
  const isItemPromoEligible = (
    item: { itemId: string },
    promo: { discountType: string; serviceIds: string | null }
  ): boolean => {
    const targetIds = getPromoTargetIds(promo);
    if (!targetIds) return true;
    if (promo.discountType === "service_category") {
      const catId =
        (servicesForCategory || []).find((s) => s.id === item.itemId)
          ?.category_id || "";
      return targetIds.includes(catId);
    }
    return targetIds.includes(item.itemId);
  };

  const handleDiscountChange = (value: string) => {
    setDiscountInput(value);
    if (activeTabId) {
      const amount = parseFloat(value) || 0;
      setDiscountAmount(activeTabId, amount);
    }
  };

  // When a promotion is chosen, apply it as a per-line VND discount on each
  // ELIGIBLE service/package line (shown read-only in the Giảm giá column).
  // Products are never touched here — their discount stays manually editable.
  // The promo lives per-item so the line "Thành tiền" and footer totals update
  // live (Task 4); the invoice-level discountAmount is cleared to avoid any
  // double-counting. Clearing the promo resets every service line to 0.
  const handlePromoSelect = (promoId: string) => {
    setSelectedPromoId(promoId);
    if (!activeTabId) return;
    const invoice = invoices[activeTabId];
    if (!invoice) return;
    const serviceItems = invoice.items.filter((it) => it.type !== "product");
    if (promoId === "") {
      // "Không áp dụng" — clear all service/package per-line discounts.
      serviceItems.forEach((it) =>
        updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND")
      );
      setDiscountInput("");
      setDiscountAmount(activeTabId, 0);
      return;
    }
    const promo = promotions.find((p) => p.id === promoId);
    if (!promo) return;
    const pct = Number(promo.discountValue) || 0;
    const eligible = serviceItems.filter((it) => isItemPromoEligible(it, promo));
    if (pct <= 0 || eligible.length === 0) {
      // No eligible service for this promo — don't apply it.
      alert("Chương trình khuyến mãi không được áp dụng cho dịch vụ hiện tại");
      setSelectedPromoId("");
      serviceItems.forEach((it) =>
        updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND")
      );
      setDiscountInput("");
      setDiscountAmount(activeTabId, 0);
      return;
    }
    // Apply the promo share to each eligible service line (VND amount so the
    // Giảm giá column shows a tiền amount); reset non-eligible services to 0.
    serviceItems.forEach((it) => {
      if (isItemPromoEligible(it, promo)) {
        const share = Math.round((it.price * it.quantity * pct) / 100);
        updateInvoiceItemDiscount(activeTabId, it.id, share, "VND");
      } else {
        updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND");
      }
    });
    // Promo now lives per-item; clear the invoice-level discount + manual input.
    setDiscountInput("");
    setDiscountAmount(activeTabId, 0);
  };

  const handleTipChange = (value: string) => {
    setTipInput(value);
    if (activeTabId) {
      const amount = parseFloat(value) || 0;
      setTipAmount(activeTabId, amount);
    }
  };

  // === Walk-in tab: invoice creation ===
  // Walk-in tabs NO LONGER create a pending standalone invoice on first item
  // add. That earlier behavior produced orphaned empty invoices (the effect
  // fired after the item was added but before the booking-creation async
  // completed, so `meta.bookingId` was still empty → a standalone invoice got
  // POSTed even for tabs that were about to be linked to a booking). The
  // invoice is now created only at checkout (POST with booking_id when a
  // booking exists, or a standalone invoice for product-only walk-in tabs).
  // This keeps "Danh sách đơn hàng" clean (no pending drafts) and avoids the
  // sync conflict with the Lịch hẹn module.
  const pendingInvoiceInFlightRef = useRef<string | null>(null);
  // Pre-compute the active tab's meta fields for the dep array (avoids
  // indexing tabMeta with a possibly-null activeTabId in the deps).
  const activeMetaType = activeTabId ? tabMeta[activeTabId]?.type : undefined;
  const activeMetaInvoiceId = activeTabId ? tabMeta[activeTabId]?.invoiceId : undefined;
  const activeMetaBookingId = activeTabId ? tabMeta[activeTabId]?.bookingId : undefined;
  useEffect(() => {
    // Disabled: no early standalone-invoice creation. Invoices are created at
    // checkout only (see checkoutMutation). The earlier behavior produced
    // orphaned empty invoices (the effect fired after an item was added but
    // before the booking-creation async completed, so `meta.bookingId` was
    // still empty → a standalone invoice got POSTed even for tabs that were
    // about to be linked to a booking). This is intentionally a no-op now.
  }, [
    activeTabId,
    invoice?.items?.length,
    activeMetaType,
    activeMetaInvoiceId,
    activeMetaBookingId,
    selectedBranchId,
  ]);

  // "Thanh toán" handler: auto-checkin the booking (if not already checkin) +
  // create a PENDING invoice (so the Booking module's invoice dialog can open
  // it) + enter review mode. This makes the booking + invoice appear in the
  // Booking module as "Đã checkin" with a "Hóa đơn" link immediately — synced
  // via the shared payment-review store.
  const [thanhToanPending, setThanhToanPending] = useState(false);
  const handleThanhToan = async () => {
    if (!activeTabId || !invoice || invoice.items.length === 0) return;
    setThanhToanPending(true);
    try {
      const meta = tabMeta[activeTabId];
      const bookingId = meta?.bookingId;
      // 1. Auto-checkin the booking if it's not already checkin/checkout.
      if (bookingId) {
        // The booking status is in dayBookings; check it.
        // We PATCH to "checkin" — the API is idempotent (if already checkin,
        // it stays checkin).
        try {
          await fetch(`/api/supabase/bookings/${bookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "checkin" }),
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
        } catch {
          // Best-effort — continue to review even if checkin fails.
        }
      }
      // 2. Create a PENDING invoice for this booking (if one doesn't exist yet)
      //    so the Booking module's invoice dialog can open it and show the
      //    Payment dialog (review mode synced).
      if (bookingId && !meta?.invoiceId) {
        try {
          const realCustomerId = meta?.customerId || activeCustomer?.customerId || "";
          const hasServices = invoice.items.some((it) => it.type === "service");
          const res = await fetch("/api/supabase/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: realCustomerId,
              branch_id: selectedBranchId || null,
              booking_id: shouldSyncBookingFor(activeTabId) ? bookingId : undefined,
              items: invoice.items.map((it) => ({
                id: it.id,
                itemId: it.itemId,
                name: it.name,
                type: it.type,
                quantity: it.quantity,
                price: it.price,
                discount: it.discount,
                discountType: it.discountType || "VND",
                total: it.total,
                staffName: it.staffName,
              })),
              subtotal: getSubtotal(activeTabId),
              discount: invoice.discountAmount,
              tip: getTipAmount(activeTabId),
              promotion: null,
              final_amount: getInvoiceTotal(activeTabId),
              payment_method: paymentMethod,
              status: "pending", // pending — not yet paid
              photos: [],
              created_by: useAuthStore.getState().user?.id,
            }),
          });
          const json = await res.json();
          if (json.ok && json.data?.id) {
            updateTabMeta(activeTabId, { invoiceId: json.data.id });
          }
        } catch {
          // Best-effort — continue to review even if invoice creation fails.
        }
      }
      // 3. Enter review mode (shared store → synced to Booking module).
      enterReview(reviewKey);
    } finally {
      setThanhToanPending(false);
    }
  };
  // Helper: check if the active tab's invoice should sync with the booking.
  function shouldSyncBookingFor(tabId: string): boolean {
    const inv = invoices[tabId];
    const m = tabMeta[tabId];
    if (!inv || !m?.bookingId) return false;
    return inv.items.some((it) => it.type === "service");
  }

  // Create-invoice mutation: POSTs the draft to Supabase.
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!activeTabId || !activeCustomer || !invoice) {
        throw new Error("Chưa chọn khách hàng hoặc chưa có mặt hàng");
      }
      if (!selectedBranchId || selectedBranchId === "all") {
        throw new Error("Vui lòng chọn chi nhánh");
      }
      // No status restriction here — checkout is allowed from any non-terminal
      // booking status (new / confirmed / checkin) or for manual tabs with no
      // booking at all. The cashier can complete payment immediately; the
      // booking (if any) will be PATCHed straight to "checkout" below.
      const subtotal = getSubtotal(activeTabId);
      const total = getInvoiceTotal(activeTabId);
      const tip = getTipAmount(activeTabId);
      // Build promotion metadata (matches the booking invoice dialog shape) so
      // the invoices API increments the promotion's used_count on save.
      const promotionMeta = selectedPromo
        ? {
            id: selectedPromo.id,
            code: selectedPromo.code || "",
            name: selectedPromo.name,
            discountValue: selectedPromo.discountValue,
            discountAmount: invoice.discountAmount,
          }
        : null;

      // Resolve the real customer_id: for booking tabs, activeCustomer.customerId
      // is the booking.id (tab key), not the customer. Use tabMeta.customerId
      // (set by handlePickBooking) to get the real customer.
      const meta = tabMeta[activeTabId];
      let realCustomerId = meta?.customerId || activeCustomer.customerId;
      const bookingId = meta?.bookingId;

      // === Walk-in tab: PUT the existing pending invoice to "completed" ===
      // Walk-in tabs create a pending standalone invoice as soon as the first
      // item is added (see the useEffect above). On "Hoàn tất" we PUT-update
      // that invoice to "completed" with the final items/tip/promotion — NO
      // new invoice is created, and NO booking is synced (walk-in invoices are
      // standalone, booking_id = null). The success path shows the inline
      // "Hóa đơn đã thanh toán thành công" banner (via paidSuccess).
      if (meta?.type === "walkin" && meta?.invoiceId) {
        const res = await fetch(
          `/api/supabase/invoices/${encodeURIComponent(meta.invoiceId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: invoice.items.map((it) => ({
                id: it.id,
                itemId: it.itemId,
                name: it.name,
                type: it.type,
                quantity: it.quantity,
                price: it.price,
                discount: it.discount,
                discountType: it.discountType || "VND",
                total: it.total,
                staffName: it.staffName,
              })),
              subtotal,
              discount: invoice.discountAmount,
              tip,
              promotion: promotionMeta,
              final_amount: total,
              payment_method: paymentMethod,
              status: "completed",
              photos: draftPhotos,
            }),
          }
        );
        const json = await res.json();
        if (!json.ok) {
          throw new Error(json.error || "Không thể thanh toán hóa đơn");
        }
        return {
          code: (json.data as { code?: string })?.code,
          id: (json.data as { id?: string })?.id,
          // Walk-in invoices never sync with the Booking module.
          syncedBooking: false,
        } as { code?: string; id?: string; syncedBooking: boolean };
      }

      // Whether the invoice contains any services. Services come from bookings,
      // so only service-containing invoices should sync with the Booking module
      // (PATCH booking → checkout). Product-only invoices are standalone
      // purchases (e.g. a walk-in buying shampoo) and simply appear in the
      // Cashier's order/invoice history without touching any booking.
      const hasServices = invoice.items.some((it) => it.type === "service");
      const shouldSyncBooking = hasServices && !!bookingId;

      // === Staff time-conflict check (block Hoàn tất) ===
      // Before completing the invoice, verify none of this booking's services
      // overlap with ANOTHER (non-cancelled) booking for the same staff on the
      // same day. Services run consecutively from the booking's date_time, so
      // we fetch the booking (with its services + durations) and check each
      // slot against existing bookings, skipping the current booking itself.
      // This is a safety net on top of the conflict checks done when each
      // service was added (POST/PUT) — guards against stale state or bookings
      // created/edited elsewhere after the cashier opened the tab.
      if (shouldSyncBooking && bookingId) {
        // Fetch this booking's full detail (services + durations + date_time).
        const detailRes = await fetch(
          `/api/supabase/bookings/${encodeURIComponent(bookingId)}`
        );
        const detailJson = await detailRes.json();
        if (detailJson.ok && detailJson.data) {
          const b = detailJson.data as {
            date_time?: string;
            branch_id?: string | null;
            services?: Array<{
              staff_id?: string | null;
              service?: { duration?: number; name?: string } | null;
            }>;
          };
          const bStart = b.date_time ? new Date(b.date_time).getTime() : NaN;
          if (!isNaN(bStart) && Array.isArray(b.services)) {
            // Build this booking's consecutive service slots.
            let cursor = bStart;
            const ownSlots = b.services
              .map((s) => {
                if (!s.staff_id) return null;
                const dur = (Number(s.service?.duration) || 60) * 60 * 1000;
                const start = cursor;
                const end = start + dur;
                cursor = end;
                return { staffId: s.staff_id, start, end, name: s.service?.name || "dịch vụ" };
              })
              .filter(
                (x): x is { staffId: string; start: number; end: number; name: string } =>
                  x !== null
              );

            // Fetch existing bookings for the same Vietnam day + branch.
            // Convert the booking's date_time (UTC) to its Vietnam calendar
            // day, then to the UTC range for that VN day so the overlap check
            // covers the full local day (consistent with the booking page).
            const dayStart = new Date(bStart);
            const vnDay = new Date(dayStart.getTime() + 7 * 60 * 60 * 1000);
            const isoDay = `${vnDay.getUTCFullYear()}-${String(vnDay.getUTCMonth() + 1).padStart(2, "0")}-${String(vnDay.getUTCDate()).padStart(2, "0")}`;
            const exParams = new URLSearchParams();
            exParams.set("page", "1");
            exParams.set("limit", "200");
            const exDayRange = localDayToUtcRange(isoDay);
            exParams.set("date_from", exDayRange.from);
            exParams.set("date_to", exDayRange.to);
            if (b.branch_id) exParams.set("branch_id", b.branch_id);
            const exRes = await fetch(`/api/supabase/bookings?${exParams.toString()}`);
            const exJson = await exRes.json();
            if (exJson.ok && Array.isArray(exJson.data)) {
              for (const ex of exJson.data as Array<{
                id: string;
                status: string;
                date_time: string;
                services?: Array<{
                  staff_id?: string | null;
                  service?: { duration?: number; name?: string } | null;
                }>;
              }>) {
                if (ex.id === bookingId) continue; // skip self
                if (ex.status === "cancelled" || ex.status === "no_show") continue;
                const exStart = new Date(ex.date_time).getTime();
                if (isNaN(exStart)) continue;
                for (const exSvc of ex.services || []) {
                  if (!exSvc.staff_id) continue;
                  const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                  const exEnd = exStart + exDur;
                  for (const ns of ownSlots) {
                    if (ns.staffId === exSvc.staff_id && ns.start < exEnd && exStart < ns.end) {
                      const exTime = new Date(exStart).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      });
                      throw new Error(
                        `Không thể hoàn tất: nhân viên bị trùng lịch — đã có lịch "${exSvc.service?.name || "dịch vụ"}" lúc ${exTime} ${isoDay.split("-").reverse().join("/")}. Vui lòng chỉnh giờ/nhân viên trước khi thanh toán.`
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Product-only walk-in / new tabs have no real customer yet (a customer
      // is normally created lazily when a SERVICE is added, because services
      // require a booking + customer). For product-only purchases we still
      // need a real customer_id for the invoice, so create one now — mirroring
      // the service-selector's walk-in customer creation.
      if (!hasServices && meta && (meta.type === "walkin" || meta.type === "new")) {
        const isWalkin = meta.type === "walkin";
        const custRes = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: isWalkin
              ? "Khách vãng lai"
              : meta.customerInfo?.name || "Khách mới",
            phone: meta.customerInfo?.phone || "",
            source_id: isWalkin
              ? "779ddad6-01fa-4887-8647-134ce699d643"
              : meta.customerInfo?.sourceId || null,
            branch_id: selectedBranchId || null,
          }),
        });
        const custJson = await custRes.json();
        if (custJson.ok && custJson.data?.id) {
          realCustomerId = custJson.data.id;
        } else if (custJson.existing_customer?.id) {
          // Duplicate phone → use the existing customer.
          realCustomerId = custJson.existing_customer.id;
        } else {
          throw new Error(custJson.error || "Không thể tạo khách hàng cho hóa đơn");
        }
      }

      const payload = {
        customer_id: realCustomerId,
        branch_id: selectedBranchId,
        // Only link the invoice to the booking when it contains services, so a
        // product-only invoice doesn't show up as a partial payment on the
        // booking in the Booking module.
        booking_id: shouldSyncBooking ? bookingId : undefined,
        items: invoice.items.map((it) => ({
          id: it.id,
          itemId: it.itemId,
          name: it.name,
          type: it.type,
          quantity: it.quantity,
          price: it.price,
          discount: it.discount,
          discountType: it.discountType || "VND",
          total: it.total,
          staffName: it.staffName,
        })),
        subtotal,
        discount: invoice.discountAmount,
        tip,
        promotion: promotionMeta,
        final_amount: total,
        payment_method: paymentMethod,
        status: "completed",
        photos: draftPhotos,
        created_by: useAuthStore.getState().user?.id,
      };

      // SYNC WITH BOOKING MODULE (only when the invoice has services):
      // Before creating a new invoice, check if a (pending) invoice already
      // exists for this booking (the Booking module's invoice dialog may have
      // created one at checkin to hold photos/tip). If so, PUT-update it to
      // "completed" with the cashier's items instead of POSTing a second
      // invoice — this keeps a single invoice per booking and ensures the two
      // modules stay in sync (same invoice id, same items, same totals).
      // Product-only invoices skip this check entirely and always POST a new
      // standalone invoice (no booking link, no duplicate-PUT path).
      let existingInvoiceId: string | null = null;
      if (shouldSyncBooking) {
        try {
          const checkRes = await fetch(
            `/api/supabase/invoices?booking_id=${encodeURIComponent(bookingId!)}&limit=1`
          );
          const checkJson = await checkRes.json();
          if (checkJson.ok && Array.isArray(checkJson.data) && checkJson.data.length > 0) {
            existingInvoiceId = (checkJson.data[0] as { id: string }).id;
          }
        } catch {
          // Best-effort check; if it fails, fall through to POST.
        }
      }

      let json: { ok: boolean; data?: { code?: string }; error?: string };
      if (existingInvoiceId) {
        // PUT update the existing invoice → completed with the cashier's items.
        const res = await fetch(`/api/supabase/invoices/${existingInvoiceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: payload.items,
            subtotal,
            discount: invoice.discountAmount,
            tip,
            promotion: promotionMeta,
            final_amount: total,
            payment_method: payload.payment_method,
            status: "completed",
            photos: draftPhotos,
            created_by: useAuthStore.getState().user?.id,
          }),
        });
        json = await res.json();
      } else {
        // No existing invoice — create a new completed one.
        const res = await fetch("/api/supabase/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        json = await res.json();
      }
      if (!json.ok) throw new Error(json.error || "Không thể tạo hóa đơn");

      // Only sync the booking status → checkout when the invoice contains
      // services. This is what transitions the Booking module's "Thanh toán"
      // column to "Đã thanh toán" + shows the Hóa đơn link, and the "Trạng
      // thái" column to "Đã Checkout". Product-only invoices do NOT touch the
      // booking — the customer simply bought retail products with no service
      // appointment to check out.
      if (shouldSyncBooking) {
        try {
          await fetch(`/api/supabase/bookings/${bookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "checkout" }),
          });
        } catch {
          // Best-effort — the invoice was created; the booking status sync
          // will happen on next data refresh.
        }
      }

      return {
        ...(json.data as { code?: string; id?: string }),
        syncedBooking: shouldSyncBooking,
      } as { code?: string; id?: string; syncedBooking: boolean };
    },
    onSuccess: (data) => {
      // Refresh the invoices list so the new order appears.
      queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-activities"] });
      // Refresh the incentives list so the CSKH counts update after a promotion use.
      queryClient.invalidateQueries({ queryKey: ["cashier-promotions"] });
      // Refresh the cashier day-bookings so the active tab's status updates
      // (checkin -> checkout) and the paid invoice hides the action buttons.
      queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
      // Refresh the standalone-invoice list so a newly-paid product-only order
      // appears as a tab in the cashier list (it has no booking, so it only
      // shows up via this query).
      queryClient.invalidateQueries({ queryKey: ["cashier-day-standalone-invoices"] });
      // Refresh the Booking module's list so the booking status → checkout.
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });

      // For product-only orders (no booking link), record the created invoice's
      // id on the tab so the InvoiceSummary can load its saved items/status.
      // This keeps the just-paid draft tab linked to the real invoice.
      if (activeTabId && data?.id && !data.syncedBooking) {
        updateTabMeta(activeTabId, { invoiceId: data.id, bookingCode: data.code || undefined });
      }

      // Capture the booking code BEFORE resetting, so the success banner can
      // show exactly which order was paid.
      const bookingCode = activeTabId ? tabMeta[activeTabId]?.bookingCode ?? null : null;

      // IMPORTANT: Do NOT close the customer tab here. Keeping the tab open lets
      // the `isPaid` flag (driven by the refetched day-bookings) flip to true,
      // which replaces the action buttons with the "Hóa đơn đã hoàn tất thanh
      // toán" banner — making it visually obvious that ONLY this order was
      // paid. Closing the tab would switch to another order and make it look
      // like multiple orders were affected.
      setDiscountInput("");
      setTipInput("");
      setSelectedPromoId("");
      setPaymentMethod("cash");
      if (activeTabId) {
        setDraftPhotosByTab((prev) => {
          const next = { ...prev };
          delete next[activeTabId];
          return next;
        });
      }
      // Show a non-blocking inline banner (replaces the old blocking alert).
      if (activeTabId) updateTabMeta(activeTabId, { paid: true });
      // Exit review mode — the invoice is now paid (read-only banner shows).
      exitReview(reviewKey);
      setPaidSuccess({
        tabId: activeTabId,
        invoiceCode: data?.code || "(không có mã)",
        bookingCode,
        syncedBooking: data?.syncedBooking ?? false,
      });
    },
    onError: (error: Error) => {
      alert(`Lỗi thanh toán: ${error.message}`);
    },
  });

  // Cancel order mutation — triggered by the "Hủy thanh toán" button.
  // Two paths:
  //  1) Order with a booking (has services): PATCH the booking status →
  //     "cancelled" so the time slot is freed up. The cancelled booking stays
  //     in the Cashier tab list (showing "Đơn hàng đã hủy").
  //  2) Product-only order (no booking): there is no booking to cancel, so we
  //     create a STANDALONE invoice with status="cancelled" to record the
  //     cancelled product-only order. Per business rule, the cancelled order
  //     stays visible in the Cashier list. We do NOT close the tab in either
  //     case — keeping it open lets the "Đơn hàng đã hủy" banner show, and the
  //     order remains in the list so the cashier can review what was cancelled.
  const cancelBookingMutation = useMutation({
    mutationFn: async () => {
      if (!activeTabId || !activeCustomer || !invoice) {
        throw new Error("Chưa chọn đơn hàng");
      }
      const meta = tabMeta[activeTabId];
      const bookingId = meta?.bookingId;

      // ---- Path 0: walk-in tab with an existing pending invoice ----
      // Walk-in tabs create a pending standalone invoice as soon as the first
      // item is added. Cancelling such a tab PUTs the EXISTING invoice to
      // "cancelled" — we do NOT create a second (cancelled) invoice, and we do
      // NOT touch any booking (walk-in invoices are standalone). This keeps a
      // single invoice per walk-in tab, consistent with the checkout path.
      if (meta?.type === "walkin" && meta?.invoiceId) {
        const res = await fetch(
          `/api/supabase/invoices/${encodeURIComponent(meta.invoiceId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: invoice.items.map((it) => ({
                id: it.id,
                itemId: it.itemId,
                name: it.name,
                type: it.type,
                quantity: it.quantity,
                price: it.price,
                discount: it.discount,
                discountType: it.discountType || "VND",
                total: it.total,
                staffName: it.staffName,
              })),
              subtotal: getSubtotal(activeTabId),
              discount: invoice.discountAmount,
              tip: getTipAmount(activeTabId),
              promotion: null,
              final_amount: getInvoiceTotal(activeTabId),
              payment_method: paymentMethod,
              status: "cancelled",
              photos: [],
            }),
          }
        );
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể hủy đơn hàng");
        return {
          code: (json.data as { code?: string })?.code || "",
          id: (json.data as { id?: string })?.id,
          productOnly: true,
        } as { code: string; id?: string; productOnly: boolean };
      }

      // ---- Path 1: order has a booking (contains services) ----
      if (bookingId) {
        const res = await fetch(`/api/supabase/bookings/${bookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể hủy đơn hàng");
        return { code: (json.data as { code?: string })?.code || "", productOnly: false };
      }

      // ---- Path 2: product-only order (no booking) ----
      // Create a standalone invoice with status="cancelled" so the cancelled
      // product-only order is recorded and stays in the cashier list. Mirrors
      // the checkout path's customer-creation for walk-in / new draft tabs.
      if (!selectedBranchId || selectedBranchId === "all") {
        throw new Error("Vui lòng chọn chi nhánh");
      }
      let realCustomerId = meta?.customerId || activeCustomer.customerId;
      if (meta && (meta.type === "walkin" || meta.type === "new")) {
        const isWalkin = meta.type === "walkin";
        const custRes = await fetch("/api/supabase/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: isWalkin
              ? "Khách vãng lai"
              : meta.customerInfo?.name || "Khách mới",
            phone: meta.customerInfo?.phone || "",
            source_id: isWalkin
              ? "779ddad6-01fa-4887-8647-134ce699d643"
              : meta.customerInfo?.sourceId || null,
            branch_id: selectedBranchId || null,
          }),
        });
        const custJson = await custRes.json();
        if (custJson.ok && custJson.data?.id) {
          realCustomerId = custJson.data.id;
        } else if (custJson.existing_customer?.id) {
          realCustomerId = custJson.existing_customer.id;
        }
      }
      const subtotal = getSubtotal(activeTabId);
      const total = getInvoiceTotal(activeTabId);
      const tip = getTipAmount(activeTabId);
      const payload = {
        customer_id: realCustomerId,
        branch_id: selectedBranchId,
        // No booking_id → standalone product-only invoice.
        items: invoice.items.map((it) => ({
          id: it.id,
          itemId: it.itemId,
          name: it.name,
          type: it.type,
          quantity: it.quantity,
          price: it.price,
          discount: it.discount,
          discountType: it.discountType || "VND",
          total: it.total,
          staffName: it.staffName,
        })),
        subtotal,
        discount: invoice.discountAmount,
        tip,
        promotion: null,
        final_amount: total,
        payment_method: paymentMethod,
        status: "cancelled",
        photos: [],
        created_by: useAuthStore.getState().user?.id,
      };
      const res = await fetch("/api/supabase/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể hủy đơn hàng");
      return {
        code: (json.data as { code?: string; id?: string })?.code || "",
        id: (json.data as { id?: string })?.id,
        productOnly: true,
      } as { code: string; id?: string; productOnly: boolean };
    },
    onSuccess: (data) => {
      // Set cancelled flag in the persisted store so it survives page navigation.
      if (activeTabId) updateTabMeta(activeTabId, { cancelled: true });
      // Refresh both modules so the cancelled status shows everywhere.
      queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["supabase-invoices"] });
      // Refresh the standalone-invoice list so a cancelled product-only order
      // appears (and stays) as a tab in the cashier list.
      queryClient.invalidateQueries({ queryKey: ["cashier-day-standalone-invoices"] });

      // For product-only cancellations, link the tab to the created cancelled
      // invoice so the InvoiceSummary shows the "Đơn hàng đã hủy" banner and
      // the saved items.
      if (activeTabId && data.productOnly && data.id) {
        updateTabMeta(activeTabId, {
          invoiceId: data.id,
          bookingCode: data.code || undefined,
        });
      }

      // Per business rule: do NOT close the tab for product-only orders — the
      // cancelled order must stay in the list. For booking orders we also keep
      // the tab open now so the "Đơn hàng đã hủy" banner shows (previously the
      // tab was closed). The order remains in the day's booking list with
      // status "cancelled".
      alert(
        data.productOnly
          ? `Đã hủy đơn hàng ${data.code || ""}.`
          : `Đã hủy đơn hàng ${data.code || ""}. Khung giờ đã được giải phóng.`
      );
    },
    onError: (error: Error) => {
      alert(`Lỗi hủy đơn: ${error.message}`);
    },
  });

  if (!activeTabId || !invoice) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <p>Chọn khách hàng để xem hóa đơn</p>
      </div>
    );
  }

  const subtotal = getSubtotal(activeTabId);
  const total = getInvoiceTotal(activeTabId);
  const tip = getTipAmount(activeTabId);

  // Paid AND cancelled orders display the SAVED invoice values (read-only) so
  // the promotion, tip, items, and total reflect what was actually paid or
  // cancelled — synced with the stored invoice.
  const showSaved = (isPaid || isCancelled) && savedInvoice;
  const displayItems = showSaved
    ? (savedInvoice!.items || []).map((it) => ({
        name: it.name || "Dịch vụ",
        type: (it.type as "service" | "product" | "package") || "service",
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        discount: Number(it.discount) || 0,
        // Read the persisted discount unit; default to "VND" for invoices
        // saved before the percent-discount feature existed.
        discountType:
          (it as { discountType?: "VND" | "PERCENT" }).discountType === "PERCENT"
            ? ("PERCENT" as const)
            : ("VND" as const),
        total: Number(it.total) || 0,
        staffName: it.staffName,
      }))
    : invoice.items;
  const displaySubtotal = showSaved
    ? (savedInvoice!.items || []).reduce((s, it) => {
        // Sum each saved line's `total` (net of per-line discount) so the
        // footer "Thành tiền" matches the per-line "Thành tiền" column — for
        // old invoices item.total == price*qty (no per-line discount), for new
        // invoices it already subtracts per-line discounts. Fallback to
        // price*qty if total is missing/zero unexpectedly.
        const t = Number(it.total);
        if (!isNaN(t) && t > 0) return s + t;
        const price = Number(it.price) || 0;
        const qty = Number(it.quantity) || 1;
        return s + price * qty;
      }, 0)
    : subtotal;
  const displayDiscount = showSaved ? Number(savedInvoice!.discount) || 0 : (invoice.discountAmount || 0);
  const displayTip = showSaved ? Number(savedInvoice!.tip) || 0 : tip;
  const displayPromo = showSaved ? savedInvoice!.promotion : null;
  const displayTotal = showSaved ? Number(savedInvoice!.final_amount) || 0 : total;

  // Multi-customer "Cùng lịch" booking detection (Cashier module only).
  // When the active booking has number_of_customers >= 2 AND a [[MULTI]] note,
  // each service line item is rendered with a 3-line layout:
  //   line 1: customer name + phone (or "Khách vãng lai" when the slot is empty
  //           or marked walkin)
  //   line 2: service name
  //   line 3: staff name
  // The per-slot customer is stored in the booking's note as a [[MULTI]] JSON
  // block; slots[i] maps 1:1 to the i-th service in the booking's services
  // array. For the invoice display, service items appear first (in booking
  // order), so a service-only counter is used to look up the correct slot.
  const activeMultiNote = activeBooking?.note
    ? parseMultiCustomerNote(activeBooking.note)
    : null;
  const isMultiCustomerBooking =
    !!activeMultiNote && (activeBooking?.number_of_customers ?? 1) >= 2;
  // Precompute the slot index for each display item (services only). Products
  // and packages don't have a slot → -1 (no customer line shown for them).
  // Uses an immutable reduce (no in-render variable mutation) to satisfy the
  // react-hooks/immutability lint rule.
  const itemSlotIndices: number[] = displayItems.reduce<{
    arr: number[];
    svc: number;
  }>(
    (acc, it) => {
      const isService = (it as { type?: string }).type === "service";
      return {
        arr: [...acc.arr, isService ? acc.svc : -1],
        svc: isService ? acc.svc + 1 : acc.svc,
      };
    },
    { arr: [], svc: 0 }
  ).arr;

  // Resolve the invoice id for the activity-history table:
  //  - Paid/cancelled tabs → the saved invoice's id.
  //  - Editable tabs that already have a server invoice (walk-in pending, or a
  //    booking-linked invoice created on first add) → meta.invoiceId.
  // When no invoice exists yet (brand-new draft), there's no history to show.
  const activityInvoiceId =
    (showSaved && savedInvoice?.id) ||
    (activeTabId ? tabMeta[activeTabId]?.invoiceId : undefined) ||
    savedInvoice?.id ||
    null;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Inline success banner — shown for ~6s after a successful checkout.
          Non-blocking (replaces the old alert). Clearly identifies WHICH
          order was paid so the cashier doesn't think all orders were paid. */}
      {paidSuccess && (
        <div className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-emerald-800">
              Đã thanh toán thành công hóa đơn {paidSuccess.invoiceCode}
            </p>
            <p className="mt-0.5 text-emerald-700">
              {paidSuccess.syncedBooking
                ? `Đơn hàng ${paidSuccess.bookingCode || ""} đã được thanh toán. Cột "Thanh toán" → Đã thanh toán, cột "Trạng thái" → Đã Checkout.`
                : "Hóa đơn đã được lưu vào Lịch sử đơn hàng."}
            </p>
            <p className="mt-0.5 text-xs text-emerald-600">
              Chỉ đơn hàng này được thanh toán. Các đơn hàng khác không bị ảnh hưởng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPaidSuccess(null)}
            className="shrink-0 rounded p-1 text-emerald-600 hover:bg-emerald-100"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Invoice table header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-x-1 border-b bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
        <div>Tên</div>
        <div className="text-center">Số lượng</div>
        <div className="text-center">Đơn giá</div>
        <div className="text-center">Giảm giá</div>
        <div className="text-right">Thành tiền</div>
      </div>

      {/* Invoice items */}
      <div className="flex-1 overflow-y-auto">
        {displayItems.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <p className="text-sm">Chưa có mặt hàng nào</p>
          </div>
        ) : (
          <div className="divide-y">
            {displayItems.map((item, idx) => (
              <div
                key={item.id || idx}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-x-1 px-4 py-2 text-sm"
              >
                <div>
                  {/* Multi-customer "Cùng lịch" booking (Cashier module only):
                      each service line shows 3 lines —
                        line 1: customer name + phone (or "Khách vãng lai"
                                when the slot has no name/phone or is marked
                                walkin)
                        line 2: service name
                        line 3: staff name
                      The per-slot customer is looked up from the booking's
                      [[MULTI]] note by a service-only index (products/packages
                      are skipped — they have no slot). */}
                  {isMultiCustomerBooking && itemSlotIndices[idx] >= 0 &&
                    (() => {
                      const sc: SlotCustomer | undefined =
                        activeMultiNote?.slots[itemSlotIndices[idx]];
                      const isWalkin = !sc || sc.walkin;
                      const label = isWalkin
                        ? "Khách vãng lai"
                        : `${sc!.name}${sc!.phone ? " " + sc!.phone : ""}`;
                      // Walk-in slots have no customer profile → plain text.
                      // Named slots are green clickable links to the history dialog.
                      if (isWalkin || !sc?.id) {
                        return (
                          <p className="text-[11px] text-gray-600 leading-tight">
                            {label}
                          </p>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryCustomer({
                              id: sc.id,
                              name: sc.name,
                              phone: sc.phone || null,
                            })
                          }
                          className="text-[11px] text-emerald-600 hover:text-emerald-700 hover:underline leading-tight cursor-pointer text-left"
                          title="Xem lịch sử khách hàng"
                        >
                          {label}
                        </button>
                      );
                    })()}
                  {/* Service name 12px + leading-tight to reduce the name slot's
                      line/row height. Staff name 11px, also leading-tight. */}
                  <p className="font-medium text-gray-900 text-xs leading-tight">{item.name}</p>
                  {editableDisplay ? (
                    <div className="flex items-center gap-1 leading-tight">
                      {/* Small square button — clicking opens a per-item staff
                          picker. Visible for ALL item types (service/product/
                          package). Pre-fills with the current staff's id (if
                          any). OK is required (disabled until a staff is
                          picked). */}
                      <button
                        type="button"
                        onClick={() => {
                          // Pre-fill with the current staff's id (lookup by
                          // name in the eligible branch staff list). When no
                          // staff is assigned yet, leave the picker empty so
                          // the cashier MUST pick one (OK disabled).
                          const current = (eligibleBranchStaff || []).find(
                            (s) => s.name === item.staffName
                          );
                          setChangeStaffPickStaffId(current?.id || "");
                          setChangeStaffItemId(item.id);
                          setChangeStaffError("");
                        }}
                        title={
                          item.staffName
                            ? `Đổi nhân viên (hiện: ${item.staffName})`
                            : "Chọn nhân viên cho mặt hàng này"
                        }
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-yellow-400 bg-yellow-400 text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                      >
                        <UserCog className="h-3 w-3" />
                      </button>
                      <p className="text-[11px] text-yellow-600">
                        {item.staffName ? `Nv: ${item.staffName}` : "Nv: (chưa có)"}
                      </p>
                    </div>
                  ) : (
                    item.staffName && (
                      <p className="text-[11px] text-yellow-600 leading-tight">
                        Nv: {item.staffName}
                      </p>
                    )
                  )}
                </div>
                <div className="flex items-center justify-center">
                  {/* Quantity: +/- buttons removed per request; value 14px → 13px. */}
                  <span className="text-center text-[13px] text-gray-700">
                    {item.quantity}
                  </span>
                </div>
                <div className="text-center text-[13px] text-gray-600">
                  {item.price.toLocaleString("vi-VN")}
                </div>
                <div className="flex items-center justify-center gap-1">
                  {/* All item types (service/product/package) can be manually
                      discounted with either đ (VND) or % (PERCENT) — matching
                      the product behavior. Previously only products had the
                      editable discount input; services/packages showed a
                      read-only value. Now the cashier can apply per-line
                      discounts to services and packages too. */}
                  {editableDisplay ? (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        // For PERCENT, cap at 100; for VND, no hard cap (the
                        // store clamps to price*qty anyway).
                        max={item.discountType === "PERCENT" ? 100 : undefined}
                        step={item.discountType === "PERCENT" ? 1 : 1000}
                        value={
                          itemDiscountDrafts[item.id] !== undefined
                            ? itemDiscountDrafts[item.id]
                            : String(item.discount || "")
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setItemDiscountDrafts((prev) => ({
                            ...prev,
                            [item.id]: raw,
                          }));
                          // Commit live when it's a valid number so the total
                          // updates as the user types. Empty string → 0.
                          const num = Number(raw);
                          if (raw === "" || !isNaN(num)) {
                            updateInvoiceItemDiscount(
                              activeTabId,
                              item.id,
                              raw === "" ? 0 : Math.max(0, num),
                              item.discountType || "VND"
                            );
                          }
                        }}
                        onBlur={() => {
                          // Drop the draft on blur — the committed value is
                          // already in the store; next render reads from it.
                          setItemDiscountDrafts((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                        className="h-7 w-16 rounded border border-gray-300 px-1 text-center text-[11px] text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="0"
                      />
                      <select
                        value={item.discountType || "VND"}
                        onChange={(e) => {
                          const nextType = e.target.value as "VND" | "PERCENT";
                          // Keep the same numeric value but switch unit; the
                          // store recomputes the total with the new type.
                          updateInvoiceItemDiscount(
                            activeTabId,
                            item.id,
                            item.discount || 0,
                            nextType
                          );
                        }}
                        className="h-7 rounded border border-gray-300 bg-white px-1 text-[11px] text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        title="Đơn vị giảm giá: đ (số tiền) hoặc % (phần trăm)"
                      >
                        <option value="VND">đ</option>
                        <option value="PERCENT">%</option>
                      </select>
                    </>
                  ) : (
                    <span className="text-[13px] text-gray-600">
                      {item.discount.toLocaleString("vi-VN")}
                      {item.discountType === "PERCENT" ? "%" : "đ"}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="font-medium text-gray-900 text-[13px]">
                    {item.total.toLocaleString("vi-VN")}
                  </span>
                  {editableDisplay && (
                    <button
                      onClick={async () => {
                        // Remove from the local invoice store (instant UI
                        // feedback). For SERVICE items that belong to a booking,
                        // ALSO sync the deletion to Supabase so the booking's
                        // services array stays in sync. Without this, reopening
                        // the tab would rebuild the service list from the
                        // booking's (still-2-service) array — making the
                        // deleted service reappear.
                        //
                        // If the deleted service was the LAST service on the
                        // booking, DELETE the booking entirely — "không có dịch
                        // vụ được hẹn thì lấy đâu ra lịch hẹn" (no services =
                        // no booking). This removes it from Lịch hẹn (all 3
                        // views: View khách hàng list, View khách hàng khung
                        // giờ, View nhân viên).
                        removeInvoiceItem(activeTabId, item.id);
                        if (item.type === "service" && activeTabId) {
                          const meta = tabMeta[activeTabId];
                          if (meta?.bookingId) {
                            const staffName = item.staffName;
                            try {
                              // Fetch the CURRENT booking's services directly
                              // from Supabase. We used to fetch ALL the customer's
                              // bookings then `.find()` the matching one — but
                              // when the customer_id was empty/walkin-synthetic,
                              // that returned ALL 54 bookings, and if the
                              // bookingId was stale, the find could match the
                              // WRONG booking (deleting another tab's booking).
                              // Fetching the single booking by id is precise.
                              const bookingRes = await fetch(
                                `/api/supabase/bookings/${encodeURIComponent(meta.bookingId)}`
                              );
                              const bookingJson = await bookingRes.json();
                              const currentBooking = bookingJson.ok ? bookingJson.data : null;
                              if (currentBooking?.services) {
                                // Build the new services array: drop the entry
                                // matching (service_id + staffName).
                                const updatedServices = currentBooking.services
                                  .filter((s: { service?: { id?: string } | null; staff?: { name?: string } | null; staff_id?: string | null }) => {
                                    if (s.service?.id !== item.itemId) return true;
                                    if (staffName && s.staff?.name && s.staff.name !== staffName) return true;
                                    return false;
                                  })
                                  .map((s: { service_id: string; staff_id: string | null; service_category_id?: string | null }) => ({
                                    service_id: s.service_id,
                                    staff_id: s.staff_id || "",
                                    service_category_id: s.service_category_id || null,
                                  }));

                                if (updatedServices.length === 0) {
                                  // Last service removed → DELETE the booking.
                                  // A booking with no services has no purpose
                                  // (no slot to show in Lịch hẹn). This also
                                  // cascades to delete booking_services rows
                                  // (ON DELETE CASCADE) and any linked pending
                                  // invoice.
                                  await fetch(`/api/supabase/bookings/${meta.bookingId}`, {
                                    method: "DELETE",
                                  });
                                  // Reset the tab's booking metadata so the
                                  // tab goes back to "draft" state — the next
                                  // service add will create a NEW booking.
                                  updateTabMeta(activeTabId, {
                                    bookingCreated: false,
                                    bookingId: undefined,
                                    bookingCode: undefined,
                                    bookingServices: [],
                                    lastServiceStartMs: undefined,
                                    lastServiceEndMs: undefined,
                                  });
                                } else {
                                  // Still have services → PUT the updated array.
                                  await fetch(`/api/supabase/bookings/${meta.bookingId}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ services: updatedServices }),
                                  });
                                  updateTabMeta(activeTabId, {
                                    bookingServices: updatedServices,
                                  });
                                }
                                // Invalidate all queries so both the cashier
                                // sidebar and the Lịch hẹn module (all 3 views)
                                // refresh immediately.
                                queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
                                queryClient.invalidateQueries({ queryKey: ["supabase-orders"] });
                                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                              }
                            } catch {
                              // Best-effort sync — the local removal already
                              // happened, so the UI is correct for this session.
                            }
                          }
                        }
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photo upload — shown for ALL booking statuses (checkin + checkout)
            as well as manual customer tabs. For checkin/manual tabs without an
            invoice yet, photos are held in local state and POSTed at checkout.
            For paid (checkout) tabs, they are loaded from the saved invoice and
            persisted via PUT /api/supabase/invoices/:id.
            Gated by upload_photo permission. */}
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center gap-3">
            {canUploadPhoto && (
              <label className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
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
            {displayPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const checkboxes = document.querySelectorAll('.cashier-photo-checkbox');
                  const allChecked = Array.from(checkboxes).every((c) => (c as HTMLInputElement).checked);
                  checkboxes.forEach((c) => ((c as HTMLInputElement).checked = !allChecked));
                }}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <CheckSquare className="h-4 w-4" />
                Chọn tất cả
              </button>
            )}
          </div>
          {displayPhotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {displayPhotos.map((src, idx) => (
                <div
                  key={idx}
                  className="relative h-10 w-10 overflow-hidden rounded border"
                >
                  <input
                    type="checkbox"
                    className="cashier-photo-checkbox absolute left-0.5 top-0.5 z-10 h-3 w-3"
                  />
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
                  {(!isPaid || canDeletePastPhotos) && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute right-0 top-0 inline-flex h-3 w-3 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label="Xóa ảnh"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 p-4">
        {/* Totals */}
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Thành tiền</span>
            <span className="font-medium">
              {displaySubtotal.toLocaleString("vi-VN")}
            </span>
          </div>
          {/* Chương trình khuyến mãi — editable Select in draft mode (gated by
              invoice_discount); read-only text for paid/non-editable orders. */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Chương trình khuyến mãi</span>
            {editableDisplay ? (
              <div className="flex items-center gap-2">
                <Select
                  value={selectedPromoId || "none"}
                  onValueChange={(v) => handlePromoSelect(v === "none" ? "" : v)}
                  disabled={!canUsePromotion}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder={canUsePromotion ? "Không áp dụng" : "Không có quyền"} />
                  </SelectTrigger>
                  {canUsePromotion && (
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Không áp dụng</SelectItem>
                      {promotions.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} ({p.discountValue}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  )}
                </Select>
                {canUsePromotion && (
                  <Input
                    type="number"
                    value={discountInput}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    placeholder="0"
                    className="h-8 w-24 text-right"
                  />
                )}
              </div>
            ) : (
              <span className="font-medium text-gray-900 text-right">
                {displayPromo
                  ? displayDiscount > 0
                    ? `${displayPromo.name} (−${displayDiscount.toLocaleString("vi-VN")})`
                    : displayPromo.name
                  : "—"}
              </span>
            )}
          </div>
          {/* Thường (thưởng thợ) — editable input in draft mode; read-only text
              for paid/non-editable orders. */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Thường (thưởng thợ)</span>
            {editableDisplay ? (
              <div className="w-32">
                <Input
                  type="number"
                  value={tipInput}
                  onChange={(e) => handleTipChange(e.target.value)}
                  placeholder="0"
                  className="h-8 text-right"
                  aria-label="Tiền thưởng cho thợ"
                />
              </div>
            ) : (
              <span className="font-medium text-gray-900">
                {displayTip > 0 ? `+${displayTip.toLocaleString("vi-VN")}` : "—"}
              </span>
            )}
          </div>
          {/* Phương thức thanh toán — shown in review mode (after pressing
              "Thanh toán") and for paid orders. Lets the cashier pick
              "Tiền mặt" (cash) or "Chuyển khoản" (transfer). In review mode
              the choice is editable; for paid orders it's read-only (shows
              what was recorded). */}
          {(reviewMode || isPaid) && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Phương thức thanh toán</span>
              {reviewMode ? (
                <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      paymentMethod === "cash"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Tiền mặt
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("transfer")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      paymentMethod === "transfer"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Chuyển khoản
                  </button>
                </div>
              ) : (
                <span className="font-medium text-gray-900">
                  {savedInvoice?.payment_method === "transfer"
                    ? "Chuyển khoản"
                    : "Tiền mặt"}
                </span>
              )}
            </div>
          )}
          <div className="flex justify-between text-sm font-medium">
            <span>Tổng tiền</span>
            <span>{displayTotal.toLocaleString("vi-VN")}</span>
          </div>
          {!isPaid && tip > 0 && (
            <div className="flex justify-between text-sm text-emerald-700">
              <span>Thưởng thợ</span>
              <span className="font-medium">+{tip.toLocaleString("vi-VN")}</span>
            </div>
          )}
        </div>

        {/* Action buttons — hidden once the order is in a terminal state:
            - Paid (checkout): "Hóa đơn đã hoàn tất thanh toán" banner
            - Cancelled / no_show: "Đơn hàng đã hủy" banner (no action buttons)
            - Review mode (after pressing "Thanh toán"): [Hủy][Hoàn tất] only —
              inputs are read-only; "Hủy" returns to the editable unpaid state.
            - Otherwise (editable unpaid): the full action bar with Thanh toán,
              Hủy thanh toán, Xếp nhân viên, etc. */}
        {isCancelled ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <X className="h-4 w-4" />
            Đơn hàng đã hủy
          </div>
        ) : reviewMode ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2">
            <Check className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 mr-auto">
              Xác nhận thanh toán — nhấn "Hoàn tất" để ghi nhận hóa đơn
            </span>
            <button
              onClick={() => exitReview(reviewKey)}
              disabled={checkoutMutation.isPending}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={
                checkoutMutation.isPending ||
                !invoice ||
                invoice.items.length === 0
              }
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {checkoutMutation.isPending ? "Đang lưu..." : "Hoàn tất"}
            </button>
          </div>
        ) : !isPaid && (
          <div className="flex flex-wrap gap-2">
            {canCancelPayment && (
            <button
              onClick={() => {
                if (!activeTabId) return;
                const meta = tabMeta[activeTabId];
                const bookingId = meta?.bookingId;
                // Product-only orders (no booking) are cancelled by creating a
                // cancelled standalone invoice (handled in the mutation).
                const msg = bookingId
                  ? "Bạn có chắc muốn hủy đơn hàng này? Khung giờ sẽ được giải phóng để đặt lịch mới."
                  : "Bạn có chắc muốn hủy đơn hàng này? Đơn sẽ được lưu là đã hủy.";
                if (confirm(msg)) {
                  cancelBookingMutation.mutate();
                }
              }}
              disabled={cancelBookingMutation.isPending}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelBookingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {cancelBookingMutation.isPending ? "Đang hủy..." : "Hủy thanh toán"}
            </button>
            )}
            <button className="flex items-center gap-2 rounded-lg border border-yellow-200 px-4 py-1 text-sm font-medium text-yellow-600 hover:bg-yellow-50">
              <Smile className="h-4 w-4" />
              Mời đánh giá
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50">
              <Printer className="h-4 w-4" />
              In hóa đơn
            </button>
            <button
              onClick={() => handleThanhToan()}
              disabled={
                thanhToanPending ||
                checkoutMutation.isPending ||
                !invoice ||
                invoice.items.length === 0 ||
                !canCheckout ||
                !canCreateInvoice
              }
              title={!canCreateInvoice ? "Bạn không có quyền tạo hóa đơn" : !canCheckout ? "Đơn hàng đã thanh toán hoặc đã hủy" : undefined}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {thanhToanPending || checkoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {thanhToanPending ? "Đang xử lý..." : checkoutMutation.isPending ? "Đang lưu..." : "Thanh toán"}
            </button>
          </div>
        )}
        {isPaid && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Hóa đơn đã hoàn tất thanh toán
            </div>
            {savedInvoice?.id && (
              <button
                onClick={() => setPaidInvoiceOpen(true)}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Xem hóa đơn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Paid invoice view — opened when the cashier clicks "Xem hóa đơn"
          on a paid booking's banner. Shows the full invoice layout. */}
      {paidInvoiceOpen && savedInvoice?.id && (
        <PaidInvoiceView
          invoiceId={savedInvoice.id}
          customerName={activeCustomer?.customerName}
          customerPhone={activeCustomer?.phone}
          bookingCode={paidSuccess?.bookingCode || tabMeta[activeTabId || ""]?.bookingCode || undefined}
          onClose={() => setPaidInvoiceOpen(false)}
        />
      )}

      {/* Photo lightbox — clicking a thumbnail opens the full-size image. */}
      {lightboxPhoto && (
        <Dialog open onOpenChange={(v) => !v && setLightboxPhoto(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
            <img
              src={lightboxPhoto}
              alt="Ảnh hóa đơn"
              className="max-w-[88vw] max-h-[86vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Per-item "Đổi nhân viên" dialog — opened by the small square button
          next to each line item's staff name. Updates ONLY the one item
          identified by `changeStaffItemId`. REQUIRED — OK disabled until a
          staff is picked (no "Không chọn" option). On confirm, runs a staff
          conflict check: if the new staff is already booked at this item's
          date/time (excluding this tab's own booking), the change is BLOCKED
          with a detailed conflict message (service + time). */}
      <Dialog
        open={!!changeStaffItemId}
        onOpenChange={(v) => {
          if (!v) {
            setChangeStaffItemId(null);
            setChangeStaffPickStaffId("");
            setChangeStaffError("");
          }
        }}
      >
        <DialogContent className="max-w-[380px] sm:max-w-[380px] p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm">Đổi nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              Chọn nhân viên cho mặt hàng này. Bắt buộc.
            </p>
            <Select
              value={changeStaffPickStaffId}
              onValueChange={(v) => {
                setChangeStaffPickStaffId(v);
                setChangeStaffError("");
              }}
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {(eligibleBranchStaff || []).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    Không có nhân viên ở cửa hàng này
                  </div>
                ) : (
                  (eligibleBranchStaff || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!changeStaffPickStaffId && (
              <p className="text-[11px] text-red-500">Vui lòng chọn nhân viên</p>
            )}
            {changeStaffError && (
              <div className="whitespace-pre-line mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {changeStaffError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChangeStaffItemId(null);
                setChangeStaffPickStaffId("");
                setChangeStaffError("");
              }}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={!changeStaffPickStaffId || !activeTabId || !changeStaffItemId || changeStaffChecking}
              title={!changeStaffPickStaffId ? "Vui lòng chọn nhân viên" : undefined}
              onClick={async () => {
                if (!activeTabId || !changeStaffItemId) return;
                const newStaffId = changeStaffPickStaffId;
                const newStaffName =
                  (eligibleBranchStaff || []).find(
                    (s) => s.id === newStaffId
                  )?.name || "";
                if (!newStaffName) return; // safety — OK is disabled in this case

                // Find the line item being edited so we can read its date/time
                // (for the conflict check) and its name (for the error message).
                const currentItem = invoice?.items.find(
                  (it) => it.id === changeStaffItemId
                );
                // Conflict check: ONLY for items that have a scheduled date +
                // time (services/packages linked to a booking). Products have
                // no date/time → no conflict possible → skip the check.
                if (currentItem?.date && currentItem?.time && currentItem?.itemId) {
                  const meta = tabMeta[activeTabId];
                  const ownBookingId = meta?.bookingId || "";
                  // Parse the item's date "DD/MM/YYYY" + time "HH:MM" into the
                  // VN wall-clock epoch (using the +07:00 offset so the epoch
                  // matches how the API stores date_time).
                  const dm = currentItem.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                  const tm = currentItem.time.match(/^(\d{1,2}):(\d{2})$/);
                  if (dm && tm) {
                    const isoDay = `${dm[3]}-${dm[2]}-${dm[1]}`;
                    const newStartMs = new Date(
                      `${isoDay}T${tm[1].padStart(2, "0")}:${tm[2]}:00+07:00`
                    ).getTime();
                    if (!isNaN(newStartMs)) {
                      // Fetch the service's duration so we know [start, end].
                      // The invoice item doesn't carry duration; query the
                      // day's bookings (already fetched) and find the matching
                      // service by id, OR just use 60 min as a fallback.
                      let durationMin = 60;
                      try {
                        const svcRes = await fetch(
                          `/api/supabase/services?limit=200`
                        );
                        const svcJson = await svcRes.json();
                        const svcRow = (svcJson.data || []).find(
                          (s: { id: string }) => s.id === currentItem.itemId
                        );
                        if (svcRow?.duration) durationMin = Number(svcRow.duration) || 60;
                      } catch {
                        /* best-effort — default 60 min */
                      }
                      const newEndMs = newStartMs + durationMin * 60 * 1000;

                      // Fetch the day's bookings for the branch + check if the
                      // NEW staff is busy during [newStart, newEnd]. Exclude
                      // this tab's own booking (the item's current booking).
                      setChangeStaffChecking(true);
                      try {
                        const params = new URLSearchParams();
                        params.set("page", "1");
                        params.set("limit", "200");
                        const dl = localDayToUtcRange(isoDay);
                        params.set("date_from", dl.from);
                        params.set("date_to", dl.to);
                        if (selectedBranchId && selectedBranchId !== "all") {
                          params.set("branch_id", selectedBranchId);
                        }
                        const cfRes = await fetch(
                          `/api/supabase/bookings?${params.toString()}`
                        );
                        const cfJson = await cfRes.json();
                        if (cfJson.ok) {
                          const exList = (cfJson.data || []) as Array<Record<string, unknown>>;
                          for (const ex of exList) {
                            if (ex.status === "cancelled" || ex.status === "no_show") continue;
                            // Exclude this tab's own booking.
                            if (ownBookingId && ex.id === ownBookingId) continue;
                            const exStart = new Date(String(ex.date_time || "")).getTime();
                            if (isNaN(exStart)) continue;
                            const exServices = (ex.services || []) as Array<{
                              staff_id?: string | null;
                              staff?: { name?: string } | null;
                              service?: { duration?: number; name?: string } | null;
                            }>;
                            for (const exSvc of exServices) {
                              if (exSvc.staff_id !== newStaffId) continue;
                              const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                              const exEnd = exStart + exDur;
                              if (newStartMs < exEnd && exStart < newEndMs) {
                                // CONFLICT — the new staff is already booked.
                                // Block the change and show a detailed message.
                                const conflictStaffName = exSvc.staff?.name || newStaffName;
                                const exSvcName = exSvc.service?.name || "Dịch vụ";
                                const exDurationMin = Math.round(exDur / 60000);
                                const exTimeStr = toVietnamTime(exStart);
                                const exEndTimeStr = toVietnamTime(exEnd);
                                const nsTimeStr = toVietnamTime(newStartMs);
                                const nsEndTimeStr = toVietnamTime(newEndMs);
                                const exDateStr = currentItem.date;
                                const exCode = (ex.code as string) || "";
                                const exCustName = (ex.customer as { name?: string } | null)?.name || "";
                                const exBranchName = (ex.branch as { name?: string } | null)?.name || "";
                                const statusLabel: Record<string, string> = {
                                  pending: "Chờ xác nhận",
                                  confirmed: "Đã xác nhận",
                                  checkin: "Đang phục vụ",
                                  checkout: "Đã thanh toán",
                                  cancelled: "Đã huỷ",
                                  no_show: "Không đến",
                                };
                                const exStatusLabel = ex.status
                                  ? statusLabel[String(ex.status)] || String(ex.status)
                                  : "";
                                const codeLine = exCode ? `Lịch ${exCode}` : "Một lịch đã đặt trước đó";
                                const custLine = exCustName ? `• Khách: ${exCustName}\n` : "";
                                const branchLine = exBranchName ? `• Chi nhánh: ${exBranchName}\n` : "";
                                const statusLine = exStatusLabel ? `• Trạng thái: ${exStatusLabel}\n` : "";
                                setChangeStaffError(
                                  `Không thể đổi nhân viên vì trùng thời gian với một lịch đã đặt trước đó.\n` +
                                  `${codeLine}:\n` +
                                  custLine +
                                  `• Thợ: ${conflictStaffName}\n` +
                                  `• Dịch vụ: ${exSvcName} (${exDurationMin} phút)\n` +
                                  `• Thời gian: ${exTimeStr} - ${exEndTimeStr} ngày ${exDateStr}\n` +
                                  branchLine +
                                  statusLine +
                                  `→ Trùng với mặt hàng "${currentItem.name}" (${nsTimeStr} - ${nsEndTimeStr} ngày ${exDateStr}). ` +
                                  `Vui lòng chọn nhân viên khác.`
                                );
                                setChangeStaffChecking(false);
                                return; // BLOCK — do not change the staff.
                              }
                            }
                          }
                        }
                      } catch {
                        /* best-effort — server still validates */
                      }
                      setChangeStaffChecking(false);
                    }
                  }
                }

                // No conflict (or item has no date/time) → apply the change.
                setInvoiceItemStaff(activeTabId, changeStaffItemId, newStaffName);
                setChangeStaffItemId(null);
                setChangeStaffPickStaffId("");
                setChangeStaffError("");
              }}
            >
              {changeStaffChecking ? "Đang kiểm tra..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer history dialog — opened when clicking a per-slot customer
          name (green link) in a multi-customer booking's invoice summary. */}
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </div>
  );
}