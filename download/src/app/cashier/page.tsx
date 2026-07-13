"use client";

import { useState } from "react";
import Link from "next/link";
import { CustomerTabs } from "@/components/features/cashier/customer-tabs";
import { ServiceSelector } from "@/components/features/cashier/service-selector";
import { InvoiceSummary } from "@/components/features/cashier/invoice-summary";
import { BranchSelector } from "@/components/layout/branch-selector";
import { List, Calendar } from "lucide-react";

export default function CashierPage() {
  // Selected date for showing bookings in the cashier tab bar (default = today).
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Thu ngân</h1>
          {/* Date picker button (next to "Thu ngân" title, right side) */}
          <div className="relative inline-flex items-center">
            <Calendar className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-emerald-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-7 border bg-white py-0.5 pl-7 pr-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <BranchSelector />
          <Link
            href="/cashier/invoices"
            prefetch
            className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <List className="h-4 w-4" />
            Danh sách đơn hàng
          </Link>
        </div>
      </div>

      {/* Customer tabs (also shows the selected date's bookings) */}
      <CustomerTabs selectedDate={selectedDate} />

      {/* Main content */}
      <div className="flex flex-1 gap-4 overflow-hidden pb-4">
        {/* Left: Invoice summary */}
        <div className="flex w-[70%] flex-col overflow-hidden rounded-lg border bg-white">
          <InvoiceSummary selectedDate={selectedDate} />
        </div>

        {/* Right: Service selector */}
        <div className="flex w-[30%] flex-col overflow-hidden rounded-lg border bg-white">
          <ServiceSelector />
        </div>
      </div>
    </div>
  );
}
