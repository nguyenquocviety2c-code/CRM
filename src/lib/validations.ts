import { z } from "zod";

export const phoneRegex = /^[0-9]{10,11}$/;

export const customerSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  name: z.string().min(1, "Họ tên không được để trống"),
  phone: z.string().regex(phoneRegex, "Số điện thoại không hợp lệ"),
  email: z.string().email("Email không hợp lệ").optional().or(z.literal("")),
  gender: z.enum(["male", "female"]).optional(),
  birthday: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  receiveNotification: z.enum(["email", "sms", "none"]).optional(),
  profileCreatedAt: z.string().optional(),
  sourceId: z.string().optional(),
  groupId: z.string().optional(),
  referrerId: z.string().optional(),
  isRegular: z.boolean().optional(),
});

export const productSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Mã sản phẩm không được để trống"),
  name: z.string().min(1, "Tên sản phẩm không được để trống"),
  categoryId: z.string().min(1, "Vui lòng chọn nhóm sản phẩm"),
  price: z.number().min(0, "Giá bán không được âm"),
  initialStock: z.number().min(0, "Tồn kho không được âm").optional(),
  unit: z.string().optional(),
  volume: z.number().min(0, "Dung tích không được âm").optional().or(z.nan().transform(() => undefined)),
  volumeUnit: z.string().optional(),
  origin: z.string().optional(),
  branchId: z.string().min(1, "Vui lòng chọn chi nhánh"),
  detail: z.string().optional(),
  showOnApp: z.boolean().optional(),
  productType: z.enum(["trading", "consumption"]).optional().or(z.string().transform((v) => v as "trading" | "consumption")),
});

export const productCategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Tên loại không được để trống"),
});

export const serviceSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Mã dịch vụ không được để trống").optional(),
  name: z.string().min(1, "Tên dịch vụ không được để trống"),
  categoryId: z.string().min(1, "Vui lòng chọn nhóm dịch vụ"),
  price: z.number().min(0, "Giá không được âm"),
  cost: z.number().min(0, "Chi phí không được âm").optional().default(0),
  costType: z.enum(["VND", "PERCENT"]).optional().default("VND"),
  subPrices: z.array(
    z.object({
      label: z.string().min(1, "Tên giá phụ không được để trống"),
      price: z.number().min(0, "Giá phụ không được âm"),
    })
  ).optional().default([]),
  duration: z.number().min(0, "Thời gian không được âm").optional().default(60),
  branchId: z.string().optional().default(""),
  attachedProducts: z.array(
    z.object({
      productId: z.string().min(1, "Vui lòng chọn sản phẩm"),
    })
  ).optional().default([]),
  allowBooking: z.boolean().optional().default(true),
  showOnApp: z.boolean().optional().default(true),
});

export const packageSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Mã gói không được để tr_fetch"),
  name: z.string().min(1, "Tên gói không được để trống"),
  totalPrice: z.number().min(0, "Giá không được âm"),
  discountPrice: z.number().min(0, "Giá khuyến mãi không được âm"),
  categoryId: z.string().optional(),
});

export const bookingServiceEntrySchema = z.object({
  serviceCategoryId: z.string().min(1, "Vui lòng chọn nhóm dịch vụ"),
  serviceId: z.string().min(1, "Vui lòng chọn dịch vụ"),
  // staffId is optional at the schema level: staff without the `assign_staff`
  // permission book services without a specific employee. The booking dialog
  // enforces staffId presence at submit time when the logged-in user DOES
  // have the permission (see BookingDialog onValidSubmit).
  staffId: z.string().optional(),
  showNote: z.boolean(),
  // date/time are NOT user-edited per service anymore — they are derived from
  // the booking-level start (date + time) and each preceding service's
  // duration so services run consecutively. Kept in the schema (optional) so
  // the submit logic can populate them before sending.
  date: z.string().optional(),
  time: z.string().optional(),
  // Multi-customer mode (numberOfCustomers >= 2): per-slot customer info.
  // Each service row ("customer slot") carries its own phone/name so a
  // distinct customer_id can be resolved at submit time. When
  // numberOfCustomers === 1 these stay empty and the booking-level
  // customerId is used (the original single-customer flow).
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
  customerId: z.string().optional(), // resolved at submit
});

