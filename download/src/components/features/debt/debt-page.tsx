"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DebtTable } from "./debt-table";
import { CreateDebtPaymentDialog } from "./create-debt-payment-dialog";
import { useDebtStore, usePaginatedDebts } from "@/stores/debt-store";
import { paginationRange } from "@/lib/debt-utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchSelector } from "@/components/layout/branch-selector";

export function DebtPage() {
  const { search, page, pageSize, setSearch, setPage, setPageSize } =
    useDebtStore();
  const { data, total } = usePaginatedDebts();

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Công nợ</h1>
          <BranchSelector />
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm theo tên hoặc sdt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {/* Table */}
        <DebtTable debts={data} />

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Hiển thị từ {from} đến {to} trên tổng số {total}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3 py-1 border rounded">{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page * pageSize >= total}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500">/ trang</span>
          </div>
        </div>
      </main>

      {/* Dialog */}
      <CreateDebtPaymentDialog />
    </div>
  );
}