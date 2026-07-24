"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Booking, BookingServiceRow } from "@/stores/booking-store";
import {
  BookingStatusLabel,
  BookingStatusBadgeColors,
  BookingStatusType,
} from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamTime } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Pencil, Trash2 } from "lucide-react";

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

    if (unassigned.length > 0) {
      columns.push({ staff: null, segments: unassigned });
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

  // Build the CSS grid-template-columns string from the widths array.
  const gridTemplate = columnWidths.map((w) => `${w}px`).join(" ");
  // Total scrollable width = sum of all column widths.
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
          - Time slot placement uses the ISO string directly (regex) so a 09:30
            booking lands in the 09:00 row, NOT in 16:00 (avoids UTC→local TZ
            shift that previously mis-bucketed bookings).
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
            stays visible while the user scrolls through the staff columns. */}
        <div className="overflow-x-auto">
          <div style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}>
            {/* Header row: "Giờ" + staff names. The "Giờ" cell is sticky-left. */}
            <div
              className="grid border-b-2 border-gray-400 bg-gray-50"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div
                className="staff-grid-header-cell sticky left-0 z-20 border-r border-gray-300 bg-gray-50 p-3 text-center text-xs font-semibold text-gray-600"
              >
                Giờ
                {/* Drag handle on the right edge of the "Giờ" header */}
                <div
                  className="staff-grid-resizer absolute top-0 right-0 z-30"
                  style={{ width: `${RESIZER_WIDTH}px`, height: "100%", cursor: "col-resize", marginRight: `-${RESIZER_WIDTH / 2}px` }}
                  onMouseDown={(e) => startColumnResize(e, 0)}
                />
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
                  {/* Drag handle on the right edge of this staff header cell */}
                  <div
                    className="staff-grid-resizer absolute top-0 right-0 z-30"
                    style={{ width: `${RESIZER_WIDTH}px`, height: "100%", cursor: "col-resize", marginRight: `-${RESIZER_WIDTH / 2}px` }}
                    onMouseDown={(e) => startColumnResize(e, idx + 1)}
                  />
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
                      // - Paid (checkout status = has a completed/paid invoice) → open the
                      //   invoice dialog (Hóa đơn) so the cashier can review/print the receipt.
                      // - Not paid (confirmed / new / checkin / cancelled / no_show) → open
                      //   the edit booking dialog (Chỉnh sửa lịch hẹn) so staff can edit
                      //   details or proceed to checkin/payment.
                      onClick={() => {
                        const isPaid = seg.booking.status === "checkout";
                        if (isPaid && onShowInvoice) {
                          onShowInvoice(seg.booking);
                        } else {
                          onBookingClick(seg.booking);
                        }
                      }}
                      onStatusChange={(status) => onStatusChange?.(seg.booking.id, status)}
                      onEdit={() => onEdit?.(seg.booking)}
                      onDelete={() => onDelete?.(seg.booking.id)}
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
  pxPerHour = PX_PER_HOUR,
}: {
  segment: ServiceSegment;
  onClick: () => void;
  onStatusChange: (status: BookingStatusType) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Hour-band height (single-day resizable timeline). Defaults to PX_PER_HOUR. */
  pxPerHour?: number;
}) {
  const booking = segment.booking;
  const canCancelPayment = useAuthStore((s) => s.hasPermission("cancel_payment"));
  const canViewCustomerPhone = useAuthStore((s) => s.hasPermission("view_customer_phone"));
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
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  // Match Khung giờ's color palette (bg-*-50 + border-*-300) for a softer look.
  const blockBg = isPaid
    ? "bg-emerald-50 border-emerald-300"
    : isCancelled
      ? "bg-red-50 border-red-200"
      : "bg-sky-50 border-sky-300";
  const timeText = isPaid
    ? "text-emerald-700"
    : isCancelled
      ? "text-red-700"
      : "text-sky-700";

  // Status options — same logic as the list view / time-grid popover.
  // "checkout" is NOT a manual option: it is applied automatically once
  // payment is completed in the Cashier/Invoice dialog. Terminal statuses
  // (checkout/no_show/cancelled) → no select.
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
      className="absolute left-1 right-1"
      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        // Keep popover open while the status select dropdown is open (it portals outside).
        if (selectOpen) return;
        setHovered(false);
      }}
    >
      {/* Block (clickable → opens edit or invoice depending on paid status) */}
      <button
        type="button"
        onClick={onClick}
        className={`absolute inset-0 overflow-hidden border p-2 text-left shadow-sm transition hover:shadow-md ${blockBg}`}
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
        <div className="mt-0.5 truncate text-sm font-medium text-gray-900">
          {booking.customer?.name || "Khách"}
          {booking.customer?.phone && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              {canViewCustomerPhone ? booking.customer.phone : maskPhone(booking.customer.phone)}
            </span>
          )}
        </div>
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
            <div className="mt-0.5 truncate text-[11px] font-medium text-sky-600">NV: {staffName}</div>
          </>
        ) : (
          <div className="mt-0.5 flex items-center gap-1 text-xs">
            <span className="truncate text-gray-700">
              {segment.services[0]?.service?.name || "Dịch vụ"}
              {segment.services[0]?.service?.duration ? <span className="ml-0.5 text-gray-500">({segment.services[0].service!.duration})</span> : null}
            </span>
            <span className="shrink-0 font-medium text-sky-600">NV: {staffName}</span>
          </div>
        )}
      </button>

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

