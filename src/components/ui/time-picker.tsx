"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  // When true, the input is disabled and the dropdown won't open. Used by the
  // booking dialog to force the user to pick a date first (the time picker's
  // past-time blocking depends on the selected date).
  disabled?: boolean;
  // Set of hour strings ("00".."23") that should be HIDDEN entirely (no
  // feasible minute in that hour). Used to hide hours fully blocked by the
  // staff's existing bookings.
  hiddenHours?: Set<string>;
  // Map hour string -> Set of minute strings ("00".."59") to hide for that
  // hour. Used to hide only the infeasible minutes within an hour.
  hiddenMinutes?: Record<string, Set<string>>;
  // Minute granularity (in minutes). When set (e.g. 30), the minute column
  // only shows 00, 30 (etc.) instead of every minute. Typing/blurring snaps
  // to the nearest step. Default undefined = all minutes.
  minuteStep?: number;
}

// Business hours: the salon accepts bookings from 08:30 to 19:30 (closing at
// 20:30). Hours and minutes outside this range are hidden from the picker.
const OPEN_HOUR = 8;
const OPEN_MINUTE = 30;
const LAST_BOOKING_HOUR = 19;
const LAST_BOOKING_MINUTE = 30;

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

// Return the visible hours based on business hours (08:30–19:30).
function getBusinessHours(): string[] {
  return ALL_HOURS.filter((h) => {
    const hi = parseInt(h, 10);
    if (hi < OPEN_HOUR || hi > LAST_BOOKING_HOUR) return false;
    return true;
  });
}

// Return the visible minutes for a given hour, based on business hours.
//  - Hour 08: only minutes >= 30 (opens at 08:30).
//  - Hour 19: only minutes <= 30 (last booking at 19:30).
//  - Other hours in range: all minutes (or step-filtered when minuteStep set).
function getBusinessMinutes(hour: string, minuteStep?: number): string[] {
  const hi = parseInt(hour, 10);
  return ALL_MINUTES.filter((m) => {
    const mi = parseInt(m, 10);
    if (hi === OPEN_HOUR && mi < OPEN_MINUTE) return false;
    if (hi === LAST_BOOKING_HOUR && mi > LAST_BOOKING_MINUTE) return false;
    // When a minuteStep is set (e.g. 30), only keep minutes that are multiples
    // of the step (00, 30). This restricts the picker to half-hour slots.
    if (minuteStep && minuteStep > 1 && mi % minuteStep !== 0) return false;
    return true;
  });
}

