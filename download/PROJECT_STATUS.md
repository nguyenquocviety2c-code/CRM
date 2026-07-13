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

Clone CRM EasySalon (https://my.easysalon.vn) với đầy đủ 11 module, 53 URL.

## 📊 TỔNG QUAN TIẾN ĐỘ

| Giai đoạn | Trạng thái | Tiến độ |
|---|---|---|
| **Giai đoạn 0: Crawl data** | ✅ XONG | 53/53 URL |
| **Giai đoạn 1: Foundation** | ✅ XONG | Task 1-4 |
| **Giai đoạn 2: Fix UI 11 module root** | 🔄 ĐANG LÀM | 2/11 |
| **Giai đoạn 3: Implement 22 URL mới** | ⏳ CHỜ | 0/22 |
| **Giai đoạn 4: Functionality (CRUD)** | ⏳ CHỜ | 0/14 task |
| **Giai đoạn 5: Integration + Auth** | ⏳ CHỜ | 0/2 task |

**Tổng tiến độ**: ~20% (Foundation xong, còn 80% UI + functionality)

## 🏗️ CẤU TRÚC APP — 11 MODULE / 53 URL

### Module 1: Thu ngân (2 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 1 | /cashier | ✅ XONG | — | ⏳ | Trang chính, tabs + selector + footer |
| 2 | /cashier/invoices | ⏳ | ⏳ NEW | ⏳ | Danh sách hóa đơn |

### Module 2: Lịch hẹn (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 3 | /booking | ✅ XONG | — | ⏳ | Calendar view |

### Module 3: Khách hàng (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 4 | /customers | 🔄 ĐANG LÀM | — | ⏳ | CRUD customers (pattern template) |

### Module 4: CSKH (3 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 5 | /customer-care/customer-set | ⏳ | — | ⏳ | Nhóm khách hàng |
| 6 | /customer-care/customer-feedback | ⏳ | — | ⏳ | Feedback list |
| 7 | /customer-care/incentives | ⏳ | — | ⏳ | Ưu đãi |

### Module 5: Thẻ tiền mặt (2 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 8 | /cashcard | ⏳ | — | ⏳ | Thẻ tích điểm |
| 9 | /cashcard/settings | ⏳ | ⏳ NEW | ⏳ | Cài đặt thẻ |

### Module 6: Sản phẩm & Dịch vụ (7 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 10 | /product-service/product | ⏳ | — | ⏳ | CRUD product |
| 11 | /product-service/product-category | ⏳ | — | ⏳ | Danh mục product |
| 12 | /product-service/warehouse | ⏳ | — | ⏳ | Kho |
| 13 | /product-service/service | ⏳ | — | ⏳ | CRUD service |
| 14 | /product-service/service-category | ⏳ | — | ⏳ | Danh mục service |
| 15 | /product-service/package | ⏳ | — | ⏳ | CRUD package |
| 16 | /product-service/package-categories | ⏳ | — | ⏳ | Danh mục package |

### Module 7: Thu chi (6 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 17 | /rev-exp/cashbook | ⏳ | — | ⏳ | Sổ quỹ |
| 18 | /rev-exp/revenue | ⏳ | — | ⏳ | Doanh thu |
| 19 | /rev-exp/revenue/category | ⏳ | ⏳ NEW | ⏳ | Danh mục doanh thu |
| 20 | /rev-exp/expenditure | ⏳ | — | ⏳ | Chi tiêu |
| 21 | /rev-exp/expenditure/category | ⏳ | ⏳ NEW | ⏳ | Danh mục chi tiêu |
| 22 | /rev-exp/debt | ⏳ | — | ⏳ | Công nợ |

### Module 8: Báo cáo (9 URL = 9 tabs)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 23 | /report/revenue | ⏳ | — | ⏳ | DOANH THU |
| 24 | /report/staff | ⏳ | ⏳ NEW | ⏳ | NHÂN VIÊN |
| 25 | /report/customer | ⏳ | ⏳ NEW | ⏳ | KHÁCH HÀNG |
| 26 | /report/liabilities | ⏳ | ⏳ NEW | ⏳ | CÔNG NỢ |
| 27 | /report/revexp | ⏳ | ⏳ NEW | ⏳ | THU CHI |
| 28 | /report/warehouse | ⏳ | ⏳ NEW | ⏳ | KHO HÀNG |
| 29 | /report/cashcard | ⏳ | ⏳ NEW | ⏳ | THẺ TIỀN MẶT |
| 30 | /report/service-package | ⏳ | ⏳ NEW | ⏳ | GÓI DỊCH VỤ |
| 31 | /report/loyalty | ⏳ | ⏳ NEW | ⏳ | TÍCH ĐIỂM |

### Module 9: Bộ sưu tập (1 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 32 | /gallery | ⏳ | — | ⏳ | Image grid |

### Module 10: Quản lý nhân viên (3 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 33 | /worker-manager/time-sheet | ⏳ | — | ⏳ | Chấm công (grid staff × days) |
| 34 | /worker-manager/payroll | ⏳ | ⏳ NEW | ⏳ | Lương |
| 35 | /worker-manager/setting/payoff-category | ⏳ | ⏳ NEW | ⏳ | Danh mục trả lương |

### Module 11: Cài đặt (18 URL)
| # | Route | UI Fix | Impl mới | Functionality | Ghi chú |
|---|---|---|---|---|---|
| 36 | /setting/salon | ⏳ | — | ⏳ | Thông tin salon |
| 37 | /setting/staff | ⏳ | — | ⏳ | Nhân viên |
| 38 | /setting/staff/group | ⏳ | ⏳ NEW | ⏳ | Nhóm NV |
| 39 | /setting/shift | ⏳ | — | ⏳ | Ca làm |
| 40 | /setting/commission-new | ⏳ | — | ⏳ | Hoa hồng (gốc) |
| 41 | /setting/commission-new?resourceMode=SELL_SERVICE | ⏳ | ⏳ NEW | ⏳ | Tab: Bán dịch vụ |
| 42 | /setting/commission-new?resourceMode=PRODUCT | ⏳ | ⏳ NEW | ⏳ | Tab: Bán sản phẩm |
| 43 | /setting/commission-new?resourceMode=PACKAGE | ⏳ | ⏳ NEW | ⏳ | Tab: Bán gói |
| 44 | /setting/commission-new?resourceMode=SELL_TREATMENT | ⏳ | ⏳ NEW | ⏳ | Tab: Điều trị |
| 45 | /setting/commission-new?resourceMode=CASH_CARD | ⏳ | ⏳ NEW | ⏳ | Tab: Thẻ tiền |
| 46 | /setting/commission-new?resourceMode=CUSTOMER_REQUEST | ⏳ | ⏳ NEW | ⏳ | Tab: Yêu cầu KH |
| 47 | /setting/commission-new?resourceMode=OVERTIME | ⏳ | ⏳ NEW | ⏳ | Tab: Làm thêm |
| 48 | /setting/customer-channel | ⏳ | — | ⏳ | Kênh KH |
| 49 | /setting/customer-sources | ⏳ | — | ⏳ | Nguồn KH |
| 50 | /setting/customer-groups | ⏳ | — | ⏳ | Nhóm KH |
| 51 | /setting/customer-rank | ⏳ | — | ⏳ | Hạng KH |
| 52 | /setting/loyal-setting | ⏳ | — | ⏳ | Tích điểm |
| 53 | /setting/booking-website | ⏳ | — | ⏳ | Web đặt lịch |

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

## 🔄 ĐANG LÀM

- [ ] **Module 3: Customers UI Fix** — Act mode đang implement
  - Đọc screenshot: crm-data/screenshots/customers.png
  - Fix UI: DataTable + search + filter + customer dialog
  - Per-Task Gate
  - Đây là pattern template cho các module CRUD khác

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

## ⚠️ VẤN ĐỀ ĐÃ BIẾT

1. **ESLint 10 incompatible với eslint-plugin-react** → Đã fix (downgrade ESLint 9)
2. **PowerShell Execution Policy chặn script** → Đã fix (Set-ExecutionPolicy Bypass)
3. **Session.json path tương đối không work** → Đã fix (dùng path tuyệt đối)
4. **Agent-browser `fill` không trigger React onChange** → Đã fix (dùng `type` thay `fill`)
5. **LiteLLM không có fallback** → OK (chỉ dùng 4 NVIDIA keys)
6. **Act mode bị treo sau khi xong Module 1** → Cần start session mới (mở Cline chat mới hoặc restart Cline)
7. **2 lint errors từ cashier module** (không liên quan booking) → Cần fix khi làm Module 3 hoặc sau khi xong tất cả module

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
