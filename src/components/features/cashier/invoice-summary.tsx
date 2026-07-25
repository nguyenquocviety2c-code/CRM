"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
// Lazy-load PaidInvoiceView — only opened on demand. Customer history now
// navigates to /customers/[id].
const PaidInvoiceView = dynamic(
  () => import("@/components/features/booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);
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
  Minus,
  Plus,
} from "lucide-react";
import { useCashierStore, resolveDiscountAmount } from "@/stores/cashier-store";
import { usePaymentReviewStore, useIsReviewing } from "@/stores/payment-review-store";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";
import { queryKeys } from "@/lib/query-keys";
import { isPromotionActive, isPromotionForBranch } from "@/lib/promotion-utils";
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
import { Label } from "@/components/ui/label";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";
import { parseMultiCustomerNote, type SlotCustomer } from "@/lib/multi-customer";

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
    updateInvoiceItemQuantity,
    removeInvoiceItem,
    setInvoiceItemStaff,
    setAllInvoiceItemsStaff,
    setDiscountAmount,
    setTipAmount,
    setVoucherCode,
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
  const router = useRouter();
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
  // Voucher state — when the cashier types a code in "Nhập mã Voucher" and
  // blurs/presses Enter, we look it up against the incentives table
  // (type=voucher), validate it (active, branch-eligible, within validity,
  // not fully used), and apply its discount to the eligible items (mirroring
  // handlePromoSelect). selectedVoucher holds the resolved voucher object;
  // voucherError holds a human-readable error string when the code is invalid.
  const [selectedVoucher, setSelectedVoucher] = useState<{
    id: string;
    code: string | null;
    name: string;
    discountValue: number;
    discountType: string;
    serviceIds: string | null;
  } | null>(null);
  const [voucherError, setVoucherError] = useState<string>("");

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
      branchIds: string | null;
      applyScope: string | null;
      startDate: string | null;
      endDate: string | null;
      usageLimit: number;
      usedCount: number;
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
  // (endDate in the past), not-yet-started (startDate in the future), fully-used
  // (usedCount >= usageLimit), AND promotions that don't apply to the currently
  // selected branch. Mirrors the Booking module's getActivePromotionsForBooking
  // so both selectors stay consistent and only branch-eligible promos appear.
  const promotions = (promotionsData?.items || []).filter(
    (p) => isPromotionActive(p) && isPromotionForBranch(p, selectedBranchId)
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
  // Bulk "Xếp nhân viên" dialog state (action-bar button). Opens a dialog where
  // the cashier picks ONE staff; on confirm, that staff is assigned to EVERY
  // line item in the current invoice (services + products + packages). This is
  // a bulk operation — it does NOT run the per-item conflict check (the cashier
  // explicitly chooses to assign the whole order to one staff). OK is disabled
  // until a staff is picked; Cancel closes without changing anything.
  const [assignAllStaffOpen, setAssignAllStaffOpen] = useState(false);
  const [assignAllStaffPickStaffId, setAssignAllStaffPickStaffId] = useState<string>("");
  // Payment confirmation dialog state. When the cashier clicks the action-bar
  // "Thanh toán" button, this dialog opens FIRST (instead of immediately
  // entering review mode). The dialog shows the amount due, one or more
  // PAYMENT ROWS (each row = Phương thức + Số tiền on the SAME line), and a
  // notes field. (The "Mã hóa đơn" field was removed per request — the system
  // auto-generates the real code.) Only when the cashier clicks "Thanh toán"
  // INSIDE this dialog does the actual `handleThanhToan()` run (which auto-
  // checkins the booking, creates a pending invoice, and enters the "chờ bấm
  // Hoàn tất" review state). "Hủy" closes the dialog without changing
  // anything. This matches the reference mockup: a 2-step payment flow where
  // the first click opens the form and the second click (inside the dialog)
  // confirms.
  //
  // Multi-row payment: the dialog starts with ONE payment row. A small square
  // [+] button next to the row lets the cashier add a SECOND row. Because there
  // are only 2 payment methods (cash / transfer), the second row's method is
  // LOCKED to the opposite of the first row's (if row 1 = Tiền mặt, row 2 =
  // Chuyển khoản, and vice versa). So at most 2 rows exist. The [+] button is
  // hidden once 2 rows exist; a [×] remove button appears on row 2 to drop it.
  // Amount entry: BOTH rows are EDITABLE — the cashier types each amount
  // manually. Row 1 starts pre-filled with the full invoice total (so a
  // single-method payment needs no editing); when the cashier clicks [+] to
  // add row 2, row 2 starts EMPTY (NO auto-split — the cashier types both
  // amounts themselves). A small hint shows the sum vs amount due.
  type PayRow = { method: "cash" | "transfer"; amount: string };
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [payConfirmRows, setPayConfirmRows] = useState<PayRow[]>([
    { method: "cash", amount: "" },
  ]);
  const [payConfirmNote, setPayConfirmNote] = useState("");

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
  // For "product" promos, match against product items by their itemId.
  // Used by handlePromoSelect to apply the promo per-line to the right items.
  const isItemPromoEligible = (
    item: { itemId: string; type?: string },
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
  // ELIGIBLE line. For service/service_category promos, only service + package
  // items are eligible (products excluded). For "product" promos, only PRODUCT
  // items are eligible (services excluded) — this previously silently failed
  // because product items were filtered out entirely.
  // The promo lives per-item so the line "Thành tiền" and footer totals update
  // live; the invoice-level discountAmount is cleared to avoid any
  // double-counting. Clearing the promo resets every line to 0.
  const handlePromoSelect = (promoId: string) => {
    setSelectedPromoId(promoId);
    if (!activeTabId) return;
    const invoice = invoices[activeTabId];
    if (!invoice) return;
    const isProductPromo = (p: { discountType: string }) => p.discountType === "product";
    // For product promos, target PRODUCT items; otherwise target services + packages.
    const targetItems = invoice.items.filter((it) =>
      isProductPromo(promotions.find((p) => p.id === promoId) || { discountType: "" })
        ? it.type === "product"
        : it.type !== "product"
    );
    if (promoId === "") {
      // "Không áp dụng" — clear all per-line discounts on the targeted item types.
      targetItems.forEach((it) =>
        updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND")
      );
      setDiscountInput("");
      setDiscountAmount(activeTabId, 0);
      return;
    }
    const promo = promotions.find((p) => p.id === promoId);
    if (!promo) return;
    // A promotion and a voucher are mutually exclusive — selecting a promo
    // clears any applied voucher (and its discount) to avoid double-discount.
    if (selectedVoucher) {
      clearVoucherDiscount();
      setSelectedVoucher(null);
      setVoucherError("");
    }
    const pct = Number(promo.discountValue) || 0;
    const eligible = targetItems.filter((it) => isItemPromoEligible(it, promo));
    if (pct <= 0 || eligible.length === 0) {
      // No eligible item for this promo — don't apply it.
      const msg = isProductPromo(promo)
        ? "Chương trình khuyến mãi không được áp dụng cho sản phẩm hiện tại"
        : "Chương trình khuyến mãi không được áp dụng cho dịch vụ hiện tại";
      alert(msg);
      setSelectedPromoId("");
      targetItems.forEach((it) =>
        updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND")
      );
      setDiscountInput("");
      setDiscountAmount(activeTabId, 0);
      return;
    }
    // Apply the promo share to each eligible line (VND amount so the Giảm giá
    // column shows a tiền amount); reset non-eligible targeted items to 0.
    targetItems.forEach((it) => {
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

  // Apply a voucher by its code. Looks up the voucher in the incentives table
  // (type=voucher), validates it (active, branch-eligible, within validity
  // window, not fully used), then applies its discount to eligible items —
  // mirroring handlePromoSelect but for vouchers. On any validation failure,
  // clears the voucher + shows a human-readable error so the cashier knows why
  // the code was rejected. A voucher and a promotion are mutually exclusive:
  // applying a voucher clears any selected promotion (and vice versa) to avoid
  // double-discounting.
  const handleVoucherApply = async (code: string) => {
    setVoucherError("");
    const trimmed = code.trim();
    if (!trimmed) {
      // Empty code → clear any previously-applied voucher discount.
      if (selectedVoucher && activeTabId) {
        clearVoucherDiscount();
      }
      setSelectedVoucher(null);
      return;
    }
    if (!activeTabId) return;
    try {
      // Fetch vouchers matching the code (case-insensitive search via the
      // API's `search` param, which matches name OR code with ilike).
      const res = await fetch(
        `/api/supabase/incentives?type=voucher&search=${encodeURIComponent(trimmed)}&limit=50`
      );
      const json = await res.json();
      const candidates = (json.data?.items || []) as Array<{
        id: string;
        code: string | null;
        name: string;
        discountValue: number;
        discountType: string;
        serviceIds: string | null;
        branchIds: string | null;
        startDate: string | null;
        endDate: string | null;
        usageLimit: number;
        usedCount: number;
      }>;
      // Find an exact (case-insensitive) code match — the search param is a
      // fuzzy ilike on name+code, so we must filter client-side for exactness.
      const voucher = candidates.find(
        (v) => v.code && v.code.toLowerCase() === trimmed.toLowerCase()
      );
      if (!voucher) {
        setVoucherError("Mã voucher không tồn tại");
        if (selectedVoucher) clearVoucherDiscount();
        setSelectedVoucher(null);
        return;
      }
      // Validate: active (date + usage).
      if (!isPromotionActive(voucher)) {
        setVoucherError("Voucher đã hết hạn hoặc hết lượt sử dụng");
        if (selectedVoucher) clearVoucherDiscount();
        setSelectedVoucher(null);
        return;
      }
      // Validate: branch-eligible.
      if (!isPromotionForBranch(voucher, selectedBranchId)) {
        setVoucherError("Voucher không áp dụng cho chi nhánh này");
        if (selectedVoucher) clearVoucherDiscount();
        setSelectedVoucher(null);
        return;
      }
      // Valid → apply the discount to eligible items. Mutually exclusive with
      // a selected promotion: clear any promo first to avoid double-discount.
      if (selectedPromoId) {
        handlePromoSelect("");
      }
      setSelectedVoucher(voucher);
      const isProductVoucher = voucher.discountType === "product";
      const invoice = invoices[activeTabId];
      const targetItems = invoice.items.filter((it) =>
        isProductVoucher ? it.type === "product" : it.type !== "product"
      );
      const pct = Number(voucher.discountValue) || 0;
      const eligible = targetItems.filter((it) =>
        isItemPromoEligible(it, voucher)
      );
      if (pct <= 0 || eligible.length === 0) {
        setVoucherError(
          isProductVoucher
            ? "Voucher không được áp dụng cho sản phẩm hiện tại"
            : "Voucher không được áp dụng cho dịch vụ hiện tại"
        );
        return;
      }
      targetItems.forEach((it) => {
        if (isItemPromoEligible(it, voucher)) {
          const share = Math.round((it.price * it.quantity * pct) / 100);
          updateInvoiceItemDiscount(activeTabId, it.id, share, "VND");
        } else {
          updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND");
        }
      });
      setDiscountInput("");
      setDiscountAmount(activeTabId, 0);
    } catch {
      setVoucherError("Không thể kiểm tra mã voucher");
    }
  };

  // Clear all per-line discounts that were applied by the current voucher.
  // Used when the voucher code is emptied or replaced. Targets the same item
  // types the voucher applied to (products for product vouchers, services+
  // packages otherwise) and resets their discount to 0.
  const clearVoucherDiscount = () => {
    if (!activeTabId || !selectedVoucher) return;
    const isProductVoucher = selectedVoucher.discountType === "product";
    const invoice = invoices[activeTabId];
    const targetItems = invoice.items.filter((it) =>
      isProductVoucher ? it.type === "product" : it.type !== "product"
    );
    targetItems.forEach((it) =>
      updateInvoiceItemDiscount(activeTabId, it.id, 0, "VND")
    );
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
      // 1. Auto-checkin the booking. FIRST fetch the booking's CURRENT status
      //    + date_time so we can detect the "Đã xác nhận → pay directly" case:
      //    when the booking was "confirmed" (NOT yet checked in), the checkin
      //    activity should be backdated to the booking's date_time (the service
      //    registration time) per the user's request. Then PATCH → "checkin".
      //    The PATCH is idempotent (if already checkin, it stays checkin).
      let checkinAt: string | null = null;
      if (bookingId) {
        try {
          // Read the booking's current status + date_time BEFORE patching, so
          // we know whether this is a "direct pay from confirmed" case.
          const getRes = await fetch(
            `/api/supabase/bookings/${encodeURIComponent(bookingId)}`
          );
          const getJson = await getRes.json();
          if (getJson.ok && getJson.data) {
            const b = getJson.data as { status?: string; date_time?: string };
            if (b.status === "confirmed" && b.date_time) {
              // Confirmed, NOT yet checked in → the checkin activity will be
              // backdated to the booking's date_time (registration time).
              checkinAt = b.date_time;
            }
          }
        } catch {
          // best-effort — if the GET fails, checkinAt stays null (defaults to now)
        }
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
      //    Payment dialog (review mode synced). SKIP when the customer_id would
      //    be a synthetic "walkin-" id (not a real UUID) — the invoices API
      //    requires a valid customer_id UUID, and the real customer is created
      //    at checkout (checkoutMutation) anyway. This is best-effort (the
      //    pending invoice is only for the Booking module's preview); skipping
      //    it here avoids the "invalid input syntax for type uuid" error.
      if (bookingId && !meta?.invoiceId) {
        try {
          const realCustomerId = meta?.customerId || activeCustomer?.customerId || "";
          if (!realCustomerId || realCustomerId.startsWith("walkin-")) {
            // Synthetic id — skip the pending-invoice preview. The real
            // customer + completed invoice are created at checkout
            // (checkoutMutation handles customer creation for synthetic ids).
          } else {
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
                // Pass the backdated checkin timestamp when this is a "direct
                // pay from confirmed" case (booking was "confirmed", not yet
                // checked in). The server uses it for the CHECKIN activity's
                // created_at so the history shows the checkin at the booking's
                // date_time (service registration time). Null/omitted → now().
                checkin_at: checkinAt || undefined,
              }),
            });
            const json = await res.json();
            if (json.ok && json.data?.id) {
              updateTabMeta(activeTabId, { invoiceId: json.data.id });
            }
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
      // the invoices API increments the promotion's used_count on save. The
      // discountAmount is the SUM of the per-line promo discounts applied to
      // eligible items (computed from each item's discount field via
      // resolveDiscountAmount) — NOT invoice.discountAmount, which
      // handlePromoSelect clears to 0. This ensures the saved invoice's
      // promotion.discountAmount is correct so cashier/invoices, activity, and
      // customer-history display "PromoName (−<actual>đ)" instead of "(−0đ)".
      const promoDiscountSum = selectedPromo
        ? invoice.items
            .filter((it) => isItemPromoEligible(it, selectedPromo))
            .reduce((sum, it) => sum + resolveDiscountAmount(it), 0)
        : 0;
      // Compute the voucher discount sum (same per-line approach as the
      // promotion sum) when a voucher is applied instead of a promotion.
      const voucherDiscountSum = selectedVoucher
        ? invoice.items
            .filter((it) => isItemPromoEligible(it, selectedVoucher))
            .reduce((sum, it) => sum + resolveDiscountAmount(it), 0)
        : 0;
      // Build promotion metadata (matches the booking invoice dialog shape) so
      // the invoices API increments the incentive's used_count on save. When a
      // voucher is applied (no promotion), send the voucher as the "promotion"
      // meta — the API only needs the id to increment used_count, and both
      // promotions and vouchers live in the same `incentives` table. A voucher
      // and a promotion are mutually exclusive, so only one is ever non-null.
      const promotionMeta = selectedPromo
        ? {
            id: selectedPromo.id,
            code: selectedPromo.code || "",
            name: selectedPromo.name,
            discountValue: selectedPromo.discountValue,
            discountAmount: promoDiscountSum,
          }
        : selectedVoucher
        ? {
            id: selectedVoucher.id,
            code: selectedVoucher.code || "",
            name: selectedVoucher.name,
            discountValue: selectedVoucher.discountValue,
            discountAmount: voucherDiscountSum,
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

      // Ensure realCustomerId is a VALID UUID before building the invoice
      // payload. Walk-in / new tabs use a SYNTHETIC tab id ("walkin-<uuid>") as
      // the activeCustomer.customerId — that's NOT a real customer and NOT a
      // valid UUID, so it can't be sent as `customer_id` (Postgres rejects it
      // with "invalid input syntax for type uuid"). A real customer is
      // normally created lazily when a SERVICE is added (createBookingForTab
      // creates the customer + sets meta.customerId). But several edge cases
      // leave meta.customerId unset with a synthetic activeCustomer.customerId:
      //   - Product-only walk-in tabs (no service → no booking → no customer).
      //   - Walk-in tabs where a service was added WITHOUT a staff (no booking
      //     created → no customer) — e.g. when the cashier lacks assign_staff
      //     permission, or the booking creation failed.
      // In ALL these cases, create a real customer NOW so the invoice has a
      // valid customer_id. This runs whenever realCustomerId is missing or
      // synthetic (starts with "walkin-"), regardless of whether the invoice
      // has services. Tabs that already have a real customer (booking tabs,
      // walk-in tabs linked via search/Thêm-khách-mới) keep their real UUID —
      // the condition is false → no duplicate customer is created.
      const isSyntheticCustomerId =
        !realCustomerId || realCustomerId.startsWith("walkin-");
      if (
        isSyntheticCustomerId &&
        meta &&
        (meta.type === "walkin" || meta.type === "new")
      ) {
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
  // Uses `serviceSlots` from the [[MULTI]] note (stored at booking creation)
  // to map each service → the customer slot that owns it. When serviceSlots
  // is absent (legacy bookings), falls back to a 1:1 service-counter (the old
  // behavior — works only when each customer has exactly 1 service).
  const itemSlotIndices: number[] = displayItems.reduce<{
    arr: number[];
    svc: number;
  }>(
    (acc, it) => {
      const isService = (it as { type?: string }).type === "service";
      if (!isService) {
        return { arr: [...acc.arr, -1], svc: acc.svc };
      }
      // Use serviceSlots if available (maps service index → customer slot index).
      const svcSlots = activeMultiNote?.serviceSlots;
      const slotIdx = svcSlots && acc.svc < svcSlots.length
        ? svcSlots[acc.svc]
        : acc.svc; // fallback: 1:1 (legacy)
      return { arr: [...acc.arr, slotIdx], svc: acc.svc + 1 };
    },
    { arr: [], svc: 0 }
  ).arr;

  // For multi-customer "Cùng lịch" bookings with per-customer slotStatuses,
  // FILTER the display items to only show services whose customer is checked in
  // (status = "checkin" or "checkout"). Services of customers who are still
  // "confirmed", "cancelled", or "no_show" are excluded from the invoice
  // display (and thus from the total). Products/packages are always included.
  const slotStatusesFilter = activeMultiNote?.slotStatuses;
  const filteredDisplayItems = isMultiCustomerBooking && slotStatusesFilter && !showSaved
    ? displayItems.filter((it, idx) => {
        // Non-service items (products/packages) are always included.
        if ((it as { type?: string }).type !== "service") return true;
        const slotIdx = itemSlotIndices[idx];
        if (slotIdx < 0) return true; // no slot mapping → include
        const st = slotStatusesFilter[slotIdx] || "confirmed";
        return st === "checkin" || st === "checkout";
      })
    : displayItems;
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
        {filteredDisplayItems.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <p className="text-sm">Chưa có mặt hàng nào</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredDisplayItems.map((item, idx) => (
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
                            router.push(`/customers/${sc.id}`)
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
                      {/* "Xếp nhân viên" button — clicking opens a per-item
                          staff picker dialog. Visible for ALL item types
                          (service/product/package). The button shows the text
                          "Xếp nhân viên" + a small UserCog icon (no longer an
                          icon-only square) so the cashier immediately sees its
                          purpose. Pre-fills with the current staff's id (if
                          any). OK is required (disabled until a staff is
                          picked). Compact: h-5, text-[10px], tight padding so
                          it fits inline next to the "Nv: <name>" label. */}
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
                            ? `Xếp nhân viên (hiện: ${item.staffName})`
                            : "Xếp nhân viên cho mặt hàng này"
                        }
                        className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-yellow-400 bg-yellow-400 px-1.5 text-[10px] font-medium text-yellow-800 hover:border-yellow-500 hover:bg-yellow-500 hover:text-yellow-900"
                      >
                        <UserCog className="h-2.5 w-2.5" />
                        Xếp nhân viên
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
                  {/* Quantity: +/- controls for ALL item types (service, product,
                      package). When editable, the cashier can increase or
                      decrease the quantity; the store recomputes the line's
                      `total` (price*qty − discount) AND the invoice subtotal /
                      total live on every change. Minimum is 1 — at 1 the
                      minus button is disabled (use the trash button to remove
                      the line entirely). When NOT editable (paid / cancelled /
                      review mode), the quantity is shown read-only. */}
                  {editableDisplay ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateInvoiceItemQuantity(
                            activeTabId!,
                            item.id,
                            Math.max(1, item.quantity - 1)
                          )
                        }
                        disabled={item.quantity <= 1}
                        title="Giảm số lượng"
                        className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[20px] text-center text-[12px] font-medium text-gray-700">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateInvoiceItemQuantity(
                            activeTabId!,
                            item.id,
                            item.quantity + 1
                          )
                        }
                        title="Tăng số lượng"
                        className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-center text-[12px] text-gray-700">
                      {item.quantity}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center text-[12px] text-gray-600">
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
                        // data-slot excludes this input from the global 28px
                        // min-height rule in globals.css (line 195), allowing
                        // the compact h-6 (24px) class to take effect so the
                        // discount input matches the adjacent đ/% select height.
                        data-slot="discount-amount"
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
                        className="h-6 w-16 rounded border border-gray-300 px-1 text-center text-[11px] text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                        className="h-6 rounded border border-gray-300 bg-white px-1 text-[11px] text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        title="Đơn vị giảm giá: đ (số tiền) hoặc % (phần trăm)"
                      >
                        <option value="VND">đ</option>
                        <option value="PERCENT">%</option>
                      </select>
                    </>
                  ) : (
                    <span className="text-[12px] text-gray-600">
                      {item.discount.toLocaleString("vi-VN")}
                      {item.discountType === "PERCENT" ? "%" : "đ"}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 -mr-2">
                  <span className="font-medium text-gray-900 text-[12px]">
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
                      className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Photo attachment section REMOVED per user request. */}
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 p-4">
        {/* Totals — tightened spacing (space-y-1.5 + mb-2) so the gap from
            "Thành tiền" down to the action buttons is noticeably smaller. */}
        <div className="mb-2 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Thành tiền</span>
            <span className="font-medium">
              {displaySubtotal.toLocaleString("vi-VN")}
            </span>
          </div>
          {/* Nhập mã Voucher — editable input in draft mode; read-only text for
              paid/non-editable orders. Sits between "Thành tiền" and
              "Chương trình khuyến mãi" so the cashier can type a voucher code
              (if any) before picking a promotion. On blur or Enter, the code is
              looked up against the incentives table (type=voucher), validated,
              and its discount auto-applied to eligible items. A voucher and a
              promotion are mutually exclusive — applying a voucher clears any
              selected promotion. The code is stored in the invoice's
              voucherCode field (persisted with the tab) and sent with the
              checkout so the voucher's used_count increments. */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Nhập mã Voucher</span>
            {editableDisplay ? (
              <div className="flex flex-col items-end gap-0.5">
                <Input
                  type="text"
                  value={invoice?.voucherCode || ""}
                  onChange={(e) =>
                    setVoucherCode(activeTabId!, e.target.value)
                  }
                  onBlur={(e) => handleVoucherApply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Nhập mã (nếu có)"
                  className="h-7 w-44 text-right"
                  aria-label="Mã voucher"
                />
                {voucherError && (
                  <span className="text-[11px] text-red-500">{voucherError}</span>
                )}
                {selectedVoucher && !voucherError && (
                  <span className="text-[11px] text-emerald-600">
                    ✓ {selectedVoucher.name} (−{selectedVoucher.discountValue}%)
                  </span>
                )}
              </div>
            ) : (
              <span className="font-medium text-gray-900">
                {invoice?.voucherCode || "—"}
              </span>
            )}
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
          {/* NOTE: The "Phương thức thanh toán" row that used to appear here
              (in review mode + for paid orders) was REMOVED per request — the
              payment confirmation dialog now handles method selection (the
              cashier picks Tiền mặt / Chuyển khoản in the dialog before the
              review state is entered), so this inline toggle was redundant.
              The `paymentMethod` state is still set by the dialog and used in
              the checkout payload; only the inline UI display is gone. For
              paid orders, the saved payment_method remains on the server
              (just no longer shown in this summary). */}
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
        ) : checkoutMutation.isPending ? (
          // While the checkout API call is in flight (after pressing "Hoàn
          // tất"), the [Hủy][Hoàn tất] review buttons are HIDDEN and replaced
          // by a non-interactive "Đang xử lý thanh toán..." indicator. This
          // guarantees the cashier can't click Hủy/Hoàn tất again while the
          // order is being finalized. Once the API resolves: on success →
          // isPaid flips true → this branch is skipped → the paid banner
          // (below) shows; on error → isPending false → reviewMode is still
          // true → the [Hủy][Hoàn tất] buttons reappear so the cashier can
          // retry or cancel.
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang xử lý thanh toán...
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
            {/* "Xếp nhân viên" — bulk-assign ONE staff to EVERY line item in the
                current invoice (services + products + packages). Opens a dialog
                where the cashier picks a staff; on confirm, all items get that
                staff's name. Disabled when the invoice is empty (no items to
                assign). Behaves like the other action buttons: only shown for
                editable unpaid orders (the parent `!isPaid && !reviewMode`
                guard already hides it for paid/review/cancelled states). */}
            <button
              onClick={() => {
                setAssignAllStaffPickStaffId("");
                setAssignAllStaffOpen(true);
              }}
              disabled={!invoice || invoice.items.length === 0}
              title={
                !invoice || invoice.items.length === 0
                  ? "Đơn hàng chưa có mặt hàng nào để xếp nhân viên"
                  : "Xếp một nhân viên cho toàn bộ đơn hàng"
              }
              className="flex items-center gap-2 rounded-lg border border-cyan-200 px-4 py-1 text-sm font-medium text-cyan-600 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCog className="h-4 w-4" />
              Xếp nhân viên
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-yellow-200 px-4 py-1 text-sm font-medium text-yellow-600 hover:bg-yellow-50">
              <Smile className="h-4 w-4" />
              Mời đánh giá
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50">
              <Printer className="h-4 w-4" />
              In hóa đơn
            </button>
            <button
              onClick={() => {
                // Open the payment confirmation dialog FIRST. The actual
                // `handleThanhToan()` (which enters the "chờ bấm Hoàn tất"
                // review state) only runs when the cashier clicks "Thanh toán"
                // INSIDE that dialog. Initialize the payment rows with ONE row
                // whose method = the current component-level paymentMethod and
                // whose amount = the full invoice total (so the cashier can
                // just confirm, or split into 2 rows via the [+] button — in
                // which case row 2 starts EMPTY and the cashier types both
                // amounts manually, no auto-split).
                const total = activeTabId ? getInvoiceTotal(activeTabId) : 0;
                setPayConfirmRows([
                  { method: paymentMethod, amount: String(total) },
                ]);
                setPayConfirmNote("");
                setPayConfirmOpen(true);
              }}
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

      {/* Per-item "Xếp nhân viên" dialog — opened by the small square button
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
            <DialogTitle className="text-sm">Xếp nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              Xếp nhân viên cho mặt hàng này. Bắt buộc.
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

      {/* Bulk "Xếp nhân viên" dialog — opened by the action-bar button of the
          same name. The cashier picks ONE staff; on confirm, that staff is
          assigned to EVERY line item in the current invoice (services +
          products + packages). This is a BULK operation: it does NOT run the
          per-item booking-conflict check (the cashier is explicitly choosing
          to assign the whole order to one staff). OK is disabled until a staff
          is picked. Cancel closes without changing anything. Uses the same
          `eligibleBranchStaff` list as the per-item dialog so the options are
          consistent (only stylist-title staff for the selected branch). */}
      <Dialog
        open={assignAllStaffOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAssignAllStaffOpen(false);
            setAssignAllStaffPickStaffId("");
          }
        }}
      >
        <DialogContent className="max-w-[400px] sm:max-w-[400px] p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm">Xếp nhân viên cho toàn bộ đơn</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              Chọn một nhân viên — toàn bộ dịch vụ, sản phẩm và gói dịch vụ
              trong đơn sẽ do nhân viên này thực hiện. Bắt buộc.
            </p>
            <Select
              value={assignAllStaffPickStaffId}
              onValueChange={(v) => setAssignAllStaffPickStaffId(v)}
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
            {!assignAllStaffPickStaffId && (
              <p className="text-[11px] text-red-500">Vui lòng chọn nhân viên</p>
            )}
            {/* Summary of how many items will be updated, so the cashier knows
                the scope of the bulk action before confirming. */}
            {invoice && invoice.items.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                Sẽ áp dụng cho {invoice.items.length} mặt hàng trong đơn.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAssignAllStaffOpen(false);
                setAssignAllStaffPickStaffId("");
              }}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={!assignAllStaffPickStaffId || !activeTabId || !invoice || invoice.items.length === 0}
              title={!assignAllStaffPickStaffId ? "Vui lòng chọn nhân viên" : undefined}
              onClick={() => {
                if (!activeTabId || !invoice || invoice.items.length === 0) return;
                const staffName =
                  (eligibleBranchStaff || []).find(
                    (s) => s.id === assignAllStaffPickStaffId
                  )?.name || "";
                if (!staffName) return; // safety — OK is disabled in this case
                // Bulk-assign the picked staff to EVERY line item in the invoice.
                setAllInvoiceItemsStaff(activeTabId, staffName);
                setAssignAllStaffOpen(false);
                setAssignAllStaffPickStaffId("");
              }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment confirmation dialog — opened by the action-bar "Thanh toán"
          button. Two-step payment flow: the first click opens this dialog
          (instead of immediately entering review mode); the cashier reviews
          the amount due, picks a payment method, can add a note, and only
          when they click "Thanh toán" INSIDE this dialog does the real
          `handleThanhToan()` run (auto-checkin → create pending invoice →
          enter "chờ bấm Hoàn tất" review state). "Hủy" closes the dialog
          with no side effects. Compact layout: "Khách cần thanh toán" amount
          + one or more payment rows (Phương thức + Số tiền on the same line)
          + Ghi chú + Hủy/Thanh toán buttons. The "Mã hóa đơn" field was
          removed per request (the system auto-generates the real code). */}
      <Dialog
        open={payConfirmOpen}
        onOpenChange={(v) => {
          if (!v) {
            setPayConfirmOpen(false);
            setPayConfirmRows([{ method: "cash", amount: "" }]);
            setPayConfirmNote("");
          }
        }}
      >
        <DialogContent className="max-w-[440px] sm:max-w-[440px] p-4 gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm font-semibold text-gray-900">
              Thanh toán
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            {/* Amount due — the invoice total (items − discount + tip). Read-only
                display; reflects live changes if the cashier edited quantities
                before opening the dialog. Compact: small padding, smaller
                amount font so the dialog stays tight. */}
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5">
              <span className="text-xs text-gray-600">Khách cần thanh toán:</span>
              <span className="text-lg font-bold text-gray-900">
                {activeTabId
                  ? getInvoiceTotal(activeTabId).toLocaleString("vi-VN")
                  : "0"}
                <span className="ml-0.5 text-xs font-normal text-gray-500">đ</span>
              </span>
            </div>
            {/* Payment rows — each row has Phương thức + Số tiền on the SAME
                line, plus a small square [+] button (on the last row, when
                fewer than 2 rows exist) to add a second payment row, or a [×]
                button (on row 2) to remove it. Multi-row logic: because there
                are only 2 payment methods (cash / transfer), row 2's method is
                always the OPPOSITE of row 1's — so when the cashier adds a 2nd
                row it auto-locks to the other method, and changing row 1's
                method flips row 2's to match.

                Amount entry: BOTH rows are EDITABLE — the cashier types each
                amount manually. Row 1 starts pre-filled with the full invoice
                total (so a single-method payment needs no editing); when the
                cashier clicks [+] to add row 2, row 2 starts EMPTY (no auto-
                split) and they type both amounts themselves. A small hint
                shows the sum of the two entered amounts vs the amount due so
                the cashier can see if they need to adjust. */}
            {payConfirmRows.map((row, idx) => {
              const isLast = idx === payConfirmRows.length - 1;
              const canAdd = payConfirmRows.length < 2 && isLast;
              const canRemove = payConfirmRows.length === 2 && idx === 1;
              // Row 2's method is the opposite of row 1's. Row 1 shows both
              // options in its Select; row 2's Select is DISABLED (locked) —
              // the cashier changes it by changing row 1.
              const oppositeMethod: "cash" | "transfer" =
                payConfirmRows[0].method === "cash" ? "transfer" : "cash";
              return (
                <div key={idx} className="space-y-1">
                  {idx === 0 && (
                    <Label className="text-[11px] font-medium text-gray-600">
                      Phương thức &amp; Số tiền
                    </Label>
                  )}
                  <div className="flex items-center gap-1.5">
                    {/* Phương thức — row 1 editable, row 2 locked to the
                        opposite method. */}
                    <Select
                      value={idx === 0 ? row.method : oppositeMethod}
                      disabled={idx === 1}
                      onValueChange={(v) => {
                        if (idx !== 0) return; // row 2 is locked
                        const newMethod = v as "cash" | "transfer";
                        setPayConfirmRows((prev) =>
                          prev.map((r, i) =>
                            i === 0
                              ? { ...r, method: newMethod }
                              : i === 1
                                ? { ...r, method: newMethod === "cash" ? "transfer" : "cash" }
                                : r
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue placeholder="Chọn phương thức" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Row 1 shows both options. Row 2 shows ONLY the
                            locked opposite method (the Select is disabled
                            anyway, but this keeps the dropdown honest). */}
                        {idx === 0 ? (
                          <>
                            <SelectItem value="cash">Tiền mặt</SelectItem>
                            <SelectItem value="transfer">Chuyển khoản</SelectItem>
                          </>
                        ) : (
                          <SelectItem value={oppositeMethod}>
                            {oppositeMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {/* Số tiền — BOTH rows editable. The cashier types each
                        amount manually (no auto-fill on row 2). Digits only;
                        the value is stored as a raw integer string. */}
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={row.amount}
                      onChange={(e) => {
                        // Allow only digits; strip any non-numeric chars.
                        const digits = e.target.value.replace(/[^\d]/g, "");
                        setPayConfirmRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: digits } : r
                          )
                        );
                      }}
                      placeholder="0"
                      className="h-8 flex-1 text-xs"
                    />
                    {/* [+] add-row button — only on the last row when fewer
                        than 2 rows exist. Adds a 2nd row locked to the
                        opposite method, with amount EMPTY (the cashier types
                        both amounts themselves — no auto-split). */}
                    {canAdd && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayConfirmRows((prev) => {
                            if (prev.length >= 2) return prev;
                            const row1Method = prev[0].method;
                            const row2Method: "cash" | "transfer" =
                              row1Method === "cash" ? "transfer" : "cash";
                            // Add row 2 with an EMPTY amount — the cashier
                            // types both amounts themselves (no auto-split).
                            return [
                              ...prev,
                              { method: row2Method, amount: "" },
                            ];
                          });
                        }}
                        title="Thêm dòng thanh toán"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      >
                      <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* [×] remove-row button — only on row 2. Drops the 2nd
                        row and leaves row 1 as the sole payment. Row 1's
                        amount is left AS-IS (the cashier may have already
                        edited it; we don't force-reset to the full total). */}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayConfirmRows((prev) => {
                            if (prev.length < 2) return prev;
                            return [prev[0]];
                          });
                        }}
                        title="Xóa dòng thanh toán này"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      >
                      <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Split summary — when 2 rows exist, show the sum of the two
                ENTERED amounts vs the amount due so the cashier can see if
                they need to adjust. Helps catch typos before confirming.
                Both amounts are user-entered, so the sum may be <, =, or > the
                total — the hint shows which. */}
            {payConfirmRows.length === 2 && activeTabId && (() => {
              const total = getInvoiceTotal(activeTabId);
              const row1 = Number(payConfirmRows[0].amount || "0") || 0;
              const row2 = Number(payConfirmRows[1].amount || "0") || 0;
              const sum = row1 + row2;
              const diff = sum - total;
              if (diff === 0) {
                return (
                  <p className="text-[11px] text-emerald-600 leading-tight">
                    Tổng 2 dòng = {sum.toLocaleString("vi-VN")}đ (đủ tiền khách cần trả).
                  </p>
                );
              }
              return (
                <p className="text-[11px] text-amber-600 leading-tight">
                  Tổng 2 dòng = {sum.toLocaleString("vi-VN")}đ
                  {diff > 0
                    ? ` (dư ${diff.toLocaleString("vi-VN")}đ so với khách cần trả).`
                    : ` (thiếu ${Math.abs(diff).toLocaleString("vi-VN")}đ so với khách cần trả).`}
                </p>
              );
            })()}
            {/* Notes — optional, free-text. Currently not persisted (the
                review-mode checkout doesn't read it), but kept so the cashier
                has a place to jot a quick note. Compact: 2 rows. */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-gray-600">
                Ghi chú
              </Label>
              <textarea
                value={payConfirmNote}
                onChange={(e) => setPayConfirmNote(e.target.value)}
                placeholder="Ghi chú"
                rows={2}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPayConfirmOpen(false);
                setPayConfirmRows([{ method: "cash", amount: "" }]);
                setPayConfirmNote("");
              }}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={
                thanhToanPending ||
                checkoutMutation.isPending ||
                !activeTabId ||
                !invoice ||
                invoice.items.length === 0
              }
              onClick={async () => {
                // Commit the dialog's payment-method choice to the
                // component-level state so the review-mode "Phương thức"
                // toggle and the eventual checkout payload use it. When 2
                // payment rows exist, the primary method = row 1's method
                // (row 2 is always the opposite — it's a secondary split, not
                // the primary method). When only 1 row exists, that's the
                // method. This keeps the existing single-method checkout
                // payload working; the 2-row split is a UI-level affordance
                // for the cashier to record both cash + transfer amounts.
                setPaymentMethod(payConfirmRows[0]?.method || "cash");
                // Close the dialog FIRST so the UI switches to review mode
                // cleanly, then run the actual payment flow (auto-checkin →
                // create pending invoice → enter "chờ bấm Hoàn tất").
                setPayConfirmOpen(false);
                setPayConfirmRows([{ method: "cash", amount: "" }]);
                setPayConfirmNote("");
                await handleThanhToan();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {thanhToanPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {thanhToanPending ? "Đang xử lý..." : "Thanh toán"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}