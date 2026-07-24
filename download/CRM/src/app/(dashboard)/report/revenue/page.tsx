"use client";

import { ReportTabs } from "@/components/features/report/report-tabs";
import { RevenueViewModeToggle } from "@/components/features/report/revenue-view-mode-toggle";
import { RevenueInvoiceView } from "@/components/features/report/revenue-invoice-view";
import { RevenuePaymentMethodView } from "@/components/features/report/revenue-payment-method-view";
import { RevenueServiceView } from "@/components/features/report/revenue-service-view";
import { RevenuePackageView } from "@/components/features/report/revenue-package-view";
import { RevenueSalesView } from "@/components/features/report/revenue-sales-view";
import { useReportRevenueStore } from "@/stores/report-revenue-store";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

export default function RevenueReportPage() {
  const { viewMode, setViewMode, dateFrom, dateTo, setDateRange } = useReportRevenueStore();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">DOANH THU</h1>
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
      <div className="flex items-center justify-between">
        <RevenueViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Content area */}
      {viewMode === "invoice" && <RevenueInvoiceView />}
      {viewMode === "payment-method" && <RevenuePaymentMethodView />}
      {viewMode === "service" && <RevenueServiceView />}
      {viewMode === "package" && <RevenuePackageView />}
      {viewMode === "sales" && <RevenueSalesView />}
    </div>
  );
}