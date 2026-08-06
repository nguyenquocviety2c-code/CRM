"use client";

import { useState } from "react";
import { Search, Columns3, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { IncentiveActions } from "./incentive-actions";

interface Promotion {
  id: string;
  code: string;
  name: string;
  discountValue: number;
  applyScope: string | null;
  serviceIds: string | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number;
  usedCount: number;
  unusedCount: number;
  expiredCount: number;
}

// Compute the number of days a promotion is valid (inclusive of both start
// and end dates). Returns null when dates are missing/unbounded so the UI can
// show "Không giới hạn".
function getPromotionDays(promotion: Promotion): number | null {
  if (!promotion.startDate || !promotion.endDate) return null;
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // inclusive
  return days < 0 ? 0 : days;
}

// Column definitions for the visibility toggle. The "actions" column is always
// visible and therefore not listed here.
interface ColumnDef {
  key: string;
  label: string;
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: "name", label: "Tên" },
  { key: "discount", label: "Giảm giá" },
  { key: "applyScope", label: "Áp dụng" },
  { key: "usageLimit", label: "Số lượng" },
  { key: "usedCount", label: "Đã sử dụng" },
  { key: "expiredCount", label: "Hết hạn" },
];

interface PromotionListProps {
  promotions: Promotion[];
  onEdit: (promotion: Promotion) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onView: (promotion: Promotion) => void;
  // Date-range filter (shared with the Voucher tab). The picker sits on the
  // SAME row as the search box and the "Cột" button, to the LEFT of "Cột".
  // The parent owns the state and applies the overlap filter; this component
  // just renders the picker + forwards changes via onDateRangeChange.
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (from: string, to: string) => void;
}

export function PromotionList({
  promotions,
  onEdit,
  onDelete,
  onCreate,
  onView,
  dateFrom,
  dateTo,
  onDateRangeChange,
}: PromotionListProps) {
  const [search, setSearch] = useState("");
  // All columns visible by default. Hidden when set to false.
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, true]))
  );

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: prev[key] !== false ? false : true }));
  };

  // Visible column defs (preserve declared order).
  const visibleCols = COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);
  // Total column count = visible data columns + 1 actions column.
  const totalColSpan = visibleCols.length + 1;

  const filtered = promotions.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Khuyến mãi</h2>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={onCreate}
        >
          + Tạo mới
        </Button>
      </div>

      {/* Search + Date range picker + Column visibility toggle — same row.
          The date-range picker sits to the LEFT of the "Cột" button so the
          user can filter the list by validity window without losing the column
          toggle. The picker is only rendered when the parent passes
          dateFrom/dateTo/onDateRangeChange (kept optional for any other
          callers that don't want the filter). */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Date range picker — filters by validity window overlap. */}
        {onDateRangeChange && dateFrom && dateTo && (
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={onDateRangeChange}
          />
        )}

        {/* Column visibility toggle */}
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
            {COLUMN_DEFS.map((col) => (
              <DropdownMenuItem
                key={col.key}
                onClick={(e) => {
                  e.preventDefault();
                  toggleColumn(col.key);
                }}
                className="cursor-pointer"
              >
                <Checkbox
                  checked={visibleColumns[col.key] !== false}
                  onCheckedChange={() => toggleColumn(col.key)}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm">{col.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={
                    col.key === "usageLimit" ||
                    col.key === "usedCount" ||
                    col.key === "expiredCount"
                      ? "px-4 py-3 text-right"
                      : "px-4 py-3"
                  }
                >
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={totalColSpan} className="px-4 py-8 text-center text-gray-500">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              filtered.map((promotion) => (
                <tr
                  key={promotion.id}
                  className="border-b last:border-b-0 hover:bg-gray-50"
                >
                  {visibleCols.map((col) => {
                    const key = col.key as keyof Promotion | "discount" | "applyScope";
                    if (key === "code") {
                      return (
                        <td key="code" className="px-4 py-3 font-mono text-xs text-gray-600">
                          {promotion.code}
                        </td>
                      );
                    }
                    if (key === "name") {
                      return (
                        <td key="name" className="px-4 py-3 font-medium text-gray-900">
                          <button
                            type="button"
                            onClick={() => onView(promotion)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                            title="Xem chi tiết khuyến mãi"
                          >
                            {promotion.name}
                          </button>
                        </td>
                      );
                    }
                    if (key === "discount") {
                      return (
                        <td key="discount" className="px-4 py-3 text-emerald-600 font-medium">
                          {promotion.discountValue}%
                        </td>
                      );
                    }
                    if (key === "applyScope") {
                      const days = getPromotionDays(promotion);
                      return (
                        <td key="applyScope" className="px-4 py-3">
                          {days === null ? (
                            <span className="text-gray-400">Không giới hạn</span>
                          ) : (
                            <span className="text-gray-700">{days} ngày</span>
                          )}
                        </td>
                      );
                    }
                    if (key === "usageLimit") {
                      return (
                        <td key="usageLimit" className="px-4 py-3 text-right">
                          {promotion.usageLimit}
                        </td>
                      );
                    }
                    if (key === "usedCount") {
                      return (
                        <td key="usedCount" className="px-4 py-3 text-right text-gray-600">
                          {promotion.usedCount}
                        </td>
                      );
                    }
                    if (key === "unusedCount") {
                      return (
                        <td key="unusedCount" className="px-4 py-3 text-right text-gray-600">
                          {promotion.unusedCount}
                        </td>
                      );
                    }
                    if (key === "expiredCount") {
                      return (
                        <td key="expiredCount" className="px-4 py-3 text-right text-gray-600">
                          {promotion.expiredCount}
                        </td>
                      );
                    }
                    return null;
                  })}
                  <td className="px-4 py-3">
                    <IncentiveActions
                      onEdit={() => onEdit(promotion)}
                      onDelete={() => onDelete(promotion.id)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
