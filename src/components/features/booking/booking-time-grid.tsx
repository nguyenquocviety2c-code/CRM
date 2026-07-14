"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Booking, BookingServiceRow } from "@/stores/booking-store";
import {
  BookingStatusLabel,
  BookingStatusBadgeColors,
  BookingStatusType,
} from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamTime, toVietnamDay } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { BookingHoverDetails } from "@/components/features/booking/booking-staff-view";

interface BookingTimeGridProps {
  bookings: Booking[];
  onBookingClick?: (booking: Booking) => void;
  onStatusChange?: (bookingId: string, newStatus: BookingStatusType) => void;
  onEdit?: (booking: Booking) => void;
  onDelete?: (bookingId: string) => void;
  /**
   * Open the invoice dialog for a booking. Called when a PAID booking card
   * (checkout status = has a completed invoice) is clicked. Unpaid bookings
   * (confirmed / new / checkin / cancelled / no_show) fall back to the
   * regular onBookingClick (edit dialog).
   */
  onShowInvoice?: (booking: Booking) => void;
  /**
   * Called when the user clicks an EMPTY area of an hour row (not on an
   * existing booking card). Opens the "Create new booking" dialog with the
   * slot's hour pre-filled as the start time.
   * Slot shape: { date: "DD/MM/YYYY", time: "HH:mm" }
   */
  onSlotClick?: (slot: { date: string; time: string }) => void;
  /** The date to use when creating a new booking from an empty slot. */
  currentDate?: Date;
  /** When provided AND spanning 2+ days, the grid switches to a per-day column
   *  layout (one column per day) — mirroring the View nhân viên multi-day grid.
   *  4 days fill the table; 5+ days scroll horizontally. */
  dateRange?: { from: Date; to: Date };
}

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================
// The timeline covers 08:00 → 21:00 (13 one-hour bands). Hour labels are drawn
// for 08:00 ... 20:00 at the TOP of each band. Booking blocks are absolutely
// positioned: `top` = (startMinutesSince08:00 / 60) * PX_PER_HOUR, `height` =
// (totalDuration / 60) * PX_PER_HOUR. Multi-service bookings therefore span
// multiple hour bands (the core fix for the "only first service shows" bug).
const START_HOUR = 8;
const END_HOUR = 21; // exclusive — the last visible band is 20:00 → 21:00
const HOUR_COUNT = END_HOUR - START_HOUR; // 13
const PX_PER_HOUR = 80;
const TRACK_HEIGHT = HOUR_COUNT * PX_PER_HOUR; // 1040px
/** Width of the left "Giờ" label column. */
const TIME_COL_WIDTH = 96; // w-24
/** Minimum height for a booking block — keeps short services readable. */
const MIN_BLOCK_HEIGHT = 44;
/** Horizontal gap (px) between side-by-side booking blocks. */
const CARD_GAP_PX = 4;
/** Default width of a single slot when it doesn't overlap any other segment.
 *  ~1/4 of the visible viewport (1200px ÷ 4 ≈ 300px) so each booking occupies
 *  about a quarter of the interface by default — multiple non-overlapping
 *  bookings sit side-by-side instead of one stretching to full width. */
const DEFAULT_SLOT_WIDTH = 300;

/** Hour labels rendered down the left axis: 08:00 → 20:00. */
const HOURS: number[] = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);

/** A service-segment of a booking, positioned on the timeline at
 *  [startMin, startMin + duration). A segment = one or more CONSECUTIVE
 *  services performed by the SAME staff, merged into a single slot. Services
 *  run back-to-back (cursor advances by each service's duration), so
 *  consecutive in sort_order = adjacent in time. A run of same-staff services
 *  becomes one merged slot whose height ∝ the sum of their durations;
 *  different-staff services stay in separate slots (mirrors View nhân viên). */
interface ServiceSegment {
  booking: Booking;
  /** One or more consecutive same-staff services merged into this slot. */
  services: BookingServiceRow[];
  staffId: string;
  staffName: string;
  /** 0-based index of this segment (group) within the booking's segment list. */
  segmentIndex: number;
  /** Total number of segments (groups) in the booking (for the "1/2" badge). */
  totalSegments: number;
  /** Minutes from the timeline's START_HOUR (08:00) to this segment's start. */
  startMin: number;
  /** This segment's total duration = Σ of its services' durations (minutes). */
  duration: number;
}

/**
 * Timeline grid view ("Khung giờ") for the booking module.
 *
 * Layout:
 * - Vertical time axis on the left: one band per hour (08:00 → 21:00).
 * - Booking blocks are absolutely positioned over a continuous timeline so a
 *   multi-service booking visually spans the SUM of its services' durations
 *   (e.g. 3 services of 60+30+30 min → a 2-hour block). Overlapping bookings
 *   are laid out in side-by-side columns (greedy column assignment).
 * - Hovering a block shows a popover with full info + status select + edit/delete.
 */
