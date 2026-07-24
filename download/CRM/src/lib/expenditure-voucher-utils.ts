import { Expenditure, CreateExpenditureInput } from "@/types/expenditure-voucher";

// Re-export from cash-fund-utils.ts
export { formatVND, paginationRange, formatDate, paginate } from "@/lib/cash-fund-utils";

// Re-export validateCategoryName from revenue-voucher-utils.ts
export { validateCategoryName } from "@/lib/revenue-voucher-utils";

export function filterExpenditures(items: Expenditure[], search: string): Expenditure[] {
  if (!search.trim()) return items;
  const s = search.toLowerCase();
  return items.filter(
    (item) =>
      item.code.toLowerCase().includes(s) ||
      item.categoryName.toLowerCase().includes(s) ||
      item.createdBy.toLowerCase().includes(s)
  );
}

export function generateExpenditureCode(existingCodes: string[]): string {
  const prefix = "PC";
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

export function validateCreateExpenditure(
  input: CreateExpenditureInput
): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!input.createdBy.trim()) {
    errors.createdBy = "Người lập phiếu không được để trống";
  }
  if (input.amount <= 0 || isNaN(input.amount)) {
    errors.amount = "Số tiền phải lớn hơn 0";
  }
  if (!input.reason.trim()) {
    errors.reason = "Lý do tạo phiếu không được để trống";
  }
  if (!input.date.trim()) {
    errors.date = "Ngày tháng không được để trống";
  } else {
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(input.date)) {
      errors.date = "Ngày tháng không hợp lệ (DD/MM/YYYY)";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}