"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RevenueCategoryTable, RevenueTableColumn } from "./revenue-category-table";
import { useReportRevenueStore, usePackageRevenueData } from "@/stores/report-revenue-store";
import { PackageRevenue } from "@/types/report";
import { formatVND } from "@/lib/cash-fund-utils";
import { SaleTypeOptions } from "@/lib/constants";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

const PACKAGE_COLUMN_DEFS: ColumnDef[] = [
  { key: "packageName", label: "Dịch vụ" },
  { key: "quantity", label: "Số lượng" },
  { key: "unitPrice", label: "Đơn giá" },
  { key: "totalAmount", label: "Tổng tiền" },
  { key: "discount", label: "Giảm giá" },
  { key: "revenue", label: "Doanh thu" },
];

export function RevenuePackageView() {
  const { toast } = useToast();
  const { data, page, pageSize, total } = usePackageRevenueData();
  const {
    packageSaleTypeFilter,
    setPackageSaleTypeFilter,
    packageCategoryFilter,
    setPackageCategoryFilter,
    setPage,
    setPageSize,
  } = useReportRevenueStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(PACKAGE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Fetch real package categories from Supabase for the filter dropdown.
  const { data: categories } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["report-package-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/package-categories");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string }>) || [];
    },
  });

  const allColumns: RevenueTableColumn<PackageRevenue>[] = [
    { key: "packageName", label: "Dịch vụ", align: "left" },
    { key: "quantity", label: "Số lượng", align: "right" },
    {
      key: "unitPrice",
      label: "Đơn giá",
      align: "right",
      formatter: (v) => formatVND(v as number),
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      align: "right",
      className: "text-sky-600",
      formatter: (v) => formatVND(v as number),
    },
    {
      key: "discount",
      label: "Giảm giá",
      align: "right",
      formatter: (v) => formatVND(v as number),
    },
    {
      key: "revenue",
      label: "Doanh thu",
      align: "right",
      formatter: (v) => formatVND(v as number),
    },
  ];

  const visibleColumnsKeys = new Set(
    PACKAGE_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)
  );
  const columns = allColumns.filter((c) => visibleColumnsKeys.has(String(c.key)));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={packageSaleTypeFilter}
          onChange={(e) => setPackageSaleTypeFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          {SaleTypeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <select
          value={packageCategoryFilter}
          onChange={(e) => setPackageCategoryFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="all">chọn nhóm</option>
          {(categories || []).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
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

        <ColumnToggle
          columnDefs={PACKAGE_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <RevenueCategoryTable
        data={data}
        columns={columns}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