/** Extract { dayKey, hour, minute } directly from the ISO `date_time` string
 *  via regex. This AVOIDS timezone shifts — `new Date("2026-07-08T09:30:00+00:00").getHours()`
 *  returns 16 in UTC+7 browsers, which is what caused bookings to land in the
 *  wrong row (a 09:30 booking showing up in the 16:00 row). By parsing the
 *  string directly we always get the time the user intended when booking. */
function getBookingDayHour(booking: Booking): { dayKey: string; hour: number; minute: number } | null {
  const dt = booking.date_time;
  if (!dt || typeof dt !== "string") return null;
  // Match the date + time portions directly from the ISO string.
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) return null;
  const dayKey = `${m[1]}-${m[2]}-${m[3]}`;
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
    // Sort each cell's bookings by start minute (earlier first → top).
    // Use the regex-parsed minute (not Date.getMinutes) to avoid TZ shifts.
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ai = getBookingDayHour(a);
        const bi = getBookingDayHour(b);
        return (ai?.minute ?? 0) - (bi?.minute ?? 0);
      });
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
}: {
  booking: Booking;
  canViewCustomerPhone: boolean;
  onClick: () => void;
}) {
  const serviceRows = getAllServices(booking);
  const svc = serviceRows[0] || null;
  const serviceName = svc?.service?.name || "Dịch vụ";
  const staffName = svc?.staff?.name || "—";
  const totalDuration = serviceRows.reduce((sum, s) => sum + (s.service?.duration || 0), 0);
  const isPaid = booking.status === "checkout";
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  // Match Khung giờ's color palette (bg-*-50 + border-*-300) for a softer look.
  const chipBg = isPaid
    ? "bg-emerald-50 border-emerald-300"
    : isCancelled
      ? "bg-red-50 border-red-200"
      : "bg-sky-50 border-sky-300";
  const timeText = isPaid
    ? "text-emerald-700"
    : isCancelled
      ? "text-red-700"
      : "text-sky-700";

  const timeStr = booking.date_time
    ? (() => {
        // Timezone-safe Vietnam time (Supabase stores +00:00; the "THH:MM"
        // segment is UTC, not the VN time the user entered).
        return toVietnamTime(booking.date_time!);
      })()
    : "";

  const phone = booking.customer?.phone || "";

  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          title={`${timeStr} · ${booking.customer?.name || "Khách"} · ${phone || ""} · ${serviceName} · ${staffName}`}
          className={`group flex w-full cursor-pointer flex-col overflow-hidden border p-2 text-left shadow-sm transition hover:shadow-md ${chipBg}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${timeText}`}>{timeStr}</span>
            {booking.numberOfCustomers > 1 && (
              <span className="border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                ×{booking.numberOfCustomers}
              </span>
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
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-[340px] max-w-[340px] p-0 text-xs shadow-xl"
      >
        <BookingHoverDetails booking={booking} canViewCustomerPhone={canViewCustomerPhone} />
      </HoverCardContent>
    </HoverCard>
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
}) {
  // Parse date + time directly from the ISO string (no TZ shift).
  const dateStr = booking.date_time
    ? (() => {
        const m = booking.date_time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!m) return "";
        return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
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
    : bookingServices.map((s) => ({
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
  const statusLabel = BookingStatusLabel[booking.status as BookingStatusType] || booking.status;
  const statusColors = BookingStatusBadgeColors[booking.status as BookingStatusType] || { bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <div className="space-y-1 p-2">
      {/* Line 1: customer name | phone */}
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
            <SelectTrigger className="h-6 w-[130px] text-[11px]">
              <SelectValue placeholder="Chọn trạng thái" />
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

      {/* Line 3: services — name (duration), staff name below in blue */}
      {displayServices.length > 0 && (
        <div className="space-y-1 border-t pt-1">
          {displayServices.map((s, i) => (
            <div key={i} className="space-y-0.5">
              <div className="text-xs text-gray-900">
                {s.name || "Dịch vụ"}
                {s.duration ? <span className="ml-1 text-gray-500">({s.duration})</span> : null}
              </div>
              {s.staffName && (
                <div className="text-[11px] font-medium text-sky-600">{s.staffName}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Line 4: "Tạo bởi" + "Đơn hàng" / "Xem hóa đơn" link */}
      <div className="border-t pt-1">
        <div className="mb-0.5 text-xs text-gray-500">
          Tạo bởi: {booking.created_by ? (booking.createdBy?.name || "—") : "Khách hàng"}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenInvoice();
          }}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {isPaid ? "Xem hóa đơn" : "Đơn hàng"}
        </button>
        {finalAmount != null && (
          <span className="ml-2 text-xs font-medium text-emerald-700">
            {fmt(finalAmount)}
          </span>
        )}
      </div>

      {/* Line 5: square edit + trash buttons */}
      <div className="flex gap-1 border-t pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex h-8 w-8 items-center justify-center border text-gray-600 hover:bg-gray-100"
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
          className="flex h-8 w-8 items-center justify-center border text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="Xóa"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
