"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryKeys } from "@/lib/query-keys";
import { useServicePackageReportStore } from "@/stores/report-service-package-store";
import { formatDate } from "@/lib/cash-fund-utils";
import {
  CustomerPackageStatusLabel,
  CustomerPackageStatusBadgeColors,
} from "@/lib/constants";
import type { PurchasedPackageResponse } from "@/types/report-service-package";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";

function formatDateOnly(iso: string): string {
  if (!iso) return "-";
  return formatDate(iso, "date");
}

export function PurchasedPackageView() {
  const {
    customerSearch,
    categoryId,
    page,
    pageSize,
    setPage,
    setPageSize,
  } = useServicePackageReportStore();
  // Customer history dialog state — opened when clicking a customer's name
  // (green link) in the table.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.packages.report.list({
      view: "purchased",
      customerSearch,
      categoryId,
      page,
      limit: pageSize,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "purchased");
      if (customerSearch) params.set("customerSearch", customerSearch);
      if (categoryId) params.set("categoryId", categoryId);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      const res = await fetch(`/api/supabase/packages/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as PurchasedPackageResponse;
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Table — no summary cards in this view */}
      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Tên khách hàng</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Gói dịch vụ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Trạng thái</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Ngày mua</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Ngày hết hạn</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Ngày sử dụng gần nhất</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Số lần sử dụng gói</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Đã sử dụng</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Còn lại</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-gray-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const badge = CustomerPackageStatusBadgeColors[row.status] || {
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                };
                return (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="text-slate-700">
                      {row.customerId ? (
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryCustomer({
                              id: row.customerId,
                              name: row.customerName,
                              phone: row.customerPhone || null,
                            })
                          }
                          className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                          title="Xem lịch sử khách hàng"
                        >
                          {row.customerName}
                        </button>
                      ) : (
                        <div>{row.customerName}</div>
                      )}
                      <div className="text-xs text-gray-400">{row.customerPhone || "-"}</div>
                    </TableCell>
                    <TableCell className="text-slate-700">{row.packageName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${badge.bg} ${badge.text} hover:${badge.bg}`}>
                        {CustomerPackageStatusLabel[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700 whitespace-nowrap">{formatDateOnly(row.purchaseDate)}</TableCell>
                    <TableCell className="text-slate-700 whitespace-nowrap">{formatDateOnly(row.expiryDate)}</TableCell>
                    <TableCell className="text-slate-700 whitespace-nowrap">{formatDateOnly(row.lastUsedDate)}</TableCell>
                    <TableCell className="text-slate-700 tabular-nums">{row.totalUses}</TableCell>
                    <TableCell className="text-slate-700 tabular-nums">{row.usedCount}</TableCell>
                    <TableCell className="text-slate-700 tabular-nums font-medium">{row.remaining}</TableCell>
                  </TableRow>
                );
              })
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

      {/* Customer history dialog — opened when clicking a customer's name
          (green link) in the table. */}
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
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
