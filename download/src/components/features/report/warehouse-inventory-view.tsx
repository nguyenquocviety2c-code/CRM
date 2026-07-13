"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryKeys } from "@/lib/query-keys";
import { useWarehouseReportStore } from "@/stores/report-warehouse-store";
import { useToast } from "@/hooks/use-toast";
import type { WarehouseInventoryResponse } from "@/types/report-warehouse";

export function WarehouseInventoryView() {
  const { toast } = useToast();
  const { dateFrom, dateTo, categoryId, search, stockStatus, page, pageSize, setPage, setPageSize } =
    useWarehouseReportStore();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.report.list({
      view: "inventory",
      from: dateFrom,
      to: dateTo,
      categoryId,
      search,
      stockStatus,
      page,
      limit: pageSize,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "inventory");
      params.set("from", dateFrom);
      params.set("to", dateTo);
      if (categoryId) params.set("categoryId", categoryId);
      if (search) params.set("search", search);
      if (stockStatus) params.set("stockStatus", stockStatus);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      const res = await fetch(`/api/supabase/warehouse/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as WarehouseInventoryResponse;
    },
  });

  const items = data?.items || [];
  const summary = data?.summary;
  const total = data?.total || 0;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const cards = [
    { label: "TỒN KHO ĐẦU KỲ", value: summary?.openingStock ?? 0, sub: "" },
    { label: "NHẬP KHO", value: summary?.importedQty ?? 0, sub: "" },
    {
      label: "XUẤT KHO",
      value: summary?.exportedTotal ?? 0,
      sub: `Xuất sử dụng: ${summary?.exportedUse ?? 0} | Xuất bán: ${summary?.exportedSell ?? 0}`,
    },
    { label: "CHUYỂN KHO", value: summary?.transferOut ?? 0, sub: "" },
    { label: "NHẬN CHUYỂN KHO", value: summary?.transferIn ?? 0, sub: "" },
    { label: "TỒN KHO", value: summary?.closingStock ?? 0, sub: "" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            {card.sub && (
              <p className="mt-1 text-[11px] text-slate-500">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Mã sản phẩm</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Tên sản phẩm</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Tồn kho đầu kỳ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Số lượng nhập</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Số lượng xuất</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  Số lượng bán ra
                  <Info className="h-3 w-3 text-slate-400" />
                </span>
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Chuyển kho</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Nhận chuyển kho</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 text-right whitespace-nowrap">Tồn kho cuối kỳ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Lịch sử nhập/xuất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-gray-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium text-slate-700">{row.productCode}</TableCell>
                  <TableCell className="text-slate-700">{row.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.openingStock}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.importedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.exportedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.soldQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.transferOut}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.transferIn}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{row.closingStock}</TableCell>
                  <TableCell>
                    <button
                      onClick={() =>
                        toast({ title: "Thông báo", description: "Lịch sử nhập/xuất sẽ khả dụng ở giai đoạn sau" })
                      }
                      className="text-sky-600 hover:text-sky-700 hover:underline text-sm whitespace-nowrap"
                    >
                      Lịch sử nhập/xuất
                    </button>
                  </TableCell>
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
