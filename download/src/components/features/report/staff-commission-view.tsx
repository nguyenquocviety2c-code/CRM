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
import { useCommissionReportData, useReportStaffStore } from "@/stores/report-staff-store";
import { formatVND, paginationRange } from "@/lib/report-staff-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Data columns for the commission view. The "actions" column (Xuất excel /
// Xem chi tiết) is intentionally NOT listed here — it stays always-visible.
const COMMISSION_COLUMN_DEFS: ColumnDef[] = [
  { key: "stt", label: "STT" },
  { key: "staffGroup", label: "Nhóm nhân viên" },
  { key: "staffName", label: "Tên nhân viên" },
  { key: "serviceCommission", label: "Hoa hồng làm dịch vụ" },
  { key: "extraBonus", label: "Thưởng thêm" },
  { key: "total", label: "Tổng" },
];

export function StaffCommissionView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = useCommissionReportData();
  const { setPage, setPageSize } = useReportStaffStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(COMMISSION_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = COMMISSION_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);
  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);
  // STT is based on the global page position (page-1)*pageSize + index+1.
  const pageOffset = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      {/* Filter bar with the Cột button */}
      <div className="flex items-center gap-2">
        <ColumnToggle
          columnDefs={COMMISSION_COLUMN_DEFS}
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
                <TableHead key={col.key} className="text-xs font-medium uppercase text-slate-600">
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="text-xs font-medium uppercase text-slate-600"></TableHead>
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
                {data.map((row, idx) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    {visibleCols.map((col) => {
                      if (col.key === "stt") return <TableCell key="stt">{pageOffset + idx + 1}</TableCell>;
                      if (col.key === "staffGroup") return <TableCell key="staffGroup">{row.staffGroup}</TableCell>;
                      if (col.key === "staffName") return (
                        <TableCell key="staffName">
                          <button
                            onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {row.staffName}
                          </button>
                        </TableCell>
                      );
                      if (col.key === "serviceCommission") return <TableCell key="serviceCommission">{formatVND(row.serviceCommission)}</TableCell>;
                      if (col.key === "extraBonus") return <TableCell key="extraBonus">{formatVND(row.extraBonus)}</TableCell>;
                      if (col.key === "total") return <TableCell key="total" className="font-medium">{formatVND(row.total)}</TableCell>;
                      return null;
                    })}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
                          className="text-sky-600 hover:text-sky-700 hover:underline text-xs"
                        >
                          Xuất excel
                        </button>
                        <button
                          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
                          className="text-sky-600 hover:text-sky-700 hover:underline text-xs"
                        >
                          Xem chi tiết
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-slate-50 font-medium">
                  {/* Fill cells up to the "serviceCommission" column, then show totals. */}
                  {visibleCols.map((col) => {
                    if (col.key === "serviceCommission") return <TableCell key={col.key}>{formatVND(summary.totalServiceCommission)}</TableCell>;
                    if (col.key === "extraBonus") return <TableCell key={col.key}>{formatVND(summary.totalExtraBonus)}</TableCell>;
                    if (col.key === "total") return <TableCell key={col.key}>{formatVND(summary.total)}</TableCell>;
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
