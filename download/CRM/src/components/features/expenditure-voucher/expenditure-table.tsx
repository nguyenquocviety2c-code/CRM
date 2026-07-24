"use client";

import { useState } from "react";
import { FolderOpen, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { usePaginatedExpenditures, useExpenditureVoucherStore } from "@/stores/expenditure-voucher-store";
import { formatVND, formatDate, paginationRange } from "@/lib/expenditure-voucher-utils";

export function ExpenditureTable() {
  const { data, total, page, pageSize } = usePaginatedExpenditures();
  const { setPage, setPageSize } = useExpenditureVoucherStore();
  const { toast } = useToast();
  const [pageInput, setPageInput] = useState(String(page));

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > Math.ceil(total / pageSize)) return;
    setPage(newPage);
    setPageInput(String(newPage));
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
  };

  const handleViewDetail = () => {
    toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Danh mục</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Số tiền</TableHead>
              <TableHead>Liên kết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                    <FolderOpen className="h-10 w-10" />
                    <span>Trống</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((expenditure) => (
                <TableRow key={expenditure.id}>
                  <TableCell className="font-medium">{expenditure.code}</TableCell>
                  <TableCell>{expenditure.categoryName}</TableCell>
                  <TableCell>{formatDate(expenditure.datetime, "datetime")}</TableCell>
                  <TableCell>{expenditure.createdBy}</TableCell>
                  <TableCell>{formatVND(expenditure.amount)}</TableCell>
                  <TableCell>
                    <button
                      onClick={handleViewDetail}
                      className="text-sky-600 hover:text-sky-700 hover:underline text-sm"
                    >
                      Xem chi tiết
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="text-gray-500">
            Hiển thị từ {from} đến {to} trên tổng số {total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => {
                  const p = parseInt(pageInput, 10);
                  if (!isNaN(p)) {
                    handlePageChange(p);
                  } else {
                    setPageInput(String(page));
                  }
                }}
                className="w-10 h-8 text-center border rounded text-sm"
              />
              <span className="text-gray-500">/</span>
              <span className="text-gray-500">{Math.ceil(total / pageSize)}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(total / pageSize)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="relative">
              <select
                value={String(pageSize)}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="h-8 pl-2 pr-6 border rounded text-sm appearance-none bg-white"
              >
                <option value="20">20 / trang</option>
                <option value="50">50 / trang</option>
                <option value="100">100 / trang</option>
              </select>
              <ChevronDown className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}