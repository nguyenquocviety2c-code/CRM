"use client";

import { Plus, Calendar, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRevenueVoucherStore } from "@/stores/revenue-voucher-store";
import { ReceiptTable } from "./receipt-table";
import { CategoryModal } from "./category-modal";
import { CategoryFormDialog } from "./category-form-dialog";
import { CreateReceiptDialog } from "./create-receipt-dialog";
import { ReceiptDetailDialog } from "./receipt-detail-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";

export function RevenueVoucherPage() {
  const {
    search,
    setSearch,
    openCategoryModal,
    openCreateReceiptDialog,
  } = useRevenueVoucherStore();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 p-4 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold">Phiếu thu</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <BranchSelector />
            {/* Branch selector */}
            <Button variant="outline" className="gap-1">
              Chi nhánh: Level 1 Van Bảo
              <ChevronDown className="h-4 w-4" />
            </Button>
            {/* Date picker */}
            <Button variant="outline" className="gap-1">
              <Calendar className="h-4 w-4" />
              Chọn thời điểm
            </Button>
            {/* Category button */}
            <Button variant="outline" onClick={openCategoryModal}>
              Loại phiếu thu
            </Button>
            {/* Create button */}
            <Button onClick={openCreateReceiptDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Tạo phiếu thu
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>

        {/* Receipt Table */}
        <ReceiptTable />
      </main>

      {/* Dialogs/Modals */}
      <CategoryModal />
      <CategoryFormDialog />
      <CreateReceiptDialog />
      <ReceiptDetailDialog />
    </div>
  );
}