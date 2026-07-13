"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useWorkerManagerStore } from "@/stores/worker-manager-store";
import {
  AttendanceStatusLabel,
  AttendanceStatusCellColors,
  AttendanceLegendDotColors,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AttendanceCustomResponse } from "@/types/attendance";

function formatTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AttendanceCustomView() {
  const { date, status } = useWorkerManagerStore();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.attendance.report.list({
      view: "custom",
      date,
      status,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "custom");
      params.set("date", date);
      if (status) params.set("status", status);
      const res = await fetch(`/api/supabase/attendance/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as AttendanceCustomResponse;
    },
  });

  const employees = data?.employees || [];
  const days = data?.days || [];
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

      {/* Weekly grid table */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap min-w-[180px]">
                Tên nhân viên
              </th>
              {days.map((day) => (
                <th
                  key={day.date}
                  className={cn(
                    "px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap min-w-[160px]",
                    day.isToday && "bg-sky-50"
                  )}
                >
                  {day.weekday} - {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={days.length + 1} className="py-12 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={days.length + 1} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.userId} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                    {emp.userName}
                  </td>
                  {days.map((day) => {
                    const cell = emp.cells[day.date];
                    if (!cell) {
                      return (
                        <td key={day.date} className="px-4 py-3">
                          <span className="text-gray-300">-</span>
                        </td>
                      );
                    }
                    const colors = AttendanceStatusCellColors[cell.status] || {
                      bg: "bg-white",
                      text: "text-slate-700",
                    };
                    return (
                      <td
                        key={day.date}
                        className={cn("px-4 py-3", day.isToday && "bg-sky-50/50")}
                      >
                        <div
                          className={cn(
                            "rounded-md px-2 py-1.5",
                            colors.bg
                          )}
                        >
                          <div className={cn("text-xs font-semibold", colors.text)}>
                            {cell.shiftName}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {formatTime(cell.checkIn)} - {formatTime(cell.checkOut)}
                          </div>
                          <div className={cn("mt-0.5 text-xs font-medium", colors.text)}>
                            {AttendanceStatusLabel[cell.status] || cell.status}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
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
