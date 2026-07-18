"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useReportCustomerStore,
  useCustomerInvoiceData,
  useCustomerGroupOptions,
  useStaffOptions,
} from "@/stores/report-customer-store";
import { formatVND, paginationRange } from "@/lib/report-customer-utils";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";

export function CustomerInvoiceView() {
  const { toast } = useToast();
  const {
    setCustomerGroupFilter,
    setCustomerNameSearch,
    setStaffFilter,
    setPage,
    setPageSize,
  } = useReportCustomerStore();
  const { summary, paginated, page, pageSize, total } = useCustomerInvoiceData();
  const customerGroupOptions = useCustomerGroupOptions();
  const staffOptions = useStaffOptions();
  // Customer history dialog state — opened when clicking a customer's name
  // (green link) in the table.
  const [historyCustomer, setHistoryCustomer] = useState<{
    id: string;
    name?: string | null;
    phone?: string | null;
  } | null>(null);

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  const handleDetail = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn lõi",
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="KHÁCH CŨ"
          count={summary.oldCount}
          revenue={summary.oldRevenue}
        />
        <SummaryCard
          label="KHÁCH MỚI"
          count={summary.newCount}
          revenue={summary.newRevenue}
        />
        <SummaryCard
          label="KHÁCH VÀNG LAI"
          count={summary.kolCount}
          revenue={summary.kolRevenue}
        />
        <SummaryCard
          label="TỔNG SỐ KHÁCH"
          count={summary.totalCount}
          revenue={summary.totalRevenue}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={setCustomerGroupFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tất cả khách hàng" />
          </SelectTrigger>
          <SelectContent>
            {customerGroupOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm tên khách hàng"
            className="pl-9 w-[240px]"
            onChange={(e) => setCustomerNameSearch(e.target.value)}
          />
        </div>

        <Select onValueChange={setStaffFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Chọn nhân viên" />
          </SelectTrigger>
          <SelectContent>
            {staffOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Khách hàng</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Hóa đơn</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Dịch vụ</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Sản phẩm</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Mua Gói</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Làm gói</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Nạp thẻ</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Giảm giá</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Thanh toán</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Nợ</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Thanh Toán Nợ</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setHistoryCustomer({
                          id: item.customerId,
                          name: item.customerName,
                          phone: item.phone || null,
                        })
                      }
                      className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                      title="Xem lịch sử khách hàng"
                    >
                      [{item.customerCode}] {item.customerName}
                    </button>
                    <div className="text-xs text-gray-500">
                      Đt: {item.phone} - Ngày t……o: {item.createdDate}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">{item.invoiceCount}</td>
                <td className="px-4 py-3 text-center">{item.serviceCount}</td>
                <td className="px-4 py-3 text-center">{item.productCount}</td>
                <td className="px-4 py-3 text-center">{item.buyPackageCount}</td>
                <td className="px-4 py-3 text-center">{item.usePackageCount}</td>
                <td className="px-4 py-3 text-center">{item.cardCount}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.discount)}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.payment)}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.debt)}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.debtPayment)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={handleDetail}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Xem chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Hiển thị từ {from} đến {to} trên tổng số {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            &lt;
          </Button>
          <span className="px-3 py-1 border rounded bg-blue-50 text-blue-600 font-medium">
            {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={to >= total}
          >
            &gt;
          </Button>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}/trang
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

function SummaryCard({
  label,
  count,
  revenue,
}: {
  label: string;
  count: number;
  revenue: number;
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
        {count} <span className="text-sm font-normal text-gray-500">khách</span> /{" "}
        {formatVND(revenue)}
      </div>
    </div>
  );
}
