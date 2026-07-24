"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useReportCustomerStore } from "@/stores/report-customer-store";
import { CustomerType } from "@/types/report-customer";

const options: { value: CustomerType | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "old", label: "Khách cũ" },
  { value: "new", label: "Khách mới" },
  { value: "kol", label: "KOL/KOC" },
];

export function CustomerFilterButton() {
  const { customerTypeFilter, setCustomerTypeFilter } = useReportCustomerStore();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48" align="start">
        <RadioGroup
          value={customerTypeFilter}
          onValueChange={(v) => setCustomerTypeFilter(v as CustomerType | "all")}
          className="flex flex-col gap-2"
        >
          {options.map((opt) => (
          <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={opt.value} />
              <Label htmlFor={opt.value} className="cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
