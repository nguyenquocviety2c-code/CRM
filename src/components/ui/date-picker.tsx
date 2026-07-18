"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { vi } from "date-fns/locale/vi";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value: string; // "DD/MM/YYYY"
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  /** Earliest selectable date (inclusive). Dates before this are disabled. */
  minDate?: Date;
}

export function DatePicker({ value, onChange, placeholder = "DD/MM/YYYY", id, minDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  // Parse "DD/MM/YYYY" → Date
  const selectedDate = value
    ? parse(value, "dd/MM/yyyy", new Date())
    : undefined;

  const isValidDate = selectedDate && !isNaN(selectedDate.getTime());

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              id={id}
              type="text"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="cursor-pointer pr-8"
            />
            <CalendarIcon className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Compact calendar: inject a scoped style to shrink cells (20px) +
              fonts. The Calendar sets its own --cell-size (32px) + p-3 with a
              className that tailwind-merge can't reliably override, so a
              scoped <style> is the reliable fix. */}
          <style>{`
            .compact-cal-pop [data-slot="calendar"] { padding: 4px !important; --cell-size: 20px !important; }
            .compact-cal-pop [data-slot="calendar"] [data-day] { font-size: 11px !important; }
            .compact-cal-pop [data-slot="calendar"] .rdp-month_caption { font-size: 11px !important; }
            .compact-cal-pop [data-slot="calendar"] .rdp-weekday { font-size: 10px !important; }
          `}</style>
          <div className="compact-cal-pop">
            <Calendar
              mode="single"
              selected={isValidDate ? selectedDate : undefined}
              onSelect={(date) => {
                if (date) {
                  onChange(format(date, "dd/MM/yyyy"));
                  setOpen(false);
                }
              }}
              disabled={minDate ? (d) => d < minDate : undefined}
              locale={vi}
              initialFocus
              classNames={{ week: "flex w-full mt-0" }}
              // Custom weekday labels: T2, T3, T4, T5, T6, T7, CN (instead of
              // the date-fns vi locale's "Th 2", "Th 3", ...).
              formatters={{
                formatWeekdayName: (date: Date) => {
                  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
                  if (day === 0) return "CN";
                  return "T" + (day + 1); // Mon→T2, Tue→T3, ..., Sat→T7
                },
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
