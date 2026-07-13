export interface Debt {
  id: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  invoiceIds: string[];
}

export interface DebtInvoice {
  id: string;
  debtId: string;
  invoiceCode: string;
  amount: number;
  datetime: string;
}

export interface CreateDebtPaymentInput {
  debtId: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  invoiceId: string;
  paymentDate: string;
  receiptCode: string | null;
  note: string;
  printReceipt: boolean;
}