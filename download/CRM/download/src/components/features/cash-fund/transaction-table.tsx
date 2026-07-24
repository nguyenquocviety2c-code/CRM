"use client";

import { FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCashFundStore, usePaginatedTransactions } from "@/stores/cash-fund-store";
import { formatVND, formatDate, paginationRange } from "@/lib/cash-fund-utils";

export function TransactionTable() {
  const { page, pageSize, setPage, setPageSize } = useCashFundStore();
  const { data, total } = usePaginatedTransactions();

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Danh mục</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Liên kết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FolderOpen className="h-10 w-10 mb-2" />
                    <span>Trống</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.voucherCode}</TableCell>
                  <TableCell>{t.categoryName}</TableCell>
                  <TableCell>{formatDate(t.createdAt, "datetime")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{t.createdBy}</span>
                      <span className="text-sm text-muted-foreground">{t.reason}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatVND(t.amount)}</TableCell>
                  <TableCell>
                    {t.link ? (
                      <span className="text-primary cursor-pointer hover:underline">
                        {t.link}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Hiển thị từ {from} đến {to} trên tổng số {total}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-2 border rounded hover:bg-muted disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 py-1 border rounded bg-primary text-primary-foreground">
            {page}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={to >= total}
            className="p-2 border rounded hover:bg-muted disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">/ trang</span>
        </div>
      </div>
    </div>
  );
}