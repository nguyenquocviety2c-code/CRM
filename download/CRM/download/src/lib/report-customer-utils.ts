import {
  CustomerInvoice,
  CustomerInvoiceSummary,
  CustomerFrequency,
  CustomerFrequencyTotal,
  CustomerType,
} from "@/types/report-customer";

// Re-export from cash-fund-utils
export {
  formatVND,
  paginationRange,
  formatDate,
  paginate,
} from "@/lib/cash-fund-utils";

// ============================================
// 1. computeInvoiceSummary
// ============================================
export function computeInvoiceSummary(
  items: CustomerInvoice[]
): CustomerInvoiceSummary {
  let oldCount = 0;
  let oldRevenue = 0;
  let newCount = 0;
  let newRevenue = 0;
  let kolCount = 0;
  let kolRevenue = 0;

  for (const item of items) {
    switch (item.customerType) {
      case "old":
        oldCount += 1;
        oldRevenue += item.payment;
        break;
      case "new":
        newCount += 1;
        newRevenue += item.payment;
        break;
      case "kol":
        kolCount += 1;
        kolRevenue += item.payment;
        break;
    }
  }

  return {
    oldCount,
    oldRevenue,
    newCount,
    newRevenue,
    kolCount,
    kolRevenue,
    totalCount: oldCount + newCount + kolCount,
    totalRevenue: oldRevenue + newRevenue + kolRevenue,
  };
}

// ============================================
// 2. filterCustomerByName (generic)
// ============================================
export function filterCustomerByName<T extends { customerName: string }>(
  items: T[],
  search: string
): T[] {
  const trimmed = search.trim();
  if (!trimmed) return items;
  const lower = trimmed.toLowerCase();
  return items.filter((item) =>
    item.customerName.toLowerCase().includes(lower)
  );
}

// ============================================
// 3. filterByCustomerType
// ============================================
export function filterByCustomerType(
  items: CustomerInvoice[],
  type: CustomerType | "all"
): CustomerInvoice[] {
  if (type === "all") return items;
  return items.filter((item) => item.customerType === type);
}

// ============================================
// 4. computeFrequencyTotal
// ============================================
export function computeFrequencyTotal(
  items: CustomerFrequency[]
): CustomerFrequencyTotal {
  return items.reduce(
    (acc, item) => ({
      customerCount: acc.customerCount + item.customerCount,
      revenue: acc.revenue + item.revenue,
    }),
    { customerCount: 0, revenue: 0 }
  );
}

// ============================================
// 5. getChartData
// ============================================
export function getChartData(
  items: CustomerFrequency[]
): { day: string; customers: number; revenue: number }[] {
  return items.map((item) => ({
    day: item.dayOfWeek,
    customers: item.customerCount,
    revenue: item.revenue,
  }));
}