export const bookingSchema = z.object({
  id: z.string().optional(),
  // customerId may be empty for walk-in bookings (customer source = "Khách vãng lai");
  // a guest record is created on submit instead.
  customerId: z.string().optional(),
  customerSourceId: z.string().optional(),
  customerChannelId: z.string().optional(),
  numberOfCustomers: z.number().min(1, "Số khách phải >= 1"),
  status: z.enum(["new", "confirmed", "checkin", "checkout", "no_show", "cancelled"]),
  note: z.string().optional(),
  // Booking-level start date/time (dd/MM/yyyy / HH:mm). The first service
  // starts here; subsequent services start consecutively after the previous
  // service's duration.
  date: z.string().min(1, "Vui lòng chọn ngày"),
  time: z.string().min(1, "Vui lòng chọn giờ"),
  services: z.array(bookingServiceEntrySchema).min(1, "Phải có ít nhất 1 dịch vụ"),
});

export const invoiceItemSchema = z.object({
  productId: z.string().optional(),
  serviceId: z.string().optional(),
  packageId: z.string().optional(),
  name: z.string(),
  quantity: z.number().min(1),
  price: z.number().min(0),
  discount: z.number().min(0),
  total: z.number().min(0),
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  branchId: z.string().min(1, "Vui lòng chọn chi nhánh"),
  items: z.array(invoiceItemSchema).min(1, "Hóa đơn phải có ít nhất 1 mặt hàng"),
  discount: z.number().min(0),
  discountType: z.enum(["VND", "%"]),
  surcharge: z.number().min(0),
  vat: z.number().min(0),
  note: z.string().optional(),
});

export const transactionSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  category: z.string().min(1, "Vui lòng chọn danh mục"),
  amount: z.number().min(0, "Số tiền không được âm"),
  description: z.string().optional(),
  branchId: z.string().min(1, "Vui lòng chọn chi nhánh"),
});

export const attendanceSchema = z.object({
  userId: z.string(),
  date: z.string(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(["onTime", "late", "early", "missing", "absent"]),
  shiftId: z.string(),
});

export const settingSchema = z.object({
  section: z.string(),
  key: z.string(),
  value: z.string(),
});

export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

// ============================================
// Module 4: CSKH
// ============================================

export const customerSetConditionSchema = z.object({
  id: z.string().optional(),
  conditionType: z.string().min(1, "Vui lòng chọn điều kiện"),
  conditionValue: z.string().optional(),
  // Operator: "gt" (lớn hơn), "lt" (nhỏ hơn), "between" (trong khoảng).
  // Optional — some conditions (birthdayMonth, customerGroup) use equality.
  conditionOperator: z.string().optional(),
  // Second value for "between" (range) operator: conditionValue = from,
  // conditionValue2 = to. Optional otherwise.
  conditionValue2: z.string().optional(),
});

export const customerSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Tên không được để trống"),
  note: z.string().optional(),
  autoUpdate: z.boolean().optional(),
  // Color hex (e.g. "#3b82f6") for the customer-set badge/icon background.
  color: z.string().optional(),
  // Logo image URL (R2 public URL or base64 data URL) shown beside the name.
  logo: z.string().optional(),
  conditions: z.array(customerSetConditionSchema).optional(),
});

export const customerFeedbackSchema = z.object({
  id: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  content: z.string().optional(),
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  serviceId: z.string().min(1, "Vui lòng chọn dịch vụ"),
});

// ============================================
// Module 4: Incentives
// ============================================

export const incentiveSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  name: z.string().min(1, "Tên khuyến mãi không được để trống"),
  applyScope: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  branchIds: z.array(z.string()).optional(),
  discountType: z.string().optional(),
  serviceIds: z.array(z.string()).min(1, "Vui lòng chọn dịch vụ"),
  discountValue: z.number().min(0, "Giảm Rockies không được âm"),
  usageLimit: z.number().int().min(1).optional(),
  autoApplyTarget: z.string().optional(),
});

// ============================================
// Module 5: Cash Card
// ============================================

export const cashcardCreateSchema = z.object({
  code: z.string().min(1, "Mã thẻ không được để trống"),
  customerId: z.string().min(1, "Vui lòng chọn chủ sở hữu"),
  coOwnerId: z.string().optional(),
  expiryDate: z.string().min(1, "Vui lòng chọn hạn dùng"),
});

