import { Debt, DebtInvoice, CreateDebtPaymentInput } from "@/types/debt";

// Re-export from cash-fund-utils.ts
export { formatVND, paginationRange, formatDate, paginate } from "@/lib/cash-fund-utils";

export function filterDebts(items: Debt[], search: string): Debt[] {
  if (!search.trim()) return items;
  const s = search.toLowerCase();
  return items.filter(
    (item) =>
      item.customerName.toLowerCase().includes(s) ||
      item.customerPhone.includes(s)
  );
}

export function generateDebtReceiptCode(existingCodes: string[]): string {
  const prefix = "PT";
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

export function validateCreateDebtPayment(
  input: CreateDebtPaymentInput,
  debt: Debt
): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!input.invoiceId.trim()) {
    errors.invoiceId = "Hóa đơn nợ không được để trống";
  }

  if (input.amount <= 0 || isNaN(input.amount)) {
    errors.amount = "Số tiền thu phải lớn hơn 0";
  } else if (input.amount > debt.totalAmount) {
    errors.amount = "Số tiền thu không được vượt quá tổng nợ";
  }

  if (!input.paymentDate.trim()) {
    errors.paymentDate = "Ngày thu không được để trống";
  } else {
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(input.paymentDate)) {
      errors.paymentDate = "Ngày thu không hợp lệ (DD/MM/YYYY)";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

export function getInvoicesByDebtId(
  invoices: DebtInvoice[],
  debtId: string
): DebtInvoice[] {
  return invoices.filter((inv) => inv.debtId === debtId);
}