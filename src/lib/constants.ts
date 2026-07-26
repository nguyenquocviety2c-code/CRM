// Invoice Activity Action Types
export const InvoiceActivityAction = {
  CREATE_INVOICE: "CREATE_INVOICE",
  CREATE_INVOICE_FROM_BOOKING: "CREATE_INVOICE_FROM_BOOKING",
  UPDATE_INVOICE: "UPDATE_INVOICE",
  CHECKIN: "CHECKIN",
  NO_SHOW: "NO_SHOW",
  CANCEL: "CANCEL",
  PAYMENT: "PAYMENT",
  CHECKOUT: "CHECKOUT",
  DELETE_ITEM: "DELETE_ITEM",
  CHANGE_PRICE: "CHANGE_PRICE",
  ASSIGN_STAFF: "ASSIGN_STAFF",
  CHANGE_PROMOTION: "CHANGE_PROMOTION",
} as const;

export type InvoiceActivityActionType = (typeof InvoiceActivityAction)[keyof typeof InvoiceActivityAction];

export const InvoiceActivityActionLabel: Record<InvoiceActivityActionType, string> = {
  CREATE_INVOICE: "Khởi tạo",
  CREATE_INVOICE_FROM_BOOKING: "Khởi tạo",
  UPDATE_INVOICE: "Chỉnh sửa",
  CHECKIN: "Checkin",
  NO_SHOW: "Không đến",
  CANCEL: "Hủy",
  PAYMENT: "Thanh toán",
  CHECKOUT: "Hoàn tất",
  DELETE_ITEM: "Xóa mặt hàng",
  CHANGE_PRICE: "Thay đổi giá",
  ASSIGN_STAFF: "Xếp nhân viên",
  CHANGE_PROMOTION: "Thay đổi khuyến mãi",
};

// Action badge color mapping
export const ActionBadgeColors: Record<InvoiceActivityActionType, { bg: string; text: string }> = {
  CREATE_INVOICE: { bg: "bg-blue-100", text: "text-blue-700" },
  CREATE_INVOICE_FROM_BOOKING: { bg: "bg-blue-100", text: "text-blue-700" },
  UPDATE_INVOICE: { bg: "bg-amber-100", text: "text-amber-700" },
  CHECKIN: { bg: "bg-green-100", text: "text-green-700" },
  NO_SHOW: { bg: "bg-amber-100", text: "text-amber-700" },
  CANCEL: { bg: "bg-red-100", text: "text-red-700" },
  PAYMENT: { bg: "bg-emerald-100", text: "text-emerald-700" },
  CHECKOUT: { bg: "bg-purple-100", text: "text-purple-700" },
  DELETE_ITEM: { bg: "bg-red-100", text: "text-red-700" },
  CHANGE_PRICE: { bg: "bg-orange-100", text: "text-orange-700" },
  ASSIGN_STAFF: { bg: "bg-orange-100", text: "text-orange-700" },
  CHANGE_PROMOTION: { bg: "bg-orange-100", text: "text-orange-700" },
};

