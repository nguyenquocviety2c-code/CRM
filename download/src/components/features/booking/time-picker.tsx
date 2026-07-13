"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * TimePicker with scrollable hour/minute columns.
 * - Click input to open dropdown
 * - Scroll wheel or click chevrons to change hour/minute
 * - Click item to select
 * - Can also type directly into the input
 */
export function TimePicker({ value, onChange, placeholder = "HH:MM" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  // Track which column has been picked during the current open session.
  // Auto-close once both hour and minute have been explicitly picked.
  const pickedRef = useRef<{ hour: boolean; minute: boolean }>({ hour: false, minute: false });

  // Parse value "HH:MM"
  const [hour, minute] = value ? value.split(":").map(Number) : [0, 0];

  // Sync input value when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Reset pick tracking when the dropdown opens.
  useEffect(() => {
    if (open) {
      pickedRef.current = { hour: false, minute: false };
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Scroll to selected item when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollToItem(hourListRef.current, hour);
        scrollToItem(minuteListRef.current, minute);
      }, 50);
    }
  }, [open, hour, minute]);

  const scrollToItem = (container: HTMLDivElement | null, index: number) => {
    if (!container) return;
    const itemHeight = 40;
    container.scrollTop = index * itemHeight;
  };

  const handleHourChange = useCallback((newHour: number) => {
    const h = String(newHour).padStart(2, "0");
    const m = String(minute).padStart(2, "0");
    const newVal = `${h}:${m}`;
    onChange(newVal);
    setInputValue(newVal);
    pickedRef.current.hour = true;
    // Auto-close if the user has also picked a minute during this session.
    if (pickedRef.current.minute) {
      setOpen(false);
    }
  }, [minute, onChange]);

  const handleMinuteChange = useCallback((newMinute: number) => {
    const h = String(hour).padStart(2, "0");
    const m = String(newMinute).padStart(2, "0");
    const newVal = `${h}:${m}`;
    onChange(newVal);
    setInputValue(newVal);
    pickedRef.current.minute = true;
    // Auto-close if the user has also picked an hour during this session.
    if (pickedRef.current.hour) {
      setOpen(false);
    }
  }, [hour, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // Try to parse "HH:MM"
    const match = e.target.value.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
      const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
      const newVal = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      onChange(newVal);
      setInputValue(newVal);
    }
  };

  const handleWheel = (e: React.WheelEvent, type: "hour" | "minute") => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    if (type === "hour") {
      let newHour = hour + delta;
      if (newHour < 0) newHour = 23;
      if (newHour > 23) newHour = 0;
      handleHourChange(newHour);
      scrollToItem(hourListRef.current, newHour);
    } else {
      let newMinute = minute + delta;
      if (newMinute < 0) newMinute = 59;
      if (newMinute > 59) newMinute = 0;
      handleMinuteChange(newMinute);
      scrollToItem(minuteListRef.current, newMinute);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="flex">
            {/* Hour column */}
            <div className="flex-1 border-r">
              <div className="px-2 py-1 text-xs font-medium text-center text-gray-500 border-b">
                Giờ
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="absolute top-0 left-0 right-0 z-10 flex justify-center py-1 bg-white/80 hover:bg-gray-100"
                  onClick={() => handleHourChange((hour + 23) % 24)}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <div
                  ref={hourListRef}
                  className="h-[120px] overflow-y-auto scrollbar-hide text-center"
                  onWheel={(e) => handleWheel(e, "hour")}
                  style={{ scrollbarWidth: "none" }}
                >
                  <div className="h-[40px]" />
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`flex h-[40px] w-full items-center justify-center text-sm hover:bg-emerald-50 ${
                        h === hour ? "bg-emerald-100 font-semibold text-emerald-700" : "text-gray-700"
                      }`}
                      onClick={() => {
                        handleHourChange(h);
                        scrollToItem(hourListRef.current, h);
                      }}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  ))}
                  <div className="h-[40px]" />
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 left-0 right-0 z-10 flex justify-center py-1 bg-white/80 hover:bg-gray-100"
                  onClick={() => handleHourChange((hour + 1) % 24)}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
            {/* Minute column */}
            <div className="flex-1">
              <div className="px-2 py-1 text-xs font-medium text-center text-gray-500 border-b">
                Phút
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="absolute top-0 left-0 right-0 z-10 flex justify-center py-1 bg-white/80 hover:bg-gray-100"
                  onClick={() => handleMinuteChange((minute + 59) % 60)}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <div
                  ref={minuteListRef}
                  className="h-[120px] overflow-y-auto scrollbar-hide text-center"
                  onWheel={(e) => handleWheel(e, "minute")}
                  style={{ scrollbarWidth: "none" }}
                >
                  <div className="h-[40px]" />
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`flex h-[40px] w-full items-center justify-center text-sm hover:bg-emerald-50 ${
                        m === minute ? "bg-emerald-100 font-semibold text-emerald-700" : "text-gray-700"
                      }`}
                      onClick={() => {
                        handleMinuteChange(m);
                        scrollToItem(minuteListRef.current, m);
                      }}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  ))}
                  <div className="h-[40px]" />
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 left-0 right-0 z-10 flex justify-center py-1 bg-white/80 hover:bg-gray-100"
                  onClick={() => handleMinuteChange((minute + 1) % 60)}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div className="border-t px-2 py-1 flex justify-end">
            <button
              type="button"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1"
              onClick={() => setOpen(false)}
            >
              Xong
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
