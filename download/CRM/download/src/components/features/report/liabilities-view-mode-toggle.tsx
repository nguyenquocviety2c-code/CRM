"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiabilitiesViewMode } from "@/types/report-liabilities";
import { LiabilitiesViewModeLabel } from "@/lib/constants";

interface LiabilitiesViewModeToggleProps {
  value: LiabilitiesViewMode;
  onChange: (mode: LiabilitiesViewMode) => void;
}

const modes: LiabilitiesViewMode[] = ["transaction", "customer"];

export function LiabilitiesViewModeToggle({
  value,
  onChange,
}: LiabilitiesViewModeToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[160px]">
          {LiabilitiesViewModeLabel[value]}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {modes.map((mode) => (
          <DropdownMenuItem key={mode} onClick={() => onChange(mode)}>
            {LiabilitiesViewModeLabel[mode]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