// Invoice status mapping
export const InvoiceStatus = {
  UNPAID: "unpaid",
  PARTIAL: "partial",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export type InvoiceStatusType = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const InvoiceStatusLabel: Record<InvoiceStatusType, string> = {
  unpaid: "Chưa thanh toán",
  partial: "Thanh toán một phần",
  paid: "Đã thanh toán",
  cancelled: "Đã hủy",
};

// Status badge colors
export const StatusBadgeColors: Record<string, { bg: string; text: string }> = {
  unpaid: { bg: "bg-amber-100", text: "text-amber-700" },
  partial: { bg: "bg-blue-100", text: "text-blue-700" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

// Staff assignment badge colors
export const StaffBadgeColors = {
  assigned: { bg: "bg-emerald-100", text: "text-emerald-700" },
  unassigned: { bg: "bg-gray-100", text: "text-gray-700" },
};

// ============================================
// Module 2: Booking Status
// ============================================

export const BookingStatus = {
  NEW: "new",
  CONFIRMED: "confirmed",
  CHECKIN: "checkin",
  CHECKOUT: "checkout",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
} as const;

export type BookingStatusType = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BookingStatusLabel: Record<BookingStatusType, string> = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  checkin: "Đã checkin",
  checkout: "Đã thanh toán",
  no_show: "Không đến",
  cancelled: "Đã hủy",
};

export const BookingStatusBadgeColors: Record<BookingStatusType, { bg: string; text: string }> = {
  new: { bg: "bg-blue-100", text: "text-blue-700" },
  confirmed: { bg: "bg-blue-100", text: "text-blue-700" },
  checkin: { bg: "bg-green-100", text: "text-green-700" },
  checkout: { bg: "bg-yellow-100", text: "text-yellow-700" },
  no_show: { bg: "bg-red-100", text: "text-red-700" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ============================================
// Module 5: Cash Card
// ============================================

export const CashcardStatus = {
  ACTIVE: "active",
  LOCKED: "locked",
  EXPIRED: "expired",
} as const;

export type CashcardStatusType = (typeof CashcardStatus)[keyof typeof CashcardStatus];

export const CashcardStatusLabel: Record<CashcardStatusType, string> = {
  active: "Đang sử dụng",
  locked: "Đã khóa",
  expired: "Hết hạn",
};

export const CashcardStatusBadgeColors: Record<CashcardStatusType, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700" },
  locked: { bg: "bg-orange-100", text: "text-orange-700" },
  expired: { bg: "bg-red-100", text: "text-red-700" },
};

export const TopupMethod = {
  CASH: "cash",
  TRANSFER: "transfer",
  CARD: "card",
} as const;

export type TopupMethodType = (typeof TopupMethod)[keyof typeof TopupMethod];

export const TopupMethodLabel: Record<TopupMethodType, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
};

// ============================================
// Module 4: Incentive Types
// ============================================

export const IncentiveType = {
  SERVICE_DISCOUNT: "SERVICE_DISCOUNT",
  PRODUCT_DISCOUNT: "PRODUCT_DISCOUNT",
  SERVICE_GIFT: "SERVICE_GIFT",
  PRODUCT_GIFT: "PRODUCT_GIFT",
} as const;

export type IncentiveTypeValue = (typeof IncentiveType)[keyof typeof IncentiveType];

export const IncentiveTypeLabel: Record<IncentiveTypeValue, string> = {
  SERVICE_DISCOUNT: "Giảm giá dịch vụ",
  PRODUCT_DISCOUNT: "Giảm giá sản phẩm",
  SERVICE_GIFT: "Tặng dịch vụ",
  PRODUCT_GIFT: "Tặng sản phẩm",
};

export const IncentiveApplyScope = {
  TIME_RANGE: "time_range",
  ALL_CUSTOMERS: "all_customers",
  MEMBERS_ONLY: "members_only",
} as const;

export type IncentiveApplyScopeValue = (typeof IncentiveApplyScope)[keyof typeof IncentiveApplyScope];

export const IncentiveApplyScopeLabel: Record<IncentiveApplyScopeValue, string> = {
  time_range: "Khoảng thời gian",
  all_customers: "Tất cả khách hàng",
  members_only: "Chỉ thành viên",
};

// ============================================
// Module 5: Cash Card Settings
// ============================================

export const ExpiryType = {
  FIXED: "FIXED",
  CUSTOM: "CUSTOM",
} as const;

export type ExpiryTypeValue = (typeof ExpiryType)[keyof typeof ExpiryType];

export const ExpiryTypeLabel: Record<ExpiryTypeValue, string> = {
  FIXED: "Hạn cố định",
  CUSTOM: "Hạn tùy chỉnh",
};

export const ExpiryUnit = {
  MONTH: "MONTH",
  YEAR: "YEAR",
} as const;

export type ExpiryUnitValue = (typeof ExpiryUnit)[keyof typeof ExpiryUnit];

export const ExpiryUnitLabel: Record<ExpiryUnitValue, string> = {
  MONTH: "Tháng",
  YEAR: "Năm",
};

export const BonusType = {
  VND: "VND",
  PERCENT: "PERCENT",
} as const;

export type BonusTypeValue = (typeof BonusType)[keyof typeof BonusType];

export const BonusTypeLabel: Record<BonusTypeValue, string> = {
  VND: "VND (số tiền)",
  PERCENT: "PERCENT (%)",
};

// ============================================
// Module 6: Service Cost Type
// ============================================

export const ServiceCostType = {
  VND: "VND",
  PERCENT: "PERCENT",
} as const;

export type ServiceCostTypeValue = (typeof ServiceCostType)[keyof typeof ServiceCostType];

export const ServiceCostTypeLabel: Record<ServiceCostTypeValue, string> = {
  VND: "VND",
  PERCENT: "%",
};

// ============================================
// Module 6: Product Units
// ============================================

export const ProductUnit = {
  CHAI: "Chai",
  LO: "Lọ",
  GOI: "Gói",
  HOP: "Hộp",
  TUYP: "Tuýp",
  CAY: "Cây",
  MIENG: "Miếng",
  ONG: "Ống",
  BICH: "Bịch",
  CHIEC: "Chiếc",
  BO: "Bộ",
  CAP: "Cặp",
  DOI: "Đôi",
  KHAC: "Khác",
} as const;

export type ProductUnitValue = (typeof ProductUnit)[keyof typeof ProductUnit];

export const ProductUnitLabel: Record<ProductUnitValue, string> = {
  Chai: "Chai",
  Lọ: "Lọ",
  Gói: "Gói",
  Hộp: "Hộp",
  Tuýp: "Tuýp",
  Cây: "Cây",
  Miếng: "Miếng",
  Ống: "Ống",
  Bịch: "Bịch",
  Chiếc: "Chiếc",
  Bộ: "Bộ",
  Cặp: "Cặp",
  Đôi: "Đôi",
  Khác: "Khác",
};

export const ProductVolumeUnit = {
  ML: "ml",
  GR: "gr",
  L: "L",
} as const;

export type ProductVolumeUnitValue = (typeof ProductVolumeUnit)[keyof typeof ProductVolumeUnit];

export const ProductVolumeUnitLabel: Record<ProductVolumeUnitValue, string> = {
  ml: "ml",
  gr: "gr",
  L: "L",
};

// ============================================
// Module 8: Revenue Report View Modes
// ============================================

export const RevenueViewModeLabel: Record<string, string> = {
  invoice: "Hóa đơn",
  "payment-method": "Phương thức thanh toán",
  "time-statistic": "Thống kê theo thời gian",
  service: "Dịch vụ",
  package: "Gói dịch vụ",
  treatment: "Liệu trình",
};

export const SaleTypeOptions = ["Tất cả", "Bán mới", "Gia hạn", "Nâng cấp"];
export const TreatmentVersionOptions = ["Tất cả", "Bản 1", "Bản 2", "Bản 3"];
export const TreatmentCategoryOptions = ["Tất cả", "Nhóm 1", "Nhóm 2"];

// ============================================
// Module 8 Part 2: Staff Report View Modes
// ============================================

export const StaffViewModeLabel: Record<string, string> = {
  commission: "Hoa hồng",
  productivity: "Năng suất làm việc",
  rating: "Đánh giá khách hàng",
  revenue: "Doanh thu",
};

export const StaffGroupOptions = ["Tất cả nhóm nhân viên", "Master", "Senior", "Junior"];
export const RatingSubTypeOptions = ["Điểm đánh giá", "Phản hồi của khách"];

// ============================================
// Module 8 Part 3: Customer Report View Modes
// ============================================

export const CustomerViewModeLabel: Record<string, string> = {
  invoice: "Hóa đơn",
  service: "Dịch vụ",
  frequency: "Tần suất",
  source: "Nguồn khách",
};

// ============================================
// Module 8 | Part 4: Liabilities Report View Modes
// ============================================

export const LiabilitiesViewModeLabel: Record<string, string> = {
  transaction: "Giao dịch",
  customer: "Khách hàng",
};

export const DebtTypeOptions = [
  { value: "all", label: "Tất cả" },
  { value: "debt", label: "Nợ" },
  { value: "payment", label: "Trả nợ" },
];

export const CustomerTypeFilterOptions = ["Khách cũ", "Khách mới", "KOL/KOC"];
export const CustomerGroupFilterOptions = ["Tất cả khách hàng", "Khách quen", "Khách mới", "Khách VIP"];
export const StaffOptions = ["Chọn nhân viên", "Tất cả", "Đoàn Anh Tuấn", "Nguyễn Thế Hải", "Khương Phú Phương"];
export const ServiceGroupOptions = ["Chọn nhóm dịch vụ", "Tất cả", "Cắt tóc", "Uốn", "Nhuộm"];

// ============================================
// Module 8 Part 5: Revenue/Expense (THU CHI) Report
// ============================================

export const RevexpViewModeLabel: Record<string, string> = {
  all: "Tất cả",
  revenue: "THU",
  expense: "CHI",
};

export const PaymentMethodOptions = [
  { value: "all", label: "Tất cả" },
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
  { value: "card", label: "Thẻ" },
  { value: "wallet", label: "Ví điện tử" },
];

// ============================================
// Module 6: Warehouse
// ============================================

export enum WarehouseTab {
  AVAILABLE = "available",
  IMPORT = "import",
  EXPORT = "export",
  TRANSFER = "transfer",
}

export const WarehouseTabLabel: Record<string, string> = {
  available: "Sản có",
  import: "Nhập kho",
  export: "Xuất kho",
  transfer: "Đang chuyển kho",
};

export enum ExportType {
  USE = "use",
  RETURN = "return",
  DESTROY = "destroy",
}

export const ExportTypeLabel: Record<string, string> = {
  use: "Xuất sử dụng",
  return: "Trả hàng nhập",
  destroy: "Xuất hủy",
};

export enum SlipStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export const SlipStatusLabel: Record<string, string> = {
  pending: "Đang chờ",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

// ============================================
// Module 8 Part 6: Warehouse Report View Modes
// ============================================

export type WarehouseReportView = "inventory" | "movement" | "transfer";

export const WarehouseReportViewLabel: Record<WarehouseReportView, string> = {
  inventory: "Tồn kho",
  movement: "Nhập xuất kho",
  transfer: "Chuyển kho",
};

export type WarehouseTransferStatus = "completed" | "pending";

export const WarehouseTransferStatusLabel: Record<WarehouseTransferStatus, string> = {
  completed: "Hoàn thành",
  pending: "Đang chuyển",
};

// "Tình trạng sản phẩm" filter options. The "all" value is labeled with the
// field name so the dropdown shows "Tình trạng sản phẩm" by default (matching
// the reference design).
export const WarehouseStockStatusOptions = [
  { value: "all", label: "Tình trạng sản phẩm" },
  { value: "in-stock", label: "Còn hàng" },
  { value: "out-of-stock", label: "Hết hàng" },
  { value: "low-stock", label: "Sắp hết" },
];

// ============================================
// Module 8 Part 7: Cash Card Report View Modes
// ============================================

export type CashcardReportView = "usage" | "topup";

export const CashcardReportViewLabel: Record<CashcardReportView, string> = {
  usage: "Lịch sử sử dụng",
  topup: "Lịch sử nạp thẻ",
};

// "Loại thanh toán" filter for the usage view. The "all" value is labeled with
// the field name so the dropdown shows "Loại thanh toán" by default.
export const CashcardPaymentTypeOptions = [
  { value: "all", label: "Loại thanh toán" },
  { value: "invoice", label: "Thanh toán hóa đơn" },
  { value: "debt", label: "Thanh toán nợ" },
];

export const CashcardUsageTypeLabel: Record<string, string> = {
  invoice: "Thanh toán hóa đơn",
  debt: "Thanh toán nợ",
};

export const CashcardUsageTypeBadgeColors: Record<string, { bg: string; text: string }> = {
  invoice: { bg: "bg-emerald-100", text: "text-emerald-700" },
  debt: { bg: "bg-amber-100", text: "text-amber-700" },
};

// ============================================
// Module 8 Part 8: Service Package Report View Modes
// ============================================

export type ServicePackageReportView = "purchased" | "usage";

export const ServicePackageReportViewLabel: Record<ServicePackageReportView, string> = {
  purchased: "Gói đã mua",
  usage: "Lịch sử dùng gói",
};

// CustomerPackage status labels & badge colors
export const CustomerPackageStatus = {
  ACTIVE: "active",
  EXPIRED: "expired",
  USED_UP: "used_up",
} as const;

export const CustomerPackageStatusLabel: Record<string, string> = {
  active: "Đang sử dụng",
  expired: "Hết hạn",
  used_up: "Đã dùng hết",
};

export const CustomerPackageStatusBadgeColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700" },
  expired: { bg: "bg-red-100", text: "text-red-700" },
  used_up: { bg: "bg-gray-100", text: "text-gray-700" },
};

// ============================================
// Module 10: Worker Manager — Attendance
// ============================================

export type AttendanceViewMode = "custom" | "overview";

export const AttendanceViewModeLabel: Record<AttendanceViewMode, string> = {
  custom: "Tùy chỉnh",
  overview: "Tổng quan",
};

export type AttendancePeriodMode = "day" | "week" | "month";

export const AttendancePeriodModeLabel: Record<AttendancePeriodMode, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
};

// Attendance status values (matches schema `Attendance.status`)
export const AttendanceStatus = {
  ON_TIME: "onTime",
  LATE: "late",
  EARLY: "early",
  MISSING: "missing",
  ABSENT: "absent",
} as const;

export const AttendanceStatusLabel: Record<string, string> = {
  onTime: "Đúng giờ",
  late: "Đi trễ",
  early: "Về sớm",
  missing: "Chưa chấm công",
  absent: "Nghỉ làm",
};

// Cell colors for the weekly grid (custom view)
export const AttendanceStatusCellColors: Record<
  string,
  { bg: string; text: string }
> = {
  onTime: { bg: "bg-emerald-50", text: "text-emerald-700" },
  late: { bg: "bg-red-50", text: "text-red-700" },
  early: { bg: "bg-red-50", text: "text-red-700" },
  missing: { bg: "bg-purple-50", text: "text-purple-700" },
  absent: { bg: "bg-gray-100", text: "text-gray-600" },
};

// Legend dot colors (top-right of table / next to period header)
export const AttendanceLegendDotColors: Record<string, string> = {
  onTime: "bg-emerald-500",
  late: "bg-red-500",
  early: "bg-red-500",
  missing: "bg-purple-500",
  partial: "bg-yellow-500",
  absent: "bg-gray-400",
};

// Status filter dropdown options for "Trạng thái"
export const AttendanceStatusFilterOptions = [
  { value: "all", label: "Trạng thái" },
  { value: "onTime", label: "Đúng giờ" },
  { value: "late", label: "Đi trễ" },
  { value: "early", label: "Về sớm" },
  { value: "missing", label: "Chưa chấm công" },
  { value: "absent", label: "Nghỉ làm" },
];

