"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query-keys";
import { useWarehouseReportStore } from "@/stores/report-warehouse-store";
import { formatVND } from "@/lib/cash-fund-utils";
import type { WarehouseMovementResponse, WarehouseMovementAction } from "@/types/report-warehouse";

const actionLabel: Record<WarehouseMovementAction, string> = {
  import: "Nhập kho",
  "export-use": "Xuất sử dụng",
  "export-sell": "Xuất bán",
  "export-return": "Trả hàng nhập",
  "export-destroy": "Xuất hủy",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function WarehouseMovementView() {
  const { dateFrom, dateTo, categoryId, search, page, pageSize, setPage, setPageSize } =
    useWarehouseReportStore();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.report.list({
      view: "movement",
      from: dateFrom,
      to: dateTo,
      categoryId,
      search,
      page,
      limit: pageSize,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "movement");
      params.set("from", dateFrom);
      params.set("to", dateTo);
      if (categoryId) params.set("categoryId", categoryId);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      const res = await fetch(`/api/supabase/warehouse/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as WarehouseMovementResponse;
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Thời gian</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Mã phiếu</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Người tạo</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Hành động</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Sản phẩm</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Số lượng</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Giá bán</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Nội dung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-gray-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-slate-700 whitespace-nowrap">{formatDateTime(row.datetime)}</TableCell>
                  <TableCell className="text-slate-700">{row.slipCode || "-"}</TableCell>
                  <TableCell className="text-slate-700">{row.createdBy}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        row.action === "import"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-red-500 text-white hover:bg-red-500"
                      }
                    >
                      {actionLabel[row.action]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-700 whitespace-nowrap">
                    {row.productCode} - {row.productName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatVND(row.price)}</TableCell>
                  <TableCell className="text-slate-600">{row.content}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Hiển thị từ {from} đến {to} trên tổng số {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={to >= total}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value={20}>20 / trang</option>
            <option value={50}>50 / trang</option>
            <option value={100}>100 / trang</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
      <span className="text-sm text-gray-400">Trống</span>
    </div>
  );
}
