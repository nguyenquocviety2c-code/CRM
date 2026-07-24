"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCashFundStore } from "@/stores/cash-fund-store";
import { SummaryCards } from "./summary-cards";
import { FilterBar } from "./filter-bar";
import { TransactionTable } from "./transaction-table";
import { HistoryDialog } from "./dialogs/history-dialog";
import { SettingDialog } from "./dialogs/setting-dialog";
import { CreateVoucherDialog } from "./dialogs/create-voucher-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";

export function CashFundPage() {
  const { openHistory, openSetting, openVoucher } = useCashFundStore();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 p-4 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold">Sổ quỹ tiền mặt</h1>
          <div className="flex items-center gap-2">
            <BranchSelector />
            <Button variant="ghost" onClick={openHistory}>
              Lịch sử cài đặt
            </Button>
            <Button variant="ghost" onClick={openSetting}>
              Cài đặt
            </Button>
            <Button onClick={() => openVoucher("expense")}>
              <Plus className="h-4 w-4 mr-1" />
              Phiếu CHI
            </Button>
            <Button onClick={() => openVoucher("revenue")}>
              <Plus className="h-4 w-4 mr-1" />
              Phiếu THU
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <SummaryCards />

        {/* Filter Bar */}
        <FilterBar />

        {/* Transaction Table */}
        <TransactionTable />
      </main>

      {/* Dialogs */}
      <HistoryDialog />
      <SettingDialog />
      <CreateVoucherDialog />
    </div>
  );
}