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

interface Voucher {
  id: string;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  discountValue: number;
  applyScope: string | null;
  usageLimit: number;
  usedCount: number;
  unusedCount: number;
  cost: number;
}

// Column definitions for the visibility toggle. The "actions" column is always
// visible and therefore not listed here. Mirrors the Promotion tab's
// COLUMN_DEFS so both tabs share the exact same look & behavior.
interface ColumnDef {
  key: string;
  label: string;
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: "code", label: "Mã" },
  { key: "name", label: "Tên" },
  { key: "discount", label: "Giảm giá" },
  { key: "applyScope", label: "Áp dụng" },
  { key: "usageLimit", label: "Số lượng" },
  { key: "usedCount", label: "Đã sử dụng" },
  { key: "cost", label: "Chi phí" },
];

interface VoucherListProps {
  vouchers: Voucher[];
  onEdit: (voucher: Voucher) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onView: (voucher: Voucher) => void;
  // Date-range filter (shared with the Promotion tab). The picker sits on the
  // SAME row as the search box and the "Cột" button, to the LEFT of "Cột".
  // The parent owns the state and applies the overlap filter; this component
  // just renders the picker + forwards changes via onDateRangeChange.
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (from: string, to: string) => void;
}

export function VoucherList({
  vouchers,
  onEdit,
  onDelete,
  onCreate,
  onView,
  dateFrom,
  dateTo,
  onDateRangeChange,
}: VoucherListProps) {
  const [search, setSearch] = useState("");
  // All columns visible by default. Hidden when set to false. Same shape as
  // the Promotion tab so both tabs behave identically.
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

  const filtered = vouchers.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Voucher</h2>
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

        {/* Column visibility toggle — mirrors the Promotion tab so the two
            tabs share an identical control. */}
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
                    col.key === "cost"
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
              filtered.map((voucher) => (
                <tr
                  key={voucher.id}
                  className="border-b last:border-b-0 hover:bg-gray-50"
                >
                  {visibleCols.map((col) => {
                    const key = col.key;
                    if (key === "code") {
                      return (
                        <td key="code" className="px-4 py-3 font-mono text-xs text-gray-600">
                          {voucher.code}
                        </td>
                      );
                    }
                    if (key === "name") {
                      return (
                        <td key="name" className="px-4 py-3 font-medium text-gray-900">
                          <button
                            type="button"
                            onClick={() => onView(voucher)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                            title="Xem chi tiết voucher"
                          >
                            {voucher.name}
                          </button>
                        </td>
                      );
                    }
                    if (key === "discount") {
                      return (
                        <td key="discount" className="px-4 py-3 text-emerald-600 font-medium">
                          {voucher.discountValue}%
                        </td>
                      );
                    }
                    if (key === "applyScope") {
                      return (
                        <td key="applyScope" className="px-4 py-3">
                          {voucher.applyScope || "Hóa đơn"}
                        </td>
                      );
                    }
                    if (key === "usageLimit") {
                      return (
                        <td key="usageLimit" className="px-4 py-3 text-right">
                          {voucher.usageLimit}
                        </td>
                      );
                    }
                    if (key === "usedCount") {
                      return (
                        <td key="usedCount" className="px-4 py-3 text-right text-gray-600">
                          {voucher.usedCount}
                        </td>
                      );
                    }
                    if (key === "cost") {
                      return (
                        <td key="cost" className="px-4 py-3 text-right text-gray-900 font-medium">
                          {voucher.cost.toLocaleString("vi-VN")}đ
                        </td>
                      );
                    }
                    return null;
                  })}
                  <td className="px-4 py-3">
                    <IncentiveActions
                      onEdit={() => onEdit(voucher)}
                      onDelete={() => onDelete(voucher.id)}
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
