"use client";

import { Button } from "@/components/ui/button";
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
  useCustomerServiceData,
  useServiceGroupOptions,
} from "@/stores/report-customer-store";
import { paginationRange } from "@/lib/report-customer-utils";

export function CustomerServiceView() {
  const { toast } = useToast();
  const { setPage, setPageSize } = useReportCustomerStore();
  const { paginated, page, pageSize, total } = useCustomerServiceData();
  const serviceGroupOptions = useServiceGroupOptions();

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  const handleServiceClick = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn lõi",
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Chọn nhóm dịch vụ" />
          </SelectTrigger>
          <SelectContent>
            {serviceGroupOptions.map((opt) => (
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
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Tên dịch vụ
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Lượt sử dụng
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Khách hàng sử dụng
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Tổng lượt(bao gồm đơn giá phụ)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button
                    onClick={handleServiceClick}
                    className="text-blue-600 hover:underline text-left"
                  >
                    {item.serviceName}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">{item.usageCount}</td>
                <td className="px-4 py-3 text-center">{item.customerCount}</td>
                <td className="px-4 py-3 text-center">{item.totalUsage}</td>
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
