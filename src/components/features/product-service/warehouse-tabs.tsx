"use client";

import { WarehouseTab, WarehouseTabLabel } from "@/lib/constants";

interface WarehouseTabsProps {
  activeTab: WarehouseTab;
  onTabChange: (tab: WarehouseTab) => void;
  transferCount?: number;
}

export function WarehouseTabs({ activeTab, onTabChange, transferCount = 0 }: WarehouseTabsProps) {
  const tabs = [
    { key: WarehouseTab.AVAILABLE, label: WarehouseTabLabel[WarehouseTab.AVAILABLE] },
    { key: WarehouseTab.IMPORT, label: WarehouseTabLabel[WarehouseTab.IMPORT] },
    { key: WarehouseTab.EXPORT, label: WarehouseTabLabel[WarehouseTab.EXPORT] },
    { key: WarehouseTab.TRANSFER, label: `${WarehouseTabLabel[WarehouseTab.TRANSFER]} (${transferCount})` },
  ];

  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key as WarehouseTab)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? "border-b-2 border-primary text-primary"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}