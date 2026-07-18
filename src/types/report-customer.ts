// ============================================
// Module 8 Part 3: Customer Report Types
// ============================================

export type CustomerViewMode = "invoice" | "service" | "frequency" | "source";

export type CustomerType = "old" | "new" | "kol";

export type FrequencyUnit = "hour" | "day";

// --- View 1: Invoice ---
export interface CustomerInvoice {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  createdDate: string;
  customerType: CustomerType;
  invoiceCount: number;
  serviceCount: number;
  productCount: number;
  buyPackageCount: number;
  usePackageCount: number;
  cardCount: number;
  discount: number;
  payment: number;
  debt: number;
  debtPayment: number;
}

export interface CustomerInvoiceSummary {
  oldCount: number;
  oldRevenue: number;
  newCount: number;
  newRevenue: number;
  kolCount: number;
  kolRevenue: number;
  totalCount: number;
  totalRevenue: number;
}

// --- View 2: Service ---
export interface CustomerService {
  id: string;
  serviceName: string;
  usageCount: number;
  customerCount: number;
  totalUsage: number;
}

// --- View 3: Frequency ---
export interface CustomerFrequency {
  id: string;
  dayOfWeek: string;
  customerCount: number;
  revenue: number;
}

export interface CustomerFrequencyTotal {
  customerCount: number;
  revenue: number;
}

// --- View 4: Source ---
export interface CustomerSource {
  id: string;
  sourceName: string;
  customerCount: number;
  invoiceCount: number;
  packageCount: number;
  productCount: number;
  serviceCount: number;
  discount: number;
  revenue: number;
}
