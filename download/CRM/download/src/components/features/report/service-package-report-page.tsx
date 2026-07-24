"use client";

import { ChevronDown, Download, Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportTabs } from "./report-tabs";
import { PurchasedPackageView } from "./purchased-package-view";
import { PackageUsageView } from "./package-usage-view";
import { useServicePackageReportStore } from "@/stores/report-service-package-store";
import { useToast } from "@/hooks/use-toast";
import {
  ServicePackageReportView,
  ServicePackageReportViewLabel,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

const viewModes: ServicePackageReportView[] = ["purchased", "usage"];

export function ServicePackageReportPage() {
  const {
    view,
    setView,
    customerSearch,
    setCustomerSearch,
    categoryId,
    setCategoryId,
    packageSearch,
    setPackageSearch,
  } = useServicePackageReportStore();
  const { toast } = useToast();

  // Fetch real package categories for the filter dropdown.
  const { data: categories } = useQuery({
    queryKey: ["service-package-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/package-categories?active=true");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string }>) || [];
    },
  });

  // Local date-range state (this tab's store doesn't hold date range, so we
  // manage it here for the DateRangePicker).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleExport = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng xuất Excel sẽ khả dụng ở giai đoạn sau",
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
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
      </div>

      {/* Module tabs */}
      <ReportTabs />

      {/* View-mode sub-tabs (Gói đã mua / Lịch sử dùng gói) */}
      <div className="flex border-b border-gray-200">
        {viewModes.map((mode) => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              view === mode
                ? "border-b-2 border-sky-500 text-sky-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {ServicePackageReportViewLabel[mode]}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View dropdown (mirrors active sub-tab, per reference design) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[180px]">
              {ServicePackageReportViewLabel[view]}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {viewModes.map((mode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => setView(mode)}
                className={cn(view === mode && "bg-sky-50 text-sky-700")}
              >
                {ServicePackageReportViewLabel[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Customer search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm tên, sdt khách hàng"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-[200px] pl-8"
          />
        </div>

        {/* Category filter */}
        <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Chọn nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhóm</SelectItem>
            {(categories || []).map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Package search — usage view only */}
        {view === "usage" && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Tìm gói dịch vụ"
              value={packageSearch}
              onChange={(e) => setPackageSearch(e.target.value)}
              className="w-[180px] pl-8"
            />
          </div>
        )}

        {/* Export excel */}
        <Button variant="outline" className="gap-2 text-sky-600" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Xuất excel
        </Button>
      </div>

      {/* View content */}
      {view === "purchased" && <PurchasedPackageView />}
      {view === "usage" && <PackageUsageView />}
    </div>
  );
}
