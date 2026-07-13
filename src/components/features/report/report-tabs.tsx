"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const reportTabs = [
  { label: "DOANH THU", href: "/report/revenue" },
  { label: "NHÂN VIÊN", href: "/report/staff" },
  { label: "KHÁCH HÀNG", href: "/report/customer" },
  { label: "CÔNG NỢ", href: "/report/liabilities" },
  { label: "KHO HÀNG", href: "/report/warehouse" },
  { label: "GÓI DỊCH VỤ", href: "/report/service-package" },
];

export function ReportTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 border-b">
      <div className="flex flex-wrap gap-1">
        {reportTabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-t-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "border-b-2 border-emerald-500 text-emerald-600"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}