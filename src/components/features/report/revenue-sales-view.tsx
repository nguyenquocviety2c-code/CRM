"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RevenueCategoryTable, RevenueTableColumn } from "./revenue-category-table";
import { useSalesRevenueData } from "@/stores/report-revenue-store";
import { SalesRevenue } from "@/types/report";
import { formatVND } from "@/lib/cash-fund-utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

const SALES_COLUMN_DEFS: ColumnDef[] = [
  { key: "productCode", label: "Mã sản phẩm" },
  { key: "productName", label: "Tên sản phẩm" },
  { key: "quantity", label: "Số lượng" },
  { key: "orderCount", label: "Số đơn hàng" },
  { key: "unitPrice", label: "Đơn giá" },
  { key: "totalAmount", label: "Tổng tiền" },
  { key: "discount", label: "Giảm giá" },
  { key: "revenue", label: "Doanh thu" },
];

export function RevenueSalesView() {
  const { toast } = useToast();
  const { data, total } = useSalesRevenueData();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(SALES_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const allColumns: RevenueTableColumn<SalesRevenue>[] = [
    { key: "productCode", label: "Mã sản phẩm", align: "left" },
    { key: "productName", label: "Tên sản phẩm", align: "left" },
    { key: "quantity", label: "Số lượng", align: "right" },
    { key: "orderCount", label: "Số đơn hàng", align: "right" },
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
    SALES_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)
  );
  const columns = allColumns.filter((c) => visibleColumnsKeys.has(String(c.key)));

  const footerTotal = {
    productCode: "TỔNG CỘNG",
    productName: "",
    quantity: total.quantity,
    orderCount: total.orderCount ?? 0,
    unitPrice: total.unitPrice,
    totalAmount: total.totalAmount,
    discount: total.discount,
    revenue: total.revenue,
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Xuất excel
        </button>

        <ColumnToggle
          columnDefs={SALES_COLUMN_DEFS}
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
