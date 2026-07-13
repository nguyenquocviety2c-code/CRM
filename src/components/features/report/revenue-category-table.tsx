"use client";

import { FolderOpen } from "lucide-react";
import { formatVND } from "@/lib/cash-fund-utils";

// ============================================
// Column configuration
// ============================================
export interface RevenueTableColumn<T> {
  key: keyof T;
  label: string;
  align?: "left" | "right" | "center";
  className?: string;
  formatter?: (value: unknown, row: T) => React.ReactNode;
}

// ============================================
// Props
// ============================================
interface RevenueCategoryTableProps<T> {
  data: T[];
  columns: RevenueTableColumn<T>[];
  footerTotal?: Record<string, number | string> | null;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  } | null;
  emptyState?: {
    icon?: React.ReactNode;
    text: string;
  };
  rowKey: (row: T) => string;
}

// ============================================
// Component
// ============================================
export function RevenueCategoryTable<T>({
  data,
  columns,
  footerTotal,
  pagination,
  emptyState,
  rowKey,
}: RevenueCategoryTableProps<T>) {
  const isEmpty = data.length === 0;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`px-4 py-3 text-xs font-medium uppercase tracking-wide ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {isEmpty ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    {emptyState?.icon || <FolderOpen className="h-10 w-10" />}
                    <span className="text-sm">{emptyState?.text || "Trống"}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                >
                  {columns.map((col) => {
                    const value = row[col.key];
                    const display = col.formatter
                      ? col.formatter(value, row)
                      : String(value ?? "");
                    return (
                      <td
                        key={String(col.key)}
                        className={`px-4 py-3 ${
                          col.align === "right"
                            ? " text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left"
                        } ${col.className || ""}`}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {/* Footer total (View 4) */}
          {!isEmpty && footerTotal && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                {columns.map((col) => {
                  const totalValue = footerTotal[String(col.key)];
                  return (
                    <td
                      key={`footer-${String(col.key)}`}
                      className={`px-4 py-3 ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left"
                      } ${col.className || ""}`}
                    >
                      {col.key === "serviceName" || col.key === "packageName" || col.key === "treatmentName"
                        ? "TỔNG CỘNG"
                        : totalValue !== undefined
                          ? typeof totalValue === "number"
                            ? formatVND(totalValue)
                            : String(totalValue)
                          : ""}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination (View 5, 6) */}
      {pagination && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <div className="text-sm text-slate-500">
            Hiển thị từ {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1} đến{" "}
            {Math.min(pagination.page * pagination.pageSize,  pagination.total)} trên tổng số {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="rounded border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {"<"}
            </button>
            <span className="text-sm">{pagination.page}</span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              className="rounded border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {">"}
            </button>
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="rounded border border-slate-200 px-2 py-1 text-sm"
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}