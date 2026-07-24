import { Transaction } from "@/types/cash-fund";

export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export function paginationRange(
  skip: number,
  take: number,
  total: number
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = skip + 1;
  const to = Math.min(skip + take, total);
  return { from, to };
}

export function filterTransactions(
  items: Transaction[],
  filters: {
    search?: string;
    filterType?: "all" | "revenue" | "expense";
    filterCategoryId?: string;
  }
): Transaction[] {
  return items.filter((t) => {
    if (filters.filterType && filters.filterType !== "all" && t.type !== filters.filterType)
      return false;
    if (
      filters.filterCategoryId &&
      filters.filterCategoryId !== "all" &&
      t.categoryId !== filters.filterCategoryId
    )
      return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      return (
        t.voucherCode.toLowerCase().includes(s) ||
        t.categoryName.toLowerCase().includes(s) ||
        t.createdBy.toLowerCase().includes(s)
      );
    }
    return true;
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number } {
  const total = items.length;
  const skip = (page - 1) * pageSize;
  const data = items.slice(skip, skip + pageSize);
  return { data, total };
}

export function computeSummary(
  transactions: Transaction[],
  openingBalance: number
): { totalRevenue: number; totalExpense: number; currentBalance: number } {
  const totalRevenue = transactions
    .filter((t) => t.type === "revenue")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const currentBalance = openingBalance + totalRevenue - totalExpense;
  return { totalRevenue, totalExpense, currentBalance };
}

export function generateVoucherCode(
  type: "revenue" | "expense",
  existingCodes: string[]
): string {
  const prefix = type === "revenue" ? "PT" : "PC";
  const maxNum = Math.max(
    0,
    ...existingCodes
      .filter((c) => c.startsWith(prefix))
      .map((c) => {
        const num = parseInt(c.replace(prefix, ""), 10);
        return isNaN(num) ? 0 : num;
      })
  );
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}

export function formatDate(
  datetime: string,
  format: "datetime" | "date"
): string {
  const d = new Date(datetime);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  if (format === "date") {
    return `${day}/${month}/${year}`;
  }
  return `${hours}:${minutes} ${day}/${month}/${year}`;
}