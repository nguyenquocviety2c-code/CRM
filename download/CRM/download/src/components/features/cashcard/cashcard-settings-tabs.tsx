"use client";

import { cn } from "@/lib/utils";

interface CashcardSettingsTabsProps {
  activeTab: "bonus" | "other";
  onTabChange: (tab: "bonus" | "other") => void;
}

export function CashcardSettingsTabs({ activeTab, onTabChange }: CashcardSettingsTabsProps) {
  return (
    <div className="flex border-b border-gray-200">
      <button
        onClick={() => onTabChange("bonus")}
        className={cn(
          "px-4 py-2 text-sm font-medium transition-colors",
          activeTab === "bonus"
            ? "border-b-2 border-blue-600 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        Cài đặt bonus
      </button>
      <button
        onClick={() => onTabChange("other")}
        className={cn(
          "px-4 py-2 text-sm font-medium transition-colors",
          activeTab === "other"
            ? "border-b-2 border-blue-600 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        Khác
      </button>
    </div>
  );
}