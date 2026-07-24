"use client";

import { Columns3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ColumnDef {
  key: string;
  label: string;
}

interface ColumnToggleProps {
  columnDefs: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (key: string) => void;
}

/**
 * Reusable column-visibility toggle button.
 *
 * Renders an outline "Cột" button with a dropdown listing every column def.
 * Each item has a checkbox; toggling hides/shows the matching column in the
 * table. The parent owns the `visibleColumns` state and the table rendering.
 *
 * The action column (pencil/trash buttons) is intentionally NOT listed here —
 * it stays always-visible. Pass only the data columns.
 */
export function ColumnToggle({
  columnDefs,
  visibleColumns,
  onToggleColumn,
}: ColumnToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0">
          <Columns3 className="h-4 w-4" />
          Cột
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
          Hiển thị cột
        </div>
        {columnDefs.map((col) => (
          <DropdownMenuItem
            key={col.key}
            onClick={(e) => {
              e.preventDefault();
              onToggleColumn(col.key);
            }}
            className="cursor-pointer"
          >
            <Checkbox
              checked={visibleColumns[col.key] !== false}
              onCheckedChange={() => onToggleColumn(col.key)}
              className="mr-2 h-4 w-4"
            />
            <span className="text-sm">{col.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Helper to build a "all visible" default state from a list of column defs.
 */
export function buildDefaultVisibleColumns(
  defs: ColumnDef[]
): Record<string, boolean> {
  return Object.fromEntries(defs.map((d) => [d.key, true]));
}

/**
 * Helper to toggle one key in a visibleColumns record (immutable).
 */
export function toggleColumnKey(
  prev: Record<string, boolean>,
  key: string
): Record<string, boolean> {
  return { ...prev, [key]: prev[key] !== false ? false : true };
}
