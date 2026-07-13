import { InvoiceReport, PaymentMethodReport, ServiceRevenue, PackageRevenue, TreatmentRevenue, CategoryRevenueTotal, SalesRevenue } from "@/types/report";

// ============================================
// Re-export from cash-fund-utils.ts (reuse, do NOT copy)
// ============================================
export { formatVND, paginationRange, formatDate, paginate } from "@/lib/cash-fund-utils";

// ============================================
// New utility functions for report module
// ============================================

/**
 * Parse DD/MM/YYYY string to Date object
 */
export function parseDateString(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date to time label based on timeUnit
 * - 'hour': "HH:00"
 * - 'day': "DD/MM/YYYY"
 * - 'month': "MM/YYYY"
 */
export function formatTimeLabel(datetime: string, timeUnit: "hour" | "day" | "month"): string {
  const d = new Date(datetime);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());

  if (timeUnit == "hour") {
    return `${hours}:00`;
  }
  if (timeUnit == "month") {
    return `${month}/${year}`;
  }
  return `${day}/${month}/${year}`;
}

/**
 * Filter items by date range (inclusive)
 * dateField: property name containing date string in "DD/MM/YYYY" format
 */
export function filterByDateRange<T>(
  items: T[],
  dateFrom: string,
  dateTo: string,
  dateField: keyof T
): T[] {
  const fromDate = parseDateString(dateFrom);
  const toDate = parseDateString(dateTo);
  toDate.setHours(23, 59, 59, 999); // include full end day

  return items.filter((item) => {
    const itemDateStr = String(item[dateField]);
    const itemDate = parseDateString(itemDateStr);
    return itemDate >= fromDate && itemDate <= toDate;
  });
}

/**
 * Group items by time unit (hour/day/month)
 * Returns a Map where key is the timeLabel
 */
export function groupByTimeUnit<T>(
  items: T[],
  timeUnit: "hour" | "day" | "month",
  dateField: keyof T
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const dateStr = String(item[dateField]);
    const label = formatTimeLabel(dateStr, timeUnit);
    const existing = groups.get(label) || [];
    existing.push(item);
    groups.set(label, existing);
  }
  return groups;
}

/**
 * Compute summary for invoice view
 */
export function computeInvoiceSummary(invoices: InvoiceReport[]): {
  count: number;
  totalRevenue: number;
  totalPaid: number;
  totalDebt: number;
} {
  const count = invoices.length;
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalDebt = totalRevenue - totalPaid;
  return { count, totalRevenue, totalPaid, totalDebt };
}

/**
 * Compute summary for payment method view
 */
export function computePaymentMethodSummary(rows: PaymentMethodReport[]): {
  topMethod: { name: string; amount: number } | null;
  total: number;
  totalCash: number;
  totalTransfer: number;
} {
  if (rows.length === 0) {
    return { topMethod: null, total: 0, totalCash: 0, totalTransfer: 0 };
  }

  const methodNames: (keyof PaymentMethodReport)[] = [
    "cash",
    "transfer",
    "cardSwipe",
    "accountCard",
    "loyaltyPoints",
    "other",
    "debt",
  ];

  const methodTotals: Record<string, number> = {};
  for (const name of methodNames) {
    methodTotals[name] = rows.reduce((sum, row) => sum + (row[name] as number), 0);
  }

  let topMethodName = "";
  let topAmount = -1;
  for (const [name, amount] of Object.entries(methodTotals)) {
    if (amount > topAmount) {
      topAmount = amount;
      topMethodName = name;
    }
  }

  const methodLabels: Record<string, string> = {
    cash: "Tiền mặt",
    transfer: "Chuyển khoản",
    cardSwipe: "Quẹt thẻ",
    accountCard: "Thẻ tài khoản",
    loyaltyPoints: "Điểm tích lũy",
    other: "Khác",
    debt: "Ghi nợ",
  };

  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return {
    topMethod: topAmount > 0 ? { name: methodLabels[topMethodName] || topMethodName, amount: topAmount } : null,
    total,
    totalCash: methodTotals["cash"] || 0,
    totalTransfer: methodTotals["transfer"] || 0,
  };
}

// ============================================
// View 4-6: Service / Package / Treatment revenue utils
// ============================================

/**
 * Compute footer total for service revenue view
 */
export function computeServiceRevenueTotal(rows: ServiceRevenue[]): CategoryRevenueTotal {
  return {
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    unitPrice: rows.reduce((sum, row) => sum + row.originalPrice, 0),
    totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    discount: rows.reduce((sum, row) => sum + row.discount, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
  };
}

/**
 * Filter service revenue by category
 */
export function filterServiceRevenue(rows: ServiceRevenue[], categoryId: string): ServiceRevenue[] {
  if (categoryId === "all") return rows;
  return rows.filter((row) => row.categoryId === categoryId);
}

/**
 * Filter package revenue by sale type and category
 */
export function filterPackageRevenue(
  rows: PackageRevenue[],
  saleType: string,
  categoryId: string
): PackageRevenue[] {
  let result = [...rows];
  if (saleType !== "Tất cả") {
    result = result.filter((row) => row.saleType === saleType);
  }
  if (categoryId !== "all") {
    result = result.filter((row) => row.categoryId === categoryId);
  }
  return result;
}

/**
 * Filter treatment revenue by version and category
 */
export function filterTreatmentRevenue(
  rows: TreatmentRevenue[],
  version: string,
  categoryId: string
): TreatmentRevenue[] {
  let result = [...rows];
  if (version !== "Tất cả") {
    result = result.filter((row) => row.treatmentVersion === version);
  }
  if (categoryId !== "Tất cả") {
    result = result.filter((row) => row.categoryId === categoryId);
  }
  return result;
}

// ============================================
// View 7: Sales revenue utils
// ============================================

/**
 * Compute footer total for sales revenue view (View 7)
 */
export function computeSalesRevenueTotal(rows: SalesRevenue[]): CategoryRevenueTotal {
  return {
    quantity: rows.reduce((sum, r) => sum + r.quantity, 0),
    unitPrice: rows.reduce((sum, r) => sum + r.unitPrice, 0),
    totalAmount: rows.reduce((sum, r) => sum + r.totalAmount, 0),
    discount: rows.reduce((sum, r) => sum + r.discount, 0),
    revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
    orderCount: rows.reduce((sum, r) => sum + r.orderCount, 0),
  };
}