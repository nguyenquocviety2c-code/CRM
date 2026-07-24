import { DebtTransaction, DebtCustomer } from "@/types/report-liabilities";

// Re-export utilities from cash-fund-utils
export { formatVND, formatDate, paginate, paginationRange } from "./cash-fund-utils";

// ---------------------------------------------------------------------------
// Liabilities-specific utilities
// ---------------------------------------------------------------------------

export function filterDebtTransactions(
  transactions: DebtTransaction[],
  filters: {
    type?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }
): DebtTransaction[] {
  return transactions.filter((t) => {
    if (filters.type && filters.type !== "all" && t.type !== filters.type) return false;

    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match =
        t.customerName.toLowerCase().includes(s) ||
        t.customerPhone.includes(s) ||
        t.note?.toLowerCase().includes(s);
      if (!match) return false;
    }

    if (filters.startDate && t.date < filters.startDate) return false;
    if (filters.endDate && t.date > filters.endDate) return false;

    return true;
  });
}

export function filterDebtCustomers(
  customers: DebtCustomer[],
  filters: {
    search?: string;
  }
): DebtCustomer[] {
  if (!filters.search) return customers;

  const s = filters.search.toLowerCase();
  return customers.filter(
    (c) =>
      c.customerName.toLowerCase().includes(s) ||
      c.customerPhone.includes(s)
  );
}

export function sortDebtTransactions(
  transactions: DebtTransaction[],
  sortBy: "date" | "amount" = "date",
  sortOrder: "asc" | "desc" = "desc"
): DebtTransaction[] {
  const sorted = [...transactions];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "date") {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === "amount") {
      cmp = a.amount - b.amount;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function sortDebtCustomers(
  customers: DebtCustomer[],
  sortBy: "name" | "remainingDebt" = "remainingDebt",
  sortOrder: "asc" | "desc" = "desc"
): DebtCustomer[] {
  const sorted = [...customers];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") {
      cmp = a.customerName.localeCompare(b.customerName);
    } else if (sortBy === "remainingDebt") {
      cmp = a.remainingDebt - b.remainingDebt;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}
