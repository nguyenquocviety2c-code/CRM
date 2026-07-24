"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryKeys } from "@/lib/query-keys";
import { useWorkerManagerStore } from "@/stores/worker-manager-store";
import {
  AttendanceLegendDotColors,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AttendanceOverviewResponse } from "@/types/attendance";

export function AttendanceOverviewView() {
  const { date, status } = useWorkerManagerStore();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.attendance.report.list({
      view: "overview",
      date,
      status,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "overview");
      params.set("date", date);
      if (status) params.set("status", status);
      const res = await fetch(`/api/supabase/attendance/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as AttendanceOverviewResponse;
    },
  });

  const rows = data?.rows || [];
  const periodLabel = data?.periodLabel || "";

  const legend = [
    { key: "onTime", label: "Đúng giờ", color: AttendanceLegendDotColors.onTime },
    { key: "late", label: "Đi trễ / Về sớm", color: AttendanceLegendDotColors.late },
    { key: "missing", label: "Chưa chấm công", color: AttendanceLegendDotColors.missing },
    { key: "partial", label: "Chấm công thiếu", color: AttendanceLegendDotColors.partial },
    { key: "absent", label: "Nghỉ làm", color: AttendanceLegendDotColors.absent },
  ];

  return (
    <div className="space-y-4">
      {/* Period header + legend */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{periodLabel}</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {legend.map((l) => (
            <div key={l.key} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-full", l.color)} />
              <span className="text-slate-600">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary table */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap min-w-[180px]">Tên nhân viên</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Đi trễ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Về sớm</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Làm ngoài giờ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Nghỉ giữa giờ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Tổng số ca</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Tổng số ngày nghỉ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Tổng giờ làm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-gray-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.userId} className="hover:bg-slate-50">
                  <TableCell className="font-medium text-slate-700">{row.userName}</TableCell>
                  <TableCell className="text-slate-700 tabular-nums">
                    {row.lateCount > 0 ? row.lateCount : "-"}
                  </TableCell>
                  <TableCell className="text-slate-700 tabular-nums">
                    {row.earlyCount > 0 ? row.earlyCount : "-"}
                  </TableCell>
                  <TableCell className="text-slate-700 tabular-nums">
                    {row.overtimeHours > 0 ? row.overtimeHours : "-"}
                  </TableCell>
                  <TableCell className="text-slate-700 tabular-nums">
                    {row.middayBreakHours > 0 ? row.middayBreakHours : "-"}
                  </TableCell>
                  <TableCell className="text-slate-700 tabular-nums">{row.totalShifts}</TableCell>
                  <TableCell className="text-slate-700 tabular-nums">{row.totalDaysOff}</TableCell>
                  <TableCell className="text-slate-700 tabular-nums">{row.totalWorkingHours}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
      <span className="text-sm text-gray-400">Chưa có nhân viên nào</span>
    </div>
  );
}
