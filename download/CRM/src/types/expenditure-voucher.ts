export interface ExpenditureCategory {
  id: string;
  name: string;
  code: string | null;
}

export interface Expenditure {
  id: string;
  code: string;
  categoryId: string;
  categoryName: string;
  datetime: string;
  createdBy: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  branchId: string;
}

export interface CreateExpenditureInput {
  createdBy: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  reason: string;
  categoryId: string | null;
  code: string | null;
  date: string;
}