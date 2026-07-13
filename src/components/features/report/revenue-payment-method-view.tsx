"use client";

import { useState } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePaymentMethodReportData, useReportRevenueStore } from "@/stores/report-revenue-store";
import { formatVND, paginationRange } from "@/lib/report-utils";
import { RevenueSummaryCards } from "./revenue-summary-cards";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Column definitions — only the 4 columns the business uses.
const PAYMENT_COLUMN_DEFS: ColumnDef[] = [
  { key: "date", label: "Ngày" },
  { key: "cash", label: "Tiền mặt" },
  { key: "transfer", label: "Chuyển khoản" },
  { key: "total", label: "Tổng cộng" },
];

export function RevenuePaymentMethodView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = usePaymentMethodReportData();
  const { setPage, setPageSize } = useReportRevenueStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(PAYMENT_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = PAYMENT_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  const cards = [
    { label: "TIỀN MẶT", value: formatVND(summary.totalCash) },
    { label: "CHUYỂN KHOẢN", value: formatVND(summary.totalTransfer) },
    { label: "TỔNG CỘNG", value: formatVND(summary.total) },
  ];

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Xuất excel
        </Button>
        <ColumnToggle
          columnDefs={PAYMENT_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Summary cards */}
      <RevenueSummaryCards cards={cards} />

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              {visibleCols.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium uppercase text-slate-600">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(visibleCols.length, 1)} className="py-8 text-center text-gray-500">
                  Trống
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  {visibleCols.map((col) => {
                    if (col.key === "date") return <TableCell key="date">{row.date}</TableCell>;
                    if (col.key === "cash") return <TableCell key="cash">{formatVND(row.cash)}</TableCell>;
                    if (col.key === "transfer") return <TableCell key="transfer">{formatVND(row.transfer)}</TableCell>;
                    if (col.key === "total") return <TableCell key="total" className="font-medium">{formatVND(row.total)}</TableCell>;
                    return null;
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Hiển thị từ {from} đến {to} trên tổng số {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={to >= total}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value={20}>20 / trang</option>
            <option value={50}>50 / trang</option>
            <option value={100}>100 / trang</option>
          </select>
        </div>
      </div>
    </div>
  );
}
