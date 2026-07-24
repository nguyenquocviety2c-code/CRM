"use client";

import { ChevronDown, Download, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportTabs } from "./report-tabs";
import { WarehouseInventoryView } from "./warehouse-inventory-view";
import { WarehouseMovementView } from "./warehouse-movement-view";
import { WarehouseTransferView } from "./warehouse-transfer-view";
import { useWarehouseReportStore } from "@/stores/report-warehouse-store";
import { useToast } from "@/hooks/use-toast";
import {
  WarehouseReportView,
  WarehouseReportViewLabel,
  WarehouseStockStatusOptions,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";

const viewModes: WarehouseReportView[] = ["inventory", "movement", "transfer"];

export function WarehouseReportPage() {
  const {
    view,
    setView,
    dateFrom,
    dateTo,
    setDateRange,
    categoryId,
    setCategoryId,
    search,
    setSearch,
    stockStatus,
    setStockStatus,
    transferStatus,
    setTransferStatus,
  } = useWarehouseReportStore();
  const { toast } = useToast();

  // Fetch real product categories for the filter dropdown.
  const { data: categories } = useQuery({
    queryKey: ["warehouse-product-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/product-categories?active=true");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string }>) || [];
    },
  });

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
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={setDateRange} />
        </div>
      </div>

      {/* Module tabs */}
      <ReportTabs />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View mode dropdown (Tồn kho / Nhập xuất kho / Chuyển kho) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[160px] border-sky-500 text-sky-600">
              {WarehouseReportViewLabel[view]}
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
                {WarehouseReportViewLabel[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* For movement view: an extra "Tất cả" filter */}
        {view === "movement" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Tất cả
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Tất cả</DropdownMenuItem>
              <DropdownMenuItem>Nhập kho</DropdownMenuItem>
              <DropdownMenuItem>Xuất bán</DropdownMenuItem>
              <DropdownMenuItem>Xuất sử dụng</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Category filter */}
        <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Chọn nhóm sản phẩm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhóm sản phẩm</SelectItem>
            {(categories || []).map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Product search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm sản phẩm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px] pl-8 border-sky-500"
          />
        </div>

        {/* Export excel */}
        <Button variant="outline" className="gap-2 text-sky-600" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Xuất excel
        </Button>

        {/* Stock status filter (split button style) — only for inventory & movement */}
        {(view === "inventory" || view === "movement") && (
          <Select value={stockStatus} onValueChange={setStockStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tình trạng sản phẩm" />
            </SelectTrigger>
            <SelectContent>
              {WarehouseStockStatusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* View content */}
      {view === "inventory" && <WarehouseInventoryView />}
      {view === "movement" && <WarehouseMovementView />}
      {view === "transfer" && (
        <WarehouseTransferView
          status={transferStatus}
          onStatusChange={setTransferStatus}
        />
      )}
    </div>
  );
}
