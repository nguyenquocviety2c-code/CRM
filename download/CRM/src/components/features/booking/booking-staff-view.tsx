"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Booking, BookingServiceRow, useBookingStore } from "@/stores/booking-store";
import {
  BookingStatusLabel,
  BookingStatusBadgeColors,
  BookingStatusType,
} from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { useIsReviewing } from "@/stores/payment-review-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamTime, toVietnamDay } from "@/lib/utils";
import { getAllSlotCustomers } from "@/lib/multi-customer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DraggableHoverPopup } from "@/components/features/booking/draggable-hover-popup";
import { Pencil, LogIn, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  groupName?: string | null;
}

interface BookingStaffViewProps {
  bookings: Booking[];
  /** The single day shown in the legacy single-day layout. Kept for backwards
   *  compatibility — when `dateRange` is provided it takes precedence. */
  currentDate?: Date;
  /** Inclusive { from, to } date range. When provided, the view renders one
   *  COLUMN PER DAY (3/7, 4/7, 5/7 …) so bookings from different days no
   *  longer overlap inside the same staff×time slot. */
  dateRange?: { from: Date; to: Date };
  daysToShow: number;
  onBookingClick: (booking: Booking) => void;
  onStatusChange?: (bookingId: string, newStatus: BookingStatusType) => void;
  onEdit?: (booking: Booking) => void;
  /** Open the dedicated "Xếp nhân viên" dialog for a booking whose service has
      no staff assigned. Called by the "Xếp nhân viên" button on segment blocks
      + in the hover popover. Distinct from onEdit (which opens the full
      "Chỉnh sửa lịch hẹn" dialog). */
  onAssignStaff?: (booking: Booking) => void;
  onDelete?: (bookingId: string) => void;
  /**
   * Open the invoice dialog for a booking. Called when a PAID booking block
   * (checkout status = has a completed invoice) is clicked. Unpaid bookings
   * (confirmed / new / checkin / cancelled / no_show) fall back to the
   * regular onBookingClick (edit dialog).
   */
  onShowInvoice?: (booking: Booking) => void;
  /**
   * Called when the user clicks an EMPTY area of a staff column's timeline
   * (not on an existing booking block). Opens the "Create new booking" dialog
   * with the slot's time + staff pre-filled.
   * Slot shape: { date: "DD/MM/YYYY", time: "HH:mm", staffId: string | null }
   */
  onSlotClick?: (slot: { date: string; time: string; staffId: string | null }) => void;
  /** Branch id (used to fetch the full staff list so ALL staff columns show). */
  branchId?: string | null;
}

interface StaffColumn {
  staff: Staff | null;
  segments: ServiceSegment[];
}

/** A service-segment of a booking, assigned to one staff's timeline. A
 *  segment = one or more CONSECUTIVE services performed by the SAME staff,
 *  merged into a single slot. Services run back-to-back (cursor advances by
 *  each service's duration), so consecutive in sort_order = adjacent in time.
 *  A run of same-staff services becomes one merged slot whose height ∝ the
 *  sum of their durations; different-staff services stay in separate slots
 *  (each in its own staff's column). Matches the server-side conflict check in
 *  /api/supabase/bookings/route.ts. */
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
  /** Minutes from the timeline's START_HOUR (08:00) to this segment's start.
   *  May be negative when the booking starts before 08:00 — callers clamp
   *  into the visible window. */
  startMin: number;
  /** This segment's total duration = Σ of its services' durations (minutes). */
  duration: number;
}

/** Pixels per hour on the vertical timeline. Slot height is proportional to
 *  duration. 1.5× the previous value (60 → 90) so each hour band is taller and
 *  multi-service segment blocks have more room to show their content. */
const PX_PER_HOUR = 90;
/** Timeline starts at 08:00 and ends at 21:00 (13 hours). */
const START_HOUR = 8;
const END_HOUR = 21;
/** Width of each staff column. The timeline scrolls horizontally when there
 *  are more staff than fit on screen. */
const STAFF_COL_WIDTH = 180;
/** Width of the fixed "Giờ" column on the left. */
const TIME_COL_WIDTH = 64;
/** Minimum column width when dragging (prevents columns from vanishing). */
const MIN_COL_WIDTH = 50;
/** Width of the drag handle on each header cell's right edge. */
const RESIZER_WIDTH = 8;

// Hairdresser groups — same filter as the booking dialog. Only these groups
// are shown as staff columns (mirrors BookingDialog's staff fetch).
const HAIRDRESSER_GROUPS = ["Artist", "Creative Director", "Master", "Junior"];

