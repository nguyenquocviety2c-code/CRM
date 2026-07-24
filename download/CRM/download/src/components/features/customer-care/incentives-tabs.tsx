"use client";

type SubTab = "promotion" | "voucher";

interface IncentivesTabsProps {
  activeTab: SubTab;
  onTabChange: (tab: SubTab) => void;
}

export function IncentivesTabs({ activeTab, onTabChange }: IncentivesTabsProps) {
  const tabs: { id: SubTab; label: string }[] = [
    { id: "promotion", label: "Khuyến mãi" },
    { id: "voucher", label: "Voucher" },
  ];

  return (
    <div className="border-b bg-white">
      <nav className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-emerald-600 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}