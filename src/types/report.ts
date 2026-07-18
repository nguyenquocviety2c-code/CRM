// ============================================
// Module 8: Report — Revenue Tab Types
// ============================================

export type RevenueViewMode = 'invoice' | 'payment-method' | 'service' | 'package' | 'sales';
export type TimeUnit = 'hour' | 'day' | 'month';

export interface ReportFilters {
  branchId: string;
  dateFrom: string; // DD/MM/YYYY
  dateTo: string;   // DD/MM/YYYY
}

// View 1: Hóa đơn
export interface InvoiceReport {
  id: string;
  stt: number;
  invoiceCode: string;       // "HD063788"
  createdAt: string;         // ISO datetime
  customerId: string;        // For opening the customer history dialog
  customerName: string;
  totalAmount: number;
  surcharge: number;         // Thưởng (tiền tip cho thợ)
  promotionName: string;     // Tên chương trình khuyến mãi áp dụng
  promotionDiscountValue: number; // % hoặc số tiền giảm
  promotionDiscountType: string;  // "percent" hoặc "amount"
  promotionDiscountAmount: number; // Số tiền thực tế promotion trừ (đ)
  discount: number;          // Tổng giảm giá của hóa đơn (đ) — fallback
  paidAmount: number;        // Đã thanh toán
}

// View 2: Phương thức thanh toán
export interface PaymentMethodReport {
  id: string;
  date: string;              // "DD/MM/YYYY"
  cash: number;              // Tiền mặt
  transfer: number;          // Chuyển khoản
  cardSwipe: number;         // Quẹt thẻ
  accountCard: number;       // Thẻ tài khoản
  loyaltyPoints: number;     // Điểm tích lũy
  other: number;             // Khác
  debt: number;              // Ghi nợ
  total: number;             // Tổng cộng = sum các method
}

// ============================================
// View 4: Dịch vụ
// ============================================
export interface ServiceRevenue {
  id: string;
  serviceName: string;
  categoryId: string;
  quantity: number;
  originalPrice: number;     // Đơn giá gốc
  totalAmount: number;       // = quantity × originalPrice
  discount: number;
  revenue: number;             // = totalAmount - discount
}

// ============================================
// View 5: Gói dịch vụ
// ============================================
export interface PackageRevenue {
  id: string;
  packageName: string;
  categoryId: string;
  saleType: string;            // "Bán mới" | "Gia hạn" | "Nâng cấp"
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  discount: number;
  revenue: number;
}

// ============================================
// View 6: Liệu trình
// ============================================
export interface TreatmentRevenue {
  id: string;
  treatmentName: string;
  treatmentVersion: string;    // "Bản 1" | "Bản 2"
  categoryId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  discount: number;
  revenue: number;
}

// ============================================
// Footer total (dùng cho View 4)
// ============================================
export interface CategoryRevenueTotal {
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  discount: number;
  revenue: number;
  orderCount?: number; // Optional: used by SalesRevenue view
}

// ============================================
// View 7: Bán hàng
// ============================================
export interface SalesRevenue {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  orderCount: number;
  unitPrice: number;
  totalAmount: number;
  discount: number;
  revenue: number;
}
