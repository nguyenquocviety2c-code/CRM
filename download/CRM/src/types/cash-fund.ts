export interface Transaction {
  id: string;
  voucherCode: string;
  type: "revenue" | "expense";
  categoryId: string;
  categoryName: string;
  amount: number;
  createdBy: string;
  createdAt: string;
  paymentMethod: "cash" | "transfer" | "card";
  reason: string;
  link?: string;
}

export interface CashFundSetting {
  branchId: string;
  openingBalance: number;
  carryForward: boolean;
}

export interface CashFundHistory {
  id: string;
  value: number;
  createdAt: string;
  createdBy: string;
  reason: string;
  mechanism: "manual" | "auto_carry_forward";
}

export interface Category {
  id: string;
  name: string;
  type: "revenue" | "expense" | "both";
}