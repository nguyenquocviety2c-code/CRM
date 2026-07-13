export interface ReceiptCategory {
  id: string;
  name: string;
  code: string | null;
}

export interface Receipt {
  id: string;
  code: string;
  categoryId: string;
  categoryName: string;
  datetime: string;
  createdBy: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  invoiceCode: string | null;
  branchId: string;
}

export interface ReceiptService {
  id: string;
  name: string;
  type: string;
  staffName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  total: number;
}

export interface ReceiptDetail {
  code: string;
  customerName: string;
  customerPhone: string;
  datetime: string;
  sequenceNumber: number;
  status: 'paid' | 'unpaid' | 'cancelled';
  services: ReceiptService[];
  images: string[];
  totalAmount: number;
  dueAmount: number;
  paidAmount: number;
  paymentDatetime: string;
}

export interface CreateReceiptInput {
  createdBy: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  reason: string;
  categoryId: string | null;
  code: string | null;
  date: string;
}