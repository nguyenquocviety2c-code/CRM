"use client";

import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useReportStaffStore, useStaffGroupOptions } from "@/stores/report-staff-store";

export function StaffFilterButton() {
  const { toast } = useToast();
  const { staffGroupFilter, setStaffGroupFilter } = useReportStaffStore();
  // Real group options derived from the active staff list (replaces the old
  // hardcoded mockStaffGroupOptions).
  const groupOptions = useStaffGroupOptions();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={staffGroupFilter}
        onChange={(e) => setStaffGroupFilter(e.target.value)}
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
      >
        {groupOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      <button
        onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-4 w-4" />
        Xuất excel
      </button>
    </div>
  );
}
