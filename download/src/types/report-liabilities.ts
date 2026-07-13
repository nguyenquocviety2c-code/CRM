// ---------------------------------------------------------------------------
// Types for Report / Tab CÔNG NỢ (Liabilities Report)
// ---------------------------------------------------------------------------

export type LiabilitiesViewMode = "transaction" | "customer";

export type DebtType = "debt" | "payment";

export type DebtTypeFilter = "all" | DebtType;

export interface DebtTransaction {
  id: string;
  type: DebtType;
  date: string; // ISO date string
  linkId: string; // e.g. appointment id or order id
  linkType: string; // e.g. "appointment", "order"
  customerId: string;
  customerName: string;
  customerPhone: string;
  initialDebt: number;
  amount: number;
  remainingDebt: number;
  note?: string;
  createdAt: string;
}

export interface DebtCustomer {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  initialDebt: number; // Nợ đầu kỳ
  debtIncurred: number; // Nợ phát sinh
  payment: number; // Trả nợ
  remainingDebt: number; // Nợ cuối kỳ
  transactionCount: number;
  lastTransactionDate: string;
}

export interface LiabilitiesSummary {
  initialDebt: number; // Nợ đầu kỳ
  debtIncurred: number; // Nợ phát sinh
  payment: number; // Trả nợ
  remainingDebt: number; // Nợ cuối kỳ
}
