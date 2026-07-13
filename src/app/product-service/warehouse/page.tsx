"use client";

import { useState } from "react";
import { WarehouseTabs } from "@/components/features/product-service/warehouse-tabs";
import { WarehouseTab } from "@/lib/constants";
import { WarehouseActions } from "@/components/features/product-service/warehouse-actions";
import { WarehouseAvailableTab } from "@/components/features/product-service/warehouse-available-tab";
import { WarehouseImportTab } from "@/components/features/product-service/warehouse-import-tab";
import { WarehouseExportTab } from "@/components/features/product-service/warehouse-export-tab";
import { WarehouseTransferTab } from "@/components/features/product-service/warehouse-transfer-tab";
import { TransferSlipDialog } from "@/components/features/product-service/transfer-slip-dialog";
import { ExportSlipDialog } from "@/components/features/product-service/export-slip-dialog";
import { ImportSlipDialog } from "@/components/features/product-service/import-slip-dialog";
import { WarehouseSettingsDialog } from "@/components/features/product-service/warehouse-settings-dialog";
import { PayDebtDialog } from "@/components/features/product-service/pay-debt-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<WarehouseTab>(WarehouseTab.AVAILABLE);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Dialog states
  const [transferOpen, setTransferOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payDebtOpen, setPayDebtOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kho hàng</h1>
        <div className="flex items-center gap-2">
          <BranchSelector />
          <WarehouseActions
            onOpenTransfer={() => setTransferOpen(true)}
            onOpenExport={() => setExportOpen(true)}
            onOpenImport={() => setImportOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </div>

      {/* Tabs */}
      <WarehouseTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === WarehouseTab.AVAILABLE && (
          <WarehouseAvailableTab
            search={search}
            categoryId={categoryId}
            onSearchChange={setSearch}
            onCategoryChange={setCategoryId}
          />
        )}
        {activeTab === WarehouseTab.IMPORT && (
          <WarehouseImportTab onOpenPayDebt={() => setPayDebtOpen(true)} />
        )}
        {activeTab === WarehouseTab.EXPORT && <WarehouseExportTab />}
        {activeTab === WarehouseTab.TRANSFER && <WarehouseTransferTab />}
      </div>

      {/* Dialogs */}
      <TransferSlipDialog open={transferOpen} onOpenChange={setTransferOpen} />
      <ExportSlipDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ImportSlipDialog open={importOpen} onOpenChange={setImportOpen} />
      <WarehouseSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PayDebtDialog open={payDebtOpen} onOpenChange={setPayDebtOpen} />
    </div>
  );
}