export function BookingStaffView({
  bookings,
  currentDate,
  dateRange,
  onBookingClick,
  onStatusChange,
  onEdit,
  onAssignStaff,
  onDelete,
  onShowInvoice,
  onSlotClick,
  branchId,
}: BookingStaffViewProps) {
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

  // Hour-band resize (single-day timeline only). The user drags a horizontal
  // handle on the "Giờ" axis to grow/shrink every hour band. Persisted.
  const MIN_PX_PER_HOUR = 40;
  const MAX_PX_PER_HOUR = 200;
  const [pxPerHour, setPxPerHour] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("crm-staff-timegrid-pxph");
      const n = raw ? parseInt(raw, 10) : NaN;
      if (!isNaN(n) && n >= MIN_PX_PER_HOUR && n <= MAX_PX_PER_HOUR) return n;
    } catch { /* ignore */ }
    return PX_PER_HOUR;
  });
  const setPxPerHourPersisted = (n: number) => {
    const clamped = Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, n));
    setPxPerHour(clamped);
    try { localStorage.setItem("crm-staff-timegrid-pxph", String(clamped)); } catch { /* ignore */ }
  };

  // Tracks which (column, hour) slot the mouse is hovering over in the
  // single-day staff-column layout. Used to highlight ONLY that slot (not
  // the entire column) with an orange overlay on hover.
  const [hoveredSlot, setHoveredSlot] = useState<{ col: number; hour: number } | null>(null);

  // Number of days in the selected range. When 1 day → use the legacy
  // per-staff column layout (one column per staff). When 2+ days → use the
  // DayRangeGrid (one column per day). Capped at 5 visible days; 6+ scroll.
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

  // Hour labels for the left axis (08:00 → 21:00).
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) h.push(i);
    return h;
  }, []);

  // Fetch ALL active staff for the selected branch (so every staff has a column,
  // not just those with bookings today). Mirrors the BookingDialog's staff query.
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function fetchStaff() {
      if (!branchId) {
        setAllStaff([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/supabase/staff?branch_id=${encodeURIComponent(branchId)}&active=true&limit=200`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setAllStaff([]);
          return;
        }
        // Only show hairdresser groups (same filter as BookingDialog).
        const list = ((json.data as Array<Record<string, unknown>>) || [])
          .filter((s) => {
            const groupName = (s.group as { name?: string } | null)?.name;
            return groupName && HAIRDRESSER_GROUPS.includes(groupName);
          })
          .map((s) => ({
            id: s.id as string,
            name: s.name as string,
            groupName: (s.group as { name?: string } | null)?.name,
          }));
        setAllStaff(list);
      } catch {
        if (!cancelled) setAllStaff([]);
      }
    }
    fetchStaff();
    return () => { cancelled = true; };
  }, [branchId]);

  // Build staff columns from the FULL staff list. Each booking is split into
  // SEGMENTS where each segment = a run of same-staff services merged into one
  // slot. PARALLEL model: every service in the booking starts at the SAME
  // booking-level start time (each runs on a different staff, simultaneously),
  // so every segment's startMin = the booking's startMin (NO cursor advance).
  // A run of same-staff services still merges into one taller block (duration
  // = sum of their durations). Each segment lands in the column of the staff
  // who performs it. Segments whose services have no staff go to a
  // "Chưa xếp nhân viên" column at the end.
  const staffColumns = useMemo<StaffColumn[]>(() => {
    const columns: StaffColumn[] = allStaff.map((staff) => ({
      staff,
      segments: [],
    }));
    const byStaffId = new Map<string, StaffColumn>();
    for (const col of columns) {
      if (col.staff) byStaffId.set(col.staff.id, col);
    }

    const unassigned: ServiceSegment[] = [];
    for (const booking of bookings) {
      // Services ordered by sort_order for stable segment ordering.
      const services = getAllServices(booking)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      // Group CONSECUTIVE services performed by the SAME staff into one
      // segment (a run of same-staff services merges into one slot).
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
      const totalSegments = groups.length;
      const startMin = getBookingStartMinutes(booking);
      // PARALLEL: every segment starts at the booking's startMin. Previously a
      // cursor advanced by each segment's duration (consecutive model), making
      // the 2nd service of a multi-staff booking appear at startMin + 1st
      // service's duration (e.g. 11:00 instead of 09:30). Fixed to parallel.
      groups.forEach((group, i) => {
        const duration = group.reduce((sum, s) => sum + (s.service?.duration || 0), 0);
        const staffId = group[0].staff_id || "";
        const seg: ServiceSegment = {
          booking,
          services: group,
          staffId,
          staffName: group[0].staff?.name || "—",
          segmentIndex: i,
          totalSegments,
          startMin: startMin ?? 0,
          duration,
        };
        if (!staffId) {
          unassigned.push(seg);
          return;
        }
        const col = byStaffId.get(staffId);
        if (col) {
          col.segments.push(seg);
        } else {
          // Staff on the booking but not in allStaff (different branch / group).
          // Add an extra column so the segment is still visible.
          const newCol: StaffColumn = {
            staff: { id: staffId, name: seg.staffName },
            segments: [seg],
          };
          columns.push(newCol);
          byStaffId.set(staffId, newCol);
        }
      });
    }

    // The "Chưa xếp nhân viên" (unassigned) column is placed FIRST (before the
    // real staff columns) so it sits right after the "Giờ" column on the left,
    // per the user's request. Previously it was appended at the end (rightmost)
    // which made it easy to miss. Putting it first draws attention to bookings
    // that still need a staff assignment — the cashier sees them immediately
    // and can click "Xếp nhân viên" on each block to assign one.
    if (unassigned.length > 0) {
      columns.unshift({ staff: null, segments: unassigned });
    }
    // Sort each column's segments by PRIORITY so that overlapping segments
    // stack with UNPAID bookings (pending/new/confirmed/checkin) ON TOP of
    // cancelled/no_show ones. In the single-day staff view, segments are
    // absolutely positioned and later-in-DOM renders on top — so we sort
    // cancelled FIRST (bottom) and unpaid LAST (top). This implements the
    // user's requirement: "lịch chưa thanh toán hiển thị đè lên lịch đã hủy"
    // (a cancelled booking at 10:30-12:00 should NOT cover an unpaid booking
    // at 10:00-11:30; the unpaid one must be fully visible).
    const SEG_PRIORITY: Record<string, number> = {
      // cancelled / no-show → priority 0 (rendered FIRST → at the BOTTOM)
      cancelled: 0,
      no_show: 0,
      // paid → priority 1
      checkout: 1,
      // unpaid / active → priority 2 (rendered LAST → ON TOP)
      pending: 2,
      new: 2,
      confirmed: 2,
      checkin: 2,
    };
    for (const col of columns) {
      col.segments.sort((a, b) => {
        const pa = SEG_PRIORITY[a.booking.status] ?? 1;
        const pb = SEG_PRIORITY[b.booking.status] ?? 1;
        if (pa !== pb) return pa - pb; // lower priority first (rendered below)
        // Same priority → keep chronological order (earlier start first).
        return a.startMin - b.startMin;
      });
    }
    return columns;
  }, [allStaff, bookings]);

  // Total timeline height in pixels. Uses the resizable pxPerHour (single-day)
  // or the constant (multi-day DayRangeGrid uses its own DAYGRID_ROW_HEIGHT).
  const timelineHeight = (END_HOUR - START_HOUR) * pxPerHour;

  // ---- Column resizing (with persistence) ----
  // columnWidths[0] = "Giờ" column width; columnWidths[1..N] = staff columns.
  // State-driven so the user can drag column edges to resize (same UX as the
  // global TableResizer, but adapted for this CSS-grid layout which isn't a
  // <table> and therefore isn't handled by TableResizer).
  //
  // Persistence: widths are saved to localStorage keyed by branch + column
  // count, so the user's column customizations survive page switches and
  // browser refreshes. When the column count changes (e.g. branch switch
  // loads a different number of staff), the saved widths for that exact
  // column count are restored; if none match, defaults are used.
  const STORAGE_PREFIX = "crm-staff-grid-widths:";

  /** Build the localStorage key for the current branch + column count. */
  const storageKey = `${STORAGE_PREFIX}${branchId || "all"}::n${staffColumns.length}`;

  /** Read saved widths from localStorage. Returns null if none/invalid. */
  function readSavedWidths(key: string): number[] | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      if (!parsed.every((n: unknown) => typeof n === "number" && n > 0)) return null;
      return parsed as number[];
    } catch {
      return null;
    }
  }

  /** Save widths to localStorage (best-effort). */
  function writeSavedWidths(key: string, widths: number[]) {
    try {
      localStorage.setItem(key, JSON.stringify(widths));
    } catch {
      // best-effort — localStorage may be full or disabled
    }
  }

  // Compute the initial widths: try saved widths for this branch+count, fall
  // back to defaults.
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    const saved = readSavedWidths(storageKey);
    if (saved && saved.length === staffColumns.length + 1) return saved;
    return [TIME_COL_WIDTH, ...Array(staffColumns.length).fill(STAFF_COL_WIDTH)];
  });

  // Reset widths whenever the column count changes (e.g. staff data finishes
  // loading, or the branch changes). Uses the "adjust state during render"
  // pattern (React docs) instead of an effect so the lint rule
  // `react-hooks/set-state-in-effect` is satisfied. Restores saved widths
  // for the new column count if available.
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    const saved = readSavedWidths(storageKey);
    if (saved && saved.length === staffColumns.length + 1) {
      setColumnWidths(saved);
    } else {
      setColumnWidths([
        TIME_COL_WIDTH,
        ...Array(staffColumns.length).fill(STAFF_COL_WIDTH),
      ]);
    }
  }

  // Permission gate: only staff whose group has "resize_table" can drag the
  // column edges to resize. When the permission is OFF, the grid uses `1fr`
  // for all staff columns (equal width, fills container, NOT resizable). When
  // the permission is ON, the grid uses persisted pixel widths (resizable via
  // the drag handles on each column's right edge; dragging one staff column
  // resizes ALL staff columns synchronously so they stay uniform).
  const canResizeTable = hasPermission("resize_table");

  // Build the CSS grid-template-columns string.
  // - canResizeTable = true: "Giờ" col (px) + staff cols (px, from
  //   columnWidths). Dragging a staff column's edge resizes all staff columns
  //   together (sync mode). The total may exceed the container → horizontal
  //   scroll.
  // - canResizeTable = false: "Giờ" col (px) + staff cols (1fr each). Always
  //   equal width, fills the container, not draggable.
  const gridTemplate = canResizeTable
    ? columnWidths.map((w) => `${w}px`).join(" ")
    : `${columnWidths[0] || TIME_COL_WIDTH}px repeat(${Math.max(staffColumns.length, 1)}, minmax(0, 1fr))`;
  // Total scrollable width. Only meaningful when canResizeTable = true (the
  // px-based grid may exceed the container). When 1fr, the container is 100%.
  const totalWidth = columnWidths.reduce((s, w) => s + w, 0);

  // Start dragging a column's right edge. `idx` is the column index in
  // columnWidths (0 = "Giờ", 1..N = staff columns).
  //
  // SYNC MODE: dragging ANY staff column's edge resizes ALL staff columns
  // together (the delta is applied to every staff column uniformly). This
  // keeps the grid visually uniform — all staff columns always have the same
  // width. The "Giờ" column (idx 0) is excluded from the sync: dragging its
  // edge still resizes only it (since the time column has a different purpose
  // and width). The user's request was specifically about staff columns, so
  // we sync those.
  const startColumnResize = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = columnWidths[idx] || STAFF_COL_WIDTH;
      // For staff columns, capture every staff column's start width so we can
      // apply the same delta to all of them synchronously.
      const staffStartWidths = columnWidths.slice(1);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Capture the current key so the save after drag uses the right one
      // (in case the branch changes mid-drag — extremely unlikely but safe).
      const dragKey = storageKey;
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        if (idx === 0) {
          // Dragging the "Giờ" column's edge → resize only that column.
          const newWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
          setColumnWidths((prev) => {
            const next = [...prev];
            next[0] = newWidth;
            return next;
          });
        } else {
          // Dragging a STAFF column's edge → apply the delta to ALL staff
          // columns synchronously so they stay uniform. Each staff column's
          // new width is clamped to MIN_COL_WIDTH independently (in practice
          // they all clamp together since they share the same start width +
          // delta).
          setColumnWidths((prev) => {
            const next = [...prev];
            for (let i = 1; i < next.length; i++) {
              const base = staffStartWidths[i - 1] ?? STAFF_COL_WIDTH;
              next[i] = Math.max(MIN_COL_WIDTH, base + delta);
            }
            return next;
          });
        }
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Persist the new widths (debounced so we read the latest state).
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          setColumnWidths((current) => {
            writeSavedWidths(dragKey, current);
            return current; // no change — just reading
          });
        }, 300);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [columnWidths, storageKey]
  );

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        /* Visual hint: a subtle line on the right edge of each header cell. */
        .staff-grid-header-cell { position: relative; }
        .staff-grid-header-cell::after {
          content: "";
          position: absolute;
          top: 20%;
          right: 0;
          width: 2px;
          height: 60%;
          background-color: rgba(15, 23, 42, 0.08);
          pointer-events: none;
        }
        .staff-grid-resizer:hover { background-color: rgba(16, 185, 129, 0.35); }
      `}</style>

      {/* =========================================================================
          MULTI-DAY TABLE LAYOUT (used when the selected range is 2+ days)
          - Rows = time slots (08:00 → 21:00)
          - Columns = one per day in the range (3/7, 4/7, 5/7 …)
          - 1–5 days: columns fill the full table width
          - 6+ days: exactly 5 columns visible, rest scroll horizontally
          - Within each (day × hour) cell, ALL bookings that start in that
            hour are shown as compact, non-overlapping chips (vertical stack).
          - Time slot placement uses `toVietnamDay` + `toVietnamTime` so a
            09:30 VN booking lands in the 09:00 row, NOT in 16:00 (avoids the
            UTC→local TZ shift that previously mis-bucketed bookings; also
            accounts for the post-migration storage where the raw "THH:MM"
            segment of `date_time` is the UTC time, not the VN time).
          ========================================================================= */}
      {dateRange && useMultiDayLayout && (
        <DayRangeGrid
          dateRange={dateRange}
          bookings={bookings}
          onBookingClick={(b) => {
            const isPaid = b.status === "checkout";
            if (isPaid && onShowInvoice) onShowInvoice(b);
            else onBookingClick(b);
          }}
          canViewCustomerPhone={canViewCustomerPhone}
          onSlotClick={onSlotClick}
          slotLocked={slotLocked}
          onEdit={onEdit}
          onAssignStaff={onAssignStaff}
        />
      )}

      {/* =========================================================================
          SINGLE-DAY STAFF-COLUMN LAYOUT.
          Used when: (a) no dateRange is supplied, OR (b) the range is exactly
          1 day. One column per staff, bookings absolutely positioned along a
          vertical timeline.
          ========================================================================= */}
      {(!dateRange || !useMultiDayLayout) && (
      <div className="border bg-white">
        {/* Horizontal-scroll container — the time column is sticky-left so it
            stays visible while the user scrolls through the staff columns.
            When canResizeTable is true, the grid uses pixel widths that may
            exceed the container → horizontal scroll. When false, the grid
            uses 1fr (fills 100%, no scroll). */}
        <div className="overflow-x-auto">
          <div style={canResizeTable ? { width: `${totalWidth}px`, minWidth: `${totalWidth}px` } : { width: "100%", minWidth: "100%" }}>
            {/* Header row: "Giờ" + staff names. The "Giờ" cell is sticky-left. */}
            <div
              className="grid border-b-2 border-gray-400 bg-gray-50"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div
                className="staff-grid-header-cell sticky left-0 z-20 border-r border-gray-300 bg-gray-50 p-3 text-center text-xs font-semibold text-gray-600"
              >
                Giờ
                {/* Drag handle on the right edge of the "Giờ" header — only
                    rendered when the staff has the "resize_table" permission.
                    Without the permission, the column is not draggable (the
                    grid uses 1fr and fills the container evenly). */}
                {canResizeTable && (
                  <div
                    className="staff-grid-resizer absolute top-0 right-0 z-30"
                    style={{ width: `${RESIZER_WIDTH}px`, height: "100%", cursor: "col-resize", marginRight: `-${RESIZER_WIDTH / 2}px` }}
                    onMouseDown={(e) => startColumnResize(e, 0)}
                  />
                )}
              </div>
              {staffColumns.map((col, idx) => (
                <div
                  key={idx}
                  className="staff-grid-header-cell border-r border-gray-300 p-3 text-center"
                >
                  <div className="truncate text-sm font-semibold text-gray-800">
                    {col.staff ? col.staff.name : "Chưa xếp nhân viên"}
                  </div>
                  {col.staff?.groupName && (
                    <div className="truncate text-[10px] text-gray-400">
                      {col.staff.groupName}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {col.segments.length > 0
                      ? (() => {
                          const n = new Set(col.segments.map((s) => s.booking.id)).size;
                          return `${n} lịch hẹn`;
                        })()
                      : "Trống"}
                  </div>
                  {/* Drag handle on the right edge of this staff header cell —
                      only when canResizeTable. Dragging resizes ALL staff
                      columns synchronously (sync mode in startColumnResize). */}
                  {canResizeTable && (
                    <div
                      className="staff-grid-resizer absolute top-0 right-0 z-30"
                      style={{ width: `${RESIZER_WIDTH}px`, height: "100%", cursor: "col-resize", marginRight: `-${RESIZER_WIDTH / 2}px` }}
                      onMouseDown={(e) => startColumnResize(e, idx + 1)}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Timeline body. The left "Giờ" axis is sticky-left. */}
            <div
              className="grid relative"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* Left axis: hour labels (sticky-left so it stays while scrolling). */}
              <div
                className="sticky left-0 z-10 border-r border-gray-300 bg-white relative"
                style={{ height: `${timelineHeight}px` }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t px-2 text-[10px] text-gray-400"
                    style={{ top: `${(h - START_HOUR) * pxPerHour}px` }}
                  >
                    <span className="block pt-0.5">{h.toString().padStart(2, "0")}:00</span>
                  </div>
                ))}
                {/* Hour-band drag handles — one at each gridline. The user grabs
                    any handle and drags up/down to grow/shrink EVERY hour band.
                    Rendered above the labels so the handle receives mousedown. */}
                {hours.slice(0, -1).map((h) => (
                  <div
                    key={`handle-${h}`}
                    data-hour-resizer
                    className="absolute left-0 right-0 z-30 cursor-row-resize hover:bg-emerald-200/50"
                    style={{ top: `${(h + 1 - START_HOUR) * pxPerHour - 4}px`, height: "8px" }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startY = e.clientY;
                      const startPph = pxPerHour;
                      document.body.style.cursor = "row-resize";
                      document.body.style.userSelect = "none";
                      const onMove = (ev: MouseEvent) => {
                        const delta = ev.clientY - startY;
                        setPxPerHourPersisted(startPph + delta);
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

              {/* Staff columns */}
              {staffColumns.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className={`border-r border-gray-300 relative ${slotLocked ? "bg-gray-50/60" : "cursor-pointer"}`}
                  style={{ height: `${timelineHeight}px` }}
                  onMouseMove={(e) => {
                    if (slotLocked) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const clampedY = Math.max(0, Math.min(y, timelineHeight - 1));
                    const totalMinutes = (clampedY / pxPerHour) * 60;
                    let hour = START_HOUR + Math.floor(totalMinutes / 60);
                    if (hour >= END_HOUR) hour = END_HOUR - 1;
                    setHoveredSlot((prev) =>
                      prev && prev.col === colIdx && prev.hour === hour
                        ? prev
                        : { col: colIdx, hour }
                    );
                  }}
                  onMouseLeave={() => {
                    setHoveredSlot((prev) => (prev && prev.col === colIdx ? null : prev));
                  }}
                  onClick={(e) => {
                    // Only fire when clicking the EMPTY area of the column (not
                    // on a booking block — those have their own onClick).
                    if (!onSlotClick || slotLocked) return;
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    // Clamp to timeline bounds.
                    const clampedY = Math.max(0, Math.min(y, timelineHeight - 1));
                    const totalMinutes = (clampedY / pxPerHour) * 60;
                    let hour = START_HOUR + Math.floor(totalMinutes / 60);
                    let minute = Math.floor(totalMinutes % 60);
                    // Snap to 30-minute intervals (00 or 30) — matches the
                    // booking dialog's TimePicker minuteStep=30 so the prefilled
                    // slot time is always selectable.
                    minute = Math.round(minute / 30) * 30;
                    if (minute >= 60) { hour += 1; minute = 0; }
                    if (hour >= END_HOUR) { hour = END_HOUR - 1; minute = 0; }
                    const hh = String(hour).padStart(2, "0");
                    const mm = String(minute).padStart(2, "0");
                    const dd = String(currentDate.getDate()).padStart(2, "0");
                    const mo = String(currentDate.getMonth() + 1).padStart(2, "0");
                    const yyyy = currentDate.getFullYear();
                    onSlotClick({
                      date: `${dd}/${mo}/${yyyy}`,
                      time: `${hh}:${mm}`,
                      staffId: col.staff?.id || null,
                    });
                  }}
                >
                  {/* Hour grid lines (background) */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-gray-300 pointer-events-none"
                      style={{ top: `${(h - START_HOUR) * pxPerHour}px` }}
                    />
                  ))}

                  {/* Hover highlight — only the hovered hour slot (orange),
                      NOT the entire column. pointer-events-none so it doesn't
                      block clicks on the column (which computes time from Y). */}
                  {!slotLocked && hoveredSlot && hoveredSlot.col === colIdx && (
                    <div
                      className="absolute left-0 right-0 bg-orange-100 pointer-events-none"
                      style={{
                        top: `${(hoveredSlot.hour - START_HOUR) * pxPerHour}px`,
                        height: `${pxPerHour}px`,
                      }}
                    />
                  )}

                  {/* Service-segment blocks. Each segment = one service of one
                      booking, positioned at [start, start+duration) on THIS
                      staff's timeline. A multi-service / multi-staff booking
                      therefore appears as separate blocks in each staff's
                      column, each occupying its own time slice. */}
                  {col.segments.map((seg) => (
                    <SegmentBlock
                      key={`${seg.booking.id}-${seg.segmentIndex}`}
                      segment={seg}
                      pxPerHour={pxPerHour}
                      // Click logic:
                      // - checkout (paid) → open the full paid invoice view (giao diện hóa
                      //   đơn hoàn tất) so the cashier can review/print the receipt.
                      // - checkin (customer is being served) → open the invoice/payment
                      //   dialog so the cashier can review items, add products, and proceed
                      //   to payment. This dialog ALSO opens when the invoice is already
                      //   "pending" (staff clicked Thanh toán but hasn't completed the
                      //   checkout) — it resumes the payment flow.
                      // - confirmed / new / cancelled / no_show → open the edit booking
                      //   dialog (Chỉnh sửa lịch hẹn) so staff can edit details or proceed
                      //   to checkin.
                      onClick={() => {
                        const status = seg.booking.status;
                        const isPaid = status === "checkout";
                        const isCheckin = status === "checkin";
                        if ((isPaid || isCheckin) && onShowInvoice) {
                          onShowInvoice(seg.booking);
                        } else {
                          onBookingClick(seg.booking);
                        }
                      }}
                      onStatusChange={(status) => onStatusChange?.(seg.booking.id, status)}
                      onEdit={() => onEdit?.(seg.booking)}
                      onDelete={() => onDelete?.(seg.booking.id)}
                      onAssignStaff={() => onAssignStaff?.(seg.booking)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/** The "Xếp nhân viên" button shown on segment blocks whose service has NO
 *  staff assigned (staffName === "—"). Renders as a small blue pill below the
 *  service name. stopPropagation on click so it doesn't trigger the parent
 *  block's onClick (which would open the edit/invoice dialog); instead it
 *  calls onAssignStaff to open the booking edit dialog focused on staff
 *  assignment. */
function AssignStaffButton({ onAssignStaff }: { onAssignStaff?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAssignStaff?.();
      }}
      className="mt-0.5 inline-flex items-center rounded border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700"
      title="Xếp nhân viên cho dịch vụ này"
    >
      Xếp nhân viên
    </button>
  );
}

/** A single service-segment block on a staff's timeline. The block occupies
 *  [segment.startMin, segment.startMin + segment.duration) — the time slice
 *  THIS service runs for, on THIS staff's column. A multi-service / multi-staff
 *  booking therefore appears as separate blocks in each staff's column, each
 *  occupying its own time slice (services run back-to-back). Hover opens the
 *  full booking popover (all services, invoice, actions). */
function SegmentBlock({
  segment,
  onClick,
  onStatusChange,
  onEdit,
  onDelete,
  onAssignStaff,
  pxPerHour = PX_PER_HOUR,
}: {
  segment: ServiceSegment;
  onClick: () => void;
  onStatusChange: (status: BookingStatusType) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Open the booking edit dialog to assign a staff to this segment's
      service(s). Called by the "Xếp nhân viên" button shown ONLY when this
      segment has no staff assigned (staffName === "—"). Mirrors onEdit but is
      a separate affordance so the user sees a clear "assign staff" CTA
      directly on unassigned blocks. */
  onAssignStaff?: () => void;
  /** Hour-band height (single-day resizable timeline). Defaults to PX_PER_HOUR. */
  pxPerHour?: number;
}) {
  const booking = segment.booking;
  const canCancelPayment = useAuthStore((s) => s.hasPermission("cancel_payment"));
  const canViewCustomerPhone = useAuthStore((s) => s.hasPermission("view_customer_phone"));
  // Payment-review flag — must be called BEFORE any early return (rules of
  // hooks). Shared across Booking + Cashier via sessionStorage; true when the
  // cashier has pressed "Thanh toán" (review mode), cleared on Hủy/Hoàn tất.
  const isReviewing = useIsReviewing(booking.id);
  // Highlight flash — when navigating from Thu ngân's "Xem lịch hẹn" button,
  // highlightBookingId is set in the store. The matching booking's card blinks
  // 3× to draw attention. Must be read BEFORE any early return (rules of hooks).
  const highlightBookingId = useBookingStore((s) => s.highlightBookingId);
  const setHighlightBookingId = useBookingStore((s) => s.setHighlightBookingId);
  const isHighlighted = highlightBookingId === booking.id;
  // After the flash animation completes, clear the highlight so it doesn't
  // re-flash on every re-render.
  useEffect(() => {
    if (!isHighlighted) return;
    const timer = setTimeout(() => setHighlightBookingId(null), 1500);
    return () => clearTimeout(timer);
  }, [isHighlighted, setHighlightBookingId]);
  const [hovered, setHovered] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  // Clamp the segment into the visible [08:00, 21:00] window.
  const trackMinutes = (END_HOUR - START_HOUR) * 60;
  // Skip only segments that start AFTER the visible window ends.
  // Segments that end BEFORE the visible window (e.g. a booking at 03:30 AM
  // ending at 05:30 — before 08:00) are NOT skipped: they're clamped to the
  // top of the grid so the user can SEE them and click to fix the time.
  // Without this, a booking at 03:30 VN (e.g. from a timezone bug) would be
  // invisible in View nhân viên — the user would see 5 bookings in the list
  // but only 4 in the staff view.
  if (segment.startMin >= trackMinutes) return null;
  const clampedStart = Math.max(segment.startMin, 0);
  // If the entire segment is before the visible window, give it a minimum
  // visible height (30 min) at the top of the grid.
  const rawEnd = segment.startMin + segment.duration;
  const clampedEnd = rawEnd <= 0
    ? Math.max(clampedStart + 30, Math.min(rawEnd, trackMinutes))
    : Math.min(rawEnd, trackMinutes);
  const topPx = (clampedStart / 60) * pxPerHour;
  const heightPx = Math.max(24, ((clampedEnd - clampedStart) / 60) * pxPerHour);

  // Time-range label "HH:MM - HH:MM" for THIS service's slice.
  const startTotalMin = START_HOUR * 60 + segment.startMin;
  const endTotalMin = startTotalMin + segment.duration;
  const fmtTime = (totalMin: number) => {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const timeRange = `${fmtTime(startTotalMin)} - ${fmtTime(endTotalMin)}`;

  const dt = booking.date_time;
  const d = dt ? new Date(dt) : null;
  const dateLabel = d && !isNaN(d.getTime())
    ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
    : "";

  const staffName = segment.staffName;
  const isMultiSegment = segment.totalSegments > 1;
  const isMergedSlot = segment.services.length > 1;

  // Block background color — groups the booking by payment/cancellation state
  // so the cashier can tell at a glance which slots need attention:
  // - Paid (checkout) → emerald tint (matches the status badge)
  // - Unpaid active (new / confirmed / checkin) → sky tint (in-progress)
  // - Cancelled / no-show → red tint (dead slots)
  // We use the SAME color tokens as the status badge (BookingStatusBadgeColors)
  // so the block and its popover badge stay visually consistent.
  // Card background color — SAME scheme as View khách hàng > Khung giờ
  // (user's color spec):
  // - confirmed / new → XANH DƯƠNG (blue)
  // - checkin, chưa bấm Thanh toán → XANH (green)
  // - checkin + đang review (đã bấm Thanh toán, chưa Hoàn tất) → TÍM ĐẬM (darker purple)
  // - no_show → yellow
  // - cancelled → red
  // - checkout (đã Hoàn tất) → TRẮNG (white)
  //
  // "đã bấm Thanh toán" is the shared payment-review flag (useIsReviewing),
  // NOT the invoice's pending status — every checkin booking auto-creates a
  // pending invoice, so pending-status can't tell the two states apart.
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled";
  const isNoShow = booking.status === "no_show";
  const isCheckin = booking.status === "checkin";

  let blockBg: string;
  let timeText: string;
  if (isPaid) {
    blockBg = "bg-white border-gray-300";
    timeText = "text-gray-700";
  } else if (isCancelled) {
    blockBg = "bg-red-50 border-red-200";
    timeText = "text-red-700";
  } else if (isNoShow) {
    blockBg = "bg-amber-50 border-amber-300";
    timeText = "text-amber-700";
  } else if (isCheckin && isReviewing) {
    blockBg = "bg-purple-300 border-purple-600";
    timeText = "text-purple-900";
  } else if (isCheckin) {
    blockBg = "bg-green-200 border-green-500";
    timeText = "text-green-900";
  } else {
    blockBg = "bg-blue-100 border-blue-500";
    timeText = "text-blue-800";
  }

  // Status options — the user wants the status Select to only offer the
  // "dead-end" transitions (Không đến / Hủy), NOT "checkin". Checkin is now a
  // dedicated button next to "Đơn hàng" (see Line 4 below). Both "Không đến"
  // (no_show) and "Hủy" (cancelled) make the order unpayable.
  // - confirmed / new → ["no_show", "cancelled"] (checkin moved to the button)
  // - checkin → ["cancelled"] only (no "Không đến" — the customer already
  //   showed up, so "no_show" doesn't make sense; only "Hủy" to cancel)
  // - checkout / cancelled / no_show → [] (terminal, no manual transitions)
  let statusOptions: BookingStatusType[] = [];
  if (booking.status === "confirmed" || booking.status === "new") {
    statusOptions = ["no_show", "cancelled"];
  } else if (booking.status === "checkin") {
    statusOptions = ["cancelled"];
  }

  // z-index by booking-status priority so UNPAID bookings always stack ON TOP
  // of cancelled/no_show ones when their segments overlap (mirrors the segment
  // sort in the column builder). Without this, a cancelled booking's block
  // could cover an unpaid booking's block, hiding its content. Hovering bumps
  // the z-index further so the hovered block's popover is always on top.
  const SEG_Z: Record<string, number> = {
    cancelled: 10,
    no_show: 10,
    checkout: 20,
    pending: 30,
    new: 30,
    confirmed: 30,
    checkin: 30,
  };
  const baseZ = SEG_Z[booking.status] ?? 20;
  const zIndex = hovered ? 50 : baseZ;

  return (
    <div
      className="absolute left-1 right-1"
      style={{ top: `${topPx}px`, height: `${heightPx}px`, zIndex }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        // Keep popover open while the status select dropdown is open (it portals outside).
        if (selectOpen) return;
        setHovered(false);
      }}
    >
      {/* Block (clickable → opens edit or invoice depending on paid status).
          Rendered as a <div role="button"> instead of <button> so it can
          contain a nested "Xếp nhân viên" button for unassigned-staff segments
          (nested <button> is invalid HTML). Keyboard accessibility is
          preserved via role + tabIndex + onKeyDown. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`absolute inset-0 cursor-pointer overflow-hidden border-2 p-2 text-left shadow-sm transition hover:shadow-md ${blockBg}${isHighlighted ? " booking-highlight-flash" : ""}`}
      >
        {/* Time range for THIS service's slice + date + multi-service badge */}
        <div className={`flex items-center justify-between text-sm font-semibold ${timeText}`}>
          <span>
            {timeRange}
            {dateLabel && <span className="ml-1 text-xs font-normal text-gray-500">{dateLabel}</span>}
          </span>
          {isMultiSegment && (
            <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {segment.segmentIndex + 1}/{segment.totalSegments}
            </span>
          )}
        </div>
        {/* Customer */}
        {/* Multi-customer "Cùng lịch" bookings: list every slot's customer
            (those with info → name+phone; empty slots → "Khách vãng lai").
            Single-customer / "Khác lịch" bookings: show the booking's one
            customer as before. */}
        {(() => {
          const slotCustomers = getAllSlotCustomers(booking.note);
          if (slotCustomers && slotCustomers.length > 0) {
            // For multi-customer "Cùng lịch" bookings, each staff's slot
            // should show ONLY the customer(s) assigned to this segment's
            // service(s). Map the segment's services back to their indices
            // in the full sorted services array, then look up the
            // corresponding slot customers (slots[i] ↔ services[i]).
            const allServices = getAllServices(booking)
              .slice()
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const segServiceIds = new Set(segment.services.map((s) => s.id));
            const segSlotIndices: number[] = [];
            allServices.forEach((s, i) => {
              if (segServiceIds.has(s.id)) segSlotIndices.push(i);
            });
            const segCustomers = segSlotIndices
              .map((i) => slotCustomers[i])
              .filter(Boolean);
            return (
              <div className="mt-0.5 space-y-0.5">
                {segCustomers.map((sc, i) => (
                  <div key={i} className="truncate text-sm font-medium text-gray-900">
                    {sc.walkin ? (
                      <span className="text-gray-500">Khách vãng lai</span>
                    ) : (
                      <>
                        {sc.name || "Khách"}
                        {sc.phone && (
                          <span className="ml-1 text-xs font-normal text-gray-500">
                            {canViewCustomerPhone ? sc.phone : maskPhone(sc.phone)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className="mt-0.5 truncate text-sm font-medium text-gray-900">
              {booking.customer?.name || "Khách"}
              {booking.customer?.phone && (
                <span className="ml-1 text-xs font-normal text-gray-500">
                  {canViewCustomerPhone ? booking.customer.phone : maskPhone(booking.customer.phone)}
                </span>
              )}
            </div>
          );
        })()}
        {/* Services — list ALL services in this merged slot, each with its
            duration. When multiple same-staff services are merged into one
            slot, list each on its own line and show the staff name once below.
            When the slot has a single service, pack service+duration with the
            staff name on one line (matches the single-service layout). */}
        {isMergedSlot ? (
          <>
            <div className="mt-0.5 space-y-0.5">
              {segment.services.map((s, i) => (
                <div key={i} className="truncate text-xs text-gray-700">
                  {s.service?.name || "Dịch vụ"}
                  {s.service?.duration ? <span className="ml-0.5 text-gray-500">({s.service.duration})</span> : null}
                </div>
              ))}
            </div>
            {staffName === "—" ? (
              <AssignStaffButton onAssignStaff={onAssignStaff} />
            ) : (
              <div className="mt-0.5 truncate text-[11px] font-medium text-sky-600">NV: {staffName}</div>
            )}
          </>
        ) : (
          staffName === "—" ? (
            <div className="mt-0.5">
              <div className="truncate text-xs text-gray-700">
                {segment.services[0]?.service?.name || "Dịch vụ"}
                {segment.services[0]?.service?.duration ? <span className="ml-0.5 text-gray-500">({segment.services[0].service!.duration})</span> : null}
              </div>
              <AssignStaffButton onAssignStaff={onAssignStaff} />
            </div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1 text-xs">
              <span className="truncate text-gray-700">
                {segment.services[0]?.service?.name || "Dịch vụ"}
                {segment.services[0]?.service?.duration ? <span className="ml-0.5 text-gray-500">({segment.services[0].service!.duration})</span> : null}
              </span>
              <span className="shrink-0 font-medium text-sky-600">NV: {staffName}</span>
            </div>
          )
        )}
      </div>

      {/* Hover popover — full booking + invoice details (services, products,
          promotion, tip, total) via BookingHoverDetails. Action buttons
          (edit / delete) stay at the bottom. */}
      {hovered && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[255px] border bg-white shadow-xl">
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
            onAssignStaff={onAssignStaff}
          />
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

/** Minutes from the timeline's START_HOUR (08:00) to the booking's start time.
 *  May be negative (booking starts before 08:00) — callers clamp into the
 *  visible window. Returns null when date_time is missing or unparseable. */
function getBookingStartMinutes(booking: Booking): number | null {
  const dt = booking.date_time;
  if (!dt) return null;
  // Use the timezone-safe Vietnam time helper. Supabase normalizes stored
  // date_time offsets to +00:00 (UTC), so the "THH:MM" segment is the UTC
  // time — NOT the Vietnam time the user entered. Parsing the segment directly
  // made bookings display at the wrong hour (and outside the visible window).
  const hhmm = toVietnamTime(dt);
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  return (hour - START_HOUR) * 60 + minute;
}

/** All service rows on the booking that carry a service or staff reference. */
function getAllServices(booking: Booking): BookingServiceRow[] {
  const services = booking.services as BookingServiceRow[];
  if (!Array.isArray(services)) return [];
  return services.filter((s) => s && (s.service || s.staff));
}

// =============================================================================
// MULTI-DAY TABLE LAYOUT — DayRangeGrid
// =============================================================================
// Renders one column per day in the selected date range. Rows are hourly time
// slots. Each (day × hour) cell shows ALL bookings that start in that hour as
// compact, non-overlapping chips (stacked vertically). Bookings from different
// days no longer collide because each day has its OWN column.
//
// Within a single (day × hour) cell, multiple bookings (from different staff)
// are stacked top-to-bottom as small chips — they never overlap because each
// chip occupies its own row in the cell's vertical flex layout.
// =============================================================================

/** Width of the left "Giờ" column in the multi-day table. */
const DAYGRID_TIME_COL_WIDTH = 64;
/** Minimum width of each day column (scrolls horizontally when more days). */
const DAYGRID_DAY_COL_MIN_WIDTH = 160;
/** Height of each hour row. Increased 1.5× (60 → 90) so multi-booking cells
 *  have room to show their chips without internal scrolling. */
const DAYGRID_ROW_HEIGHT = 90;
/** The "minimum" layout baseline is 4 days — when 4 days are selected, the
 *  columns fill the table. 5+ days keep the SAME per-column width as 4 days
 *  would have had (so cells stay readable) and scroll horizontally. */
const DAYGRID_BASELINE_DAYS = 4;

interface DayRangeGridProps {
  dateRange: { from: Date; to: Date };
  bookings: Booking[];
  onBookingClick: (b: Booking) => void;
  canViewCustomerPhone: boolean;
  onSlotClick?: (slot: { date: string; time: string; staffId: string | null }) => void;
  slotLocked: boolean;
  /** Open the booking edit dialog (passed down to BookingChip so the "Xếp nhân
      viên" button in its hover popover can assign a staff). */
  onEdit?: (b: Booking) => void;
  /** Open the dedicated "Xếp nhân viên" dialog (passed down to BookingChip). */
  onAssignStaff?: (b: Booking) => void;
}

/** Build the list of calendar days (inclusive) between `from` and `to`.
 *  Each Date is normalized to local midnight so day-of-month arithmetic is
 *  stable regardless of the host timezone. */
function buildDaysInRange(from: Date, to: Date): Date[] {
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

/** Build a `YYYY-MM-DD` dayKey from a local Date object (no UTC shift). */
function dateToLocalDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extract { dayKey, hour, minute } from the booking's `date_time` as VIETNAM
 *  wall-clock values. Post-migration (Task 6), `date_time` is stored as a UTC
 *  ISO string (e.g. "2026-07-14T03:30:00+00:00" represents 10:30 VN), so the
 *  raw "THH:MM" segment is the UTC time, NOT the VN time the user entered.
 *  Using `toVietnamDay` + `toVietnamTime` ensures the booking lands in the
 *  correct row+column of the multi-day staff grid (a 10:30 VN booking lands in
 *  the "10:00" row of column "2026-07-14", not the skipped "03:00" row). */
function getBookingDayHour(booking: Booking): { dayKey: string; hour: number; minute: number } | null {
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

/** "dd/MM" label for a day. */
function dayLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Short weekday name (T2, T3, … T7, CN). */
function weekdayLabel(d: Date): string {
  const vi = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return vi[d.getDay()];
}

function DayRangeGrid({
  dateRange,
  bookings,
  onBookingClick,
  canViewCustomerPhone,
  onSlotClick,
  slotLocked,
  onEdit,
  onAssignStaff,
}: DayRangeGridProps) {
  const days = useMemo(() => buildDaysInRange(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) h.push(i);
    return h;
  }, []);

  // Measure the container width so we can compute the per-day column width
  // when 5+ days are selected. The "minimum readable" layout is defined as
  // 4 days filling the table; 5+ days keep the SAME column width as 4 days
  // would have had, and scroll horizontally. Without measuring we'd have to
  // hard-code a width that may not match the actual table width.
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

  // Index bookings by `${dayKey}|${hour}` for O(1) cell lookup.
  const cellMap = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const info = getBookingDayHour(b);
      if (!info) continue;
      // Skip bookings outside the visible hour range.
      if (info.hour < START_HOUR || info.hour > END_HOUR) continue;
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
        const ai = getBookingDayHour(a);
        const bi = getBookingDayHour(b);
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
            const info = getBookingDayHour(b);
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
          const info = getBookingDayHour(b);
          if (info && unpaidMinutes.has(info.minute)) {
            arr.splice(i, 1);
          }
        }
      }
    }
    return m;
  }, [bookings]);

  // Layout decision:
  //   - 1–4 days → columns fill the full table width (1fr each), no scroll.
  //   - 5+ days → each column keeps the SAME width it would have had when 4
  //     days filled the table ((containerWidth - timeCol) / 4), and the table
  //     scrolls horizontally. This guarantees cells never shrink below the
  //     4-day baseline width, no matter how many days are selected.
  const dayCount = days.length;
  const needsScroll = dayCount > DAYGRID_BASELINE_DAYS;
  // Per-column width when scrolling. Derived from the measured container
  // width so 5+ days look exactly like 4 days did (just with more columns
  // off-screen to the right). Fall back to a sane default before the
  // ResizeObserver fires (containerWidth === 0 on first render).
  const scrollColWidth = containerWidth > 0
    ? Math.max(DAYGRID_DAY_COL_MIN_WIDTH, (containerWidth - DAYGRID_TIME_COL_WIDTH) / DAYGRID_BASELINE_DAYS)
    : 240;
  const totalWidth = needsScroll
    ? DAYGRID_TIME_COL_WIDTH + dayCount * scrollColWidth
    : undefined; // undefined → 100% width (fills the table)

  const handleCellClick = (day: Date, hour: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick || slotLocked) return;
    if (e.target !== e.currentTarget) return; // only empty area
    const dd = String(day.getDate()).padStart(2, "0");
    const mo = String(day.getMonth() + 1).padStart(2, "0");
    const yyyy = day.getFullYear();
    onSlotClick({
      date: `${dd}/${mo}/${yyyy}`,
      time: `${String(hour).padStart(2, "0")}:00`,
      staffId: null,
    });
  };

  return (
    <div className="border bg-white flex flex-col" ref={containerRef} style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="flex-1 min-h-0 overflow-auto" data-grid-resizable>
        <div
          style={
            needsScroll
              ? { width: `${totalWidth}px`, minWidth: `${totalWidth}px` }
              : { width: "100%" }
          }
        >
          {/* Header: "Giờ" + day columns — sticky at top so it stays during vertical scroll */}
          <div
            data-grid-header
            className="grid border-b bg-gray-50 sticky top-0 z-10"
            style={{
              gridTemplateColumns: needsScroll
                ? `${DAYGRID_TIME_COL_WIDTH}px repeat(${dayCount}, ${scrollColWidth}px)`
                : `${DAYGRID_TIME_COL_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-r p-2 text-center text-xs font-semibold text-gray-600">
              Giờ
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
                  className={`border-r p-2 text-center ${isToday ? "bg-emerald-50" : ""}`}
                >
                  <div className="text-[11px] font-medium text-gray-500">
                    {weekdayLabel(day)}
                  </div>
                  <div className={`text-sm font-semibold ${isToday ? "text-emerald-700" : "text-gray-800"}`}>
                    {dayLabel(day)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body: one row per hour. Uses minHeight (not height) so rows expand
              downward when a cell has many bookings — no internal cell scroll. */}
          <div data-grid-body>
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid border-b last:border-b-0"
                style={{
                  gridTemplateColumns: needsScroll
                    ? `${DAYGRID_TIME_COL_WIDTH}px repeat(${dayCount}, ${scrollColWidth}px)`
                    : `${DAYGRID_TIME_COL_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`,
                  minHeight: `${DAYGRID_ROW_HEIGHT}px`,
                }}
              >
                {/* Time label */}
                <div className="border-r bg-gray-50/60 px-2 py-1 text-[11px] text-gray-500">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {/* Day cells */}
                {days.map((day, dayIdx) => {
                  const dayKey = dateToLocalDayKey(day);
                  const cellBookings = cellMap.get(`${dayKey}|${hour}`) || [];
                  const isToday = (() => {
                    const t = new Date();
                    t.setHours(0, 0, 0, 0);
                    const d = new Date(day);
                    d.setHours(0, 0, 0, 0);
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
                            className={
                              i === cellBookings.length - 1 && cellBookings.length % 2 === 1
                                ? "col-span-2"
                                : ""
                            }
                          >
                            <BookingChip
                              booking={b}
                              canViewCustomerPhone={canViewCustomerPhone}
                              onClick={() => onBookingClick(b)}
                              onEdit={onEdit ? () => onEdit(b) : undefined}
                              onAssignStaff={onAssignStaff ? () => onAssignStaff(b) : undefined}
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
    </div>
  );
}

/** Compact booking chip for the multi-day table cells. Non-overlapping: each
 *  chip is a flex child in its cell so multiple bookings stack vertically.
 *  Hovering opens a rich HoverCard popover showing full booking + invoice
 *  details (date/time, customer name+phone, services, products, staff,
 *  promotion, tip, total). */
function BookingChip({
  booking,
  canViewCustomerPhone,
  onClick,
  onEdit,
  onAssignStaff,
}: {
  booking: Booking;
  canViewCustomerPhone: boolean;
  onClick: () => void;
  /** Open the booking edit dialog (used by the "Xếp nhân viên" button in the
      hover popover for services with no staff). Optional — when omitted, the
      assign-staff button is hidden in the popover. */
  onEdit?: () => void;
  /** Open the dedicated "Xếp nhân viên" dialog (preferred over onEdit for the
      assign-staff button). When provided, the popover's "Xếp nhân viên" button
      calls this; falls back to onEdit when not provided. */
  onAssignStaff?: () => void;
}) {
  const serviceRows = getAllServices(booking);
  const svc = serviceRows[0] || null;
  const serviceName = svc?.service?.name || "Dịch vụ";
  const staffName = svc?.staff?.name || "—";
  const totalDuration = serviceRows.reduce((sum, s) => sum + (s.service?.duration || 0), 0);
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled";
  const isNoShow = booking.status === "no_show";
  const isCheckin = booking.status === "checkin";
  const isReviewing = useIsReviewing(booking.id);
  const highlightBookingId = useBookingStore((s) => s.highlightBookingId);
  const setHighlightBookingId = useBookingStore((s) => s.setHighlightBookingId);
  const isHighlighted = highlightBookingId === booking.id;
  useEffect(() => {
    if (!isHighlighted) return;
    const timer = setTimeout(() => setHighlightBookingId(null), 1500);
    return () => clearTimeout(timer);
  }, [isHighlighted, setHighlightBookingId]);
  // SAME scheme as SegmentBlock above (user's color spec):
  // confirmed → blue, checkin (chưa bấm TT) → green, checkin + đang review (đã bấm TT) → darker purple, checkout → white.
  let chipBg: string;
  let timeText: string;
  if (isPaid) {
    chipBg = "bg-white border-gray-300";
    timeText = "text-gray-700";
  } else if (isCancelled) {
    chipBg = "bg-red-50 border-red-200";
    timeText = "text-red-700";
  } else if (isNoShow) {
    chipBg = "bg-amber-50 border-amber-300";
    timeText = "text-amber-700";
  } else if (isCheckin && isReviewing) {
    chipBg = "bg-purple-300 border-purple-600";
    timeText = "text-purple-900";
  } else if (isCheckin) {
    chipBg = "bg-green-200 border-green-500";
    timeText = "text-green-900";
  } else {
    chipBg = "bg-blue-100 border-blue-500";
    timeText = "text-blue-800";
  }

  const timeStr = booking.date_time
    ? (() => {
        // Timezone-safe Vietnam time (Supabase stores +00:00; the "THH:MM"
        // segment is UTC, not the VN time the user entered).
        return toVietnamTime(booking.date_time!);
      })()
    : "";

  const phone = booking.customer?.phone || "";

  return (
    <DraggableHoverPopup
      side="right"
      align="start"
      sideOffset={0}
      className="w-[340px] max-w-[340px] text-xs"
      renderPopup={() => (
        <BookingHoverDetails
          booking={booking}
          canViewCustomerPhone={canViewCustomerPhone}
          statusOptions={[]}
          onStatusChange={() => {}}
          selectOpen={false}
          setSelectOpen={() => {}}
          onEdit={onEdit || onClick}
          onDelete={() => {}}
          canCancelPayment={false}
          onOpenInvoice={onClick}
          onAssignStaff={onAssignStaff || onEdit || onClick}
        />
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={`${timeStr} · ${booking.customer?.name || "Khách"} · ${phone || ""} · ${serviceName} · ${staffName}`}
        className={`group flex w-full cursor-pointer flex-col overflow-hidden border-2 p-2 text-left shadow-sm transition hover:shadow-md ${chipBg}${isHighlighted ? " booking-highlight-flash" : ""}`}
      >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${timeText}`}>{timeStr}</span>
            {booking.numberOfCustomers > 1 && (
              <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                ×{booking.numberOfCustomers}
              </span>
            )}
          </div>
          {/* Customer — multi-customer "Cùng lịch" bookings list every slot's
              customer; others show the single booking customer. */}
          {(() => {
            const slotCustomers = getAllSlotCustomers(booking.note);
            if (slotCustomers && slotCustomers.length > 0) {
              return (
                <div className="mt-0.5 space-y-0.5">
                  {slotCustomers.map((sc, i) => (
                    <div key={i} className="truncate text-sm font-medium text-gray-900">
                      {sc.walkin ? (
                        <span className="text-gray-500">Khách vãng lai</span>
                      ) : (
                        <>
                          {sc.name || "Khách"}
                          {sc.phone && (
                            <span className="ml-1 text-xs font-normal text-gray-500">
                              {canViewCustomerPhone ? sc.phone : maskPhone(sc.phone)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div className="mt-0.5 truncate text-sm font-medium text-gray-900">
                {booking.customer?.name || "Khách"}
                {phone && (
                  <span className="ml-1 text-xs font-normal text-gray-500">
                    {canViewCustomerPhone ? phone : maskPhone(phone)}
                  </span>
                )}
              </div>
            );
          })()}
          {/* Services — list ALL of them, one line per service. The staff name
              sits to the RIGHT of each service (same line) so the cashier sees
              who performs each service at a glance. */}
          <div className="mt-0.5 space-y-0.5">
            {serviceRows.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-1">
                <span className="truncate text-xs text-gray-700">
                  {s.service?.name || "Dịch vụ"}
                  {s.service?.duration ? (
                    <span className="ml-0.5 text-gray-500">({s.service.duration})</span>
                  ) : null}
                </span>
                {s.staff?.name && (
                  <span className="shrink-0 text-[11px] font-medium text-sky-600">NV: {s.staff.name}</span>
                )}
              </div>
            ))}
            {serviceRows.length === 0 && (
              <div className="truncate text-xs text-gray-600">{serviceName}</div>
            )}
          </div>
          {totalDuration > 0 && (
            <div className="mt-0.5 text-[10px] font-medium text-gray-500">
              Tổng: {totalDuration} phút
            </div>
          )}
      </button>
    </DraggableHoverPopup>
  );
}

/** Rich hover popover content — redesigned per user request:
 *  Line 1: customer name | phone
 *  Line 2: status badge + status Select (Checkin / Không đến / Hủy)
 *  Line 3: services with (duration), staff name below in blue
 *  Line 4: "Đơn hàng" link (or "Xem hóa đơn" if paid) → opens invoice dialog
 *  Line 5: square edit + trash buttons
 *  Lazily fetches the linked invoice for the paid-amount display.
 *
 *  Exported so the Khung giờ (time-grid) view can reuse the SAME popover
 *  content, keeping the hover experience identical across both views. */
export function BookingHoverDetails({
  booking,
  canViewCustomerPhone,
  statusOptions,
  onStatusChange,
  selectOpen,
  setSelectOpen,
  onEdit,
  onDelete,
  canCancelPayment,
  onOpenInvoice,
  onAssignStaff,
}: {
  booking: Booking;
  canViewCustomerPhone: boolean;
  statusOptions: BookingStatusType[];
  onStatusChange: (status: BookingStatusType) => void;
  selectOpen: boolean;
  setSelectOpen: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  canCancelPayment: boolean;
  onOpenInvoice: () => void;
  /** Open the booking edit dialog to assign a staff. Called by the "Xếp nhân
      viên" button shown in the services list when a service has no staff. */
  onAssignStaff?: () => void;
}) {
  // Parse date + time using the timezone-safe Vietnam helpers. Supabase
  // stores date_time normalized to +00:00 (UTC), so the raw "THH:MM" segment
  // is the UTC time — NOT the Vietnam wall-clock time the user entered.
  // Parsing the raw segment directly would display "03:30" for a 10:30 VN
  // booking (off by 7h).
  const dateStr = booking.date_time
    ? (() => {
        const isoDayParts = toVietnamDay(booking.date_time).split("-");
        if (isoDayParts.length !== 3) return "";
        return `${isoDayParts[2]}/${isoDayParts[1]}/${isoDayParts[0]} ${toVietnamTime(booking.date_time)}`;
      })()
    : "";

  // Lazy-load the invoice detail (items, tip, promotion, final_amount).
  // Bookings that were never checked out have no invoice → the query returns
  // null and we show only the booking's own services.
  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["booking-hover-invoice", booking.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=1`
      );
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data) || json.data.length === 0) return null;
      return json.data[0] as {
        code?: string | null;
        status?: string | null;
        final_amount?: number | string | null;
        total_amount?: number | string | null;
        discount?: number | string | null;
        tip?: number;
        promotion?: { name?: string; code?: string; discountValue?: number; discountAmount?: number } | null;
        payment_method?: string | null;
        items?: Array<{
          name?: string;
          type?: string;
          quantity?: number;
          price?: number;
          discount?: number;
          total?: number;
          staffName?: string;
        }>;
      } | null;
    },
    staleTime: 60_000, // cache for 1 min so re-hover doesn't refetch
  });

  // Booking's own services (always available, even without an invoice).
  const bookingServices = (booking.services as BookingServiceRow[]) || [];
  // Invoice items — split services vs products.
  const invoiceItems = invoiceData?.items || [];
  const serviceItems = invoiceItems.filter((it) => it.type === "service");
  const productItems = invoiceItems.filter((it) => it.type === "product" || (it.type && it.type !== "service"));
  // Build a name→duration map from the booking's own services so invoice
  // service items can also show their duration (the invoice item itself only
  // carries price/quantity, not duration).
  const durationByName = new Map<string, number>();
  for (const s of bookingServices) {
    if (s.service?.name && s.service?.duration) {
      durationByName.set(s.service.name, s.service.duration);
    }
  }
  // Fallback to booking services when invoice has no service items yet.
  // Sort by sort_order so the numbering matches the multi-customer slot
  // customer order (slots[i] ↔ services[i] in sort_order).
  const displayServices: Array<{
    name?: string;
    type?: string;
    quantity?: number;
    price?: number;
    discount?: number;
    total?: number;
    staffName?: string;
    duration?: number;
  }> = serviceItems.length > 0
    ? serviceItems.map((it) => ({
        ...it,
        duration: (it.name && durationByName.get(it.name)) ?? undefined,
      }))
    : bookingServices
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((s) => ({
          name: s.service?.name || "Dịch vụ",
          type: "service",
          quantity: 1,
          price: Number(s.service?.price) || 0,
          discount: 0,
          total: Number(s.service?.price) || 0,
          staffName: s.staff?.name,
          duration: s.service?.duration,
        }));

  const fmt = (n: number | string | null | undefined) => {
    const v = Number(n) || 0;
    return new Intl.NumberFormat("vi-VN").format(v) + "đ";
  };

  const tip = Number(invoiceData?.tip) || 0;
  const discount = Number(invoiceData?.discount) || 0;
  const finalAmount = invoiceData?.final_amount ?? booking.invoice?.final_amount;
  const promo = invoiceData?.promotion;
  const isPaid = booking.status === "checkout";
  // Multi-customer "Cùng lịch" booking — detected via the [[MULTI]] note marker.
  // Used to add customer/service numbering in the hover tooltip.
  const isMulti = !!getAllSlotCustomers(booking.note);
  // When the booking has been checked in (customer is being served), the
  // "Đơn hàng" link becomes "Xem hóa đơn" — clicking it opens the invoice
  // dialog so the cashier can review/add items and proceed to payment.
  // This matches the user's requirement: a checkin booking's order link
  // should read "Xem hóa đơn" (not "Đơn hàng"), and clicking it opens:
  //  - the invoice dialog (payment dialog) if no invoice exists yet or the
  //    invoice is still pending (staff hasn't completed checkout), OR
  //  - the paid invoice view if the invoice is already completed (this branch
  //    is handled by the `isPaid` gate above — a `checkin` booking with a
  //    completed invoice is unusual; the normal flow transitions the booking
  //    to `checkout` when the invoice is paid).
  const isCheckin = booking.status === "checkin";
  const showInvoiceLabel = isPaid || isCheckin;
  const statusLabel = BookingStatusLabel[booking.status as BookingStatusType] || booking.status;
  const statusColors = BookingStatusBadgeColors[booking.status as BookingStatusType] || { bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <div className="space-y-1 p-2">
      {/* Line 1: customer name | phone — multi-customer "Cùng lịch" bookings
          list every slot's customer WITH numbering (1. 2. 3. ...); others show
          the single booking customer. */}
      {(() => {
        const slotCustomers = getAllSlotCustomers(booking.note);
        if (slotCustomers && slotCustomers.length > 0) {
          return (
            <div className="space-y-1 border-b pb-1">
              {slotCustomers.map((sc, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    <span className="text-emerald-600">{i + 1}.</span>{" "}
                    {sc.walkin ? <span className="text-gray-500">Khách vãng lai</span> : (sc.name || "Khách")}
                  </span>
                  {!sc.walkin && sc.phone && (
                    <span className="shrink-0 text-xs text-gray-500">
                      {canViewCustomerPhone ? sc.phone : maskPhone(sc.phone)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="flex items-center justify-between gap-2 border-b pb-1">
            <span className="truncate text-sm font-semibold text-gray-900">
              {booking.customer?.name || "Khách"}
            </span>
            {booking.customer?.phone && (
              <span className="shrink-0 text-xs text-gray-500">
                {canViewCustomerPhone ? booking.customer.phone : maskPhone(booking.customer.phone)}
              </span>
            )}
          </div>
        );
      })()}

      {/* Line 2: status badge + status Select (Checkin / Không đến / Hủy) */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors.bg} ${statusColors.text}`}>
          {statusLabel}
        </span>
        {statusOptions.length > 0 ? (
          <Select
            value=""
            open={selectOpen}
            onOpenChange={(open) => setSelectOpen(open)}
            onValueChange={(value) => {
              onStatusChange(value as BookingStatusType);
              setSelectOpen(false);
            }}
          >
            <SelectTrigger className="cursor-pointer h-6 w-auto min-w-0 max-w-[110px] text-[11px] gap-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
              <SelectValue placeholder="Đổi trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((st) => (
                <SelectItem key={st} value={st} className="text-xs">
                  {BookingStatusLabel[st]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {/* Line 3: services — name (duration), staff name below in blue.
          For multi-customer bookings, each service is numbered to match the
          customer numbering above (1. ↔ customer 1, 2. ↔ customer 2, etc.).
          When a service has NO staff assigned, a small blue "Xếp nhân viên"
          button appears below the service name so the user can assign one
          directly from the hover popover (mirrors the button on the block
          face). */}
      {displayServices.length > 0 && (
        <div className="space-y-1 border-t pt-1">
          {displayServices.map((s, i) => (
            <div key={i} className="space-y-0.5">
              <div className="text-xs text-gray-900">
                {isMulti && <span className="text-emerald-600">{i + 1}.</span>}{" "}
                {s.name || "Dịch vụ"}
                {s.duration ? <span className="ml-1 text-gray-500">({s.duration})</span> : null}
              </div>
              {s.staffName ? (
                <div className="text-[11px] font-medium text-sky-600">{s.staffName}</div>
              ) : onAssignStaff ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignStaff();
                  }}
                  className="cursor-pointer inline-flex items-center rounded border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700"
                  title="Xếp nhân viên cho dịch vụ này"
                >
                  Xếp nhân viên
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Line 4: "Tạo bởi" + "Đơn hàng"/"Xem hóa đơn" link + "Checkin" button.
          - checkout (paid) → "Xem hóa đơn" (opens the full paid invoice view)
          - checkin (being served) → "Xem hóa đơn" (opens the invoice/payment
            dialog so the cashier can review items and proceed to payment)
          - confirmed / new / cancelled / no_show → "Đơn hàng" (opens the
            booking edit dialog — no invoice to view yet)
          The "Checkin" button appears ONLY for confirmed/new bookings (the
          customer hasn't arrived yet). Clicking it transitions the booking to
          "checkin" via onStatusChange("checkin"). Once checked in, the button
          disappears (the status is already checkin). */}
      <div className="border-t pt-1">
        <div className="mb-0.5 text-xs text-gray-500">
          Tạo bởi: {booking.created_by ? (booking.createdBy?.name || "—") : "Khách hàng"}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenInvoice();
            }}
            className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            {showInvoiceLabel ? "Xem hóa đơn" : "Đơn hàng"}
          </button>
          {finalAmount != null && (
            <span className="text-xs font-medium text-emerald-700">
              {fmt(finalAmount)}
            </span>
          )}
          {/* Checkin button — only for confirmed/new (customer not yet arrived).
              Uses onStatusChange("checkin") to transition. Hidden for checkin
              (already checked in) and terminal statuses (checkout/cancelled/no_show).
              Positioned IMMEDIATELY NEXT TO "Đơn hàng" (not pushed to the far
              right) so it reads as a companion action, not a separate section. */}
          {(booking.status === "confirmed" || booking.status === "new") && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange("checkin");
              }}
              className="cursor-pointer flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              title="Chuyển đơn sang trạng thái Đã checkin"
            >
              <LogIn className="h-3 w-3" />
              Checkin
            </button>
          )}
        </div>
      </div>

      {/* Line 5: square edit + trash buttons */}
      <div className="flex gap-1 border-t pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="cursor-pointer flex h-8 w-8 items-center justify-center border text-gray-600 hover:bg-gray-100"
          aria-label="Chỉnh sửa"
          title="Chỉnh sửa"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (canCancelPayment) onDelete();
          }}
          disabled={!canCancelPayment}
          title={canCancelPayment ? "Xóa" : "Bạn không có quyền hủy"}
          className="cursor-pointer flex h-8 w-8 items-center justify-center border text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="Xóa"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