export function TimePicker({ value, onChange, placeholder = "HH:MM", id, disabled, hiddenHours, hiddenMinutes, minuteStep }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  const parts = value.split(":");
  const hour = parts[0] || "08";
  const minute = parts[1] || "30";

  // Track whether the user has explicitly picked an hour and a minute during
  // the current open session. Auto-close the popover once BOTH have been
  // picked (the user selected an hour then a minute → done).
  const pickedRef = useRef<{ hour: boolean; minute: boolean }>({ hour: false, minute: false });

  const setHour = useCallback(
    (h: string) => {
      onChange(`${h}:${minute}`);
      pickedRef.current.hour = true;
      // Auto-close once BOTH hour and minute have been picked this session.
      if (pickedRef.current.minute) {
        setOpen(false);
      }
    },
    [minute, onChange]
  );

  const setMinute = useCallback(
    (m: string) => {
      onChange(`${hour}:${m}`);
      pickedRef.current.minute = true;
      // Auto-close once BOTH hour and minute have been picked this session.
      if (pickedRef.current.hour) {
        setOpen(false);
      }
    },
    [hour, onChange]
  );

  // --- Compute visible hours + minutes ---
  // Start from business hours, then remove feasibility-hidden ones.
  const businessHours = getBusinessHours();
  const hiddenHrs = hiddenHours || new Set<string>();
  const visibleHours = businessHours.filter((h) => !hiddenHrs.has(h));

  // Business minutes for the selected hour (step-filtered when minuteStep set),
  // then remove feasibility-hidden ones.
  const businessMinutes = getBusinessMinutes(hour, minuteStep);
  const hiddenMins = hiddenMinutes || {};
  const visibleMinutes = businessMinutes.filter(
    (m) => !(hiddenMins[hour] && hiddenMins[hour].has(m))
  );

  const handleWheel = (e: React.WheelEvent, type: "hour" | "minute") => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Scroll up → decrease
      if (type === "hour") {
        const idx = visibleHours.indexOf(hour);
        if (idx > 0) setHour(visibleHours[idx - 1]);
      } else {
        const idx = visibleMinutes.indexOf(minute);
        if (idx > 0) setMinute(visibleMinutes[idx - 1]);
      }
    } else {
      // Scroll down → increase
      if (type === "hour") {
        const idx = visibleHours.indexOf(hour);
        if (idx >= 0 && idx < visibleHours.length - 1) setHour(visibleHours[idx + 1]);
      } else {
        const idx = visibleMinutes.indexOf(minute);
        if (idx >= 0 && idx < visibleMinutes.length - 1) setMinute(visibleMinutes[idx + 1]);
      }
    }
  };

  const scrollItemIntoView = (container: HTMLElement, index: number) => {
    const itemHeight = 24;
    container.scrollTop = index * itemHeight - itemHeight * 2; // Center selected
  };

  useEffect(() => {
    if (open) {
      // Reset the pick tracking so the auto-close only fires after BOTH an
      // hour AND a minute are picked in THIS open session.
      pickedRef.current = { hour: false, minute: false };
      if (hourRef.current) {
        const idx = visibleHours.indexOf(hour);
        if (idx >= 0) scrollItemIntoView(hourRef.current, idx);
      }
      if (minuteRef.current) {
        const idx = visibleMinutes.indexOf(minute);
        if (idx >= 0) scrollItemIntoView(minuteRef.current, idx);
      }
    }
  }, [open, hour, minute, visibleHours, visibleMinutes]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow free typing — accept digits and colon
    const cleaned = raw.replace(/[^\d:]/g, "");
    onChange(cleaned);
  };

  const handleInputBlur = () => {
    // Normalize on blur — pad with zeros, clamp to business hours.
    if (value && value.includes(":")) {
      let [h, m] = value.split(":");
      let hNum = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
      let mNum = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
      // When a minuteStep is set (e.g. 30), snap the typed minute to the
      // nearest step (00 or 30) so manually-typed times also land on a slot.
      if (minuteStep && minuteStep > 1) {
        mNum = Math.round(mNum / minuteStep) * minuteStep;
        if (mNum >= 60) mNum = 0; // wrapped past 59 → 0 (hour unchanged here)
      }
      // Clamp to business hours 08:30–19:30.
      if (hNum < OPEN_HOUR) { hNum = OPEN_HOUR; mNum = OPEN_MINUTE; }
      else if (hNum === OPEN_HOUR && mNum < OPEN_MINUTE) { mNum = OPEN_MINUTE; }
      if (hNum > LAST_BOOKING_HOUR) { hNum = LAST_BOOKING_HOUR; mNum = LAST_BOOKING_MINUTE; }
      else if (hNum === LAST_BOOKING_HOUR && mNum > LAST_BOOKING_MINUTE) { mNum = LAST_BOOKING_MINUTE; }
      onChange(`${String(hNum).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`);
    }
  };

  // Clicking an hour or minute should NOT close the popover — the user needs
  // to pick both. Radix Popover closes on any pointer-down inside content by
  // default; we stop propagation on the click so it stays open. A "Xong"
  // button at the bottom explicitly closes it.
  const handleHourClick = (e: React.MouseEvent, h: string) => {
    e.stopPropagation();
    setHour(h);
  };
  const handleMinuteClick = (e: React.MouseEvent, m: string) => {
    e.stopPropagation();
    setMinute(m);
  };

  return (
    <div className="relative">
      <Popover open={open && !disabled} onOpenChange={(v) => !disabled && setOpen(v)}>
        <PopoverTrigger asChild>
          <Input
            id={id}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={disabled ? undefined : handleInputChange}
            onBlur={disabled ? undefined : handleInputBlur}
            disabled={disabled}
            className={cn("pr-8", disabled ? "cursor-not-allowed bg-gray-100 text-gray-400" : "cursor-pointer")}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Allow outside-click to close (the user wanted this). Previously
          // onInteractOutside was prevented which kept the popover open.
        >
          <div className="flex">
            {/* Hours column */}
            <div className="flex flex-col items-center border-r">
              <button
                type="button"
                className="py-0.5 text-gray-500 hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = visibleHours.indexOf(hour);
                  if (idx > 0) setHour(visibleHours[idx - 1]);
                }}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <div
                ref={hourRef}
                onWheel={(e) => handleWheel(e, "hour")}
                className="h-24 overflow-y-auto scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {visibleHours.length === 0 ? (
                  <div className="px-2 py-3 text-[10px] text-gray-400">Không có giờ</div>
                ) : (
                  visibleHours.map((h) => (
                    <div
                      key={h}
                      className={cn(
                        "flex h-6 w-10 items-center justify-center cursor-pointer text-[11px] tabular-nums",
                        h === hour
                          ? "bg-emerald-100 font-semibold text-emerald-700"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                      onClick={(e) => handleHourClick(e, h)}
                    >
                      {h}
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                className="py-0.5 text-gray-500 hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = visibleHours.indexOf(hour);
                  if (idx >= 0 && idx < visibleHours.length - 1) setHour(visibleHours[idx + 1]);
                }}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            {/* Separator */}
            <div className="flex items-center justify-center w-4 text-sm font-medium text-gray-500">
              :
            </div>
            {/* Minutes column */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                className="py-0.5 text-gray-500 hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = visibleMinutes.indexOf(minute);
                  if (idx > 0) setMinute(visibleMinutes[idx - 1]);
                }}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <div
                ref={minuteRef}
                onWheel={(e) => handleWheel(e, "minute")}
                className="h-24 overflow-y-auto scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {visibleMinutes.length === 0 ? (
                  <div className="px-2 py-3 text-[10px] text-gray-400">Không có phút</div>
                ) : (
                  visibleMinutes.map((m) => (
                    <div
                      key={m}
                      className={cn(
                        "flex h-6 w-10 items-center justify-center cursor-pointer text-[11px] tabular-nums",
                        m === minute
                          ? "bg-emerald-100 font-semibold text-emerald-700"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                      onClick={(e) => handleMinuteClick(e, m)}
                    >
                      {m}
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                className="py-0.5 text-gray-500 hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = visibleMinutes.indexOf(minute);
                  if (idx >= 0 && idx < visibleMinutes.length - 1) setMinute(visibleMinutes[idx + 1]);
                }}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
