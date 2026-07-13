"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerViewMode } from "@/types/report-customer";
import { CustomerViewModeLabel } from "@/lib/constants";

interface CustomerViewModeToggleProps {
  value: CustomerViewMode;
  onChange: (mode: CustomerViewMode) => void;
}

const modes: CustomerViewMode[] = ["invoice", "service", "frequency", "source"];

export function CustomerViewModeToggle({
  value,
  onChange,
}: CustomerViewModeToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[160px]">
          {CustomerViewModeLabel[value]}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {modes.map((mode) => (
          <DropdownMenuItem key={mode} onClick={() => onChange(mode)}>
            {CustomerViewModeLabel[mode]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
