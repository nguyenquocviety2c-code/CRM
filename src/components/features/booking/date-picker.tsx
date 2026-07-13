"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { vi } from "date-fns/locale";
import { format, parse } from "date-fns";

interface DatePickerProps {
  value: string; // "DD/MM/YYYY"
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * DatePicker with calendar popup.
 * - Click input to open calendar
 * - Click a day to select
 * - Can also type directly into the input (DD/MM/YYYY)
 */
export function DatePicker({ value, onChange, placeholder = "DD/MM/YYYY" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse "DD/MM/YYYY" → Date
  const parseDate = (str: string): Date | undefined => {
    if (!str) return undefined;
    const parsed = parse(str, "dd/MM/yyyy", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(parseDate(value));

  useEffect(() => {
    setInputValue(value);
    setSelectedDate(parseDate(value));
  }, [value]);

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

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const formatted = format(date, "dd/MM/yyyy");
      onChange(formatted);
      setInputValue(formatted);
      setSelectedDate(date);
      setOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = parseDate(e.target.value);
    if (parsed) {
      setSelectedDate(parsed);
      onChange(e.target.value);
    }
  };

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
        <div className="absolute z-50 mt-1 rounded-md border bg-white shadow-lg">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            locale={vi}
            initialFocus
          />
        </div>
      )}
    </div>
  );
}
