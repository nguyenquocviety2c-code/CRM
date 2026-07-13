"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RevenueCategoryTable, RevenueTableColumn } from "./revenue-category-table";
import { useReportRevenueStore, useServiceRevenueData } from "@/stores/report-revenue-store";
import { ServiceRevenue } from "@/types/report";
import { formatVND } from "@/lib/cash-fund-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

const SERVICE_COLUMN_DEFS: ColumnDef[] = [
  { key: "serviceName", label: "Dịch vụ" },
  { key: "quantity", label: "Số lượng" },
  { key: "originalPrice", label: "Đơn giá gốc" },
  { key: "totalAmount", label: "Tổng tiền" },
  { key: "discount", label: "Giảm giá" },
  { key: "revenue", label: "Doanh thu" },
];

export function RevenueServiceView() {
  const { toast } = useToast();
  const { data, total } = useServiceRevenueData();
  const { serviceCategoryFilter, setServiceCategoryFilter } = useReportRevenueStore();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(SERVICE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Fetch real service categories from Supabase for the filter dropdown.
  const { data: categories } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["report-service-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string }>) || [];
    },
  });

  const allColumns: RevenueTableColumn<ServiceRevenue>[] = [
    { key: "serviceName", label: "Dịch vụ", align: "left" },
    { key: "quantity", label: "Số lượng", align: "right" },
    {
      key: "originalPrice",
      label: "Đơn giá gốc",
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

  // Filter columns by visibleColumns.
  const visibleColumnsKeys = new Set(
    SERVICE_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)
  );
  const columns = allColumns.filter((c) => visibleColumnsKeys.has(String(c.key)));

  const footerTotal = {
    serviceName: "TỔNG CỘNG",
    quantity: total.quantity,
    originalPrice: total.unitPrice,
    totalAmount: total.totalAmount,
    discount: total.discount,
    revenue: total.revenue,
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={serviceCategoryFilter}
          onChange={(e) => setServiceCategoryFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="all">chọn nhóm dịch vụ</option>
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
          columnDefs={SERVICE_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <RevenueCategoryTable
        data={data}
        columns={columns}
        footerTotal={footerTotal}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
