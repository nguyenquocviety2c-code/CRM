"use client";

import { useRouter } from "next/navigation";
import { Users, MessageSquare, Gift } from "lucide-react";

type Tab = "customer-set" | "feedback" | "incentives";

const tabs = [
  { id: "customer-set" as Tab, label: "Tập khách hàng", icon: Users, href: "/customer-care" },
  { id: "feedback" as Tab, label: "Phản hồi dịch vụ", icon: MessageSquare, href: "/customer-care/feedback" },
  { id: "incentives" as Tab, label: "Chương trình khuyến mãi", icon: Gift, href: "/customer-care/incentives" },
];

interface CustomerCareTabsProps {
  activeTab: Tab;
}

export function CustomerCareTabs({ activeTab }: CustomerCareTabsProps) {
  const router = useRouter();

  return (
    <div className="border-b bg-white">
      <nav className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className={`relative flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-emerald-600 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}