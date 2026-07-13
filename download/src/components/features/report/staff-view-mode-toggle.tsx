"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffViewMode } from "@/types/report-staff";

const viewModeOptions: { value: StaffViewMode; label: string }[] = [
  { value: "commission", label: "Hoa hồng" },
  { value: "productivity", label: "Năng suất làm việc" },
  { value: "rating", label: "Đánh giá khách hàng" },
  { value: "revenue", label: "Doanh thu" },
];

interface StaffViewModeToggleProps {
  value: StaffViewMode;
  onChange: (value: StaffViewMode) => void;
}

export function StaffViewModeToggle({ value, onChange }: StaffViewModeToggleProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StaffViewMode)}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Chế độ xem" />
      </SelectTrigger>
      <SelectContent>
        {viewModeOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
