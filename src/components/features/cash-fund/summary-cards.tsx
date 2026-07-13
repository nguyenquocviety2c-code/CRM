"use client";

import { useSummary } from "@/stores/cash-fund-store";
import { formatVND } from "@/lib/cash-fund-utils";

export function SummaryCards() {
  const { openingBalance, totalRevenue, totalExpense, currentBalance } = useSummary();

  const cards = [
    { label: "Quỹ đầu ngày", value: openingBalance, color: "bg-emerald-500" },
    { label: "Tổng thu", value: totalRevenue, color: "bg-sky-500" },
    { label: "Tổng chi", value: totalExpense, color: "bg-rose-500" },
    { label: "Quỹ hiện có", value: currentBalance, color: "bg-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.color} text-white rounded-lg p-4 flex flex-col items-center justify-center min-h-[100px]`}
        >
          <span className="text-sm font-medium opacity-90">{card.label}</span>
          <span className="text-2xl font-bold mt-1">{formatVND(card.value)}</span>
        </div>
      ))}
    </div>
  );
}