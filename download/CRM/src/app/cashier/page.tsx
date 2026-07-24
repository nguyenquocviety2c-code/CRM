"use client";

import { useState } from "react";
import Link from "next/link";
import { format as fmtDate } from "date-fns";
import { CustomerTabs } from "@/components/features/cashier/customer-tabs";
import { ServiceSelector } from "@/components/features/cashier/service-selector";
import { InvoiceSummary } from "@/components/features/cashier/invoice-summary";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";

type DateNav = "today" | "tomorrow" | "7days";

function getDateRangeFromNav(nav: DateNav): { from: Date; to: Date } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const from = new Date(now);
  const to = new Date(now);

  switch (nav) {
    case "today":
      to.setHours(23, 59, 59, 999);
      break;
    case "tomorrow":
      from.setDate(from.getDate() + 1);
      to.setDate(to.getDate() + 1);
      to.setHours(23, 59, 59, 999);
      break;
    case "7days":
      to.setDate(to.getDate() + 7);
      to.setHours(23, 59, 59, 999);
      break;
  }

  return { from, to };
}

export default function CashierPage() {
  // Date navigation state — same model as Booking module.
  const [dateNav, setDateNav] = useState<DateNav>("today");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(
    getDateRangeFromNav("today")
  );

  const handleDateNavChange = (nav: DateNav) => {
    setDateNav(nav);
    setDateRange(getDateRangeFromNav(nav));
  };

  const handleDateRangeChange = (range: { from: Date; to: Date }) => {
    setDateRange(range);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Thu ngân</h1>
          {/* Date navigation — same UI as Booking module */}
          <div className="flex items-center gap-2">
            <Button
              variant={dateNav === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateNavChange("today")}
              className={dateNav === "today" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
            >
              Hôm nay
            </Button>
            <Button
              variant={dateNav === "tomorrow" ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateNavChange("tomorrow")}
              className={dateNav === "tomorrow" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
            >
              Ngày mai
            </Button>
            <Button
              variant={dateNav === "7days" ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateNavChange("7days")}
              className={dateNav === "7days" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
            >
              7 ngày
            </Button>
            <DateRangePicker
              size="sm"
              dateFrom={fmtDate(dateRange.from, "dd/MM/yyyy")}
              dateTo={fmtDate(dateRange.to, "dd/MM/yyyy")}
              lockEndBeforeStart
              onChange={(from, to) => {
                const [d1, m1, y1] = from.split("/").map(Number);
                const [d2, m2, y2] = to.split("/").map(Number);
                const f = new Date(y1, m1 - 1, d1);
                const t = new Date(y2, m2 - 1, d2);
                t.setHours(23, 59, 59, 999);
                handleDateRangeChange({ from: f, to: t });
              }}
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

      {/* Customer tabs (also shows the selected date range's bookings) */}
      <CustomerTabs dateRange={dateRange} />

      {/* Main content */}
      <div className="flex flex-1 gap-4 overflow-hidden pb-4">
        {/* Left: Invoice summary */}
        <div className="flex w-[70%] flex-col overflow-hidden rounded-lg border bg-white">
          <InvoiceSummary dateRange={dateRange} />
        </div>

        {/* Right: Service selector */}
        <div className="flex w-[30%] flex-col overflow-hidden rounded-lg border bg-white">
          <ServiceSelector />
        </div>
      </div>
    </div>
  );
}
