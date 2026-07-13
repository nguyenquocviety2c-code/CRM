"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ColumnToggle,
  ColumnDef,
} from "@/components/shared/column-toggle";

interface ServiceFilterProps {
  onSearchChange: (search: string) => void;
  onCategoryChange: (categoryId: string) => void;
  categories: { id: string; name: string }[];
  columnDefs?: ColumnDef[];
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (key: string) => void;
  // Branch filter — lets the user view services available at a specific
  // branch or at all branches.
  branches?: { id: string; name: string }[];
  branchFilter?: string;
  onBranchChange?: (branchId: string) => void;
}

export function ServiceFilter({
  onSearchChange,
  onCategoryChange,
  categories,
  columnDefs,
  visibleColumns,
  onToggleColumn,
  branches,
  branchFilter,
  onBranchChange,
}: ServiceFilterProps) {
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    onSearchChange(value);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onChange={handleSearch}
          className="max-w-sm"
        />
      </div>
      <div className="w-full sm:w-64">
        <Select onValueChange={onCategoryChange}>
          <SelectTrigger>
            <SelectValue placeholder="Lọc theo nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả nhóm</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {branches && onBranchChange && (
        <div className="w-full sm:w-56">
          <Select
            value={branchFilter || "all"}
            onValueChange={(v) => onBranchChange(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Lọc theo chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chi nhánh</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {columnDefs && visibleColumns && onToggleColumn && (
        <ColumnToggle
          columnDefs={columnDefs}
          visibleColumns={visibleColumns}
          onToggleColumn={onToggleColumn}
        />
      )}
    </div>
  );
}
