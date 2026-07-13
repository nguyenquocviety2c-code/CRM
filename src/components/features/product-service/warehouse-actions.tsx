"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WarehouseActionsProps {
  onOpenTransfer: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
}

export function WarehouseActions({
  onOpenTransfer,
  onOpenExport,
  onOpenImport,
  onOpenSettings,
}: WarehouseActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1">
          Tùy chọn
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            onOpenTransfer();
          }}
          className="text-emerald-600 cursor-pointer"
        >
          Tạo phiếu chuyển
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            onOpenExport();
          }}
          className="text-red-600 cursor-pointer"
        >
          Tạo phiếu xuất
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            onOpenImport();
          }}
          className="text-emerald-600 cursor-pointer"
        >
          Tạo phiếu nhập
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            onOpenSettings();
          }}
          className="text-gray-600 cursor-pointer"
        >
          Cài đặt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}