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
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
