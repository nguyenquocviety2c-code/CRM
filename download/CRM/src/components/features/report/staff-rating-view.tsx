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
import { useRatingReportData, useReportStaffStore } from "@/stores/report-staff-store";
import { paginationRange } from "@/lib/report-staff-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

const RATING_COLUMN_DEFS: ColumnDef[] = [
  { key: "staffName", label: "Nhân viên" },
  { key: "staffGroup", label: "Nhóm nhân viên" },
  { key: "poorCount", label: "SL Kém 2 điểm" },
  { key: "averageCount", label: "SL Trung bình 3 điểm" },
  { key: "goodCount", label: "SL Tốt 4 điểm" },
  { key: "excellentCount", label: "SL Rất tốt 5 điểm" },
  { key: "totalReviews", label: "Tổng lượt" },
  { key: "totalScore", label: "Tổng điểm" },
  { key: "averageScore", label: "Điểm trung bình" },
];

export function StaffRatingView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = useRatingReportData();
  const { setPage, setPageSize } = useReportStaffStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(RATING_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = RATING_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);
  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filter bar with the Cột button */}
      <div className="flex items-center gap-2">
        <ColumnToggle
          columnDefs={RATING_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Tổng lượt đánh giá</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalReviews}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Kém</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalPoor}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Trung bình</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalAverage}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Tốt</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalGood}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Rất tốt</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalExcellent}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Tổng điểm đánh giá</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalScore}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500 uppercase">Điểm trung bình</div>
          <div className="mt-1 text-2xl font-bold">{summary.averageScore.toFixed(1)}</div>
        </div>
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
                      if (col.key === "poorCount") return <TableCell key="poorCount" className="text-right">{row.poorCount}</TableCell>;
                      if (col.key === "averageCount") return <TableCell key="averageCount" className="text-right">{row.averageCount}</TableCell>;
                      if (col.key === "goodCount") return <TableCell key="goodCount" className="text-right">{row.goodCount}</TableCell>;
                      if (col.key === "excellentCount") return <TableCell key="excellentCount" className="text-right">{row.excellentCount}</TableCell>;
                      if (col.key === "totalReviews") return <TableCell key="totalReviews" className="text-right">{row.totalReviews}</TableCell>;
                      if (col.key === "totalScore") return <TableCell key="totalScore" className="text-right">{row.totalScore}</TableCell>;
                      if (col.key === "averageScore") return <TableCell key="averageScore" className="text-right">{row.averageScore.toFixed(1)}</TableCell>;
                      return null;
                    })}
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-slate-50 font-medium">
                  {visibleCols.map((col) => {
                    if (col.key === "poorCount") return <TableCell key={col.key} className="text-right">{summary.totalPoor}</TableCell>;
                    if (col.key === "averageCount") return <TableCell key={col.key} className="text-right">{summary.totalAverage}</TableCell>;
                    if (col.key === "goodCount") return <TableCell key={col.key} className="text-right">{summary.totalGood}</TableCell>;
                    if (col.key === "excellentCount") return <TableCell key={col.key} className="text-right">{summary.totalExcellent}</TableCell>;
                    if (col.key === "totalReviews") return <TableCell key={col.key} className="text-right">{summary.totalReviews}</TableCell>;
                    if (col.key === "totalScore") return <TableCell key={col.key} className="text-right">{summary.totalScore}</TableCell>;
                    if (col.key === "averageScore") return <TableCell key={col.key} className="text-right">{summary.averageScore.toFixed(1)}</TableCell>;
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
