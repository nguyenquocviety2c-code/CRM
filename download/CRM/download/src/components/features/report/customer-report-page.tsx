"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportTabs } from "./report-tabs";
import { CustomerViewModeToggle } from "./customer-view-mode-toggle";
import { CustomerFilterButton } from "./customer-filter-button";
import { CustomerInvoiceView } from "./customer-invoice-view";
import { CustomerServiceView } from "./customer-service-view";
import { CustomerFrequencyView } from "./customer-frequency-view";
import { CustomerSourceView } from "./customer-source-view";
import { useReportCustomerStore } from "@/stores/report-customer-store";
import { useToast } from "@/hooks/use-toast";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

export function CustomerReportPage() {
  const { viewMode, setViewMode, dateFrom, dateTo, setDateRange } = useReportCustomerStore();
  const { toast } = useToast();

  const handleExport = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn lõi",
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Báo cáo</h1>
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
        <CustomerViewModeToggle value={viewMode} onChange={setViewMode} />
        <CustomerFilterButton />
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Xuất excel
        </Button>
      </div>

      {/* View content */}
      {viewMode === "invoice" && <CustomerInvoiceView />}
      {viewMode === "service" && <CustomerServiceView />}
      {viewMode === "frequency" && <CustomerFrequencyView />}
      {viewMode === "source" && <CustomerSourceView />}
    </div>
  );
}
