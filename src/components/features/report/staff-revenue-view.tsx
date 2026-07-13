"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
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
import { useRevenueReportData, useReportStaffStore } from "@/stores/report-staff-store";
import { formatVND, paginationRange } from "@/lib/report-staff-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Data columns for the revenue view. Per the spec, the sale/bundle/topup/
// treatment/other columns were REMOVED — only service revenue + tip + total
// remain. The "Xuất File" action column is always-visible (not listed here).
const REVENUE_COLUMN_DEFS: ColumnDef[] = [
  { key: "staffName", label: "Tên nhân viên" },
  { key: "serviceCount", label: "Số lượng làm DV" },
  { key: "serviceRevenue", label: "Làm dịch vụ" },
  { key: "tipTotal", label: "Tiền thưởng" },
  { key: "total", label: "Tổng" },
];

export function StaffRevenueView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = useRevenueReportData();
  const { setPage, setPageSize } = useReportStaffStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(REVENUE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = REVENUE_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);
  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filter bar with the Cột button */}
      <div className="flex items-center gap-2">
        <ColumnToggle
          columnDefs={REVENUE_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              {visibleCols.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium uppercase text-slate-600 text-right">
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="text-xs font-medium uppercase text-slate-600 text-center">Xuất File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(visibleCols.length, 1) + 1} className="py-8 text-center text-gray-500">
                  Trống
                </TableCell>
              </TableRow>
            ) : (
              <>
                {data.map((row) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    {visibleCols.map((col) => {
                      if (col.key === "staffName") return (
                        <TableCell key="staffName" className="text-left">
                          <button
                            onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {row.staffName}
                          </button>
                        </TableCell>
                      );
                      if (col.key === "serviceCount") return <TableCell key="serviceCount" className="text-right">{row.serviceCount}</TableCell>;
                      if (col.key === "serviceRevenue") return <TableCell key="serviceRevenue" className="text-right">{formatVND(row.serviceRevenue)}</TableCell>;
                      if (col.key === "tipTotal") return <TableCell key="tipTotal" className="text-right">{formatVND(row.tipTotal)}</TableCell>;
                      if (col.key === "total") return <TableCell key="total" className="text-right font-medium">{formatVND(row.total)}</TableCell>;
                      return null;
                    })}
                    <TableCell className="text-center">
                      <button
                        onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
                        className="text-sky-600 hover:text-sky-700"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-slate-50 font-medium">
                  {visibleCols.map((col) => {
                    if (col.key === "serviceCount") return <TableCell key={col.key} className="text-right">{summary.totalServiceCount}</TableCell>;
                    if (col.key === "serviceRevenue") return <TableCell key={col.key} className="text-right">{formatVND(summary.totalServiceRevenue)}</TableCell>;
                    if (col.key === "tipTotal") return <TableCell key={col.key} className="text-right">{formatVND(summary.totalTip)}</TableCell>;
                    if (col.key === "total") return <TableCell key={col.key} className="text-right">{formatVND(summary.total)}</TableCell>;
                    return <TableCell key={col.key}></TableCell>;
                  })}
                  <TableCell></TableCell>
                </TableRow>
              </>
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
