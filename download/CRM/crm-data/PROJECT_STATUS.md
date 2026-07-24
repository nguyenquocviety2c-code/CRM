# PROJECT STATUS — EasySalon CRM Clone

> Living document — cập nhật sau mỗi task hoàn thành.
> Giữ file này luôn đồng bộ để tránh mất ngữ cảnh.

## 📋 THÔNG TIN DỰ ÁN

| Thông tin | Giá trị |
|---|---|
| **Tên dự án** | EasySalon CRM Clone |
| **Workspace** | `E:\APP\crm-clone` |
| **Stack** | Next.js 16 + TypeScript 5 + Tailwind 4 + shadcn/ui (Radix, Nova) + Prisma + SQLite + Zustand + TanStack Query + NextAuth v4 |
| **Models** | Plan: DeepSeek V4 Pro (qua LiteLLM) · Act: Kimi K2.6 (qua LiteLLM) |
| **LiteLLM Proxy** | `http://localhost:4000` (4 NVIDIA NIM keys, rotation) |
| **Cline config** | `globalState.json` (planActSeparateModelsSetting: true) |
| **Rules** | Global Cline Rules (Code.md) |

## 🎯 MỤC TIÊU

Clone CRM EasySalon (https://my.easysalon.vn) với đầy đủ 11 module, 54 URL (53 ban đầu + 1 URL mới phát hiện /cashier/activity).

## 📊 TỔNG QUAN TIẾN ĐỘ

| Giai đoạn | Trạng thái | Tiến độ |
|---|---|---|
| **Giai đoạn 0: Crawl data** | ✅ XONG | 53/53 URL |
| **Giai đoạn 1: Foundation** | ✅ XONG | Task 1-4 |
| **Giai đoạn 2: Fix UI 11 module root** | ✅ XONG | 11/11 |
| **Giai đoạn 3: Implement 23 URL mới** | 🔄 ĐANG LÀM | 2/23 |
| **Giai đoạn 4: Functionality (CRUD)** | ⏳ CHỜ | 0/14 task |
| **Giai đoạn 5: Integration + Auth** | ⏳ CHỜ | 0/2 task |

**Tổng tiến độ**: ~57% (Module 1-4 + Module 5 phần 1, còn 43% sub-pages + functionality)

## 🏗️ CẤU TRÚC APP — 11 MODULE / 54 URL

### Module 1: Thu ngân (3 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 1 | /cashier | ✅ XONG | — | ⏳ | Trang chính, tabs + selector + footer |
| 2 | /cashier/invoices | ⏳ | ✅ XONG | ⏳ | Danh sách hóa đơn (11 columns, 4 filter buttons) |
| 3 | /cashier/activity | ⏳ | ✅ XONG | ⏳ | Lịch sử hoạt động trên hóa đơn (6 columns, 7 action badges) |

### Module 2: Lịch hẹn (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 4 | /booking | ✅ XONG | — | ⏳ | Calendar view — 2 views (Customer + Staff) + Dialog 2-column |

### Module 3: Khách hàng (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 5 | /customers | ✅ XONG (triệt để) | — | ⏳ | 7 columns + Dialog 14 fields + scrollbar |

### Module 4: CSKH (3 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 6 | /customer-care/customer-set | ✅ XONG (triệt để) | — | ⏳ | Bảng 2 cột + dialog 5 fields + dynamic conditions |
| 7 | /customer-care/customer-feedback | ✅ XONG (triệt để) | — | ⏳ | Bảng 4 cột + filter Đánh giá + empty state |
| 8 | /customer-care/incentives | ✅ XONG (triệt để) | — | ⏳ | 2 tabs (Khuyến mãi 8 cols + Voucher 9 cols) + Dialog 10 fields + scrollbar |

### Module 5: Thẻ tiền mặt (2 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 9 | /cashcard | ✅ XONG (triệt để) | — | ⏳ | 7 cols + 4 action dialogs (Tạo, Gia hạn, Khóa, Nạp) |
| 10 | /cashcard/settings | ⏳ | ⏳ NEW | ⏳ | Cài đặt thẻ (phần 2) |

### Module 6: Sản phẩm & Dịch vụ (7 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 11 | /product-service/product | ⏳ | — | ⏳ | CRUD product |
| 12 | /product-service/product-category | ⏳ | — | ⏳ | Danh mục product |
| 13 | /product-service/warehouse | ⏳ | — | ⏳ | Kho |
| 14 | /product-service/service | ⏳ | — | ⏳ | CRUD service |
| 15 | /product-service/service-category | ⏳ | — | ⏳ | Danh mục service |
| 16 | /product-service/package | ⏳ | — | ⏳ | CRUD package |
| 17 | /product-service/package-categories | ⏳ | — | ⏳ | Danh mục package |

### Module 7: Thu chi (6 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 18 | /rev-exp/cashbook | ⏳ | — | ⏳ | Sổ quỹ |
| 19 | /rev-exp/revenue | ⏳ | — | ⏳ | Doanh thu |
| 20 | /rev-exp/revenue/category | ⏳ | ⏳ NEW | ⏳ | Danh mục doanh thu |
| 21 | /rev-exp/expenditure | ⏳ | — | ⏳ | Chi tiêu |
| 22 | /rev-exp/expenditure/category | ⏳ | ⏳ NEW | ⏳ | Danh mục chi tiêu |
| 23 | /rev-exp/debt | ⏳ | — | ⏳ | Công nợ |

### Module 8: Báo cáo (9 URL = 9 tabs)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 24 | /report/revenue | ⏳ | — | ⏳ | DOANH THU |
| 25 | /report/staff | ⏳ | ⏳ NEW | ⏳ | NHÂN VIÊN |
| 26 | /report/customer | ⏳ | ⏳ NEW | ⏳ | KHÁCH HÀNG |
| 27 | /report/liabilities | ⏳ | ⏳ NEW | ⏳ | CÔNG NỢ |
| 28 | /report/revexp | ⏳ | ⏳ NEW | ⏳ | THU CHI |
| 29 | /report/warehouse | ⏳ | ⏳ NEW | ⏳ | KHO HÀNG |
| 30 | /report/cashcard | ⏳ | ⏳ NEW | ⏳ | THẺ TIỀN MẶT |
| 31 | /report/service-package | ⏳ | ⏳ NEW | ⏳ | GÓI DỊCH VỤ |
| 32 | /report/loyalty | ⏳ | ⏳ NEW | ⏳ | TÍCH ĐIỂM |

### Module 9: Bộ sưu tập (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 33 | /gallery | ⏳ | — | ⏳ | Image grid |

### Module 10: Quản lý nhân viên (3 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 34 | /worker-manager/time-sheet | ⏳ | — | ⏳ | Chấm công (grid staff × days) |
| 35 | /worker-manager/payroll | ⏳ | ⏳ NEW | ⏳ | Lương |
| 36 | /worker-manager/setting/payoff-category | ⏳ | ⏳ NEW | ⏳ | Danh mục trả lương |

### Module 11: Cài đặt (18 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 37 | /setting/salon | ⏳ | — | ⏳ | Thông tin salon |
| 38 | /setting/staff | ⏳ | — | ⏳ | Nhân viên |
| 39 | /setting/staff/group | ⏳ | ⏳ NEW | ⏳ | Nhóm NV |
| 40 | /setting/shift | ⏳ | — | ⏳ | Ca làm |
| 41 | /setting/commission-new | ⏳ | — | ⏳ | Hoa hồng (gốc) |
| 42 | /setting/commission-new?resourceMode=SELL_SERVICE | ⏳ | ⏳ NEW | ⏳ | Tab: Bán dịch vụ |
| 43 | /setting/commission-new?resourceMode=PRODUCT | ⏳ | ⏳ NEW | ⏳ | Tab: Bán sản phẩm |
| 44 | /setting/commission-new?resourceMode=PACKAGE | ⏳ | ⏳ NEW | ⏳ | Tab: Bán gói |
| 45 | /setting/commission-new?resourceMode=SELL_TREATMENT | ⏳ | ⏳ NEW | ⏳ | Tab: Điều trị |
| 46 | /setting/commission-new?resourceMode=CASH_CARD | ⏳ | ⏳ NEW | ⏳ | Tab: Thẻ tiền |
| 47 | /setting/commission-new?resourceMode=CUSTOMER_REQUEST | ⏳ | ⏳ NEW | ⏳ | Tab: Yêu cầu KH |
| 48 | /setting/commission-new?resourceMode=OVERTIME | ⏳ | ⏳ NEW | ⏳ | Tab: Làm thêm |
| 49 | /setting/customer-channel | ⏳ | — | ⏳ | Kênh KH |
| 50 | /setting/customer-sources | ⏳ | — | ⏳ | Nguồn KH |
| 51 | /setting/customer-groups | ⏳ | — | ⏳ | Nhóm KH |
| 52 | /setting/customer-rank | ⏳ | — | ⏳ | Hạng KH |
| 53 | /setting/loyal-setting | ⏳ | — | ⏳ | Tích điểm |
| 54 | /setting/booking-website | ⏳ | — | ⏳ | Web đặt lịch |

**Chú thích**: ⏳ = chưa làm · 🔄 = đang làm · ✅ = xong · NEW = URL mới cần implement

## 📐 CẤU TRÚC THƯ MỤC

```
E:\APP\crm-clone\
├── .clinerules                 ← (Global rules)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── eslint.config.mjs
├── prisma/
│   ├── schema.prisma           ← 11 module models
│   └── seed.ts                 ← Seed data
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← Root layout
│   │   ├── page.tsx            ← Redirect to /cashier
│   │   ├── globals.css
│   │   ├── (dashboard)/
│   │   │   ├── cashier/page.tsx
│   │   │   ├── booking/page.tsx
│   │   │   ├── customers/page.tsx
│   │   │   ├── customer-care/{...}/page.tsx
│   │   │   ├── cashcard/page.tsx
│   │   │   ├── product-service/{...}/page.tsx
│   │   │   ├── rev-exp/{...}/page.tsx
│   │   │   ├── report/{...}/page.tsx
│   │   │   ├── gallery/page.tsx
│   │   │   ├── worker-manager/{...}/page.tsx
│   │   │   └── setting/{...}/page.tsx
│   │   ├── (auth)/login/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── customers/route.ts + [id]/route.ts
│   │       ├── invoices/route.ts + [id]/route.ts
│   │       ├── bookings/route.ts + [id]/route.ts
│   │       ├── products/route.ts + [id]/route.ts
│   │       ├── services/route.ts + [id]/route.ts
│   │       ├── packages/route.ts + [id]/route.ts
│   │       ├── cashcards/route.ts
│   │       ├── transactions/route.ts
│   │       ├── reports/revenue/route.ts
│   │       ├── workers/time-sheet/route.ts
│   │       └── settings/[section]/route.ts
│   ├── components/
│   │   ├── ui/                 ← shadcn primitives (Radix, Nova)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── shell.tsx
│   │   ├── shared/
│   │   │   ├── data-table.tsx
│   │   │   ├── search-input.tsx
│   │   │   ├── export-button.tsx
│   │   │   ├── date-range-picker.tsx
│   │   │   └── status-badge.tsx
│   │   └── features/
│   │       ├── cashier/
│   │       ├── booking/
│   │       ├── customers/
│   │       ├── worker/
│   │       └── ...
│   ├── lib/
│   │   ├── db.ts               ← Prisma singleton
│   │   ├── auth.ts             ← NextAuth config
│   │   ├── validations.ts      ← Zod schemas
│   │   ├── constants.ts        ← Menu items, routes
│   │   └── query-keys.ts       ← TanStack Query keys
│   ├── stores/
│   │   ├── sidebar-store.ts
│   │   ├── branch-store.ts
│   │   └── cashier-store.ts
│   └── hooks/
├── public/
└── crm-data/                   ← Data crawl từ EasySalon
    ├── screenshots/            ← 53 PNG
    ├── html/                   ← 53 HTML
    ├── structure/              ← 53 TXT (UTF-8)
    ├── urls.txt                ← 53 URL
    ├── session.json            ← Session đăng nhập
    ├── crawl.ps1               ← Script crawl v7
    └── crawl-report.md         ← Báo cáo crawl
```

## 🔑 DATA MODELS (Prisma)

| Model | Fields chính | Module dùng |
|---|---|---|
| User | id, name, email, role, branchId | Auth, Staff, Worker |
| Branch | id, name, address, phone | Tất cả (filter) |
| Customer | id, code, name, phone, email, gender, birthday, sourceId, groupId, rankId, totalSpent, debt | Customers, CSKH, Cashcard, Report |
| CustomerSource | id, name | Customers, Settings |
| CustomerGroup | id, name | Customers, Settings, CSKH |
| CustomerRank | id, name, minSpent | Customers, Settings |
| Product | id, code, name, categoryId, price, cost, unit, stock | Product-Service, Cashier, Report |
| ProductCategory | id, name | Product-Service |
| Service | id, code, name, categoryId, price, duration, commission | Product-Service, Cashier, Report |
| ServiceCategory | id, name | Product-Service |
| Package | id, code, name, categoryId, items[], totalPrice, discountPrice | Product-Service, Cashier |
| PackageCategory | id, name | Product-Service |
| PackageItem | id, packageId, productId/serviceId, quantity | Package |
| Invoice | id, code, customerId, items[], subtotal, discount, discountType, surcharge, vat, total, paid, debt, status | Cashier, Report |
| InvoiceItem | id, invoiceId, productId/serviceId/packageId, name, quantity, price, discount, total | Invoice |
| Booking | id, customerId, staffId, serviceId, dateTime, duration, status, note | Booking |
| CashCard | id, customerId, code, balance, status | Cashcard, Report |
| Transaction | id, type (revenue/expense), category, amount, description, branchId, invoiceId | Rev-Exp, Report |
| Attendance | id, userId, date, shiftId, checkIn, checkOut, status | Worker, Report |
| Shift | id, name, startTime, endTime | Settings, Worker |
| Commission | id, staffId, serviceId, rate, effectiveDate | Settings, Worker |
| Setting | id, section, key, value | Settings |

## 🔄 WORKFLOW PHÁT TRIỂN

### Giai đoạn 2: Fix UI 11 module root (ĐANG LÀM)

**Quy trình mỗi module:**
```
1. Plan mode (DeepSeek):
   - Đọc crm-data/structure/<module>.txt
   - Tạo mini-blueprint (UI spec từ text)
2. Act mode (Kimi):
   - Đọc blueprint
   - ĐỌC SCREENSHOT crm-data/screenshots/<module>.png
   - Implement UI khớp ảnh ≥90%
3. Verify:
   - bun run lint (0 error)
   - tsc --noEmit (0 error)
   - Mở /<route> → render khớp ảnh
```

**Thứ tự ưu tiên:**
1. ✅ Module 1: Cashier (ĐANG LÀM)
2. ⏳ Module 3: Customers (pattern template)
3. ⏳ Module 2: Booking
4. ⏳ Module 6: Product-Service root
5. ⏳ Module 7: Rev-Exp root
6. ⏳ Module 8: Report root
7. ⏳ Module 10: Worker Manager
8. ⏳ Module 4: CSKH root
9. ⏳ Module 5: Cashcard
10. ⏳ Module 9: Gallery
11. ⏳ Module 11: Settings root

### Giai đoạn 3: Implement 22 URL mới

**Pattern:**
- CRUD pattern: áp dụng cho product, service, package + categories, staff, customer-sources/groups/rank/channel
- Form pattern: salon, loyal-setting, booking-website, cashcard/settings
- Table pattern: cashbook, revenue, expenditure, debt, invoices, feedback, incentives, payroll
- Special: warehouse, gallery, report (9 tabs), commission-new (7 tabs)

### Giai đoạn 4: Functionality (CRUD thực sự)

**Thứ tự:**
1. Customers CRUD (đã có pattern)
2. Products/Services/Packages CRUD
3. Invoices (Cashier)
4. Bookings
5. Transactions (Rev-Exp)
6. CashCard
7. Reports với charts
8. Settings forms
9. Worker Timesheet + Payroll

## 🔧 THÔNG TIN QUAN TRỌNG CHO GIAI ĐOẠN 4 (Functionality)

### Tóm tắt UI đã hoàn thiện (Module 1, 2, 3)

| Module | UI đã xong | Cần làm cho functionality |
|---|---|---|
| **Module 1 (Cashier)** | 3 pages: /cashier (tabs+selector+footer), /cashier/invoices (11 cols), /cashier/activity (6 cols) | Invoice CRUD thực sự, Activity log auto-capture, Payment flow, Print invoice |
| **Module 2 (Booking)** | 2 views (Customer bảng 8 cols + Staff calendar grid), Dialog 2-column 14 fields | Booking CRUD, Status workflow (New→Confirmed→Checkin→Checkout), Calendar drag-drop, SMS/Email reminder |
| **Module 3 (Customers)** | 7 cols list + Dialog 14 fields + scrollbar | Customer CRUD, "Thêm lịch sử" link, "Đặt lịch" link, Autocomplete, Referrer system |

### API Routes đã có (cần verify/extend cho functionality)

| Endpoint | Methods | Module | Trạng thái |
|---|---|---|---|
| `/api/customers` | GET (filters), POST | 3 | ✅ Có (cần extend POST với 14 fields) |
| `/api/customers/[id]` | GET, PUT, DELETE | 3 | ✅ Có |
| `/api/customers/export` | GET (CSV) | 3 | ✅ Có |
| `/api/customers/sources` | GET | 3 | ✅ Có |
| `/api/customers/groups` | GET | 3 | ✅ Có |
| `/api/customers/ranks` | GET | 3 | ✅ Có |
| `/api/invoices` | GET (filters), POST | 1 | ✅ Có (cần extend filters) |
| `/api/invoices/[id]` | GET, PUT, DELETE | 1 | ✅ Có |
| `/api/cashier/activity` | GET | 1 | ✅ Có |
| `/api/bookings` | GET (filters), POST | 2 | ✅ Có (cần extend POST với services array) |
| `/api/bookings/[id]` | GET, PUT, DELETE | 2 | ✅ Có |
| `/api/customer-care/customer-set` | GET, POST | 4 | ✅ Có (mới) |
| `/api/customer-care/customer-set/[id]` | GET, PUT, DELETE | 4 | ✅ Có (mới) |
| `/api/customer-care/feedback` | GET (rating filter) | 4 | ✅ Có (mới) |
| `/api/customer-care/incentives` | GET, POST | 4 | ✅ Có (mới) |
| `/api/customer-care/incentives/[id]` | GET, PUT, DELETE | 4 | ✅ Có (mới) |
| `/api/customer-care/vouchers` | GET | 4 | ✅ Có (mới) |

### API Routes CẦN TẠO cho Giai đoạn 4

| Endpoint | Methods | Module | Mục đích |
|---|---|---|---|
| `/api/products` | GET, POST | 6 | Product CRUD |
| `/api/products/[id]` | GET, PUT, DELETE | 6 | Product detail |
| `/api/services` | GET, POST | 6 | Service CRUD |
| `/api/services/[id]` | GET, PUT, DELETE | 6 | Service detail |
| `/api/packages` | GET, POST | 6 | Package CRUD |
| `/api/packages/[id]` | GET, PUT, DELETE | 6 | Package detail |
| `/api/categories` | GET, POST | 6 | Categories (product/service/package) |
| `/api/transactions` | GET, POST | 7 | Cashbook + revenue + expenditure |
| `/api/debts` | GET, PUT | 7 | Debt management |
| `/api/cashcards` | GET, POST | 5 | Cash card CRUD + top-up |
| `/api/reports/revenue` | GET | 8 | Report data aggregation |
| `/api/reports/staff` | GET | 8 | Staff report |
| `/api/reports/customer` | GET | 8 | Customer report |
| `/api/reports/[type]` | GET | 8 | Generic report endpoint |
| `/api/workers/time-sheet` | GET, PUT | 10 | Attendance |
| `/api/workers/payroll` | GET, POST | 10 | Payroll |
| `/api/settings/[section]` | GET, PUT | 11 | Dynamic settings |
| `/api/staff` | GET, POST | 11 | Staff CRUD |
| `/api/shifts` | GET, POST | 11 | Shift CRUD |
| `/api/commissions` | GET, POST | 11 | Commission config |
| `/api/gallery` | GET, POST, DELETE | 9 | Image upload + grid |
| `/api/customers/[id]/care-history` | GET, POST | 3 | "Thêm lịch sử" feature |

### Prisma Schema — DEVIATIONS cần xử lý trước Giai đoạn 4

| Deviation | Module | Vấn đề | Giải pháp |
|---|---|---|---|
| **#1: Booking services** | 2 | services array stored as JSON trong `note` field | Thêm `BookingService` model (bookingId, serviceCategoryId, serviceId, staffId, showNote, duration) |
| **#2: Customer fields** | 3 | 14 fields mới cần verify trong schema | Đảm bảo schema có: receiveNotification, profileCreatedAt, referrerId, isRegular |
| **#3: Care history** | 3 | "Thêm lịch sử" cần model riêng | Thêm `CustomerCareHistory` model (customerId, type, content, createdAt, createdById) |
| **#4: Notification settings** | 3 | "Nhận" field (Email/SMS) | Đảm bảo enum: EMAIL, SMS, NONE |

### Status Enums đã define (constants.ts)

| Enum | Values | Module |
|---|---|---|
| `BookingStatus` | NEW, CONFIRMED, CHECKIN, CHECKOUT, NO_SHOW, CANCELLED | 2 |
| `InvoiceStatus` | PAID, PARTIAL, UNPAID, CANCELLED | 1 |
| `InvoiceAction` | CREATE_INVOICE, CREATE_INVOICE_FROM_BOOKING, DELETE_ITEM, CHANGE_PRICE, ASSIGN_STAFF, PAYMENT, CHANGE_PROMOTION | 1 |
| `IncentiveType` | SERVICE_DISCOUNT, PRODUCT_DISCOUNT, SERVICE_GIFT, PRODUCT_GIFT | 4 |

### State Management (Zustand stores)

| Store | Module | Trạng thái |
|---|---|---|
| `cashier-store` | 1 | ✅ tabs + invoice items + voucher + discount |
| `invoice-filter-store` | 1 | ✅ branch, date, search, status |
| `activity-filter-store` | 1 | ✅ search, action type |
| `booking-store` | 2 | ✅ viewMode, dateNav, filters |
| (customer filter) | 3 | ⚠️ Inline trong page (cần tách thành store nếu phức tạp) |

### TanStack Query Keys đã dùng

| Key pattern | Module |
|---|---|
| `['customers', { search, page, groupId, sourceId }]` | 3 |
| `['invoices', { branchId, from, to, search, status, page }]` | 1 |
| `['cashier-activity', { branchId, from, to, search, action, page }]` | 1 |
| `['bookings', { dateFrom, dateTo, staffId, status, search, branchId }]` | 2 |
| `['customer-sources']`, `['customer-groups']`, `['customer-ranks']` | 3 |

### Workflow logic cần implement (Giai đoạn 4)

#### Module 1 (Cashier) — Invoice flow
```
1. Customer chọn services/products/packages → add to invoice
2. Apply voucher + discount
3. Click "Hoàn tất" → POST /api/invoices
4. Auto-create InvoiceActivity records (CREATE_INVOICE)
5. If from booking → CREATE_INVOICE_FROM_BOOKING
6. Payment → status PAID + activity PAYMENT
7. Print → increment printCount
8. Cancel → status CANCELLED
```

#### Module 2 (Booking) — Status workflow
```
NEW → CONFIRMED → CHECKIN → CHECKOUT
                  ↓
              NO_SHOW / CANCELLED
```

#### Module 3 (Customers) — Special links
```
"Thêm lịch sử" → mở dialog → POST /api/customers/[id]/care-history
"Đặt lịch" → navigate to /booking?customerId=X
```

### Database migration (khi chuyển Supabase)

| Bước | Hành động |
|---|---|
| 1 | Export SQLite data (Prisma seed) |
| 2 | Update `prisma/schema.prisma` datasource → Supabase PostgreSQL |
| 3 | Run `prisma migrate dev` để tạo tables trong Supabase |
| 4 | Import data từ seed |
| 5 | Update `.env` `DATABASE_URL` |
| 6 | Test all API routes |

### Auth (Giai đoạn 5)

| Việc | Chi tiết |
|---|---|
| NextAuth config | `src/lib/auth.ts` — Credentials provider, JWT session |
| Login page | `src/app/(auth)/login/page.tsx` |
| Middleware | `src/middleware.ts` — protect `/cashier`, `/booking`, `/customers`, v.v. |
| Session user | Email, role (ADMIN/STAFF), branchId |
| "Tạo bởi" field | Auto từ session user email (đã có trong Module 2 dialog) |

### Giai đoạn 5: Integration + Auth

1. NextAuth integration
2. Login page
3. Route protection middleware
4. Final redirect

## ✅ ĐÃ HOÀN THÀNH

- [x] Crawl 53 URL EasySalon (31 cũ + 22 mới)
- [x] Tạo file crawl-report.md (53 URL, 11 module)
- [x] Setup workspace crm-clone (Next.js 16 + shadcn/ui Nova + Prisma)
- [x] Prisma schema (đầy đủ 11 module models)
- [x] Foundation (Task 1-4): layout, sidebar, shared components
- [x] 11 module root pages (UI placeholder)
- [x] Seed data (20 customers, 10 products, 10 services)
- [x] Fix ESLint 10 → 9 (compatible với eslint-plugin-react)
- [x] Verify Foundation: lint + tsc + dev pass
- [x] **Module 1: Cashier UI Fix** — Done (4 sub-task: store, customer-tabs, service-selector, invoice-summary)
  - Gate: PASS (lint 0 error, tsc 0 error, smoke test OK)
  - UI khớp cashier.png ≥90%
- [x] **Module 2: Booking UI Fix** — Done (5 sub-task: store, filter, calendar, dialog, page)
  - Gate: PASS (lint 0 error booking, tsc 0 error, build OK)
  - UI khớp booking.png — calendar (week/month), color-coded status, dialog form
  - Status colors: pending (amber), confirmed (sky), done (emerald), cancelled (red)
  - Lưu ý: có 2 lint errors từ cashier module (không liên quan booking)
- [x] **Module 3: Customers UI Fix** — Done (5 sub-task: lint fix, DataTable, search+filter, dialog, delete+export)
  - Gate: PASS (lint 0 error, tsc 0 error)
  - UI khớp customers.png — DataTable 9 columns, search, 3 filters, dialog form, delete confirm, export CSV
  - API mới: /api/customers/export, /sources, /groups, /ranks
  - Pattern template cho các module CRUD khác
  - Note: 2 cashier lint errors thực ra là warnings (không phải errors)
- [x] **Giai đoạn 3 — Module 1: 2 URL mới (/cashier/invoices + /cashier/activity)** — Done
  - 4 sub-task: API+Schema, /cashier/invoices, /cashier/activity, Navigation+Specs
  - Gate: PASS (lint 0 error, tsc 0 error, db push+generate OK)
  - /cashier/invoices: 11 columns table + 4 filter buttons (Tất cả/Đã TT/Chưa TT/Đã hủy) + status badges (vàng/xanh/đỏ) + staff badges (xám/xanh) + pagination
  - /cashier/activity: 6 columns table + 7 action badge types (Tạo HD xanh, Tạo HD từ lịch hẹn xanh, Xóa mặt hàng đỏ, Thay đổi giá cam, Xếp nhân viên cam, Thanh toán xanh lá, Thay đổi khuyến mãi cam) + filter (search + action type) + pagination
  - API mới: /api/invoices (extended GET with filters), /api/invoices/[id] (GET detail), /api/cashier/activity (GET activity log)
  - Prisma schema: thêm InvoiceActivity model, Invoice.code optional, printCount field, cancelled status
  - Navigation flow: /cashier → "Danh sách đơn hàng" → /cashier/invoices → "Lịch sử hóa đơn" → /cashier/activity
  - Files: 11 (2 modify schema + page, 9 create)
  - MODULE_SPECS.md: appended "Module 1: Cashier (Update)" section
- [x] **Giai đoạn 3 — Module 2: Booking UPDATE (2 views + dialog)** — Done triệt để
  - UPDATE-2 (6 sub-task): 2 views (Customer + Staff) + filter + dialog + store + API
    * View Khách hàng: bảng 8 cột + status dropdown (6 states)
    * View Nhân viên: calendar grid (time × staff) + slot height = duration
    * Status enum: NEW/CONFIRMED/CHECKIN/CHECKOUT/NO_SHOW/CANCELLED
    * Filter: Hôm nay / Ngày mai / 7 ngày đến + branch + staff search
  - UPDATE-2.7 (3 sub-task): Dialog "Tạo mới lịch hẹn" 2-column
    * Section 1: Thông tin KH (SĐT + Tên KH/Mã KH autocomplete)
    * Section 2: Thông tin lịch hẹn (Ngày, Giờ, Nguồn KH, Kênh đặt, Số khách, Trạng thái, Ghi chú)
    * Section 3: Dynamic services (Khách #1, #2, ... + "Thêm dịch vụ" + duration auto-calc "X d | Y Phút")
    * Footer: Hủy + Lưu
  - Gate: PASS (tsc 0 error, lint 0 error, build OK)
  - Files: 8 (4 create + 4 modify)
  - ⚠️ DEVIATION: services array stored as JSON trong `note` field (tạm — cần update Prisma schema sau khi user approve theo §6)
- [x] **Giai đoạn 3 — Module 3: Customers UPDATE (list + dialog)** — Done triệt để
  - UPDATE-3 (5 sub-task): schema + API + columns + dialog + page
    * List view: 7 columns (Mã, Họ tên & ghi chú, Điện thoại, Điểm tích lũy, Lịch sử chăm sóc, Lịch hẹn gần nhất, Actions)
    * Dialog "Thêm khách hàng": 14 fields (Họ tên, SĐT, Mã KH, Địa chỉ, Email, Nhận, Ngày khởi tạo, Nhóm, Nguồn, Người giới thiệu, Sinh nhật, Giới tính, Là khách quen, Ghi chú)
    * Dialog layout: 2 cột (label 140px trái, input phải) + scrollbar dọc (max-height: calc(80vh - 120px)) + footer cố định
    * Filter: search + dropdown Nhóm + dropdown Nguồn
    * Special links: "Thêm lịch sử" + "Đặt lịch" trong table
    * Required: Họ tên + SĐT
    * API: filters groupId + sourceId, POST với 14 fields
  - Gate: PASS (lint 0 error, tsc 0 error, 22 warnings unrelated)
  - Files: 5 modify + 1 specs update
- [x] **Giai đoạn 3 — Module 4 phần 1: CSKH (Tập KH + Phản hồi)** — Done triệt để
  - UPDATE-4.1 (4 sub-task): API+schema, tabs, customer-set, customer-feedback
    * Tập khách hàng: bảng 2 cột (Tên tập, Mô tả hoặc ghi chú) + nút "..." actions + dialog "Tạo mới" 5 fields + dynamic conditions
    * Phản hồi dịch vụ: bảng 4 cột (Đánh giá, Khách hàng, Dịch vụ, Thời gian) + filter Đánh giá + empty state + pagination
    * Shared tabs: 3 sub-tabs (Tập KH | Phản hồi | Chương trình KM) navigate giữa 3 sub-pages
    * API mới: /api/customer-care/customer-set (GET, POST), /[id] (GET, PUT, DELETE), /api/customer-care/feedback (GET with rating filter)
  - Bug fix: "Query data cannot be undefined" — fix trong 2 pages (customer-care/page.tsx, customer-care/feedback/page.tsx)
    * Root cause: query function trả về json.data có thể undefined khi API lỗi
    * Fix: error check + fallback + placeholderData
  - Gate: PASS (lint 0 error, tsc 0 error)
  - Files: 8 create + 3 modify + 2 bug fix
- [x] **Giai đoạn 3 — Module 4 phần 2: CSKH (Chương trình khuyến mãi)** — Done triệt để
  - UPDATE-4.2 (6 sub-task): API+schema, tabs, promotion-list, voucher-list, dialog, page
    * Tab Khuyến mãi: bảng 8 cột (Mã, Tên KM, Giảm giá, Áp dụng, Số lượng, Đã sử dụng, Chưa sử dụng, Hết hạn) + "..." actions + "Tạo mới" button
    * Tab Voucher: bảng 9 cột (Mã, Tên chương trình, Thời gian khả dụng, Giảm giá, Áp dụng, Số lượng, Đã sử dụng, Chưa sử dụng, Chi phí) + empty state + pagination
    * Dialog "Tạo mới chương trình khuyến mãi": 10 fields + scrollbar dọc + footer cố định
      - Fields: Mã KM, *Tên KM, Áp dụng (select), Hết hạn sau (date range), *Chỉ dành cho (tag input multi-select), Loại giảm giá (select), *Chọn dịch vụ, *Giảm giá (input + %), *Số lần sử dụng, Tự động áp dụng (select)
      - Multi-select tag input với nút xóa
      - Apply scrollbar pattern (max-height calc(80vh - 120px), overflow-y auto)
    * Incentives tabs: 2 sub-tabs (Khuyến mãi | Voucher)
    * API mới: /api/customer-care/incentives (GET, POST) + /[id] (GET, PUT, DELETE), /api/customer-care/vouchers (GET)
    * Prisma: thêm Incentive model
    * Constants: IncentiveType enum (SERVICE_DISCOUNT, PRODUCT_DISCOUNT, SERVICE_GIFT, PRODUCT_GIFT)
  - Gate: PASS (lint 0 error, 29 warnings pre-existing, tsc 0 error)
  - Files: 9 create + 5 modify (including use-toast hook)
- [x] **Giai đoạn 3 — Module 5 phần 1: Cashcard (List + 4 dialogs)** — Done triệt để
  - UPDATE-5.1 (7 sub-task): API+schema, list, 4 dialogs, page
    * List view: 7 cols (Mã thẻ, Trạng thái, Bảo lưu tới, Khách hàng, Số dư, Hạn sử dụng, Thời gian tạo) + 4 actions per row
    * 4 Dialogs (mỗi action có dialog riêng):
      - Tạo thẻ mới (4 fields): Mã thẻ, Chủ sở hữu, Đồng sở hữu, Hạn dùng
      - Gia hạn (3 fields): Thẻ tiền mặt (static), Gia hạn tới (date), Ghi chú
      - Khóa thẻ (3 fields): Thẻ tiền mặt (static), Khóa đến ngày (date), Ghi chú
      - Nạp tiền (8 fields): Phương thức, Số tiền, Tiền thưởng, Tổng nhận (auto-calc), Ngày nạp, Mã nạp, Ghi nhận cho (staff), Ghi chú
    * Action colors: Gia hạn (xanh), Khóa thẻ (cam), Nạp tiền (xanh), Xóa (đỏ)
    * Status badge: "Đang sử dụng" (xanh lá), "Đã khóa" (cam), "Hết hạn" (đỏ)
    * API: /api/cashcards (GET, POST) + /[id] (GET, PUT, DELETE) + /[id]/extend + /[id]/lock + /[id]/topup
  - Bug fix: "Query data cannot be undefined" (VẤN ĐỀ #11 variant)
    * Root cause: queryFn return `json.data` có thể undefined khi response nested
    * Fix: return `json` (full response) + destructure with fallback: `data?.data?.cashCards || []`
    * Pattern mới cho nested data (xem VẤN ĐỀ #14)
  - Gate: PASS (lint 0 error, 31 warnings pre-existing)
  - Files: 7 create + 3 modify

## 🔄 ĐANG LÀM

- [ ] **Giai đoạn 3: Implement 23 URL mới** — Đang làm (2/23 xong)
  - Strategy: chụp ảnh có data thực → gửi Z.ai (VLM) → viết prompt → Plan+Act với ảnh
  - Tiến độ:
    * Module 1: ✅ 2/2 URL (/cashier/invoices + /cashier/activity)
    * Module 5: ⏳ 0/1 URL (/cashcard/settings)
    * Module 7: ⏳ 0/2 URLs (revenue/category, expenditure/category)
    * Module 8: ⏳ 0/8 URLs (8 report tabs còn lại)
    * Module 10: ⏳ 0/2 URLs (payroll, setting/payoff-category)
    * Module 11: ⏳ 0/8 URLs (staff/group + 7 commission tabs)

### Tiếp theo:
- **Module 2 (Booking)**: User sẽ gửi ảnh + mô tả
- Sau đó: Module 8 (Report) — 8 URL phức tạp nhất

## ⏳ TIẾP THEO

### Sau Module 1 xong:
- [ ] Module 3: Customers UI Fix (pattern template)
- [ ] Module 2: Booking UI Fix
- [ ] ... (theo thứ tự ưu tự ở trên)

### Sau Giai đoạn 2 xong (11 module root fixed):
- [ ] Giai đoạn 3: Implement 22 URL mới
- [ ] Giai đoạn 4: Functionality
- [ ] Giai đoạn 5: Integration + Auth

## 📝 LOG THAY ĐỔI

### [Ngày crawl] - Hoàn thành crawl 53 URL
- Crawl 31 URL cũ + 22 URL mới
- Skip logic hoạt động (31 SKIP, 22 crawl mới)
- Failed: 0
- File: crawl-report.md updated

### [Ngày setup] - Foundation xong
- create-next-app + shadcn/ui (Radix, Nova) + Prisma + SQLite
- 11 module root pages tạo
- Prisma schema đầy đủ
- Seed data
- Fix ESLint 10 → 9

### [Hiện tại] - Module 1 Cashier UI Fix xong
- Plan mode tạo blueprint (4 sub-task)
- Act mode (Kimi) implement xong: store, customer-tabs, service-selector, invoice-summary
- Gate: PASS
- UI khớp cashier.png ≥90%
- Act mode bị treo sau khi xong → cần start session mới cho Module 2

### [Tiếp theo] - Module 2 Booking UI Fix
- Plan mode tạo blueprint (5 sub-task)
- Act mode (Kimi) implement xong: store, filter, calendar, dialog, page
- Gate: PASS
- UI khớp booking.png — calendar (week/month), color-coded status, dialog form
- Status colors: pending (amber), confirmed (sky), done (emerald), cancelled (red)

### [Tiếp theo] - Module 3 Customers UI Fix
- Pattern template cho các module CRUD khác
- Đọc customers.png + structure/customers.txt
- DataTable + search + filter (group/rank/source) + Customer Dialog
- Quan trọng: làm kỹ vì sẽ reuse cho các module CRUD khác

### [Hoàn thành] - Module 3 Customers UI Fix xong
- 5 sub-task: lint fix, DataTable, search+filter, dialog, delete+export
- Gate: PASS (lint 0 error, tsc 0 error)
- API mới: /api/customers/export, /sources, /groups, /ranks
- DataTable 9 columns + 3 filters + dialog form + delete confirm + export CSV
- 2 cashier lint errors thực ra là warnings → không chặn

### [Tiếp theo] - Module 4 CSKH UI Fix
- 3 sub-pages: customer-set, customer-feedback, incentives
- Pattern: CRUD (customer-set) + Table (feedback, incentives)
- Tận dụng DataTable + Dialog từ Module 3

### [Hoàn thành] - Giai đoạn 2 Fix UI 11 module root xong
- Module 1 (Cashier): ✅
- Module 2 (Booking): ✅
- Module 3 (Customers): ✅ (pattern template)
- Module 4 (CSKH): ✅
- Module 5-11: ✅
- Tổng cộng: 11/11 module root UI xong
- Tiến độ: ~40% dự án

### [Hiện tại] - Giai đoạn 3 Implement 23 URL mới
- Bắt đầu với Module 1: 2 URL (/cashier/invoices + /cashier/activity)
- Phát hiện URL mới: /cashier/activity (Lịch sử hoạt động trên hóa đơn)
- Z.ai phân tích 2 ảnh + viết prompt Plan+Act chi tiết
- Strategy mới: chụp ảnh có data → gửi Z.ai → viết prompt → Plan+Act với ảnh

### [Hoàn thành] - Module 1: 2 URL mới xong
- /cashier/invoices: 11 columns table + 4 filter buttons + status badges + pagination
- /cashier/activity: 6 columns table + 7 action badge types (màu khác nhau) + filter + pagination
- API: /api/invoices (extended), /api/invoices/[id], /api/cashier/activity
- Prisma: InvoiceActivity model, printCount, cancelled status
- Navigation: /cashier → /cashier/invoices → /cashier/activity
- Gate: PASS (lint 0, tsc 0, db OK)
- Files: 11 (2 modify + 9 create)
- MODULE_SPECS.md updated

### [Hoàn thành] - Module 2 (Booking) UPDATE
- Update 2 views: Customer (bảng 8 cột) + Staff (calendar grid với slot height = duration)
- 6 sub-task all PASS
- Gate: PASS (lint 0 error, tsc 0 error, 19 warnings unrelated)
- Files: 3 create + 6 modify
- Status enum: NEW/CONFIRMED/CHECKIN/CHECKOUT/NO_SHOW/CANCELLED
- Booking dialog updated với duration, staff assign, createdBy

### [Đang làm] - Module 2 (Booking) UPDATE-2.7: Booking Dialog
- Update dialog "Tạo mới lịch hẹn" cho khớp ảnh
- 2-column layout (trái: KH + lịch hẹn, phải: dịch vụ)
- 3 sections: Thông tin KH, Thông tin lịch hẹn, Khách #N (dynamic services)
- Dynamic duration calculation ("X d | Y Phút")
- Autocomplete SĐT + Tên KH
- 3 sub-task: schema+store, API, dialog UI

### [Hoàn thành] - Module 2 (Booking) UPDATE-2.7: Booking Dialog xong
- Dialog 2-column hoàn chỉnh: 3 sections
- Section 1: Thông tin KH (autocomplete SĐT + Tên/Mã KH)
- Section 2: Thông tin lịch hẹn (7 fields)
- Section 3: Dynamic services (Khách #1, #2, ...) + auto duration calc
- Footer: Hủy + Lưu
- Gate: PASS (tsc 0, lint 0, build OK)
- Files: 8 (4 create + 4 modify)
- ⚠️ DEVIATION: services array stored as JSON trong `note` field (tạm)
  → Cần update Prisma schema (thêm BookingService model) khi user approve §6

### [Tiếp theo] - Module 3 (Customers) hoặc Module khác
- User sẽ gửi ảnh + mô tả
- Z.ai sẽ phân tích + viết prompt Plan+Act
- Sau khi Module 2 triệt để, có thể tiếp tục các URL mới khác

### [Đang làm] - Module 3 (Customers) UPDATE
- Update list view: 7 columns (Mã, Họ tên & ghi chú, Điện thoại, Điểm tích lũy, Lịch sử chăm sóc, Lịch hẹn gần nhất, Actions)
- Update dialog "Thêm khách hàng": 14 fields + scrollbar dọc bên phải
- Special: "Thêm lịch sử" link + "Đặt lịch" link trong table
- 5 sub-task: schema, API, columns, dialog, page

### [Hoàn thành] - Module 3 (Customers) UPDATE xong
- List view: 7 columns (đổi từ 9 → 7)
- Dialog: 14 fields + scrollbar dọc + footer cố định
- Filter: search + Nhóm + Nguồn
- Gate: PASS (lint 0, tsc 0)
- Files: 5 modify + 1 specs
- 3 module đầu (1, 2, 3) hoàn thiện triệt để

### [Tiếp theo] - Module 4 (CSKH) hoặc URL mới khác
- 3 module đầu đã triệt để (1, 2, 3)
- Cần update sâu Module 4-11 hoặc implement 21 URL mới còn lại
- User sẽ gửi ảnh + mô tả

### [Đang làm] - Module 4 (CSKH) UPDATE phần 1
- 2 sub-pages: Tập khách hàng + Phản hồi dịch vụ
- Tập KH: bảng 2 cột + dialog 5 fields + dynamic conditions
- Phản hồi: bảng 4 cột + filter Đánh giá + empty state
- Shared: 3 tabs (Tập KH | Phản hồi | Chương trình KM)
- 4 sub-task: API+schema, tabs, customer-set, customer-feedback

### [Hoàn thành] - Module 4 phần 1 (CSKH) xong
- Tập khách hàng: 2 cols + dialog 5 fields + dynamic conditions
- Phản hồi dịch vụ: 4 cols + filter + empty state + pagination
- Shared 3 tabs navigation
- Bug fix: "Query data cannot be undefined" (error check + fallback + placeholderData)
- Gate: PASS (lint 0, tsc 0)
- Files: 8 create + 3 modify + 2 bug fix

### [Tiếp theo] - Module 4 phần 2 (Chương trình khuyến mãi - Incentives)
- Sub-page cuối của Module 4
- User sẽ gửi ảnh + mô tả
- Sau khi xong → Module 4 hoàn thiện triệt để

### [Đang làm] - Module 4 phần 2 (Incentives) UPDATE
- /customer-care/incentives: 2 tabs (Khuyến mãi + Voucher)
- Tab Khuyến mãi: bảng 8 cột + "Tạo mới" dialog (10 fields + scrollbar)
- Tab Voucher: bảng 9 cột + empty state + pagination
- Dialog: multi-select tag input ("Chỉ dành cho"), date range, select dropdowns
- 6 sub-task: API+schema, tabs, promotion-list, voucher-list, dialog, page
- Apply bug fix VẤN ĐỀ #11

### [Hoàn thành] - Module 4 phần 2 (Incentives) xong
- Tab Khuyến mãi: 8 cols table + "Tạo mới" button + "..." actions
- Tab Voucher: 9 cols table + empty state + pagination
- Dialog: 10 fields + scrollbar dọc + multi-select tag input + footer cố định
- API: /api/customer-care/incentives (GET, POST, PUT, DELETE) + /vouchers (GET)
- Prisma: Incentive model
- Constants: IncentiveType enum (4 values)
- Gate: PASS (lint 0, tsc 0, 29 warnings pre-existing)
- Files: 9 create + 5 modify (including use-toast hook)
- MODULE_SPECS.md: bổ sung phần 3

### [Hoàn thành] - MODULE 4 HOÀN THIỆN TRIỆT ĐỂ
- 3/3 sub-pages: Tập KH + Phản hồi + Chương trình khuyến mãi
- 4 module đầu (1, 2, 3, 4) hoàn thiện triệt để
- Tổng cộng: 17 sub-task (4+9+5+4+6) cho 4 module

### [Tiếp theo] - Module 5 (Cashcard) hoặc module khác
- User sẽ gửi ảnh + mô tả
- 4 module đầu đã triệt để, còn 7 module (5-11)
- 21 URL mới còn lại trong Giai đoạn 3

### [Đang làm] - Module 5 (Cashcard) UPDATE — 2 URL
- /cashcard: list 7 cols (Mã thẻ, Trạng thái, Bảo lưu, KH, Số dư, Hạn dùng, Tạo) + 4 actions (Gia hạn, Khóa, Nạp, Xóa) + dialog "Tạo mới" (4 fields)
- /cashcard/settings: 2 tabs (Cài đặt bonus | Khác) + table 2 cols + dialog "Thêm khoản bonus" (2 fields)
- 7 sub-task: API+schema, list, dialog, actions, page, settings, settings-page
- Apply bug fix VẤN ĐỀ #11

### [Hoàn thành] - Module 5 phần 1 (Cashcard List + 4 dialogs) xong
- List view: 7 cols + 4 action dialogs
- 4 dialogs: Tạo mới (4 fields), Gia hạn (3 fields), Khóa thẻ (3 fields), Nạp tiền (8 fields)
- Action colors: Gia hạn (xanh), Khóa thẻ (cam), Nạp tiền (xanh), Xóa (đỏ)
- Status badge: Đang sử dụng (xanh lá), Đã khóa (cam), Hết hạn (đỏ)
- Bug fix: VẤN ĐỀ #14 (nested data pattern)
- Gate: PASS (lint 0, tsc 0, 31 warnings pre-existing)
- Files: 7 create + 3 modify

### [Tiếp theo] - Module 5 phần 2 (Cashcard Settings)
- /cashcard/settings: 2 tabs (Cài đặt bonus | Khác)
- Tab "Cài đặt bonus": table 2 cols + dialog "Thêm khoản bonus" (2 fields)
- User sẽ gửi ảnh + mô tả

### [Đang làm] - Module 5 phần 2 (Cashcard Settings) UPDATE
- /cashcard/settings: 2 tabs (Cài đặt bonus | Khác)
- Tab "Cài đặt bonus": table 2 cols (Số tiền tối thiểu | Bonus) + empty state + dialog "Thêm khoản bonus" (2 fields)
- Tab "Khác": form "HẠN SỬ DỤNG THẺ TIỀN MẶT" (radio Hạn có định/tùy chỉnh + input số + button Tháng/Năm + Cập nhật)
- 6 sub-task: API+schema, tabs, bonus-list, bonus-dialog, expiry-settings, page

### Kế hoạch tiếp theo (sau Module 1):
- Module 8 (Report): 8 URL — phức tạp nhất, cần ảnh
- Module 11 (Settings): 8 URL — nhiều tabs commission
- Module 7 (Rev-Exp): 2 URL — đơn giản
- Module 10 (Worker): 2 URL — trung bình
- Module 5 (Cashcard): 1 URL — đơn giản

## ⚠️ VẤN ĐỀ ĐÃ BIẾT

1. **ESLint 10 incompatible với eslint-plugin-react** → Đã fix (downgrade ESLint 9)
2. **PowerShell Execution Policy chặn script** → Đã fix (Set-ExecutionPolicy Bypass)
3. **Session.json path tương đối không work** → Đã fix (dùng path tuyệt đối)
4. **Agent-browser `fill` không trigger React onChange** → Đã fix (dùng `type` thay `fill`)
5. **LiteLLM không có fallback** → OK (chỉ dùng 4 NVIDIA keys)
6. **Act mode bị treo sau khi xong Module 1** → Cần start session mới (mở Cline chat mới hoặc restart Cline)
7. **2 lint errors từ cashier module** (không liên quan booking) → Cần fix khi làm Module 3 hoặc sau khi xong tất cả module
8. **URL /cashier/activity mới phát hiện** (bị bỏ sót ban đầu) → Đã thêm vào urls.txt + cần crawl + implement
9. **structure.txt thiếu nội dung động** (table empty, dialog đóng, tabs ẩn) → Strategy mới: chụp ảnh có data → Z.ai phân tích → viết prompt chính xác
10. **DEVIATION Module 2 Booking**: services array stored as JSON trong `note` field (tạm) → Cần update Prisma schema (thêm BookingService model với fields: bookingId, serviceCategoryId, serviceId, staffId, showNote, duration) khi user approve §6. Sau đó migrate data từ note JSON sang table mới.
11. **"Query data cannot be undefined" bug** (đã fix): TanStack Query function trả về `json.data` có thể undefined khi API lỗi → Fix pattern: error check `if (!json.ok) throw new Error(...)` + fallback `return json.data || { ...defaultData }` + `placeholderData: { ... }`. Pattern này cần apply cho tất cả useQuery mới (Giai đoạn 4).
12. **Prisma schema changes được approve tự động** (Module 4): Incentive model đã được thêm vào schema mà không cần user approval → Lưu ý: từ Module 5 trở đi, nếu cần thêm model mới, Act mode nên hỏi user trước (theo §6 Safety Rails).
13. **29 lint warnings pre-existing**: Tích lũy từ các module trước (cashier, booking, customers, customer-care) → Cần clean up sau khi xong toàn bộ UI (trước Giai đoạn 4).
14. **"Query data cannot be undefined" — pattern mới cho nested data** (đã fix Module 5): Khi API response có nested structure `{ ok, data: { cashCards, total, page, limit } }`, queryFn return `json.data` có thể undefined → Fix: return `json` (full response) + destructure với optional chaining + fallback: `const cashCards = data?.data?.cashCards || []`. Pattern này dùng cho nested data (khác VẤN ĐỀ #11 cho flat data).
    * **Pattern VẤN ĐỀ #11** (flat data): `return json.data || { items: [], total: 0, page: 1, limit: 20 }`
    * **Pattern VẤN ĐỀ #14** (nested data): `return json` + `data?.data?.cashCards || []`

## 🔧 LỆNH HỮU ÍNG

```powershell
# Dev server
cd E:\APP\crm-clone
bun run dev

# Lint + typecheck
bun run lint
npx tsc --noEmit

# Prisma
npx prisma db push
npx prisma generate
npx prisma studio

# Seed data
bun run db:seed

# Crawl (nếu cần update)
cd E:\crm-crawl
.\crawl.ps1

# LiteLLM proxy
litellm --config "C:\Users\Administrator\litellm_config.yaml" --port 4000
```

## 📌 LƯU Ý QUAN TRỌNG

1. **App phải đang chạy** (`bun run dev`) khi Act mode implement — để hot reload + smoke test
2. **Kimi K2.6 là multimodal** — có thể đọc screenshot trực tiếp khi Act mode
3. **DeepSeek KHÔNG multimodal** — chỉ đọc text (structure.txt + html)
4. **Per-Task Gate (§9.5)** — bắt buộc sau mỗi task: lint + tsc + smoke test
5. **Quality Gate (§9)** — bắt buộc sau mỗi giai đoạn
6. **Footer sticky bottom** — rule §8 Frontend Rules
7. **KHÔNG dùng màu indigo/blue** — rule §8
8. **Mobile responsive** — rule §8

## 📊 THỐNG KÊ

- **Tổng URL**: 53
- **Tổng module**: 11
- **Tổng task dự kiến**: ~25-30
- **Đã hoàn thành**: ~5 task (Foundation)
- **Còn lại**: ~20-25 task
- **Ước tính thời gian**: ~10-15 giờ làm việc
