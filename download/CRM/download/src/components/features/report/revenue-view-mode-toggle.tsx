"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RevenueViewMode } from "@/types/report";

const viewModeOptions: { value: RevenueViewMode; label: string }[] = [
  { value: "invoice", label: "Hóa đơn" },
  { value: "payment-method", label: "Phương thức thanh toán" },
  { value: "service", label: "Dịch vụ" },
  { value: "package", label: "Gói dịch vụ" },
  { value: "sales", label: "Bán hàng" },
];

interface RevenueViewModeToggleProps {
  value: RevenueViewMode;
  onChange: (value: RevenueViewMode) => void;
}

export function RevenueViewModeToggle({ value, onChange }: RevenueViewModeToggleProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RevenueViewMode)}>
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