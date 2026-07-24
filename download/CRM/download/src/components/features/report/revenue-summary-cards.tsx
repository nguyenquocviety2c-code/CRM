"use client";

interface SummaryCard {
  label: string;
  value: string;
}

interface RevenueSummaryCardsProps {
  cards: SummaryCard[];
}

export function RevenueSummaryCards({ cards }: RevenueSummaryCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}