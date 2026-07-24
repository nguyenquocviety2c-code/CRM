"use client";

import { useRouter } from "next/navigation";
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
import { useToast } from "@/hooks/use-toast";
import {
  useReportLiabilitiesStore,
  useLiabilitiesCustomerData,
} from "@/stores/report-liabilities-store";
import { formatVND, paginationRange } from "@/lib/report-liabilities-utils";
import { RevenueSummaryCards } from "./revenue-summary-cards";
import { EmptyState } from "../customer-care/empty-state";

export function LiabilitiesCustomerView() {
  const { toast } = useToast();
  const router = useRouter();
  const { setPage, setPageSize } = useReportLiabilitiesStore();
  const { data, summary, page, pageSize, total } = useLiabilitiesCustomerData();

  const cards = [
    { label: "NỢ ĐẦU KỲ", value: formatVND(summary.initialDebt) },
    { label: "NỢ PHÁT SINH", value: formatVND(summary.debtIncurred) },
    { label: "TRẢ", value: formatVND(summary.payment) },
    { label: "NỢ CUỐI KỲ", value: formatVND(summary.remainingDebt) },
  ];

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <RevenueSummaryCards cards={cards} />

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-medium uppercase text-slate-600">Mã khách hàng</TableHead>
              <TableHead className="text-xs font-medium uppercase text-slate-600">Tên khách hàng</TableHead>
              <TableHead className="text-xs font-medium uppercase text-slate-600">Nợ đầu kỳ</TableHead>
              <TableHead className="text-xs font-medium uppercase text-slate-600">Nợ phát sinh</TableHead>
              <TableHead className="text-xs font-medium uppercase text-slate-600">Trả nợ</TableHead>
              <TableHead className="text-xs font-medium uppercase text-slate-600">Nợ cuối kỳ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8">
                  <EmptyState text="Trống" />
                </TableCell>
              </TableRow>
            ) : (
              data.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-slate-50">
                  <TableCell>
                    <button
                      onClick={() =>
                        router.push(`/customers/${customer.customerId}`)
                      }
                      className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                      title="Xem lịch sử khách hàng"
                    >
                      {customer.customerId}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/customers/${customer.customerId}`)
                        }
                        className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                        title="Xem lịch sử khách hàng"
                      >
                        {customer.customerName}
                      </button>
                      <span className="text-xs text-gray-500">{customer.customerPhone}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatVND(customer.initialDebt)}</TableCell>
                  <TableCell>{formatVND(customer.debtIncurred)}</TableCell>
                  <TableCell>{formatVND(customer.payment)}</TableCell>
                  <TableCell>{formatVND(customer.remainingDebt)}</TableCell>
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
