"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useReportCustomerStore,
  useCustomerSourceData,
} from "@/stores/report-customer-store";
import { formatVND, paginationRange } from "@/lib/report-customer-utils";

export function CustomerSourceView() {
  const { setPage, setPageSize } = useReportCustomerStore();
  const { paginated, page, pageSize, total } = useCustomerSourceData();

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Nguồn khách
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Số khách
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Số hóa đơn
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Số gói
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Số sản phẩm
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Số dịch vụ
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">
                Giảm giá
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">
                Doanh thu
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{item.sourceName}</td>
                <td className="px-4 py-3 text-center">{item.customerCount}</td>
                <td className="px-4 py-3 text-center">{item.invoiceCount}</td>
                <td className="px-4 py-3 text-center">{item.packageCount}</td>
                <td className="px-4 py-3 text-center">{item.productCount}</td>
                <td className="px-4 py-3 text-center">{item.serviceCount}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.discount)}</td>
                <td className="px-4 py-3 text-right">{formatVND(item.revenue)}</td>
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
    </div>
  );
}
