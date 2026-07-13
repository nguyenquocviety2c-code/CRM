"use client";

import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportTabs } from "./report-tabs";
import { LiabilitiesViewModeToggle } from "./liabilities-view-mode-toggle";
import { LiabilitiesTransactionView } from "./liabilities-transaction-view";
import { LiabilitiesCustomerView } from "./liabilities-customer-view";
import { useReportLiabilitiesStore } from "@/stores/report-liabilities-store";
import { useToast } from "@/hooks/use-toast";
import { DebtTypeOptions } from "@/lib/constants";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

export function LiabilitiesReportPage() {
  const { toast } = useToast();
  const {
    viewMode,
    setViewMode,
    debtTypeFilter,
    setDebtTypeFilter,
    searchQuery,
    setSearchQuery,
    startDate,
    endDate,
    setDateRange,
  } = useReportLiabilitiesStore();

  const handleExport = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn sau",
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
          <DateRangePicker
            dateFrom={startDate || ""}
            dateTo={endDate || ""}
            onChange={(from, to) => setDateRange(from, to)}
          />
        </div>
      </div>

      {/* Tabs */}
      <ReportTabs />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <LiabilitiesViewModeToggle value={viewMode} onChange={setViewMode} />

        {/* Debt type filter (transaction view only) */}
        {viewMode === "transaction" && (
          <Select value={debtTypeFilter} onValueChange={(v) => setDebtTypeFilter(v as "all" | "debt" | "payment")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Chọn loại" />
            </SelectTrigger>
            <SelectContent>
              {DebtTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm theo tên hoặc sđt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-[260px]"
          />
        </div>

        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Xuất excel
        </Button>
      </div>

      {/* View content */}
      {viewMode === "transaction" && <LiabilitiesTransactionView />}
      {viewMode === "customer" && <LiabilitiesCustomerView />}
    </div>
  );
}
