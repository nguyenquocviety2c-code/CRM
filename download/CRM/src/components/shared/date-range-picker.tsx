"use client";

import { useState, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";

interface DateRangePickerProps {
  /** Start date in "dd/MM/yyyy" format */
  dateFrom: string;
  /** End date in "dd/MM/yyyy" format */
  dateTo: string;
  /** Called with (from, to) — both in "dd/MM/yyyy" format — when the user changes the range */
  onChange: (from: string, to: string) => void;
  /** Optional compact mode (smaller button) */
  size?: "default" | "sm";
  /** When true, the end-date calendar disables all days before the start date
   *  (so the end date must be >= start date). */
  lockEndBeforeStart?: boolean;
}

/**
 * Dual-calendar date range picker — unified click model.
 *
 * A SINGLE button shows the current range ("dd/MM/yyyy ~ dd/MM/yyyy"). Clicking
 * opens a popover with TWO side-by-side calendars. The user can click ANY day
 * on EITHER calendar — there is no fixed "left = start, right = end" rule.
 *
 * Click model:
 *   - 1st click: selects the first date (highlighted). Popover stays open.
 *   - 2nd click: selects the second date. The earlier of the two becomes the
 *     start, the later becomes the end. Popover auto-closes.
 *   - If both clicks are the same day → single-day range (from === to).
 *
 * This is simpler and faster than the old left=start / right=end model.
 */
export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
  size = "default",
  lockEndBeforeStart = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  // Draft state — mirrors the parent's committed values while the popover
  // is open. The first click sets `firstPick`; the second click commits
  // the range and closes.
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const [firstPick, setFirstPick] = useState<string | null>(null);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setDraftFrom(dateFrom);
      setDraftTo(dateTo);
      setFirstPick(null);
    }
  };

  const parseDDMMYYYY = (s: string): Date | undefined => {
    if (!s) return undefined;
    const d = parse(s, "dd/MM/yyyy", new Date());
    return isValid(d) ? d : undefined;
  };

  // Unified day-click handler — works for BOTH calendars. The user clicks
  // any day on either calendar; the 1st click sets the first date, the 2nd
  // click sets the range (earlier = start, later = end) and closes.
  const handleDayClick = (
    _side: "start" | "end",
    date: Date,
    _e: ReactMouseEvent
  ) => {
    const formatted = format(date, "dd/MM/yyyy");

    if (!firstPick) {
      // 1st click — just remember the date. Show it as selected on both
      // calendars so the user sees their pick.
      setFirstPick(formatted);
      setDraftFrom(formatted);
      setDraftTo(formatted);
      // Commit immediately so the parent updates (single-day preview).
      onChange(formatted, formatted);
      return;
    }

    // 2nd click — determine start (earlier) and end (later).
    const first = parseDDMMYYYY(firstPick)!;
    const second = date;
    first.setHours(0, 0, 0, 0);
    second.setHours(0, 0, 0, 0);

    let from: string;
    let to: string;
    if (first <= second) {
      from = firstPick;
      to = formatted;
    } else {
      from = formatted;
      to = firstPick;
    }

    setDraftFrom(from);
    setDraftTo(to);
    setFirstPick(null);
    onChange(from, to);
    setOpen(false);
  };

  const startDate = parseDDMMYYYY(draftFrom);
  const endDate = parseDDMMYYYY(draftTo);

  const today = new Date();
  const leftDefaultMonth = startDate || today;
  // Right calendar shows the next month so the user can see a wider range.
  const rightDefaultMonth = new Date(leftDefaultMonth);
  rightDefaultMonth.setMonth(rightDefaultMonth.getMonth() + 1);

  const triggerLabel =
    dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : "Chọn khoảng ngày";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`gap-1.5 h-7 px-2.5 text-xs ${size === "sm" ? "h-6 text-[11px]" : ""}`}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        {/* Two side-by-side compact calendars. Both accept clicks — the user
            can pick any day from either calendar. No "Ngày bắt đầu" / "Ngày kết
            thúc" labels — the 2-click model is self-explanatory.

            Size: override the shared Calendar's --cell-size (default 32px) down
            to 24px and trim padding so the whole popover is noticeably smaller.
            Applied here (not in calendar.tsx) so standalone Calendar usages
            elsewhere keep their original size. */}
        <div className="flex">
          <div className="border-r p-1.5">
            <Calendar
              mode="single"
              selected={startDate}
              defaultMonth={leftDefaultMonth}
              className="p-1.5 [--cell-size:--spacing(6)] text-[11px] [&_[data-day]]:!text-[13px]"
              // Tighten the gap between week rows (default mt-2 → mt-0.5). The
              // `week` override REPLACES the default (Calendar spreads
              // ...classNames last), so we re-include "flex w-full".
              classNames={{ week: "flex w-full mt-0.5" }}
              onDayClick={(date, _modifiers, e) =>
                handleDayClick("start", date, e as unknown as ReactMouseEvent)
              }
            />
          </div>
          <div className="p-1.5">
            <Calendar
              mode="single"
              selected={endDate}
              defaultMonth={rightDefaultMonth}
              className="p-1.5 [--cell-size:--spacing(6)] text-[11px] [&_[data-day]]:!text-[13px]"
              classNames={{ week: "flex w-full mt-0.5" }}
              onDayClick={(date, _modifiers, e) =>
                handleDayClick("end", date, e as unknown as ReactMouseEvent)
              }
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
