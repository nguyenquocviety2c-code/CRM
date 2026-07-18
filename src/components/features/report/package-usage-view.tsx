"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
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
import { useServicePackageReportStore } from "@/stores/report-service-package-store";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/cash-fund-utils";
import type { PackageUsageResponse } from "@/types/report-service-package";
import { PaidInvoiceView } from "@/components/features/booking/paid-invoice-view";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";

function formatDateTime(iso: string): string {
  return formatDate(iso, "datetime");
}

export function PackageUsageView() {
  const { toast } = useToast();
  const {
    customerSearch,
    categoryId,
    packageSearch,
    page,
    pageSize,
    setPage,
    setPageSize,
  } = useServicePackageReportStore();

  // When set, opens the full-page invoice view for the clicked usage row's
  // linked invoice. Mirrors the revenue invoice view's behavior so the user
  // gets the same invoice detail experience across all report sub-views.
  const [detailTarget, setDetailTarget] = useState<{
    invoiceId: string;
    customerName?: string;
    code?: string | null;
  } | null>(null);
  // Customer history dialog state — opened when clicking a customer's name
  // (green link) in the table.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.packages.report.list({
      view: "usage",
      customerSearch,
      categoryId,
      packageSearch,
      page,
      limit: pageSize,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("view", "usage");
      if (customerSearch) params.set("customerSearch", customerSearch);
      if (categoryId) params.set("categoryId", categoryId);
      if (packageSearch) params.set("packageSearch", packageSearch);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      const res = await fetch(`/api/supabase/packages/report?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as PackageUsageResponse;
    },
  });

  const items = data?.items || [];
  const summary = data?.summary;
  const total = data?.total || 0;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Summary cards
  const cards = [
    { label: "TỔNG SỐ GÓI", value: summary?.totalPackages ?? 0 },
    { label: "TỔNG SỐ LƯỢT DÙNG", value: summary?.totalUses ?? 0 },
    { label: "TỔNG SỐ KHÁCH", value: summary?.totalCustomers ?? 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Gói dịch vụ</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Khách hàng</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Ngày sử dụng</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Số lượt</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">
                Hóa đơn ({total})
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">Nhân viên thực hiện</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-600 w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-gray-500">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-slate-700">{row.packageName}</TableCell>
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
                  <TableCell className="text-slate-700 whitespace-nowrap">{formatDateTime(row.useDate)}</TableCell>
                  <TableCell className="text-slate-700 tabular-nums">{row.quantity}</TableCell>
                  <TableCell>
                    {row.invoiceCode && row.invoiceId ? (
                      <button
                        onClick={() =>
                          setDetailTarget({
                            invoiceId: row.invoiceId!,
                            customerName: row.customerName,
                            code: row.invoiceCode,
                          })
                        }
                        className="text-sky-600 hover:text-sky-700 hover:underline text-sm"
                      >
                        {row.invoiceCode}
                      </button>
                    ) : row.invoiceCode ? (
                      // Legacy row with a code but no invoice_id — can't open
                      // the detail view, so show the code as plain text.
                      <span className="text-gray-500 text-sm" title="Hóa đơn cũ, không xem được chi tiết">
                        {row.invoiceCode}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-700">{row.staffName || "-"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        toast({ title: "Thông báo", description: "Tùy chọn sẽ khả dụng ở giai đoạn sau" })
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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

      {/*
        Full-page invoice view — opens when clicking an invoice code in the
        "Hóa đơn" column. Same PaidInvoiceView component used by the revenue
        invoice view, cashier history, and booking checkout, so the user gets
        a consistent invoice detail experience everywhere.
      */}
      {detailTarget && (
        <PaidInvoiceView
          invoiceId={detailTarget.invoiceId}
          customerName={detailTarget.customerName}
          bookingCode={detailTarget.code}
          onClose={() => setDetailTarget(null)}
        />
      )}

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
