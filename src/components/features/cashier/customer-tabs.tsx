"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
// Lazy-load PaidInvoiceView + CustomerHistoryDialog — only opened on demand.
const PaidInvoiceView = dynamic(
  () => import("@/components/features/booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);
const CustomerHistoryDialog = dynamic(
  () => import("@/components/features/customers/customer-history-dialog").then((m) => m.CustomerHistoryDialog),
  { ssr: false }
);
import { User, Phone, Plus, Calendar, Search, X, UserPlus, Loader2, RotateCcw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCashierStore, type InvoiceItem, type TabMeta } from "@/stores/cashier-store";
import { useBranchStore } from "@/stores/branch-store";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { localDayToUtcRange, toVietnamDay, toVietnamTime } from "@/lib/utils";
import {
  BookingStatusLabel,
  BookingStatusBadgeColors,
  BookingStatusType,
} from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { parseMultiCustomerNote } from "@/lib/multi-customer";

// Fetch a customer's "Khách cũ" status from the API. A customer counts as
// "old" (Khách cũ) when they have at least one completed invoice OR belong
// to a customer group whose name contains "khách cũ". This mirrors the
// booking dialog's determination so both modules filter service categories
// consistently. Returns "new" on any error (safe default: show the
// new-customer cut).
async function fetchCustomerOldStatus(customerId: string): Promise<"old" | "new"> {
  try {
    const res = await fetch(
      `/api/supabase/customers/${encodeURIComponent(customerId)}`
    );
    const json = await res.json();
    if (!json.ok || !json.data) return "new";
    const groupName = (json.data.group?.name || "").toLowerCase();
    const isOld =
      json.data.customer_type === "old" || groupName.includes("khách cũ");
    return isOld ? "old" : "new";
  } catch {
    return "new";
  }
}

interface BookingServiceRow {
  id: string;
  staff_id: string | null;
  service_category_id?: string | null;
  service: { id: string; name: string; duration: number; price?: number } | null;
  staff: { id: string; name: string } | null;
}

interface TodayBooking {
  id: string;
  code: string | null;
  date_time: string;
  status: string;
  note: string | null;
  number_of_customers: number | null;
  customer: { id: string; name: string; phone: string | null } | null;
  services: BookingServiceRow[];
}

// A standalone invoice (no linked booking) — created when a customer buys
// ONLY products (no service) at the cashier. These show as tabs in the tab
// bar alongside the day's bookings so the cashier can see / re-open product-
// only orders. `status` is "completed" (paid) or "cancelled".
interface StandaloneInvoice {
  id: string;
  code: string | null;
  status: string;
  booking_id: string | null;
  final_amount: number;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
  items: Array<{
    name: string;
    type?: string;
    quantity: number;
    price: number;
    discount?: number;
    total: number;
  }>;
}

interface CustomerTabsProps {
  selectedDate: string; // "YYYY-MM-DD" — the date whose bookings are shown in the tab bar.
}

export function CustomerTabs({ selectedDate }: CustomerTabsProps) {
  const {
    activeCustomers,
    activeTabId,
    openCustomerTab,
    setActiveTab,
    addInvoiceItem,
    replaceServiceItems,
    invoices,
    tabMeta,
    setTabMeta,
    updateTabMeta,
    closeCustomerTab,
    updateCustomerTab,
  } = useCashierStore();
  const { selectedBranchId } = useBranchStore();
  const { hasPermission } = useAuthStore();
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  const { toast } = useToast();
  // Paid invoice full-page view state — opened when clicking "Hóa đơn: HDxxx"
  // on a paid booking's info bar.
  const [paidInvoiceView, setPaidInvoiceView] = useState<{
    invoiceId: string;
    customerName?: string;
    customerPhone?: string;
    bookingCode?: string | null;
  } | null>(null);

  // === Walk-in tab: customer search + add-new-customer dialogs ===
  // State for the search dialog (find an existing customer by phone). When a
  // result is clicked, the walk-in tab is linked to that real customer:
  // tabMeta.customerId + customerInfo are updated, and the activeCustomer's
  // displayed name/phone update too (via updateCustomerTab).
  // Inline customer search for walk-in tabs — real-time autocomplete as the
  // user types a phone number or name. Results show in a dropdown below the
  // input. Replaces the old square-button + dialog approach.
  const [inlineSearch, setInlineSearch] = useState("");
  const [showInlineResults, setShowInlineResults] = useState(false);
  const inlineSearchRef = useRef<HTMLDivElement>(null);

  // Debounced search — fires when inlineSearch has ≥ 2 chars.
  const { data: inlineResults, isFetching: inlineFetching } = useQuery({
    queryKey: ["cashier-inline-customer-search", inlineSearch],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/customers?search=${encodeURIComponent(inlineSearch)}&limit=10&include_guests=true`
      );
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string; phone: string | null; code: string | null }>) || [];
    },
    enabled: inlineSearch.trim().length >= 2,
    staleTime: 10_000,
  });

  // Close the results dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inlineSearchRef.current && !inlineSearchRef.current.contains(e.target as Node)) {
        setShowInlineResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // State for the "Thêm khách mới" dialog (name + phone → POST a new customer).
  // On submit, the new customer is linked to the walk-in tab same as search.
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  // State for the customer history dialog — opened when the cashier clicks a
  // customer's name (green link) in the info bar.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
    code?: string | null;
  } | null>(null);

  const activeCustomer = activeCustomers.find(
    (c) => c.customerId === activeTabId
  );

  // Fetch the selected date's bookings (shown as buttons in the tab bar).
  const { data: dayBookings } = useQuery<TodayBooking[]>({
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
      return (json.data as TodayBooking[]) || [];
    },
  });

  // Fetch the selected date's STANDALONE invoices (booking_id IS NULL) — these
  // are product-only orders created at the cashier (walk-in / new / old customer
  // who bought ONLY products, no service). They show as tabs alongside the
  // day's bookings so the cashier can re-open / review them. Per business
  // rule, both completed (paid) and cancelled standalone invoices stay in the
  // list for the day.
  const { data: dayStandaloneInvoices } = useQuery<StandaloneInvoice[]>({
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
      // Only standalone invoices (no booking link) — product-only orders.
      const all = (json.data as StandaloneInvoice[]) || [];
      return all.filter((inv) => !inv.booking_id);
    },
  });

  // The active tab's booking (if the tab was opened from a booking).
  // Tabs opened via "Thêm khách hàng" (manual customer picker) have no booking,
  // so no status is shown for them.
  // Walk-in tabs that were auto-linked to an existing booking (via
  // handleSelectInlineResult) have type "booking" but their activeTabId is
  // still "walkin-xxx" — look them up by meta.bookingId in that case so the
  // info bar's status badge, date, and code-link render correctly.
  const activeMetaForBooking = activeTabId ? tabMeta[activeTabId] : undefined;
  const activeBooking = activeTabId
    ? (dayBookings || []).find(
        (b) => b.id === activeTabId || b.id === activeMetaForBooking?.bookingId
      ) || null
    : null;

  // Multi-customer "Cùng lịch" booking detection (Cashier module only).
  // When a booking has number_of_customers >= 2 AND a [[MULTI]] note, the
  // customer info bar hides the name + phone (those are shown per-service
  // instead) and only displays the appointment code + date/time.
  const activeIsMultiCustomer = activeBooking
    ? (() => {
        const multi = parseMultiCustomerNote(activeBooking.note);
        return !!multi && (activeBooking.number_of_customers ?? 1) >= 2;
      })()
    : false;

  // When the selected date changes, a previously-opened booking tab (or
  // standalone-invoice tab) from an EARLIER day can still be the active tab
  // (its id is persisted in the cashier store). Its content would then show
  // on the new day even though the booking/invoice doesn't belong to that
  // day — making it look like the module is "out of sync" with Lịch hẹn.
  //
  // Fix: once the new day's bookings + standalone invoices have loaded, if the
  // active tab is a booking-type tab (not a walk-in draft) AND it isn't in the
  // current day's lists, deselect it so its stale content stops rendering.
  // Walk-in drafts (type "walkin") are intentionally kept — a cashier may
  // start a draft and return to it later, and drafts aren't tied to a day.
  //
  // Edge case: a walk-in tab that was auto-linked to an existing booking (via
  // handleSelectInlineResult) has type "booking" but its activeTabId is still
  // "walkin-xxx" (not the booking's id). Such a tab is valid as long as its
  // meta.bookingId points to a booking in the current day's list — don't
  // deselect it.
  useEffect(() => {
    if (!activeTabId) return;
    const meta = tabMeta[activeTabId];
    if (!meta || meta.type !== "booking") return; // only booking/standalone tabs
    // Wait until the current day's data has been fetched.
    if (!dayBookings || !dayStandaloneInvoices) return;
    const inDayBookings = dayBookings.some((b) => b.id === activeTabId);
    const inDayStandalone = dayStandaloneInvoices.some((inv) => inv.id === activeTabId);
    // Walk-in tabs auto-linked to a booking: check by meta.bookingId too.
    const linkedBookingInDay = meta.bookingId
      ? dayBookings.some((b) => b.id === meta.bookingId)
      : false;
    if (!inDayBookings && !inDayStandalone && !linkedBookingInDay) {
      // The active tab's booking/invoice doesn't belong to this day — deselect.
      setActiveTab("");
    }
  }, [activeTabId, tabMeta, dayBookings, dayStandaloneInvoices, setActiveTab]);

  // AUTO-REBUILD: when the active tab is a booking tab AND the current day's
  // bookings have loaded, sync the invoice's service items from the booking.
  // This self-heals persisted stale state (e.g. a 2-service booking that was
  // merged into 1 line with quantity 2 by an older code version) WITHOUT
  // requiring the user to re-click the tab. Product items + discount + tip +
  // voucher are preserved (replaceServiceItems keeps them).
  // Also handles walk-in tabs that were auto-linked to a booking (activeTabId
  // is "walkin-xxx", but meta.bookingId points to a real booking in dayBookings).
  useEffect(() => {
    if (!activeTabId) return;
    const meta = tabMeta[activeTabId];
    if (!meta || meta.type !== "booking") return;
    if (!dayBookings) return;
    // Look up the booking by activeTabId (direct booking tab) OR by
    // meta.bookingId (walk-in tab that was auto-linked to a booking).
    const b = dayBookings.find(
      (x) => x.id === activeTabId || x.id === meta.bookingId
    );
    if (!b || !b.services) return;
    // Build the fresh service items list from the booking's current services.
    const serviceItems: InvoiceItem[] = b.services
      .filter((s) => s.service)
      .map((s) => {
        const price = Number(s.service!.price) || 0;
        return {
          id: `${s.service!.id}-${crypto.randomUUID()}`,
          itemId: s.service!.id,
          name: s.service!.name,
          type: "service" as const,
          price,
          quantity: 1,
          discount: 0,
          total: price,
          staffName: s.staff?.name || undefined,
        };
      });
    replaceServiceItems(activeTabId, serviceItems);
    // Only depend on activeTabId + dayBookings (the booking's services). Don't
    // depend on `invoices` (would loop — replaceServiceItems changes invoices).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, dayBookings]);

  // Sort the day's bookings for the tab bar:
  // 1. Paid/cancelled/no_show (terminal) → LEFT, unpaid (active) → RIGHT.
  // 2. Within each group: earlier created → LEFT, later created → RIGHT
  //    (chronological order left-to-right).
  const sortedDayBookings = useMemo(() => {
    const bookings = (dayBookings || []).slice();
    bookings.sort((a, b) => {
      // 1. Terminal statuses first (left), active last (right).
      const aTerminal = a.status === "checkout" || a.status === "cancelled" || a.status === "no_show";
      const bTerminal = b.status === "checkout" || b.status === "cancelled" || b.status === "no_show";
      if (aTerminal !== bTerminal) return aTerminal ? -1 : 1;
      // 2. Earlier time first (left), later time last (right) → ascending.
      const aTime = a.date_time ? new Date(a.date_time).getTime() : 0;
      const bTime = b.date_time ? new Date(b.date_time).getTime() : 0;
      return aTime - bTime;
    });
    return bookings;
  }, [dayBookings]);

  // Merge standalone (product-only) invoices into the tab list. Each invoice
  // becomes a tab button with the invoice's time + customer name. We reuse a
  // TodayBooking-shaped object so the rendering code stays uniform (the
  // services array is empty for product-only orders — items live in the
  // invoice, not the booking). Terminal invoices (completed/cancelled) sort
  // left, pending sort right; within each group by created_at ascending.
  const standaloneAsBookings: TodayBooking[] = useMemo(() => {
    return ((dayStandaloneInvoices || []) as StandaloneInvoice[]).map((inv) => ({
      id: inv.id,
      code: inv.code,
      // Use the invoice's creation time as the tab's "time" label.
      date_time: inv.created_at,
      // Map invoice status → a status the tab bar badge understands.
      status: inv.status === "completed" ? "checkout" : inv.status,
      customer: inv.customer
        ? { id: inv.customer.id, name: inv.customer.name, phone: inv.customer.phone }
        : { id: "", name: "Khách", phone: null },
      services: [],
    }));
  }, [dayStandaloneInvoices]);

  // Badge color helper (same as the Booking module's getStatusBadgeClass).
  const getStatusBadgeClass = (status: BookingStatusType) => {
    const colors = BookingStatusBadgeColors[status];
    return `${colors.bg} ${colors.text}`;
  };

  // "Tạo hóa đơn" — open a new walk-in customer tab immediately with a
  // synthetic id ("walkin-<uuid>"). A guest customer + booking are only
  // created lazily when a service is added to the tab.
  //
  // Two store updates happen here: openCustomerTab (sets activeTabId + adds
  // the tab to activeCustomers) and setTabMeta (sets tabMeta[tabId]). Both
  // are Zustand `set` calls, which are SYNCHRONOUS — they immediately mutate
  // the store. React (via useSyncExternalStore) batches the resulting
  // re-render, so by the time the component re-renders, BOTH activeTabId and
  // tabMeta[tabId] are set. This guarantees the fresh walk-in tab renders
  // with isWalkinTab=true and walkinHasCustomer=false on the very first
  // render after the click — the inline search + "Thêm khách mới" button
  // appear immediately. No race condition.
  //
  // (Previously this opened a 3-option dropdown: Khách vãng lai / Khách mới /
  // Khách cũ — the latter two were removed per request.)
  const handleAddCustomer = () => {
    const tabId = `walkin-${crypto.randomUUID()}`;
    openCustomerTab({
      customerId: tabId,
      customerName: "Khách vãng lai",
      phone: "",
    });
    // Walk-in = not a "Khách cũ" → treated as new for service filtering.
    // setTabMeta OVERWRITES the entry at tabId (no merge) — and since tabId
    // is a brand-new UUID, there's no stale persisted entry to clobber.
    setTabMeta(tabId, { type: "walkin", customerType: "new" });
  };

  // "Đổi khách" — reset a walk-in tab's customer link so the inline search +
  // "Thêm khách mới" button reappear. Lets the cashier recover from a
  // previously-linked customer (e.g. a walk-in tab from an earlier session
  // whose customerId is still set in the persisted cashier-store, OR simply
  // picking the wrong customer via search / add-new). Only allowed when the
  // tab is still a fresh walk-in draft (type="walkin", NO invoice items, NO
  // booking created) — once services are added or a booking exists, the
  // customer link can't be undone without losing data. Auto-linked walk-in
  // tabs (type flipped to "booking" by handleSelectInlineResult) are also
  // excluded: their booking link is real and shouldn't be reset here.
  const handleResetWalkinCustomer = () => {
    if (!activeTabId || !activeMeta) return;
    if (activeMeta.type !== "walkin") return;
    const items = invoices[activeTabId]?.items || [];
    if (items.length > 0 || activeMeta.bookingCreated) {
      alert(
        "Không thể đổi khách khi đã thêm dịch vụ/sản phẩm hoặc đã tạo lịch hẹn."
      );
      return;
    }
    // Clear the customer link (customerId → undefined makes walkinHasCustomer
    // false → search + "Thêm khách mới" button reappear). Reset the displayed
    // name/phone back to the walk-in defaults. customerType stays "new".
    updateTabMeta(activeTabId, {
      customerId: undefined,
      customerInfo: undefined,
      customerType: "new",
    });
    updateCustomerTab(activeTabId, {
      customerName: "Khách vãng lai",
      phone: "",
    });
    setInlineSearch("");
    setShowInlineResults(false);
  };

  // Pick a day's booking → opens a customer tab AND adds the booking's services
  // to that customer's invoice (so they show in the invoice area below instead of
  // "Chưa có mặt hàng nào"). Each booking gets its OWN tab (keyed by booking.id,
  // not customer.id) so that a customer with 2 separate bookings (e.g. 8:30 and
  // 10:30) has 2 separate tabs — each showing only that booking's services and
  // payable independently. Avoids duplicate items within the same booking's tab.
  const handlePickBooking = (b: TodayBooking) => {
    if (!b.customer) return;
    // Use booking.id as the tab key so separate bookings = separate tabs.
    const tabId = b.id;
    openCustomerTab({
      customerId: tabId,
      customerName: b.customer.name,
      phone: b.customer.phone || "",
    });
    // Mark this tab as an existing booking tab so adding more services can
    // decide same-booking (PUT, gap ≤ 15 min) vs new-booking (POST, gap > 15).
    if (!tabMeta[tabId]) {
      // Compute the booking's last service end time for gap checking.
      const bookingStart = b.date_time ? new Date(b.date_time).getTime() : 0;
      let maxEnd = bookingStart;
      const bookingServices = (b.services || [])
        .filter((s) => s.service)
        .map((s) => ({
          service_id: s.service!.id,
          staff_id: s.staff_id || "",
          service_category_id: s.service_category_id || null,
        }));
      for (const s of b.services || []) {
        if (!s.service) continue;
        const dur = (Number(s.service.duration) || 60) * 60 * 1000;
        const end = bookingStart + dur;
        if (end > maxEnd) maxEnd = end;
      }
      setTabMeta(tabId, {
        type: "booking",
        bookingCreated: true,
        bookingId: b.id,
        bookingCode: b.code || undefined,
        customerId: b.customer?.id,
        bookingServices,
        lastServiceEndMs: maxEnd,
        // PARALLEL model: the booking's start time is the reference for all
        // services. Used by ServiceSelector to default the 2nd service's time
        // to the SAME start (parallel), and by the gap check to decide
        // same-booking (PUT) vs new-booking (POST).
        lastServiceStartMs: bookingStart,
      });
    }
    // Fetch the booking customer's real "Khách cũ" status so the
    // ServiceSelector filters cut categories for booking tabs too (previously
    // booking tabs showed every category). Khách cũ → "Dịch Vụ Cắt" only;
    // otherwise → "Dành cho khách hàng mới - DV Cắt" only.
    if (b.customer?.id) {
      fetchCustomerOldStatus(b.customer.id).then((ct) =>
        updateTabMeta(tabId, { customerType: ct })
      );
    }
    // REBUILD the service items from the booking every time the tab is opened.
    // This guarantees the invoice's services always mirror the booking's current
    // services — even if the persisted localStorage state was corrupted by an
    // older code version (e.g. 2 same-id services with different staff merged
    // into 1 line with quantity 2). Product items + discount + tip are kept.
    // Each service becomes its OWN line (no quantity-merge) so 2 same-id
    // services with different staff = 2 distinct lines.
    const serviceItems: InvoiceItem[] = (b.services || [])
      .filter((s) => s.service)
      .map((s) => {
        const price = Number(s.service!.price) || 0;
        return {
          id: `${s.service!.id}-${crypto.randomUUID()}`,
          itemId: s.service!.id,
          name: s.service!.name,
          type: "service" as const,
          price,
          quantity: 1,
          discount: 0,
          total: price,
          staffName: s.staff?.name || undefined,
        };
      });
    replaceServiceItems(tabId, serviceItems);
  };

  // Pick a standalone (product-only) invoice → opens a tab keyed by the
  // invoice id. The invoice's saved items are loaded into the tab so the
  // InvoiceSummary shows what was actually purchased, and the status drives
  // the paid / cancelled banners. Re-opening a tab that's already open just
  // activates it (openCustomerTab dedupes by customerId).
  const handlePickStandaloneInvoice = (inv: StandaloneInvoice) => {
    // Defensive: the caller may pass undefined when the invoice isn't in the
    // current day's list (e.g. a tab from a previous day). Bail out gracefully
    // instead of crashing on `inv.id`.
    if (!inv) return;
    const tabId = inv.id;
    openCustomerTab({
      customerId: tabId,
      customerName: inv.customer?.name || "Khách",
      phone: inv.customer?.phone || "",
    });
    if (!tabMeta[tabId]) {
      setTabMeta(tabId, {
        type: "booking",
        bookingCreated: true,
        invoiceId: inv.id,
        bookingCode: inv.code || undefined,
        customerId: inv.customer?.id,
        bookingServices: [],
      });
    }
  };

  // Merge day bookings + standalone invoices + walk-in draft tabs into one
  // list, then sort:
  // 1. Terminal (paid/cancelled/no_show) → LEFT, active (unpaid) → RIGHT.
  // 2. Within active group: empty walk-in drafts (no items) → RIGHTMOST,
  //    then active bookings/invoices with items by time ascending.
  // 3. Within terminal group: earlier created → LEFT, later → RIGHT.
  // Walk-in tabs that have an invoiceId are kept (they show the paid/unpaid
  // status from the linked invoice). Standalone invoices that match a walk-in
  // tab's invoiceId are deduplicated — the walk-in tab takes priority so the
  // tab doesn't "disappear" after payment.
  const mergedTabList = useMemo(() => {
    // Collect invoiceIds AND bookingIds from walk-in tabs so we can deduplicate:
    // 1. Standalone invoices that match a walk-in tab's invoiceId.
    // 2. Day bookings that match a walk-in tab's bookingId — this prevents the
    //    DUPLICATE TAB issue: when the cashier adds a service to a walk-in tab,
    //    createBookingForTab creates a booking in Supabase. The
    //    cashier-day-bookings query then returns that booking as a SEPARATE
    //    tab entry. Without this dedup, the sidebar shows BOTH the walk-in tab
    //    AND the booking tab (same time, same customer, same services) —
    //    looking like a duplicate. The walk-in tab takes priority (it carries
    //    the cashier's draft state: items, discount, tip).
    //
    // Note: a walk-in tab whose customerId starts with "walkin-" is treated
    // as a walk-in-style tab for dedup/rendering purposes EVEN if its meta.type
    // has been flipped to "booking" by handleSelectInlineResult's auto-link
    // (when the cashier picked a customer who already had a booking for the
    // day). The id is the stable identifier — the type field changes during
    // the tab's lifecycle but the tab itself is still the same draft.
    const isWalkinStyleTab = (customerId: string, meta?: TabMeta) =>
      customerId.startsWith("walkin-") || meta?.type === "walkin";

    const walkinInvoiceIds = new Set<string>();
    const walkinBookingIds = new Set<string>();
    for (const c of activeCustomers) {
      const meta = tabMeta[c.customerId];
      if (isWalkinStyleTab(c.customerId, meta)) {
        if (meta?.invoiceId) walkinInvoiceIds.add(meta.invoiceId);
        if (meta?.bookingId) walkinBookingIds.add(meta.bookingId);
      }
    }

    // Build walk-in tab entries from activeCustomers that are walk-in drafts.
    // Include the invoiceId + status so paid walk-in tabs sort to the left.
    // For walk-in tabs that were auto-linked to a booking (meta.type ===
    // "booking" but customerId starts with "walkin-"), also look up the
    // linked booking's status so the tab badge reflects the booking's actual
    // status (e.g. "confirmed" → "Đã xác nhận") instead of the default "new".
    const walkinTabs: TodayBooking[] = activeCustomers
      .filter((c) => {
        const meta = tabMeta[c.customerId];
        return isWalkinStyleTab(c.customerId, meta);
      })
      .map((c) => {
        const meta = tabMeta[c.customerId];
        // Determine status: check the persisted paid/cancelled flags first
        // (survives page navigation), then fall back to the linked invoice's
        // status, then to the linked booking's status (for auto-linked
        // walk-in tabs whose meta.type is "booking").
        const linkedInv = meta?.invoiceId
          ? (dayStandaloneInvoices || []).find((inv) => inv.id === meta.invoiceId)
          : null;
        const linkedBooking = meta?.bookingId
          ? (dayBookings || []).find((b) => b.id === meta.bookingId)
          : null;
        const status = meta?.paid || linkedInv?.status === "completed" ? "checkout"
          : meta?.cancelled || linkedInv?.status === "cancelled" ? "cancelled"
          : linkedBooking?.status || "new";
        // For walk-in tabs that have a booking created (via createBookingForTab
        // OR auto-linked via handleSelectInlineResult), use the booking's start
        // time (lastServiceStartMs) as the tab's time so the tab button shows
        // the service's scheduled time BEFORE the customer name — per the
        // user's request. Convert the epoch ms to an ISO string so
        // toVietnamTime() in the render works correctly.
        const walkinDateTime = meta?.lastServiceStartMs
          ? new Date(meta.lastServiceStartMs).toISOString()
          : linkedInv?.created_at || null;
        return {
          id: c.customerId,
          code: meta?.bookingCode || linkedInv?.code || null,
          date_time: walkinDateTime,
          status,
          customer: { id: c.customerId, name: c.customerName, phone: c.phone || null },
          services: [],
        };
      });

    // Filter out standalone invoices that are already represented by a walk-in tab.
    const dedupedStandalone = (standaloneAsBookings || []).filter(
      (inv) => !walkinInvoiceIds.has(inv.id)
    );

    // Filter out day bookings that are already represented by a walk-in tab's
    // bookingId. Without this, the sidebar shows BOTH the walk-in tab AND the
    // booking tab — a duplicate. The walk-in tab takes priority (it carries
    // the cashier's draft state: items, discount, tip, photos).
    const dedupedDayBookings = (sortedDayBookings || []).filter(
      (b) => !walkinBookingIds.has(b.id)
    );

    const merged = [...dedupedDayBookings, ...dedupedStandalone, ...walkinTabs];
    merged.sort((a, b) => {
      const aTerminal = a.status === "checkout" || a.status === "cancelled" || a.status === "no_show";
      const bTerminal = b.status === "checkout" || b.status === "cancelled" || b.status === "no_show";
      // 1. Terminal → LEFT, active → RIGHT.
      if (aTerminal !== bTerminal) return aTerminal ? -1 : 1;
      // Within the active (non-terminal) group:
      if (!aTerminal) {
        // 2. Empty walk-in drafts (no items, no invoice) → RIGHTMOST.
        const aIsEmptyWalkin = a.id.startsWith("walkin-") &&
          (invoices[a.id]?.items || []).length === 0 && !tabMeta[a.id]?.invoiceId;
        const bIsEmptyWalkin = b.id.startsWith("walkin-") &&
          (invoices[b.id]?.items || []).length === 0 && !tabMeta[b.id]?.invoiceId;
        if (aIsEmptyWalkin !== bIsEmptyWalkin) return aIsEmptyWalkin ? 1 : -1;
      }
      // 3. Earlier time → LEFT, later → RIGHT (ascending).
      const aTime = a.date_time ? new Date(a.date_time).getTime() : 0;
      const bTime = b.date_time ? new Date(b.date_time).getTime() : 0;
      return aTime - bTime;
    });
    return merged;
  }, [sortedDayBookings, standaloneAsBookings, activeCustomers, tabMeta, invoices, dayStandaloneInvoices]);

  // The active tab's draft metadata (walk-in / new / old). Used to show the
  // booking code under the customer info once a booking is created.
  const activeMeta = activeTabId ? tabMeta[activeTabId] : undefined;

  // Whether the active tab is a walk-in draft (opened via "Tạo hóa đơn").
  // Walk-in tabs show Search + "Thêm khách mới" buttons instead of the
  // customer name link (the link 404s for synthetic walkin-xxx ids).
  const isWalkinTab = activeMeta?.type === "walkin";
  // Whether a real customer (old or newly created) has been linked to this
  // walk-in tab. Once linked, the inline search + "Thêm khách mới" button
  // are hidden — the customer is already chosen.
  const walkinHasCustomer = isWalkinTab && Boolean(activeMeta?.customerId);
  // Whether the active tab is still an EMPTY order (no items, no pending
  // invoice, no booking services). Applies to BOTH walk-in drafts AND booking
  // tabs (e.g. a booking whose services were all removed, or a freshly-picked
  // booking the cashier wants to dismiss). Empty tabs show the X close button
  // in the info bar so the cashier can discard them. Once an item is added
  // (or an invoice is created, or the booking has services) the tab becomes a
  // real order and the X disappears. Terminal statuses never show X.
  const activeTabItems = activeTabId ? invoices[activeTabId]?.items : undefined;
  const activeBookingHasServices = (activeBooking?.services || []).length > 0;
  const isEmptyTab =
    (!activeTabItems || activeTabItems.length === 0) &&
    !activeMeta?.invoiceId &&
    !activeBookingHasServices &&
    activeBooking?.status !== "checkout" &&
    activeBooking?.status !== "cancelled" &&
    activeBooking?.status !== "no_show";

  // Select an inline search result → link the walk-in tab to the real customer.
  //
  // AUTO-LINK existing booking: when the cashier opens a walk-in tab and picks
  // a customer who ALREADY has a non-terminal booking for the selected day, the
  // tab is auto-linked to that booking — the booking code (LHxxx) shows in the
  // info bar, the booking's existing services load into the invoice area, and
  // adding more services PUTs to the existing booking instead of creating a
  // duplicate. Without this, the walk-in tab would render the customer's name +
  // phone but NO booking code (because bookingCode stays undefined), which made
  // it look like the cashier module "lost" the Lịch hẹn entry.
  //
  // Terminal statuses (checkout / cancelled / no_show) are excluded — those
  // bookings are no longer actionable, so a new walk-in service should start a
  // new booking. If the customer has NO eligible booking for the day, the
  // original walk-in behavior is kept (a booking will be created lazily when
  // the cashier adds the first service).
  const handleSelectInlineResult = (c: {
    id: string;
    name: string;
    phone: string | null;
  }) => {
    if (!activeTabId) return;
    updateTabMeta(activeTabId, {
      customerId: c.id,
      customerInfo: {
        name: c.name,
        phone: c.phone || "",
      },
    });
    updateCustomerTab(activeTabId, {
      customerName: c.name,
      phone: c.phone || "",
    });
    // Re-fetch the linked customer's "Khách cũ" status so the ServiceSelector
    // filters service categories correctly (Khách cũ → "Dịch Vụ Cắt" only).
    fetchCustomerOldStatus(c.id).then((ct) =>
      updateTabMeta(activeTabId, { customerType: ct })
    );

    // AUTO-LINK: find the customer's existing non-terminal booking for the
    // selected day. If one exists, link this walk-in tab to it (mirrors what
    // handlePickBooking does when the user clicks the booking tab directly).
    // This makes the booking code appear in the info bar AND makes subsequent
    // service adds PUT to the existing booking (no duplicate).
    const existingBooking = (dayBookings || []).find(
      (b) =>
        b.customer?.id === c.id &&
        b.status !== "checkout" &&
        b.status !== "cancelled" &&
        b.status !== "no_show"
    );
    if (existingBooking) {
      const bookingStart = existingBooking.date_time
        ? new Date(existingBooking.date_time).getTime()
        : 0;
      let maxEnd = bookingStart;
      const bookingServices = (existingBooking.services || [])
        .filter((s) => s.service)
        .map((s) => ({
          service_id: s.service!.id,
          staff_id: s.staff_id || "",
          service_category_id: s.service_category_id || null,
        }));
      for (const s of existingBooking.services || []) {
        if (!s.service) continue;
        const dur = (Number(s.service.duration) || 60) * 60 * 1000;
        const end = bookingStart + dur;
        if (end > maxEnd) maxEnd = end;
      }
      // Change the tab type from "walkin" → "booking" so:
      //   1. The booking-code badge branch renders in the info bar (the badge
      //      is only shown in the non-walkin branch — see the JSX below).
      //   2. The walk-in-specific UI (search bar, "Thêm khách mới" button) is
      //      hidden now that a real booking is linked.
      //   3. The tab sorts with the day's bookings (not as an empty walk-in
      //      draft) and is deduplicated against the booking tab via
      //      walkinBookingIds in mergedTabList.
      // All existing meta fields (customerId, customerInfo, customerType) are
      // preserved — the booking fields are layered ON TOP.
      updateTabMeta(activeTabId, {
        type: "booking",
        bookingCreated: true,
        bookingId: existingBooking.id,
        bookingCode: existingBooking.code || undefined,
        bookingServices,
        lastServiceStartMs: bookingStart,
        lastServiceEndMs: maxEnd,
      });
      // Load the booking's existing services into the invoice area (mirrors
      // handlePickBooking lines 409-425). Product items / discount / tip are
      // kept by replaceServiceItems.
      const serviceItems: InvoiceItem[] = (existingBooking.services || [])
        .filter((s) => s.service)
        .map((s) => {
          const price = Number(s.service!.price) || 0;
          return {
            id: `${s.service!.id}-${crypto.randomUUID()}`,
            itemId: s.service!.id,
            name: s.service!.name,
            type: "service" as const,
            price,
            quantity: 1,
            discount: 0,
            total: price,
            staffName: s.staff?.name || undefined,
          };
        });
      replaceServiceItems(activeTabId, serviceItems);
      toast({
        title: "Đã liên kết lịch hẹn",
        description: `${c.name} • ${existingBooking.code || ""}`,
      });
    } else {
      toast({ title: "Đã chọn khách hàng", description: c.name });
    }

    setInlineSearch("");
    setShowInlineResults(false);
  };

  // === Walk-in tab: add a new customer (name + phone) ===
  // POSTs to /api/supabase/customers, then links the walk-in tab to the newly
  // created customer. If the phone already exists, the API returns the existing
  // customer (409) — we link to that one instead so no duplicate is created.
  const handleAddNewCustomer = async () => {
    const name = newCustomerName.trim();
    const phone = newCustomerPhone.trim();
    if (!name) return;
    if (!selectedBranchId || selectedBranchId === "all") {
      alert("Vui lòng chọn chi nhánh");
      return;
    }
    setAddingCustomer(true);
    try {
      const res = await fetch("/api/supabase/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          branch_id: selectedBranchId || null,
        }),
      });
      const json = await res.json();
      let customer: { id: string; name: string; phone: string | null } | null = null;
      if (json.ok && json.data?.id) {
        customer = { id: json.data.id, name: json.data.name, phone: json.data.phone };
      } else if (json.existing_customer?.id) {
        // Phone already exists → use the existing customer (no duplicate).
        customer = {
          id: json.existing_customer.id,
          name: json.existing_customer.name,
          phone: json.existing_customer.phone,
        };
      } else {
        alert(json.error || "Không thể tạo khách hàng");
        return;
      }
      if (activeTabId && customer) {
        updateTabMeta(activeTabId, {
          customerId: customer.id,
          customerInfo: { name: customer.name, phone: customer.phone || "" },
        });
        updateCustomerTab(activeTabId, {
          customerName: customer.name,
          phone: customer.phone || "",
        });
        // New customer is never "Khách cũ".
        updateTabMeta(activeTabId, { customerType: "new" });
      }
      setShowAddCustomer(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      toast({ title: "Đã thêm khách mới", description: name });
    } catch {
      alert("Không thể tạo khách hàng");
    } finally {
      setAddingCustomer(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Tab bar — [day's booking buttons (time + name)] [Thêm khách hàng pinned at end] */}
      <div className="flex border-b bg-white">
        {/* Scrollable area: day's bookings + standalone product-only invoices */}
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {mergedTabList.map((b) => {
            const time = b.date_time ? toVietnamTime(b.date_time) : "—";
            const bs = b.status as BookingStatusType;
            // Cashier tab bar color scheme (per user request):
            // - cancelled (Hủy) → pink background + red text.
            // - everything else (new / confirmed / checkin / checkout / no_show,
            //   i.e. "chưa thanh toán" and "chưa hủy") → plain white background
            //   with neutral dark text. Only the active tab keeps its emerald
            //   highlight.
            const isCancelled = bs === "cancelled";
            const statusColors = isCancelled
              ? { bg: "bg-pink-100", text: "text-red-600" }
              : { bg: "bg-white", text: "text-gray-700" };
            const isActive = activeTabId === b.id;
            // Distinguish a standalone-invoice tab (services empty) from a
            // booking tab: the title shows "SP" (sản phẩm) for product-only
            // orders so the cashier can tell them apart at a glance.
            const isStandalone = (b.services || []).length === 0;
            // Walk-in draft tab: id starts with "walkin-".
            const isWalkinDraft = b.id.startsWith("walkin-");
            // ANY tab (walk-in OR booking) that has NO invoice items, NO pending
            // invoice, AND NO booking services can be closed via X. The user
            // wants to discard empty orders (no service/product/package) from
            // the sidebar. We check BOTH the local invoice items (loaded when
            // the tab is active) AND the booking's own services array (from
            // the day's bookings query) — this covers non-active tabs whose
            // local invoice state hasn't been loaded yet. Terminal statuses
            // (checkout/cancelled/no_show) never show X.
            const tabItems = invoices[b.id]?.items || [];
            const tabHasInvoice = !!tabMeta[b.id]?.invoiceId;
            const bookingHasServices = (b.services || []).length > 0;
            const canCloseWalkin =
              tabItems.length === 0 &&
              !tabHasInvoice &&
              !bookingHasServices &&
              b.status !== "checkout" &&
              b.status !== "cancelled" &&
              b.status !== "no_show";
            return (
              <div
                key={b.id}
                className={`relative flex shrink-0 items-center gap-2 border-r px-3 py-1 text-sm transition ${isActive ? "bg-emerald-50 font-semibold text-emerald-700" : `${statusColors.bg} ${statusColors.text} ${isCancelled ? "hover:bg-pink-200" : "hover:bg-gray-50"}`}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isWalkinDraft) {
                      setActiveTab(b.id);
                    } else if (isStandalone) {
                      // Look up the standalone invoice in the CURRENT day's
                      // list. The lookup may return undefined when the tab is
                      // from a different day (the sidebar keeps open tabs
                      // across day changes) or when the day query hasn't
                      // refreshed yet. In that case, fall back to just
                      // activating the tab — it's already open, so the
                      // InvoiceSummary will render its saved items from the
                      // persisted tabMeta/invoice state.
                      const foundInv = (dayStandaloneInvoices || []).find(
                        (inv) => inv.id === b.id
                      );
                      if (foundInv) {
                        handlePickStandaloneInvoice(foundInv);
                      } else {
                        setActiveTab(b.id);
                      }
                    } else {
                      handlePickBooking(b);
                    }
                  }}
                  className="flex items-center gap-2"
                  title={`${b.customer?.name || "Khách"} - ${time}${isStandalone ? " - Đơn sản phẩm" : ` - ${b.services.map((s) => s.service?.name).filter(Boolean).join(", ")}`}`}
                >
                  <span className="text-xs text-gray-400">{time}</span>
                  <span className="font-medium">{b.customer?.name || "Khách"}</span>
                  {isStandalone && !isWalkinDraft && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">SP</span>
                  )}
                </button>
                {/* X close button — only for empty walk-in draft tabs (no
                    items, no pending invoice). Once an item is added the tab
                    becomes a real invoice and cannot be closed this way. */}
                {canCloseWalkin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeCustomerTab(b.id);
                    }}
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
                    title="Xóa đơn trống"
                    aria-label="Xóa đơn trống"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* "Tạo hóa đơn" button — opens a new customer tab immediately
            (walk-in guest). Can be clicked multiple times to create multiple
            tabs. Booking + customer are created lazily when a service is
            added to the tab. */}
        <button
          type="button"
          onClick={handleAddCustomer}
          className="flex shrink-0 items-center gap-1 self-stretch border-l px-4 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
        >
          <Plus className="h-4 w-4" />
          Tạo hóa đơn
        </button>
      </div>

      {/* Customer info */}
      {activeCustomer && (
        <div className="flex items-center gap-6 border-b bg-white px-4 py-1 text-sm">
          {isWalkinTab ? (
            <>
              {/* Walk-in tab: show customer name (green clickable link to
                  history dialog when a customer is linked, plain text when
                  no customer is linked yet) + inline search input with
                  real-time autocomplete dropdown + "Thêm khách mới" button. */}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                {walkinHasCustomer && activeMeta?.customerId ? (
                  <button
                    type="button"
                    onClick={() =>
                      setHistoryCustomer({
                        id: activeMeta.customerId!,
                        name: activeCustomer.customerName,
                        phone: activeCustomer.phone || null,
                      })
                    }
                    className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                    title="Xem lịch sử khách hàng"
                  >
                    {activeCustomer.customerName}
                  </button>
                ) : (
                  <span className="font-medium text-gray-900">
                    {activeCustomer.customerName}
                  </span>
                )}
              </div>
              {activeCustomer.phone && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Phone className="h-4 w-4" />
                  <span>
                    {canViewCustomerPhone
                      ? activeCustomer.phone
                      : maskPhone(activeCustomer.phone)}
                  </span>
                </div>
              )}
              {/* Inline search input + "Thêm khách mới" button — ONLY shown
                  while the walk-in tab still has NO real customer linked.
                  Once the cashier picks an existing customer (search result)
                  OR creates a new one, both controls disappear and only the
                  customer name + phone remain. */}
              {!walkinHasCustomer && (
              <>
              {/* Inline search input with autocomplete dropdown */}
              <div className="relative" ref={inlineSearchRef}>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={inlineSearch}
                    onChange={(e) => {
                      setInlineSearch(e.target.value);
                      setShowInlineResults(true);
                    }}
                    onFocus={() => setShowInlineResults(true)}
                    placeholder="Tìm SĐT khách cũ..."
                    className="h-7 w-44 rounded border border-gray-200 pl-7 pr-2 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none"
                  />
                  {inlineFetching && (
                    <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>
                {/* Autocomplete dropdown */}
                {showInlineResults && inlineSearch.trim().length >= 2 && (
                  <div className="absolute z-50 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border bg-white shadow-lg">
                    {(inlineResults || []).length === 0 && !inlineFetching ? (
                      <div className="px-3 py-3 text-center text-xs text-gray-400">
                        Không tìm thấy khách hàng
                      </div>
                    ) : (
                      (inlineResults || []).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectInlineResult(c)}
                          className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-emerald-50"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{c.name}</p>
                            <p className="text-gray-500">
                              {c.phone || "—"}
                              {c.code ? ` • ${c.code}` : ""}
                            </p>
                          </div>
                          <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewCustomerName("");
                  setNewCustomerPhone("");
                  setShowAddCustomer(true);
                }}
                className="flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Thêm khách mới
              </button>
              </>
              )}
              {/* "Đổi khách" button — the MIRROR of the above block: shown
                  ONLY when a customer IS linked (walkinHasCustomer=true).
                  Lets the cashier reset the walk-in tab back to a fresh
                  state so the search + "Thêm khách mới" button reappear.
                  Restricted to truly fresh walk-in drafts (no items, no
                  booking created, type still "walkin") — see
                  handleResetWalkinCustomer for the guard logic. This
                  directly addresses the persisted-state confusion: if a
                  walk-in tab from an earlier session still has a
                  customerId set in localStorage, the cashier can click
                  "Đổi khách" to bring the search/button back instead of
                  having to close the tab and click "Tạo hóa đơn" again. */}
              {walkinHasCustomer &&
                (!activeTabItems || activeTabItems.length === 0) &&
                !activeMeta?.bookingCreated && (
                  <button
                    type="button"
                    onClick={handleResetWalkinCustomer}
                    className="flex items-center gap-1 rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                    title="Xóa liên kết khách hàng để chọn lại"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Đổi khách
                  </button>
                )}
            </>
          ) : (
            <>
              {/* Booking / standalone-invoice tab.
                  For multi-customer bookings (number_of_customers >= 2 with a
                  [[MULTI]] note), the per-customer name + phone are shown on
                  each SERVICE line in the invoice summary instead — so the
                  info bar here only shows the appointment code + date/time to
                  avoid clutter. Single-customer bookings show name + phone;
                  the name is a green clickable link to the history dialog
                  (uses the booking's customer_id). */}
              {!activeIsMultiCustomer && (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    {activeBooking?.customer?.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          setHistoryCustomer({
                            id: activeBooking.customer!.id,
                            name: activeCustomer.customerName,
                            phone: activeCustomer.phone || null,
                          })
                        }
                        className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                        title="Xem lịch sử khách hàng"
                      >
                        {activeCustomer.customerName}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-900">
                        {activeCustomer.customerName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Phone className="h-4 w-4" />
                    <span>
                      {canViewCustomerPhone
                        ? (activeCustomer.phone || "—")
                        : maskPhone(activeCustomer.phone)}
                    </span>
                  </div>
                </>
              )}

              {/* Booking/invoice code badge: shows "Lịch hẹn: LHxxx" when unpaid,
                  "Hóa đơn: HDxxx" (clickable → opens full invoice view) when paid. */}
              {activeMeta?.bookingCode && (
                <div className="flex items-center gap-2 text-emerald-700">
                  {activeBooking?.status === "checkout" ? (
                    <button
                      onClick={() => {
                        const invId = activeMeta?.invoiceId || activeBooking?.invoice?.id;
                        if (invId) {
                          setPaidInvoiceView({
                            invoiceId: invId,
                            customerName: activeCustomer?.customerName,
                            customerPhone: activeCustomer?.phone,
                            bookingCode: activeMeta?.bookingCode,
                          });
                        }
                      }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Hóa đơn: {activeMeta?.invoiceId ? `HD${activeMeta.bookingCode?.replace(/\D/g, "").slice(-6) || ""}` : activeMeta?.bookingCode}
                    </button>
                  ) : (
                    <span className="text-xs font-medium">
                      Lịch hẹn: {activeMeta.bookingCode}
                    </span>
                  )}
                </div>
              )}

              {/* Booking date + time — the appointment's full date_time
                  (dd/MM/yyyy HH:MM). Shown alongside the booking code so the
                  cashier sees EXACTLY when the appointment is for. Previously
                  only the date was shown (no time), which left the cashier
                  guessing the hour — especially for walk-in tabs auto-linked
                  to a booking, where the booking's date_time is the only
                  source of the appointment time. Now shows "dd/MM/yyyy HH:MM". */}
              {activeBooking?.date_time && (
                <div className="flex items-center gap-1 text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">
                    {(() => {
                      try {
                        // Timezone-safe Vietnam day + time (Supabase stores
                        // +00:00; the ISO segments are UTC, not the VN time
                        // the user entered). toVietnamDay/toVietnamTime convert
                        // the epoch to the VN wall-clock values.
                        const iso = toVietnamDay(activeBooking.date_time).split("-");
                        const t = toVietnamTime(activeBooking.date_time);
                        return iso.length === 3
                          ? `${iso[2]}/${iso[1]}/${iso[0]} ${t}`
                          : "—";
                      } catch {
                        return "—";
                      }
                    })()}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Right side: booking status badge (read-only) for non-walkin tabs.
              The status is now managed automatically — clicking "Hoàn tất" in
              the invoice summary creates the invoice and transitions the booking
              to "checkout". Walk-in tabs have no booking, so no badge is shown. */}
          {!isWalkinTab && activeBooking && (
            <div className="ml-auto flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                  activeBooking.status as BookingStatusType
                )}`}
              >
                {BookingStatusLabel[activeBooking.status as BookingStatusType]}
              </span>
            </div>
          )}

          {/* X close button — for ANY empty tab (no items, no pending invoice).
              Lets the cashier discard a mistakenly opened tab OR an empty
              booking tab (no service/product/package). Once an item is added
              the tab becomes a real (pending) invoice and the X disappears. */}
          {isEmptyTab && (
            <button
              type="button"
              onClick={() => closeCustomerTab(activeCustomer.customerId)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
              title="Đóng tab"
              aria-label="Đóng tab"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* === Walk-in tab: add new customer dialog === */}
      <Dialog open={showAddCustomer} onOpenChange={(v) => setShowAddCustomer(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm khách mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-customer-name">Tên khách hàng</Label>
              <Input
                id="new-customer-name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Nhập tên"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-customer-phone">Số điện thoại</Label>
              <Input
                id="new-customer-phone"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="Nhập SĐT"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddCustomer(false)}
              disabled={addingCustomer}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleAddNewCustomer}
              disabled={addingCustomer || !newCustomerName.trim()}
            >
              {addingCustomer ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paid invoice full-page view — opened when clicking "Hóa đơn: HDxxx"
          on a paid booking's info bar. */}
      {paidInvoiceView && (
        <PaidInvoiceView
          invoiceId={paidInvoiceView.invoiceId}
          customerName={paidInvoiceView.customerName}
          customerPhone={paidInvoiceView.customerPhone}
          bookingCode={paidInvoiceView.bookingCode}
          onClose={() => setPaidInvoiceView(null)}
        />
      )}

      {/* Customer history dialog — opened when clicking a customer's name
          (green link) in the info bar. Shows visit history, spending stats,
          and feedback for the linked customer. */}
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </div>
  );
}