export const cashcardUpdateSchema = z.object({
  code: z.string().optional(),
  customerId: z.string().optional(),
  coOwnerId: z.string().optional(),
  expiryDate: z.string().optional(),
});

export const cashcardExtendSchema = z.object({
  newExpiryDate: z.string().min(1, "Vui lòng chọn ngày gia hạn"),
  note: z.string().optional(),
});

export const cashcardLockSchema = z.object({
  lockedUntil: z.string().min(1, "Vui lòng chọn ngày khóa thẻ"),
  note: z.string().optional(),
});

export const cashcardTopupSchema = z.object({
  method: z.enum(["cash", "transfer", "card"]),
  amount: z.number().min(0, "Số tiền phải >= 0"),
  bonus: z.number().min(0, "Tiền thưởng phải >= 0"),
  topupDate: z.string().min(1, "Vui lòng chọn ngày nạp"),
  topupCode: z.string().optional(),
  recordedById: z.string().optional(),
  note: z.string().optional(),
});

// ============================================
// Module 5: Cash Card Settings
// ============================================

export const bonusSchema = z.object({
  id: z.string().optional(),
  minTopupAmount: z.number().min(0, "Số tiền phải >= 0"),
  bonusValue: z.number().min(0, "Bonus phải >= 0"),
  bonusType: z.enum(["VND", "PERCENT"]),
});

export const cardExpirySchema = z.object({
  expiryType: z.enum(["FIXED", "CUSTOM"]),
  expiryValue: z.number().int().min(1, "Thời gian phải >= 1"),
  expiryUnit: z.enum(["MONTH", "YEAR"]),
});

// ============================================
// Module 6: Warehouse
// ============================================

export const slipProductSchema = z.object({
  productId: z.string().min(1, "Vui lòng chọn sản phẩm"),
  quantity: z.number().int().min(1, "Số lượng phải >= 1"),
});

export const transferSlipSchema = z.object({
  id: z.string().optional(),
  createdByEmail: z.string().email("Email không hợp lệ"),
  code: z.string().optional(),
  transferDate: z.string().min(1, "Vui lòng chọn ngày chuyển kho"),
  fromBranchId: z.string().min(1, "Vui lòng chọn chi nhánh chuyển từ"),
  toBranchId: z.string().min(1, "Vui lòng chọn chi nhánh chuyển tới"),
  note: z.string().optional(),
  products: z.array(slipProductSchema).min(1, "Phải có ít nhất 1 sản phẩm"),
});

export const exportSlipSchema = z.object({
  id: z.string().optional(),
  createdByEmail: z.string().email("Email không hợp lệ"),
  code: z.string().optional(),
  exportDate: z.string().min(1, "Vui lòng chọn ngày xuất"),
  note: z.string().optional(),
  exportType: z.enum(["use", "return", "destroy"]),
  receiverId: z.string().optional(),
  products: z.array(slipProductSchema).min(1, "Phải có ít nhất 1 sản phẩm"),
});

export const importSlipSchema = z.object({
  id: z.string().optional(),
  createdByEmail: z.string().email("Email không hợp lệ"),
  code: z.string().optional(),
  importDate: z.string().min(1, "Vui lòng chọn ngày nhập"),
  note: z.string().optional(),
  supplierId: z.string().optional(),
  isPaid: z.boolean().default(false),
  products: z.array(slipProductSchema).min(1, "Phải có ít nhất 1 sản phẩm"),
});

export const warehouseSettingsSchema = z.object({
  enableOutOfStockAlert: z.boolean(),
  outOfStockThreshold: z.number().int().min(0),
  enableLowStockAlert: z.boolean(),
  lowStockThreshold: z.number().int().min(0),
});

export const payDebtSchema = z.object({
  createdByEmail: z.string().email("Email không hợp lệ"),
  supplierId: z.string().min(1, "Vui lòng chọn nhà cung cấp"),
  paymentMethod: z.enum(["cash", "transfer", "card"]),
  paymentType: z.enum(["auto", "manual"]),
  amount: z.number().min(0, "Số tiền phải >= 0"),
  code: z.string().optional(),
  paymentDate: z.string().min(1, "Vui lòng chọn ngày thanh toán"),
  note: z.string().optional(),
  importSlipId: z.string().optional(),
});
