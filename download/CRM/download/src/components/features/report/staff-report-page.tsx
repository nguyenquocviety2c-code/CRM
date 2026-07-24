"use client";

import { ReportTabs } from "./report-tabs";
import { StaffViewModeToggle } from "./staff-view-mode-toggle";
import { StaffFilterButton } from "./staff-filter-button";
import { StaffCommissionView } from "./staff-commission-view";
import { StaffProductivityView } from "./staff-productivity-view";
import { StaffRatingView } from "./staff-rating-view";
import { StaffRevenueView } from "./staff-revenue-view";
import { useReportStaffStore } from "@/stores/report-staff-store";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

export function StaffReportPage() {
  const { viewMode, setViewMode, dateFrom, dateTo, setDateRange } = useReportStaffStore();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">NHÂN VIÊN</h1>
        <div className="flex items-center gap-3">
          {/* Branch dropdown */}
          <BranchSelector />
          {/* Date range picker */}
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={setDateRange} />
        </div>
      </div>

      {/* Tabs */}
      <ReportTabs />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <StaffViewModeToggle value={viewMode} onChange={setViewMode} />
        <StaffFilterButton />
      </div>

      {/* View content */}
      {viewMode === "commission" && <StaffCommissionView />}
      {viewMode === "productivity" && <StaffProductivityView />}
      {viewMode === "rating" && <StaffRatingView />}
      {viewMode === "revenue" && <StaffRevenueView />}
    </div>
  );
}