export function BookingTimeGrid({
  bookings,
  onBookingClick,
  onStatusChange,
  onEdit,
  onDelete,
  onShowInvoice,
  onSlotClick,
  currentDate,
  dateRange,
}: BookingTimeGridProps) {
  const { hasPermission } = useAuthStore();
  const canViewCustomerPhone = hasPermission("view_customer_phone");
  const canBookPastDate = hasPermission("book_past_date");
  // Whether the viewed date is in the past (slot creation blocked when
  // !canBookPastDate).
  const isPastDate = (() => {
    if (!currentDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    return d < today;
  })();
  const slotLocked = isPastDate && !canBookPastDate;

  // Row-band resize (single-day timeline only). The user drags a horizontal
  // handle on the "Giờ" axis to grow/shrink every hour band. Persisted to
  // localStorage so the choice survives page switches / refreshes.
  const MIN_PX_PER_HOUR = 40;
  const MAX_PX_PER_HOUR = 200;
  const [pxPerHour, setPxPerHour] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("crm-cust-timegrid-pxph");
      const n = raw ? parseInt(raw, 10) : NaN;
      if (!isNaN(n) && n >= MIN_PX_PER_HOUR && n <= MAX_PX_PER_HOUR) return n;
    } catch { /* ignore */ }
    return PX_PER_HOUR;
  });
  const setPxPerHourPersisted = (n: number) => {
    const clamped = Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, n));
    setPxPerHour(clamped);
    try { localStorage.setItem("crm-cust-timegrid-pxph", String(clamped)); } catch { /* ignore */ }
  };

  // Decide whether to use the per-day column layout (when 2+ days selected).
  const rangeDayCount = useMemo(() => {
    if (!dateRange) return 0;
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(0, 0, 0, 0);
    if (to < from) return 1;
    return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  }, [dateRange]);
  const useMultiDayLayout = rangeDayCount >= 2;

  // Card factory shared by both layouts — keeps click/status/edit/delete logic
  // identical for the single-day and multi-day grids. Takes a SEGMENT (one
  // service of one booking) so multi-service bookings render as separate cards.
  const renderCard = (segment: ServiceSegment) => (
    <SegmentCard
      segment={segment}
      fullWidth
      onClick={() => {
        const isPaid = segment.booking.status === "checkout";
        if (isPaid && onShowInvoice) onShowInvoice(segment.booking);
        else onBookingClick?.(segment.booking);
      }}
      onStatusChange={(status) => onStatusChange?.(segment.booking.id, status)}
      onEdit={() => onEdit?.(segment.booking)}
      onDelete={() => onDelete?.(segment.booking.id)}
    />
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 border bg-white" style={{ maxHeight: "calc(100vh - 200px)" }}>
      {/* Header (sticky at top — does not scroll with the rows) */}
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2 shrink-0">
        <span className="text-sm font-semibold text-gray-700">Khung giờ</span>
        <span className="text-xs text-gray-500">{bookings.length} lịch hẹn</span>
      </div>

      {/* When 2+ days are selected, render a tidy grid-table (rows = hours,
          columns = days, chips stacked non-overlapping) — mirrors View nhân
          viên's multi-day layout so the customer view stays neat. */}
      {useMultiDayLayout && dateRange ? (
        <CustomerDayRangeGrid
          dateRange={dateRange}
          bookings={bookings}
          onBookingClick={onBookingClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onShowInvoice={onShowInvoice}
          onSlotClick={onSlotClick}
          slotLocked={slotLocked}
          canViewCustomerPhone={canViewCustomerPhone}
        />
      ) : (
        /* Single-day continuous timeline. The body scrolls both vertically and
           horizontally (many overlapping booking blocks may extend beyond the
           container width). time-grid-scroll → always-visible styled scrollbar.
           --px-per-hour is set on this root so all descendants (axis labels,
           gridlines, booking blocks) can resize hour bands via CSS var. */
        <div
          className="flex-1 overflow-auto time-grid-scroll"
          style={{ "--px-per-hour": `${pxPerHour}px` } as React.CSSProperties}
        >
          <TimelineColumn
            bookings={bookings}
            showLabels
            slotDate={currentDate}
            onSlotClick={onSlotClick}
            slotLocked={slotLocked}
            renderCard={renderCard}
            pxPerHour={pxPerHour}
            onPxPerHourChange={setPxPerHourPersisted}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TimelineColumn — a single continuous-timeline column with absolutely
// positioned booking blocks. Used for the single-day view (with labels) and
// once per day in the multi-day view (without labels).
// =============================================================================

interface TimelineColumnProps {
  bookings: Booking[];
  /** Render the "Giờ" label column on the left (single-day view). */
  showLabels: boolean;
  /** Date used when creating a new booking from an empty slot. */
  slotDate?: Date;
  onSlotClick?: (slot: { date: string; time: string }) => void;
  slotLocked: boolean;
  renderCard: (segment: ServiceSegment) => ReactNode;
  /** Fixed pixel width (multi-day scroll mode). When omitted the column is flex-1. */
  fixedWidth?: number;
  /** Current hour-band height (single-day view). Used to render drag handles on
   *  the "Giờ" axis that resize every band. When omitted, falls back to PX_PER_HOUR. */
  pxPerHour?: number;
  /** Called when the user drags an hour-band handle (single-day view). */
  onPxPerHourChange?: (px: number) => void;
}

function TimelineColumn({
  bookings,
  showLabels,
  slotDate,
  onSlotClick,
  slotLocked,
  renderCard,
  fixedWidth,
  pxPerHour,
  onPxPerHourChange,
}: TimelineColumnProps) {
  // Per-hour count of bookings STARTING in that hour (shown next to the label).
  const countByHour = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of bookings) {
      const h = getBookingStartHour(b);
      if (h === null) continue;
      m.set(h, (m.get(h) || 0) + 1);
    }
    return m;
  }, [bookings]);

  // Split each booking into one segment per service, then position every
  // segment absolutely with overlap-aware column assignment. A multi-service
  // booking therefore appears as separate blocks at consecutive time slices
  // (services run back-to-back) — different services by different staff are
  // never merged (mirrors View nhân viên).
  const positioned = useMemo(() => {
    const items: { segment: ServiceSegment; startMin: number; endMin: number }[] = [];
    const trackMinutes = HOUR_COUNT * 60;
    for (const b of bookings) {
      for (const seg of bookingToSegments(b)) {
        const segEnd = seg.startMin + seg.duration;
        // Skip only segments that start AFTER the visible window ends.
        // Segments that END before the visible window (e.g. a booking at 03:30
        // AM with a 2-hour duration ending at 05:30 — before 08:00) are NOT
        // skipped: they're CLAMPED to the top of the grid so the user can
        // SEE them and click to fix the time. Without this, a booking at
        // 03:30 VN (e.g. from a timezone bug) would be invisible in the
        // Khung giờ view — the user would see 4 bookings in the list but
        // only 3 in the grid.
        if (seg.startMin >= trackMinutes) continue;
        const clampedStart = Math.max(seg.startMin, 0);
        // If the entire segment is before the visible window (segEnd <= 0),
        // give it a minimum visible height (30 min) at the top of the grid
        // so the user can see + click it.
        const clampedEnd = segEnd <= 0
          ? Math.max(clampedStart + 30, Math.min(segEnd, trackMinutes))
          : Math.min(segEnd, trackMinutes);
        items.push({ segment: seg, startMin: clampedStart, endMin: clampedEnd });
      }
    }
    return layoutSegments(items);
  }, [bookings]);

  // Effective hour-band height for JS arithmetic (segment block positioning).
  // When pxPerHour is provided (single-day view), use it; otherwise fall back
  // to the PX_PER_HOUR constant (multi-day dead code / fixedWidth mode).
  const pph = pxPerHour ?? PX_PER_HOUR;
  const trackHeightPx = HOUR_COUNT * pph;
  // CSS calc strings so all descendants resize when --px-per-hour changes.
  // Only set when pxPerHour is provided (single-day root sets the CSS var);
  // otherwise use the constant pixel values (multi-day fixedWidth).
  const useVar = pxPerHour !== undefined;
  const trackHeight = useVar ? `calc(${HOUR_COUNT} * var(--px-per-hour))` : `${trackHeightPx}px`;
  const bandTop = (h: number) => useVar ? `calc(${h - START_HOUR} * var(--px-per-hour))` : `${(h - START_HOUR) * pph}px`;
  const bandHeight = useVar ? "var(--px-per-hour)" : `${pph}px`;

  const rootStyle: React.CSSProperties = fixedWidth
    ? { width: `${fixedWidth}px`, flexShrink: 0, height: trackHeightPx }
    : { flex: "1 1 0%", minWidth: 0, height: trackHeight };

  return (
    <div className="flex" style={rootStyle}>
      {showLabels && (
        <div
          className="relative shrink-0 border-r bg-gray-50/60"
          style={{ width: TIME_COL_WIDTH, height: trackHeight }}
        >
          {HOURS.map((h) => {
            const count = countByHour.get(h) || 0;
            return (
              <div
                key={h}
                className="absolute left-0 right-0 px-3"
                style={{ top: bandTop(h) }}
              >
                <div className="text-sm font-medium text-gray-700">
                  {`${String(h).padStart(2, "0")}:00`}
                </div>
                {count > 0 && <div className="text-xs text-gray-400">({count})</div>}
              </div>
            );
          })}
          {/* Hour-band drag handles — one at each gridline (between hour h and
              h+1). The user grabs any handle and drags up/down to grow/shrink
              EVERY hour band (all bands share the same --px-per-hour). Only
              rendered when onPxPerHourChange is provided (single-day view). */}
          {onPxPerHourChange && pxPerHour !== undefined && HOURS.slice(0, -1).map((h) => (
            <div
              key={`handle-${h}`}
              data-hour-resizer
              className="absolute left-0 right-0 z-30 cursor-row-resize hover:bg-emerald-200/50"
              style={{
                top: `calc(${h + 1 - START_HOUR} * var(--px-per-hour) - 4px)`,
                height: "8px",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startPph = pxPerHour;
                document.body.style.cursor = "row-resize";
                document.body.style.userSelect = "none";
                const onMove = (ev: MouseEvent) => {
                  const delta = ev.clientY - startY;
                  onPxPerHourChange(startPph + delta);
                };
                const onUp = () => {
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            />
          ))}
        </div>
      )}

      {/* The continuous timeline track. */}
      <div className="relative flex-1" style={{ height: trackHeight }}>
        {/* Horizontal hour gridlines. */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-gray-300"
            style={{ top: bandTop(h) }}
          />
        ))}
        {/* Bottom border (21:00 line). */}
        <div className="absolute left-0 right-0 border-t border-gray-300" style={{ top: trackHeight }} />

        {/* Clickable empty hour bands — open the "Create booking" dialog with
            the band's hour pre-filled. Rendered BEHIND the booking blocks so
            clicking a block hits the block (not the band). */}
        {onSlotClick && !slotLocked && slotDate && HOURS.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 cursor-pointer hover:bg-sky-50/40"
            style={{
              top: bandTop(h),
              height: bandHeight,
            }}
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              const hh = String(h).padStart(2, "0");
              const dd = String(slotDate.getDate()).padStart(2, "0");
              const mo = String(slotDate.getMonth() + 1).padStart(2, "0");
              const yyyy = slotDate.getFullYear();
              onSlotClick({ date: `${dd}/${mo}/${yyyy}`, time: `${hh}:00` });
            }}
          />
        ))}

        {/* Segment blocks — one per service, absolutely positioned at
            [start, start+duration). Different services by different staff are
            never merged. Default width ~1/4 of the interface; overlapping
            segments split the column evenly. Uses pxPerHour (JS) for the
            Math.max height clamp. */}
        {positioned.map((p) => {
          const top = (p.startMin / 60) * pph;
          const height = Math.max(MIN_BLOCK_HEIGHT, ((p.endMin - p.startMin) / 60) * pph);
          const widthPx = DEFAULT_SLOT_WIDTH;
          const leftPx = p.col * (widthPx + CARD_GAP_PX);
          return (
            <div
              key={`${p.segment.booking.id}-${p.segment.segmentIndex}`}
              className="absolute"
              style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `${leftPx}px`,
                width: `${widthPx}px`,
              }}
            >
              {renderCard(p.segment)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A single service-segment card. The face shows THIS segment's service +
 *  duration + staff + time range; the hover popover shows the FULL booking
 *  (all services, status, edit/delete) for context. A multi-service booking
 *  therefore appears as multiple SegmentCards stacked at consecutive time
 *  slices — different services by different staff are never merged. */
function SegmentCard({
  segment,
  onClick,
  onStatusChange,
  onEdit,
  onDelete,
  fullWidth = false,
}: {
  segment: ServiceSegment;
  onClick: () => void;
  onStatusChange: (status: BookingStatusType) => void;
  onEdit: () => void;
  onDelete: () => void;
  fullWidth?: boolean;
}) {
  const booking = segment.booking;
  // Segment-specific face values (the popover below uses `booking` for the
  // full-booking context).
  const segStaffName = segment.staffName;
  const isMultiSegment = segment.totalSegments > 1;
  const isMergedSlot = segment.services.length > 1;
  const segStartTotalMin = START_HOUR * 60 + segment.startMin;
  const segEndTotalMin = segStartTotalMin + segment.duration;
  const fmtMin = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  const segTimeRange = `${fmtMin(segStartTotalMin)} - ${fmtMin(segEndTotalMin)}`;
  const canCancelPayment = useAuthStore((s) => s.hasPermission("cancel_payment"));
  const canViewCustomerPhone = useAuthStore((s) => s.hasPermission("view_customer_phone"));
  const [hovered, setHovered] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  // Segment-specific service info — the popover shows ONLY this slot's
  // service(s) (the segment's), not the full booking's. A multi-service booking
  // with different staff appears as separate slots; each slot's popover shows
  // only its own service + the staff who performs it (per the user's request:
  // "slot dành cho dịch vụ nào thì chỉ hiển thị thông tin của dịch vụ đấy").
  // NOTE: the hover popover now uses the shared BookingHoverDetails component
  // (same as View nhân viên), so the segment-specific service summary vars are
  // no longer needed here — BookingHoverDetails fetches the full booking +
  // invoice and shows all services with durations.
  const dateLabel = getBookingDateLabel(booking);

  // Card background color — groups the booking by payment/cancellation state
  // so the cashier can tell at a glance which slots need attention:
  // - Paid (checkout) → emerald tint (matches the status badge)
  // - Unpaid active (new / confirmed / checkin) → sky tint (in-progress)
  // - Cancelled / no-show → gray/red tint (dead slots)
  // We use the SAME color tokens as the status badge (BookingStatusBadgeColors)
  // so the card and its popover badge stay visually consistent. The badge text
  // color is applied to the time label so the slot still has readable contrast.
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  const cardBg = isPaid
    ? "bg-emerald-50 border-emerald-300"
    : isCancelled
      ? "bg-red-50 border-red-200"
      : "bg-sky-50 border-sky-300";
  const timeText = isPaid
    ? "text-emerald-700"
    : isCancelled
      ? "text-red-700"
      : "text-sky-700";

  // Determine which next-statuses are allowed — SAME logic as the list view
  // (booking-customer-view.tsx). Terminal statuses (checkout/no_show/cancelled)
  // cannot be changed (app-wide rule: đã checkout/Xác nhận thanh toán then no
  // status change allowed). The select is hidden for terminal statuses.
  let statusOptions: BookingStatusType[] = [];
  if (booking.status === "confirmed" || booking.status === "new") {
    statusOptions = ["checkin", "no_show", "cancelled"];
  } else if (booking.status === "checkin") {
    // checkin → can cancel (customer showed up but changed mind before paying;
    // the slot is freed for a new booking).
    statusOptions = ["cancelled"];
  }

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        // Don't close the popover while the status select dropdown is open —
        // its content renders in a portal outside this container, so the mouse
        // leaving would otherwise dismiss the popover before a selection lands.
        if (selectOpen) return;
        setHovered(false);
      }}
    >
      {/* Card (clickable → opens edit or invoice depending on paid status). */}
      <button
        type="button"
        onClick={onClick}
        className={`group flex h-full w-full ${fullWidth ? "" : "w-[220px] shrink-0"} cursor-pointer flex-col overflow-hidden border p-2.5 text-left shadow-sm transition hover:shadow-md ${cardBg}`}
      >
        {/* Time range for THIS segment's slice + date + multi-service badge.
            shrink-0 → always visible even when the slot is short. */}
        <div className="flex shrink-0 items-center justify-between">
          <span className={`text-sm font-semibold ${timeText}`}>
            {segTimeRange}
            {dateLabel && <span className="ml-1 text-xs font-normal text-gray-500">{dateLabel}</span>}
          </span>
          <div className="flex items-center gap-1">
            {isMultiSegment && (
              <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {segment.segmentIndex + 1}/{segment.totalSegments}
              </span>
            )}
            {booking.numberOfCustomers > 1 && (
              <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                ×{booking.numberOfCustomers}
              </span>
            )}
          </div>
        </div>
        {/* Customer — prioritized over services. shrink-0 → always visible
            even when the slot is short; services below absorb the overflow. */}
        <div className="mt-0.5 shrink-0 truncate text-sm font-medium text-gray-900">
          {booking.customer?.name || "Khách"}
          {booking.customer?.phone && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              {canViewCustomerPhone ? booking.customer.phone : maskPhone(booking.customer.phone)}
            </span>
          )}
        </div>
        {/* Services — list ALL services in this merged slot, each with its
            duration. This section is flex-1 + overflow-hidden so it fills the
            remaining height and CLIPS from the bottom when the slot is too
            short: time range + customer always show first, services that don't
            fit are simply hidden (per the user's request). */}
        {isMergedSlot ? (
          <div className="mt-0.5 min-h-0 flex-1 overflow-hidden">
            <div className="space-y-0.5">
              {segment.services.map((s, i) => (
                <div key={i} className="truncate text-xs text-gray-700">
                  {s.service?.name || "Dịch vụ"}
                  {s.service?.duration ? <span className="ml-0.5 text-gray-500">({s.service.duration})</span> : null}
                </div>
              ))}
            </div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-sky-600">NV: {segStaffName}</div>
          </div>
        ) : (
          <div className="mt-0.5 min-h-0 flex-1 overflow-hidden flex items-center gap-1 text-xs">
            <span className="truncate text-gray-700">
              {segment.services[0]?.service?.name || "Dịch vụ"}
              {segment.services[0]?.service?.duration ? <span className="ml-0.5 text-gray-500">({segment.services[0].service!.duration})</span> : null}
            </span>
            <span className="shrink-0 font-medium text-sky-600">NV: {segStaffName}</span>
          </div>
        )}
      </button>

      {/* Hover popover — uses the SAME BookingHoverDetails component as the
          View nhân viên (staff-view) so the hover experience is identical
          across both views: customer name | phone, status + select, services
          with duration + staff in blue, "Tạo bởi" + "Đơn hàng"/"Xem hóa đơn"
          link, edit + trash buttons. */}
      {hovered && (
        <div className="absolute left-0 top-0 z-50 mt-1 w-[255px] border bg-white shadow-xl">
          <BookingHoverDetails
            booking={booking}
            canViewCustomerPhone={canViewCustomerPhone}
            statusOptions={statusOptions}
            onStatusChange={onStatusChange}
            selectOpen={selectOpen}
            setSelectOpen={setSelectOpen}
            onEdit={onEdit}
            onDelete={onDelete}
            canCancelPayment={canCancelPayment}
            onOpenInvoice={onClick}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/** Split a booking into SEGMENTS where each segment = a run of same-staff
 *  services merged into one slot. PARALLEL model: every service in the booking
 *  starts at the SAME booking-level start time (each runs on a different staff,
 *  simultaneously), so every segment's startMin = the booking's startMin (NO
 *  cursor advance). A run of same-staff services still merges into one taller
 *  block (duration = sum of their durations). Matches the parallel server-side
 *  conflict check in /api/supabase/bookings/route.ts. */
function bookingToSegments(booking: Booking): ServiceSegment[] {
  const startMin = getBookingStartMinutesFromOpen(booking);
  if (startMin === null) return [];
  const services = getAllServices(booking)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // Group consecutive same-staff services into one segment.
  const groups: BookingServiceRow[][] = [];
  for (const s of services) {
    const last = groups.length > 0 ? groups[groups.length - 1] : null;
    const lastStaffId = last && last.length > 0 ? last[last.length - 1].staff_id : null;
    if (last && lastStaffId && lastStaffId === s.staff_id) {
      last.push(s);
    } else {
      groups.push([s]);
    }
  }
  const total = groups.length;
  // PARALLEL: every segment starts at the booking's startMin. Previously a
  // cursor advanced by each segment's duration (consecutive model), making the
  // 2nd service of a multi-staff booking appear at startMin + 1st duration
  // (e.g. 11:00 instead of 09:30). Fixed to parallel.
  const segs: ServiceSegment[] = [];
  groups.forEach((group, i) => {
    const duration = group.reduce((sum, s) => sum + (s.service?.duration || 0), 0);
    segs.push({
      booking,
      services: group,
      staffId: group[0].staff_id || "",
      staffName: group[0].staff?.name || "—",
      segmentIndex: i,
      totalSegments: total,
      startMin,
      duration,
    });
  });
  return segs;
}

/** All service rows on the booking that carry a service or staff reference. */
function getAllServices(booking: Booking): BookingServiceRow[] {
  const services = booking.services as BookingServiceRow[];
  if (!Array.isArray(services)) return [];
  return services.filter((s) => s && (s.service || s.staff));
}

function getBookingStartHour(booking: Booking): number | null {
  const dt = booking.date_time;
  if (!dt) return null;
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const hour = parseInt(m[4], 10);
  return isNaN(hour) ? null : hour;
}

/** Minutes since the timeline's START_HOUR (08:00). May be negative (booking
 *  starts before the visible window) — callers clamp as needed. */
function getBookingStartMinutesFromOpen(booking: Booking): number | null {
  const dt = booking.date_time;
  if (!dt) return null;
  // Timezone-safe Vietnam time (Supabase stores +00:00; the "THH:MM" segment
  // is UTC, not the VN time the user entered).
  const hhmm = toVietnamTime(dt);
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  return (hour - START_HOUR) * 60 + minute;
}

/** Format the booking's date as "dd/MM" (compact) for display alongside the time. */
function getBookingDateLabel(booking: Booking): string {
  const dt = booking.date_time;
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// =============================================================================
// OVERLAP-AWARE SEGMENT LAYOUT (Google-Calendar style)
// =============================================================================
// Segments are grouped into clusters of mutually-overlapping intervals, then
// each cluster is split into the fewest parallel columns needed so no two
// blocks in the same column overlap. Every block in a cluster gets an equal
// 1/cols slice of the column width.

type LaidOutSegment = {
  segment: ServiceSegment;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
};

function layoutSegments(
  items: { segment: ServiceSegment; startMin: number; endMin: number }[],
): LaidOutSegment[] {
  if (items.length === 0) return [];

  // Sort by start time (earlier first), then by longer duration first so wide
  // blocks claim the leftmost column.
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );

  // Cluster segments whose [start, end) intervals overlap transitively.
  const clusters: typeof items[] = [];
  let current: typeof items = [];
  let clusterEnd = -Infinity;
  for (const it of sorted) {
    if (current.length === 0 || it.startMin < clusterEnd) {
      current.push(it);
      clusterEnd = Math.max(clusterEnd, it.endMin);
    } else {
      clusters.push(current);
      current = [it];
      clusterEnd = it.endMin;
    }
  }
  if (current.length) clusters.push(current);

  const result: LaidOutSegment[] = [];
  for (const cluster of clusters) {
    // Greedy column assignment: place each segment in the leftmost column
    // whose current tail ends at or before this segment's start.
    const columnTails: number[] = [];
    const placement: { it: (typeof items)[0]; col: number }[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < columnTails.length; c++) {
        if (columnTails[c] <= it.startMin) {
          columnTails[c] = it.endMin;
          placement.push({ it, col: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columnTails.push(it.endMin);
        placement.push({ it, col: columnTails.length - 1 });
      }
    }
    const cols = columnTails.length;
    for (const { it, col } of placement) {
      result.push({
        segment: it.segment,
        startMin: it.startMin,
        endMin: it.endMin,
        col,
        cols,
      });
    }
  }
  return result;
}

// =============================================================================
// MULTI-DAY COLUMN LAYOUT — DayColumnGrid
// =============================================================================
// Renders one TimelineColumn per day in the selected date range, sharing a
// single left "Giờ" label column. Booking blocks span the SUM of their
// services' durations exactly like the single-day view (the fix applies to
// both layouts).
//
// Sizing (mirrors View nhân viên):
//   - 2–4 days → columns fill the full table width (flex-1 each), no scroll.
//   - 5+ days → each column keeps the SAME width as 4 days would have had
//     (measured via ResizeObserver), and the table scrolls horizontally.
//
// Vertical scrolling happens INSIDE the table body (overflow-y-auto) so the
// module header / filters stay fixed — the whole page doesn't scroll.
// =============================================================================

interface DayColumnGridProps {
  dateRange: { from: Date; to: Date };
  bookings: Booking[];
  onSlotClick?: (slot: { date: string; time: string }) => void;
  slotLocked: boolean;
  renderCard: (segment: ServiceSegment) => ReactNode;
}

/** Minimum day column width (used as a floor when computing scrollColWidth). */
const TG_DAY_COL_MIN_WIDTH = 220;
/** The 4-day baseline: 1–4 days fill the table; 5+ keep that column width. */
const TG_BASELINE_DAYS = 4;

/** Build the list of calendar days (inclusive) between `from` and `to`. */
function buildDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  if (end < start) return [start];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Build a `YYYY-MM-DD` dayKey from a local Date (no UTC shift). */
function dateToDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extract { dayKey, hour } from the ISO date_time (regex, no TZ shift). */
function getBookingDayHourKey(booking: Booking): { dayKey: string; hour: number } | null {
  const dt = booking.date_time;
  if (!dt || typeof dt !== "string") return null;
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);
  if (!m) return null;
  const hour = parseInt(m[4], 10);
  if (isNaN(hour)) return null;
  return { dayKey: `${m[1]}-${m[2]}-${m[3]}`, hour };
}

function DayColumnGrid({
  dateRange,
  bookings,
  onSlotClick,
  slotLocked,
  renderCard,
}: DayColumnGridProps) {
  const days = useMemo(() => buildDays(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);

  // Measure container width to compute scrollColWidth = (container - timeCol) / 4.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dayCount = days.length;
  const needsScroll = dayCount > TG_BASELINE_DAYS;
  const scrollColWidth = containerWidth > 0
    ? Math.max(TG_DAY_COL_MIN_WIDTH, (containerWidth - TIME_COL_WIDTH) / TG_BASELINE_DAYS)
    : 280;
  const totalWidth = needsScroll
    ? TIME_COL_WIDTH + dayCount * scrollColWidth
    : undefined;

  // Horizontal scroll tracking — shows left/right arrow buttons when the grid
  // content overflows horizontally (many days selected). The buttons let the
  // user scroll left/right one column at a time, complementing the native
  // scrollbar (which may be invisible on overlay-scrollbar browsers).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollFlags = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };
  useEffect(() => {
    updateScrollFlags();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollFlags);
    const ro = new ResizeObserver(updateScrollFlags);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollFlags);
      ro.disconnect();
    };
  }, [days, containerWidth]);
  const scrollByColumns = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * scrollColWidth, behavior: "smooth" });
  };

  // Index bookings by day so each day column only renders its own bookings.
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const info = getBookingDayHourKey(b);
      if (!info) continue;
      const arr = m.get(info.dayKey);
      if (arr) arr.push(b);
      else m.set(info.dayKey, [b]);
    }
    return m;
  }, [bookings]);

  const weekdayVi = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  return (
    <div
      ref={containerRef}
      className="border bg-white flex flex-col relative"
      style={{ maxHeight: "calc(100vh - 200px)" }}
    >
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto time-grid-scroll">
        <div
          style={
            needsScroll
              ? { width: `${totalWidth}px`, minWidth: `${totalWidth}px` }
              : { width: "100%" }
          }
        >
          {/* Header: "Giờ" + day columns — sticky at top during vertical scroll */}
          <div className="flex border-b bg-gray-50 sticky top-0 z-10">
            <div
              className="shrink-0 border-r px-3 py-2 text-sm font-semibold text-gray-700"
              style={{ width: TIME_COL_WIDTH }}
            >
              Khung giờ
            </div>
            {days.map((day, idx) => {
              const isToday = (() => {
                const t = new Date();
                t.setHours(0, 0, 0, 0);
                const d = new Date(day);
                d.setHours(0, 0, 0, 0);
                return t.getTime() === d.getTime();
              })();
              return (
                <div
                  key={idx}
                  className={`border-r px-3 py-2 text-center ${isToday ? "bg-emerald-50" : ""}`}
                  style={needsScroll ? { width: scrollColWidth, flexShrink: 0 } : { flex: "1 1 0%", minWidth: 0 }}
                >
                  <div className="text-[11px] font-medium text-gray-500">{weekdayVi[day.getDay()]}</div>
                  <div className={`text-sm font-semibold ${isToday ? "text-emerald-700" : "text-gray-800"}`}>
                    {`${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body: shared "Giờ" label column + one TimelineColumn per day. */}
          <div className="flex" style={{ height: TRACK_HEIGHT }}>
            {/* Giờ label column */}
            <div
              className="relative shrink-0 border-r bg-gray-50/60"
              style={{ width: TIME_COL_WIDTH, height: TRACK_HEIGHT }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 px-3"
                  style={{ top: (h - START_HOUR) * PX_PER_HOUR }}
                >
                  <div className="text-sm font-medium text-gray-700">
                    {`${String(h).padStart(2, "0")}:00`}
                  </div>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day, idx) => {
              const dayKey = dateToDayKey(day);
              const dayBookings = byDay.get(dayKey) || [];
              return (
                <TimelineColumn
                  key={idx}
                  bookings={dayBookings}
                  showLabels={false}
                  slotDate={day}
                  onSlotClick={onSlotClick}
                  slotLocked={slotLocked}
                  renderCard={renderCard}
                  fixedWidth={needsScroll ? scrollColWidth : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Left/right scroll arrows — always-visible clickable buttons that scroll
          the grid horizontally by one column. Shown only when there is content
          beyond the visible edge (canScrollLeft / canScrollRight). Complements
          the native scrollbar (which may be invisible on overlay-scrollbar
          browsers) so the user can always navigate when many days are selected. */}
      {needsScroll && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByColumns(-1)}
          aria-label="Cuộn sang trái"
          className="absolute left-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-gray-300 bg-white/90 text-gray-600 shadow-md hover:bg-white hover:text-gray-900"
          style={{ marginLeft: TIME_COL_WIDTH }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {needsScroll && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByColumns(1)}
          aria-label="Cuộn sang phải"
          className="absolute right-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-white/90 text-gray-600 shadow-md hover:bg-white hover:text-gray-900"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// MULTI-DAY GRID TABLE (CustomerDayRangeGrid) — grid-table layout mirroring
// View nhân viên's DayRangeGrid. Rows = hours, columns = days, each cell holds
// non-overlapping chips stacked top-to-bottom. This replaces the absolute-
// positioning DayColumnGrid for multi-day so the layout stays tidy when many
// days/bookings are selected (per the user's request).
// =============================================================================

const CDG_TIME_COL_WIDTH = 64;
const CDG_DAY_COL_MIN_WIDTH = 160;
const CDG_ROW_HEIGHT = 90;
const CDG_BASELINE_DAYS = 4;

/** Build the inclusive list of local-midnight Dates between `from` and `to`. */
function cdgBuildDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  if (end < start) return [start];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** `YYYY-MM-DD` key from a local Date (no UTC shift). */
function cdgDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extract { dayKey, hour, minute } from the booking's `date_time` as VIETNAM
 *  wall-clock values. Post-migration (Task 6), `date_time` is stored as a UTC
 *  ISO string (e.g. "2026-07-14T03:30:00+00:00" represents 10:30 VN), so the
 *  raw "THH:MM" segment is the UTC time, NOT the VN time the user entered.
 *  Using `toVietnamDay` + `toVietnamTime` ensures the booking lands in the
 *  correct row+column of the multi-day grid (a 10:30 VN booking lands in the
 *  "10:00" row of column "2026-07-14", not the skipped "03:00" row). */
function cdgBookingDayHour(booking: Booking): { dayKey: string; hour: number; minute: number } | null {
  const dt = booking.date_time;
  if (!dt || typeof dt !== "string") return null;
  const dayKey = toVietnamDay(dt);
  const hhmm = toVietnamTime(dt);
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  return { dayKey, hour, minute };
}

interface CustomerDayRangeGridProps {
  dateRange: { from: Date; to: Date };
  bookings: Booking[];
  onBookingClick?: (booking: Booking) => void;
  onEdit?: (booking: Booking) => void;
  onDelete?: (bookingId: string) => void;
  onShowInvoice?: (booking: Booking) => void;
  onSlotClick?: (slot: { date: string; time: string }) => void;
  slotLocked: boolean;
  canViewCustomerPhone: boolean;
}

function CustomerDayRangeGrid({
  dateRange,
  bookings,
  onBookingClick,
  onEdit,
  onDelete,
  onShowInvoice,
  onSlotClick,
  slotLocked,
  canViewCustomerPhone,
}: CustomerDayRangeGridProps) {
  const days = useMemo(() => cdgBuildDays(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);
  const hours = HOURS;

  // Measure container width to compute per-day column width for 5+ days.
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Index bookings by `${dayKey}|${hour}` for O(1) cell lookup. Bookings whose
  // start hour falls outside [START_HOUR, END_HOUR) are skipped (not shown).
  const cellMap = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const info = cdgBookingDayHour(b);
      if (!info) continue;
      if (info.hour < START_HOUR || info.hour >= END_HOUR) continue;
      const key = `${info.dayKey}|${info.hour}`;
      const arr = m.get(key);
      if (arr) arr.push(b);
      else m.set(key, [b]);
    }
    // Sort each cell's bookings:
    // 1. UNPAID bookings (pending/new/confirmed/checkin) take priority and
    //    render ON TOP of cancelled/no_show ones. When a cancelled booking
    //    would occupy the same slot as an unpaid booking (same start minute),
    //    the unpaid one wins the visible position. This implements the user's
    //    requirement: "lịch chưa thanh toán hiển thị đè lên lịch đã hủy".
    // 2. Within the same priority, sort by start minute (earlier → top) so
    //    the cell still reads top-to-bottom chronologically.
    const PRIORITY: Record<string, number> = {
      // unpaid / active → priority 0 (top)
      pending: 0,
      new: 0,
      confirmed: 0,
      checkin: 0,
      // paid → priority 1
      checkout: 1,
      // cancelled / no-show → priority 2 (bottom, "hidden under" unpaid)
      cancelled: 2,
      no_show: 2,
    };
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const pa = PRIORITY[a.status] ?? 1;
        const pb = PRIORITY[b.status] ?? 1;
        if (pa !== pb) return pa - pb;
        const ai = cdgBookingDayHour(a);
        const bi = cdgBookingDayHour(b);
        return (ai?.minute ?? 0) - (bi?.minute ?? 0);
      });
      // When an UNPAID booking and a CANCELLED booking share the EXACT same
      // start minute (a true slot collision — e.g. a cancelled booking at
      // 10:30 and a new confirmed booking at 10:30 for the same staff), hide
      // the cancelled one entirely so the unpaid booking's chip is fully
      // visible (not stacked under/over the cancelled chip). Bookings with
      // different start minutes stay (they're different time slots within
      // the same hour cell).
      const hasUnpaid = arr.some(
        (b) => (PRIORITY[b.status] ?? 1) === 0
      );
      if (hasUnpaid) {
        // Build a set of start-minutes that have an unpaid booking.
        const unpaidMinutes = new Set<number>();
        for (const b of arr) {
          if ((PRIORITY[b.status] ?? 1) === 0) {
            const info = cdgBookingDayHour(b);
            if (info) unpaidMinutes.add(info.minute);
          }
        }
        // Remove cancelled/no_show bookings whose start minute collides with
        // an unpaid booking's start minute. Keep non-colliding cancelled ones
        // (different slot within the same hour) so the staff still sees them.
        for (let i = arr.length - 1; i >= 0; i--) {
          const b = arr[i];
          const isCancelled = b.status === "cancelled" || b.status === "no_show";
          if (!isCancelled) continue;
          const info = cdgBookingDayHour(b);
          if (info && unpaidMinutes.has(info.minute)) {
            arr.splice(i, 1);
          }
        }
      }
    }
    return m;
  }, [bookings]);

  const dayCount = days.length;
  const needsScroll = dayCount > CDG_BASELINE_DAYS;
  const scrollColWidth = containerWidth > 0
    ? Math.max(CDG_DAY_COL_MIN_WIDTH, (containerWidth - CDG_TIME_COL_WIDTH) / CDG_BASELINE_DAYS)
    : 240;
  const totalWidth = needsScroll
    ? CDG_TIME_COL_WIDTH + dayCount * scrollColWidth
    : undefined;

  // Horizontal scroll-arrow visibility (mirrors DayColumnGrid's logic).
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollFlags = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };
  useEffect(() => {
    updateScrollFlags();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollFlags);
    const ro = new ResizeObserver(updateScrollFlags);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollFlags);
      ro.disconnect();
    };
  }, [days, containerWidth]);
  const scrollByColumns = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * scrollColWidth, behavior: "smooth" });
  };

  const weekdayVi = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  const handleCellClick = (day: Date, hour: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick || slotLocked) return;
    if (e.target !== e.currentTarget) return; // only empty area
    const dd = String(day.getDate()).padStart(2, "0");
    const mo = String(day.getMonth() + 1).padStart(2, "0");
    const yyyy = day.getFullYear();
    onSlotClick({ date: `${dd}/${mo}/${yyyy}`, time: `${String(hour).padStart(2, "0")}:00` });
  };

  const handleChipClick = (booking: Booking) => {
    const isPaid = booking.status === "checkout";
    if (isPaid && onShowInvoice) onShowInvoice(booking);
    else onBookingClick?.(booking);
  };

  return (
    <div ref={containerRef} className="border bg-white flex flex-col relative" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto time-grid-scroll" data-grid-resizable>
        <div style={needsScroll ? { width: `${totalWidth}px`, minWidth: `${totalWidth}px` } : { width: "100%" }}>
          {/* Header: "Giờ" + day columns — sticky at top during vertical scroll */}
          <div
            data-grid-header
            className="grid border-b bg-gray-50 sticky top-0 z-10"
            style={{
              gridTemplateColumns: needsScroll
                ? `${CDG_TIME_COL_WIDTH}px repeat(${dayCount}, ${scrollColWidth}px)`
                : `${CDG_TIME_COL_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-r p-2 text-center text-xs font-semibold text-gray-600">Giờ</div>
            {days.map((day, idx) => {
              const isToday = (() => {
                const t = new Date(); t.setHours(0, 0, 0, 0);
                const d = new Date(day); d.setHours(0, 0, 0, 0);
                return t.getTime() === d.getTime();
              })();
              return (
                <div key={idx} className={`border-r p-2 text-center ${isToday ? "bg-emerald-50" : ""}`}>
                  <div className="text-[11px] font-medium text-gray-500">{weekdayVi[day.getDay()]}</div>
                  <div className={`text-sm font-semibold ${isToday ? "text-emerald-700" : "text-gray-800"}`}>
                    {`${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body: one row per hour. minHeight so rows expand when a cell has
              many bookings — no internal cell scroll. */}
          <div data-grid-body>
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid border-b last:border-b-0"
                style={{
                  gridTemplateColumns: needsScroll
                    ? `${CDG_TIME_COL_WIDTH}px repeat(${dayCount}, ${scrollColWidth}px)`
                    : `${CDG_TIME_COL_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`,
                  minHeight: `${CDG_ROW_HEIGHT}px`,
                }}
              >
                <div className="border-r bg-gray-50/60 px-2 py-1 text-[11px] text-gray-500">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {days.map((day, dayIdx) => {
                  const dayKey = cdgDateKey(day);
                  const cellBookings = cellMap.get(`${dayKey}|${hour}`) || [];
                  const isToday = (() => {
                    const t = new Date(); t.setHours(0, 0, 0, 0);
                    const d = new Date(day); d.setHours(0, 0, 0, 0);
                    return t.getTime() === d.getTime();
                  })();
                  return (
                    <div
                      key={dayIdx}
                      onClick={(e) => handleCellClick(day, hour, e)}
                      className={`border-r p-1 ${slotLocked ? "bg-gray-50/40" : "cursor-pointer hover:bg-orange-100"} ${isToday ? "bg-emerald-50/20" : ""}`}
                    >
                      <div className="grid grid-cols-2 gap-1">
                        {cellBookings.map((b, i) => (
                          <div
                            key={b.id}
                            className={i === cellBookings.length - 1 && cellBookings.length % 2 === 1 ? "col-span-2" : ""}
                          >
                            <CustomerGridChip
                              booking={b}
                              canViewCustomerPhone={canViewCustomerPhone}
                              onClick={() => handleChipClick(b)}
                              onEdit={onEdit}
                              onDelete={onDelete}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Left/right scroll arrows — same UX as DayColumnGrid. */}
      {needsScroll && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByColumns(-1)}
          aria-label="Cuộn sang trái"
          className="absolute left-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-gray-300 bg-white/90 text-gray-600 shadow-md hover:bg-white hover:text-gray-900"
          style={{ marginLeft: CDG_TIME_COL_WIDTH }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {needsScroll && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByColumns(1)}
          aria-label="Cuộn sang phải"
          className="absolute right-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-white/90 text-gray-600 shadow-md hover:bg-white hover:text-gray-900"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** Compact booking chip for the customer multi-day grid cells. Non-overlapping:
 *  each chip is a flex child in its cell so multiple bookings stack vertically.
 *  Hovering opens a popover with service breakdown + edit/delete. */
function CustomerGridChip({
  booking,
  canViewCustomerPhone,
  onClick,
  onEdit,
  onDelete,
}: {
  booking: Booking;
  canViewCustomerPhone: boolean;
  onClick: () => void;
  onEdit?: (booking: Booking) => void;
  onDelete?: (bookingId: string) => void;
}) {
  const canCancelPayment = useAuthStore((s) => s.hasPermission("cancel_payment"));
  const serviceRows = getAllServices(booking);
  const svc = serviceRows[0] || null;
  const serviceName = svc?.service?.name || "Dịch vụ";
  const totalDuration = serviceRows.reduce((sum, s) => sum + (s.service?.duration || 0), 0);
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  const chipBg = isPaid
    ? "bg-emerald-50 border-emerald-300"
    : isCancelled
      ? "bg-red-50 border-red-200"
      : "bg-sky-50 border-sky-300";
  const timeText = isPaid ? "text-emerald-700" : isCancelled ? "text-red-700" : "text-sky-700";

  const timeStr = booking.date_time
    ? (() => {
        // Timezone-safe Vietnam time (Supabase stores +00:00; the "THH:MM"
        // segment is UTC, not the VN time the user entered).
        return toVietnamTime(booking.date_time!);
      })()
    : "";
  const phone = booking.customer?.phone || "";
  const statusColors = BookingStatusBadgeColors[booking.status as BookingStatusType] || { bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          title={`${timeStr} · ${booking.customer?.name || "Khách"} · ${phone || ""} · ${serviceName}`}
          className={`group flex w-full cursor-pointer flex-col overflow-hidden border p-2 text-left shadow-sm transition hover:shadow-md ${chipBg}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${timeText}`}>{timeStr}</span>
            {booking.numberOfCustomers > 1 && (
              <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">×{booking.numberOfCustomers}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium text-gray-900">
            {booking.customer?.name || "Khách"}
            {phone && (
              <span className="ml-1 text-xs font-normal text-gray-500">
                {canViewCustomerPhone ? phone : maskPhone(phone)}
              </span>
            )}
          </div>
          <div className="mt-0.5 space-y-0.5">
            {serviceRows.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-1">
                <span className="truncate text-xs text-gray-700">
                  {s.service?.name || "Dịch vụ"}
                  {s.service?.duration ? <span className="ml-0.5 text-gray-500">({s.service.duration})</span> : null}
                </span>
                {s.staff?.name && <span className="shrink-0 text-[11px] font-medium text-sky-600">NV: {s.staff.name}</span>}
              </div>
            ))}
            {serviceRows.length === 0 && <div className="truncate text-xs text-gray-600">{serviceName}</div>}
          </div>
          {totalDuration > 0 && <div className="mt-0.5 text-[10px] font-medium text-gray-500">Tổng: {totalDuration} phút</div>}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-[255px] max-w-[255px] p-0 text-xs shadow-xl">
        <BookingHoverDetails
          booking={booking}
          canViewCustomerPhone={canViewCustomerPhone}
          statusOptions={[]}
          onStatusChange={() => {}}
          selectOpen={false}
          setSelectOpen={() => {}}
          onEdit={() => onEdit?.(booking)}
          onDelete={() => onDelete?.(booking.id)}
          canCancelPayment={canCancelPayment}
          onOpenInvoice={onClick}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
