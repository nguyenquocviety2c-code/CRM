"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { useProductivityReportData, useReportStaffStore } from "@/stores/report-staff-store";
import { formatVND, paginationRange } from "@/lib/report-staff-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

const PRODUCTIVITY_COLUMN_DEFS: ColumnDef[] = [
  { key: "staffName", label: "Tên nhân viên" },
  { key: "staffGroup", label: "Nhóm" },
  { key: "serviceCount", label: "Số lượt làm dịch vụ" },
  { key: "customerRequestCount", label: "Số lượt khách yêu cầu" },
  { key: "serviceValue", label: "Giá trị làm dịch vụ" },
  { key: "customerRequestValue", label: "Giá trị làm dịch vụ khách yêu cầu" },
];

export function StaffProductivityView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = useProductivityReportData();
  const { setPage, setPageSize } = useReportStaffStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(PRODUCTIVITY_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = PRODUCTIVITY_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);
  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filter bar with the Cột button */}
      <div className="flex items-center gap-2">
        <ColumnToggle
          columnDefs={PRODUCTIVITY_COLUMN_DEFS}
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
                      if (col.key === "staffGroup") return <TableCell key="staffGroup" className="text-left">{row.staffGroup}</TableCell>;
                      if (col.key === "serviceCount") return <TableCell key="serviceCount" className="text-right">{row.serviceCount}</TableCell>;
                      if (col.key === "customerRequestCount") return <TableCell key="customerRequestCount" className="text-right">{row.customerRequestCount}</TableCell>;
                      if (col.key === "serviceValue") return <TableCell key="serviceValue" className="text-right">{formatVND(row.serviceValue)}</TableCell>;
                      if (col.key === "customerRequestValue") return <TableCell key="customerRequestValue" className="text-right">{formatVND(row.customerRequestValue)}</TableCell>;
                      return null;
                    })}
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-slate-50 font-medium">
                  {visibleCols.map((col) => {
                    if (col.key === "serviceCount") return <TableCell key={col.key} className="text-right">{summary.totalServiceCount}</TableCell>;
                    if (col.key === "customerRequestCount") return <TableCell key={col.key} className="text-right">{summary.totalCustomerRequestCount}</TableCell>;
                    if (col.key === "serviceValue") return <TableCell key={col.key} className="text-right">{formatVND(summary.totalServiceValue)}</TableCell>;
                    if (col.key === "customerRequestValue") return <TableCell key={col.key} className="text-right">{formatVND(summary.totalCustomerRequestValue)}</TableCell>;
                    return <TableCell key={col.key}></TableCell>;
                  })}
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
