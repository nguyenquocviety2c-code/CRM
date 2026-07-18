// ============================================
// Module 8 Part 8: Service Package Report Types
// ============================================

import type { ServicePackageReportView } from "@/lib/constants";

export type { ServicePackageReportView };

// --- View 1: Gói đã mua (Purchased packages) ---

export interface PurchasedPackageRow {
  id: string;
  customerId: string;
  customerName: string;
  packageName: string;
  status: string; // active | expired | used_up
  purchaseDate: string;
  expiryDate: string;
  lastUsedDate: string;
  totalUses: number;
  usedCount: number;
  remaining: number;
}

export interface PurchasedPackageResponse {
  items: PurchasedPackageRow[];
  total: number;
  page: number;
  limit: number;
}

// --- View 2: Lịch sử dùng gói (Package usage history) ---

export interface PackageUsageRow {
  id: string;
  packageName: string;
  customerId: string;
  customerName: string;
  useDate: string;
  quantity: number;
  invoiceCode: string;
  /** Supabase invoice id — used to open the full-page PaidInvoiceView when
   *  the user clicks the invoice code in the report. Empty string when the
   *  usage row has no linked invoice (legacy / manual entries). */
  invoiceId?: string;
  staffName: string;
}

export interface PackageUsageSummary {
  totalPackages: number; // distinct packages used
  totalUses: number; // sum of quantity
  totalCustomers: number; // distinct customers
}

export interface PackageUsageResponse {
  items: PackageUsageRow[];
  summary: PackageUsageSummary;
  total: number;
  page: number;
  limit: number;
}

// --- Shared filter shape ---

export interface ServicePackageReportFilters {
  view: ServicePackageReportView;
  customerSearch: string; // "Tìm tên, sdt khách hàng"
  categoryId: string; // "Chọn nhóm"
  packageSearch: string; // "Tìm gói dịch vụ" (usage view only)
  page: number;
  limit: number;
}
