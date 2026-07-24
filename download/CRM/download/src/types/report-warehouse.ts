// ============================================
// Module 8 Part 6: Warehouse Report Types
// ============================================

import type {
  WarehouseReportView,
  WarehouseTransferStatus,
} from "@/lib/constants";

export type { WarehouseReportView, WarehouseTransferStatus };

// --- View 1: Inventory (Tồn kho) ---

export interface WarehouseInventoryRow {
  id: string;
  productCode: string;
  productName: string;
  openingStock: number;
  importedQty: number;
  exportedQty: number; // Xuất sử dụng (XS)
  soldQty: number; // Xuất bán (XB)
  transferOut: number;
  transferIn: number;
  closingStock: number;
}

export interface WarehouseInventorySummary {
  openingStock: number;
  importedQty: number;
  exportedUse: number;
  exportedSell: number;
  exportedTotal: number;
  transferOut: number;
  transferIn: number;
  closingStock: number;
}

export interface WarehouseInventoryResponse {
  items: WarehouseInventoryRow[];
  summary: WarehouseInventorySummary;
  total: number;
  page: number;
  limit: number;
}

// --- View 2: Movement (Nhập xuất kho) ---

export type WarehouseMovementAction =
  | "import"
  | "export-use"
  | "export-sell"
  | "export-return"
  | "export-destroy";

export interface WarehouseMovementRow {
  id: string;
  datetime: string;
  slipCode: string;
  createdBy: string;
  action: WarehouseMovementAction;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  price: number;
  content: string;
}

export interface WarehouseMovementResponse {
  items: WarehouseMovementRow[];
  total: number;
  page: number;
  limit: number;
}

// --- View 3: Transfer (Chuyển kho) ---

export interface WarehouseTransferRow {
  id: string;
  datetime: string;
  slipCode: string;
  createdBy: string;
  action: "transfer";
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  content: string;
  status: WarehouseTransferStatus;
}

export interface WarehouseTransferResponse {
  items: WarehouseTransferRow[];
  total: number;
  page: number;
  limit: number;
}

// --- Shared filter shape ---

export interface WarehouseReportFilters {
  view: WarehouseReportView;
  dateFrom: string; // DD/MM/YYYY
  dateTo: string; // DD/MM/YYYY
  categoryId: string;
  search: string;
  stockStatus: string;
  transferStatus: WarehouseTransferStatus;
  page: number;
  limit: number;
}
