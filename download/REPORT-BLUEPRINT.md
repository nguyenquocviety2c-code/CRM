# Technical Blueprint: Module Báo cáo — Thay thế dữ liệu demo bằng dữ liệu thực từ Supabase

> **Phiên bản:** 1.0
> **Ngày:** 09/07/2026
> **Phạm vi:** 6 tab báo cáo (DOANH THU, NHÂN VIÊN, KHÁCH HÀNG, CÔNG NỢ, KHO HÀNG, GÓI DỊCH VỤ)

---

## Mục lục

1. [Tổng quan trạng thái hiện tại](#1-tổng-quan-trạng-thái-hiện-tại)
2. [Kiến trúc mục tiêu](#2-kiến-trúc-mục-tiêu)
3. [Blueprint từng tab](#3-blueprint-từng-tab)
   - [3.1 Tab DOANH THU — Dọn dead code](#31-tab-doanh-thu--dọn-dead-code)
   - [3.2 Tab NHÂN VIÊN — Lấp khoảng trống dữ liệu](#32-tab-nhân-viên--lấp-khoảng-trống-dữ-liệu)
   - [3.3 Tab KHÁCH HÀNG — Thay mock bằng Supabase](#33-tab-khách-hàng--thay-mock-bằng-supabase)
   - [3.4 Tab CÔNG NỢ — Thay mock bằng Supabase](#34-tab-công-nợ--thay-mock-bằng-supabase)
   - [3.5 Tab KHO HÀNG — Bổ sung dropdown + cân nhắc migrate](#35-tab-kho-hàng--bổ-sung-dropdown--cân-nhắc-migrate)
   - [3.6 Tab GÓI DỊCH VỤ — Bổ sung dropdown + cân nhắc migrate](#36-tab-gói-dịch-vụ--bổ-sung-dropdown--cân-nhắc-migrate)
4. [Thứ tự ưu tiên thực hiện](#4-thứ-tự-ưu-tiên-thực-hiện)
5. [Cleanup — Xóa dead code](#5-cleanup--xóa-dead-code)
6. [Appendix: Danh sách Supabase tables & API endpoints](#6-appendix-danh-sách-supabase-tables--api-endpoints)

---

## 1. Tổng quan trạng thái hiện tại

| Tab | Trạng thái | Nguồn dữ liệu | Số view dùng mock |
|-----|-----------|--------------|-------------------|
| **DOANH THU** | ✅ REAL | `/api/supabase/invoices` | 0/5 |
| **NHÂN VIÊN** | ⚠️ PARTIAL | `/api/supabase/invoices` + `/api/supabase/staff` (3/4 view real, 1 view rỗng) | 0 (nhưng hoa hồng = 0 hardcode) |
| **KHÁCH HÀNG** | ❌ ALL MOCK | `src/lib/mock/report-customer.ts` (inject vào Zustand) | 4/4 |
| **CÔNG NỢ** | ❌ ALL MOCK | `src/lib/mock/report-liabilities.ts` (inject vào Zustand) | 2/2 |
| **KHO HÀNG** | ✅ REAL (Prisma) | `/api/warehouse/report` (Prisma/SQLite) | 0/3 |
| **GÓI DỊCH VỤ** | ✅ REAL (Prisma) | `/api/packages/report` (Prisma/SQLite) | 0/2 |

**Tóm tắt vấn đề:**
- **2 tab hoàn toàn mock** (KHÁCH HÀNG, CÔNG NỢ) — không có bất kỳ `fetch()` nào, dữ liệu hardcode trong Zustand store
- **1 tab thiếu dữ liệu** (NHÂN VIÊN) — hoa hồng = 0, đánh giá rỗng, "yêu cầu khách" = 0
- **2 tab dùng Prisma/SQLite** (KHO HÀNG, GÓI DỊCH VỤ) — hoạt động nhưng không dùng Supabase
- **2 file mock dead-code** (report-revenue.ts, report-staff.ts) — không import nhưng vẫn tồn tại

---

## 2. Kiến trúc mục tiêu

### Pattern chuẩn (đã hoạt động ở tab DOANH THU)

```
┌─────────────────────────────────────────────────┐
│  Page (src/app/(dashboard)/report/{tab}/page)   │
│    ├─ BranchSelector (global)                   │
│    ├─ DateRangePicker (global)                  │
│    ├─ ReportTabs                                │
│    ├─ ViewModeToggle                            │
│    └─ <ActiveView />                            │
├─────────────────────────────────────────────────┤
│  Store (src/stores/report-{tab}-store.ts)       │
│    ├─ useRawData() ← useQuery → /api/supabase/  │
│    ├─ per-view selector hooks (filter/paginate) │
│    └─ filter state (search, type, page...)      │
├─────────────────────────────────────────────────┤
│  Utils (src/lib/report-{tab}-utils.ts)          │
│    └─ compute*Summary, filter*, paginate        │
├─────────────────────────────────────────────────┤
│  API (src/app/api/supabase/{resource}/route.ts)  │
│    └─ Supabase query + response                 │
└─────────────────────────────────────────────────┘
```

**Nguyên tắc:**
1. **Một hook `useRaw*()` duy nhất** fetch toàn bộ dữ liệu thô (đã có ở revenue + staff, thiếu ở customer + liabilities)
2. **Mỗi view** dùng selector hook riêng để filter/paginate trên dữ liệu thô (client-side)
3. **Utils** là pure functions, DB-agnostic — chỉ cần feed mảng thực là chạy được
4. **Filter dropdowns** cũng fetch từ Supabase (groups, sources, categories, staff)

---

## 3. Blueprint từng tab

### 3.1 Tab DOANH THU — Dọn dead code

**Trạng thái:** ✅ Hoàn toàn REAL. Không cần thay đổi logic.

**Việc cần làm:**
- Xóa `src/lib/mock/report-revenue.ts` (dead code, không import)
- Xóa `src/components/features/report/revenue-bar-chart.tsx` (component chết, không import)

**Cơ sở dữ liệu đang dùng:**
- `GET /api/supabase/invoices?status=completed&limit=1000&date_from=…&date_to=…&branch_id=…`
- `GET /api/supabase/service-categories` (dropdown lọc)
- `GET /api/supabase/package-categories` (dropdown lọc)

**Tùy chọn nâng cao (không bắt buộc):**
- Bổ sung doanh thu từ `/api/supabase/revenue-vouchers` (phiếu thu khác) vào tổng doanh thu
- Trừ chi phí từ `/api/supabase/expenditure-vouchers` để tính lợi nhuận ròng

---

### 3.2 Tab NHÂN VIÊN — Lấp khoảng trống dữ liệu

**Trạng thái:** ⚠️ 3/4 view dùng dữ liệu thực, 1 view (đánh giá) rỗng

#### View 1: Hoa hồng (`staff-commission-view.tsx`)

| Trường | Hiện tại | Cần làm |
|--------|----------|---------|
| staffGroup | ✅ Real (từ `/api/supabase/staff`) | — |
| staffName | ✅ Real | — |
| serviceCommission | ❌ Hardcode = 0 | Fetch `/api/supabase/commissions` → tính `serviceRevenue × commission_percent` |
| extraBonus | ✅ Real (= tipTotal) | — |
| total | ⚠️ = 0 + tip | Sau khi có commission: `serviceCommission + extraBonus` |

**Blueprint:**
```
Bước 1: Thêm hook useCommissions() vào report-staff-store.ts
  → GET /api/supabase/commissions?branch_id=…&active=true
  → Trả về: [{ staffId, staffName, commissionType: 'percent'|'fixed', commissionValue, ... }]

Bước 2: Sửa aggregateStaff() trong store
  → Với mỗi staff, tìm commission config tương ứng
  → Nếu type='percent': serviceCommission = serviceRevenue × value / 100
  → Nếu type='fixed': serviceCommission = serviceCount × value

Bước 3: Xóa src/lib/mock/report-staff.ts (dead code)
```

#### View 2: Năng suất (`staff-productivity-view.tsx`)

| Trường | Hiện tại | Cần làm |
|--------|----------|---------|
| serviceCount | ✅ Real | — |
| serviceValue | ✅ Real | — |
| customerRequestCount | ❌ Hardcode = 0 | Fetch `/api/supabase/bookings` → đếm booking_services có `staff_id` = staff đó (khác với staff mặc định) |
| customerRequestValue | ❌ Hardcode = 0 | Tính từ các booking services đó |

**Blueprint:**
```
Bước 1: Thêm hook useRawBookings() vào report-staff-store.ts
  → GET /api/supabase/bookings?date_from=…&date_to=…&branch_id=…&limit=500
  → Trả về booking + booking_services (có staff_id, service.price)

Bước 2: Sửa aggregateStaff()
  → Mở rộng booking_services, đếm những service mà customer chỉ định staff
  → Tính customerRequestValue = Σ service.price cho các service đó
```

#### View 3: Đánh giá (`staff-rating-view.tsx`)

| Trường | Hiện tại | Cần làm |
|--------|----------|---------|
| Tất cả | ❌ Rỗng (`[]`) | Cần bảng `customer_ratings` trong Supabase |

**Blueprint (2 tùy chọn):**
```
Tùy chọn A (khuyến nghị nếu chưa có nhu cầu đánh giá):
  → Ẩn view "Đánh giá" khỏi ViewModeToggle
  → Xóa staff-rating-view.tsx

Tùy chọn B (nếu muốn xây dựng tính năng đánh giá):
  Bước 1: Tạo bảng Supabase `customer_ratings`:
    - id (uuid PK)
    - staff_id (text FK → staff)
    - customer_id (text FK → customers)
    - booking_id (text FK → bookings, nullable)
    - rating (int 1-4: 1=kém, 2=trung bình, 3=tốt, 4=xuất sắc)
    - comment (text, nullable)
    - branch_id (text FK → branches)
    - created_at (timestamptz)

  Bước 2: Tạo API route /api/supabase/customer-ratings/route.ts (GET + POST)

  Bước 3: Thêm hook useRatings() vào report-staff-store.ts
    → GET /api/supabase/customer-ratings?date_from=…&date_to=…&branch_id=…

  Bước 4: aggregateStaff() bổ sung: đếm poorCount/averageCount/goodCount/excellentCount theo rating
```

#### View 4: Doanh thu (`staff-revenue-view.tsx`)

**Trạng thái:** ✅ Real. Các cột productRevenue/topupRevenue/packageRevenue/treatmentRevenue đang = 0 (hardcode cho type compatibility nhưng không hiển thị).

**Nâng cao (tùy chọn):**
```
Sửa aggregateStaff() để bổ sung:
  → productRevenue: Σ item.total where type='product' và staffName khớp
  → topupRevenue: Σ item.total where type='topup'
  → packageRevenue: Σ item.total where type='package'
```

---

### 3.3 Tab KHÁCH HÀNG — Thay mock bằng Supabase

**Trạng thái:** ❌ 4/4 view hoàn toàn MOCK. Store hardcode mock arrays, không có `fetch()`.

#### Kiến trúc hiện tại (cần thay)
```
report-customer-store.ts:
  invoiceData: [...mockCustomerInvoice]    ← HARDCODE
  serviceData: [...mockCustomerService]    ← HARDCODE
  frequencyData: [...mockCustomerFrequency]← HARDCODE
  sourceData: [...mockCustomerSource]      ← HARDCODE
```

#### Kiến trúc mục tiêu
```
report-customer-store.ts:
  useRawInvoices()     ← GET /api/supabase/invoices?status=completed
  useRawCustomers()    ← GET /api/supabase/customers?limit=500
  useRawSources()      ← GET /api/supabase/customer-sources
  useRawGroups()       ← GET /api/supabase/customer-groups
  useRawStaff()        ← GET /api/supabase/staff (cho dropdown)
  useRawServiceCats()  ← GET /api/supabase/service-categories (cho dropdown)

  // Per-view selectors (client-side aggregation):
  useCustomerInvoiceData()    ← aggregate(invoices, customers)
  useCustomerServiceData()    ← aggregate service items from invoices
  useCustomerFrequencyData()  ← group invoices by weekday
  useCustomerSourceData()     ← group customers by source
```

#### View 1: Hóa đơn khách hàng (`customer-invoice-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| customerCode | `/api/supabase/customers` → `code` |
| customerName | `/api/supabase/customers` → `name` |
| phone | `/api/supabase/customers` → `phone` |
| createdDate | `/api/supabase/customers` → `created_at` |
| customerType | `/api/supabase/customers` → `customer_type` ('old'/'new'/'kol') |
| invoiceCount | Đếm từ `/api/supabase/invoices` where `customer_id` = customer.id |
| serviceCount | Đếm invoice items where `type='service'` |
| productCount | Đếm invoice items where `type='product'` |
| buyPackageCount | Đếm invoice items where `type='package'` |
| usePackageCount | (cần `/api/supabase/packages/report` hoặc bảng `package_usages`) |
| cardCount | Đếm invoice items where `type='card'` (thẻ nạp) |
| discount | Σ invoice.discount per customer |
| payment | Σ invoice.final_amount per customer |
| debt | `/api/supabase/debts` where `customer_id` = customer.id |
| debtPayment | `/api/supabase/debt-invoices` where `status`='paid' |

**Blueprint:**
```typescript
// Bước 1: Thêm hooks vào report-customer-store.ts
function useRawInvoices() {
  return useQuery({
    queryKey: ["report-customer-invoices", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "completed");
      params.set("limit", "1000");
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/invoices?${params}`);
      const json = await res.json();
      return json.data || [];
    },
  });
}

function useRawCustomers() {
  return useQuery({
    queryKey: ["report-customer-customers", selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/customers?${params}`);
      const json = await res.json();
      return json.data || [];
    },
  });
}

// Bước 2: Hàm aggregate
function aggregateCustomerInvoices(invoices, customers) {
  // Group invoices by customer_id
  const byCustomer = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const cid = inv.customer_id;
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid)!.push(inv);
  }
  // Map customers → rows
  return customers.map(c => {
    const custInvoices = byCustomer.get(c.id) || [];
    const items = custInvoices.flatMap(inv => inv.items || []);
    return {
      customerCode: c.code || "",
      customerName: c.name,
      phone: c.phone || "",
      createdDate: c.created_at,
      customerType: c.customer_type || "new",
      invoiceCount: custInvoices.length,
      serviceCount: items.filter(i => i.type === "service").length,
      productCount: items.filter(i => i.type === "product").length,
      buyPackageCount: items.filter(i => i.type === "package").length,
      usePackageCount: 0, // TODO: cần package_usages
      cardCount: items.filter(i => i.type === "card").length,
      discount: custInvoices.reduce((s, i) => s + (Number(i.discount) || 0), 0),
      payment: custInvoices.reduce((s, i) => s + (Number(i.final_amount) || 0), 0),
      debt: 0, // TODO: fetch from /api/supabase/debts
      debtPayment: 0, // TODO: fetch from /api/supabase/debt-invoices
    };
  });
}

// Bước 3: Xóa mock imports khỏi store
// Bước 4: Thay dropdown options bằng hooks thật
//   useCustomerGroupOptions() → GET /api/supabase/customer-groups
//   useStaffOptions() → GET /api/supabase/staff
//   useServiceGroupOptions() → GET /api/supabase/service-categories
```

#### View 2: Dịch vụ (`customer-service-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| serviceName | Invoice items where `type='service'` → `name` |
| usageCount | Σ `quantity` cho mỗi service name |
| customerCount | Đếm distinct `customer_id` cho mỗi service name |
| totalUsage | = usageCount |

**Blueprint:** Aggregate invoice items (type='service') → group by name.

#### View 3: Tần suất (`customer-frequency-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| dayOfWeek | Từ `invoice.created_at` → `getDay()` |
| customerCount | Distinct customer_id per weekday |
| revenue | Σ `final_amount` per weekday |

**Blueprint:** Group invoices by weekday → count distinct customers + sum revenue.

#### View 4: Nguồn khách (`customer-source-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| sourceName | `/api/supabase/customer-sources` → `name` |
| customerCount | Đếm customers where `source_id` = source.id |
| invoiceCount | Đếm invoices of those customers |
| packageCount | Đếm invoice items type='package' |
| productCount | Đếm invoice items type='product' |
| serviceCount | Đếm invoice items type='service' |
| discount | Σ discount |
| revenue | Σ final_amount |

**Blueprint:** Fetch sources + customers + invoices → join by source_id.

#### Filter dropdowns

| Dropdown | Mock hiện tại | Thay bằng |
|----------|--------------|-----------|
| Nhóm khách hàng | `mockCustomerGroupOptions` | `GET /api/supabase/customer-groups` |
| Nhân viên | `mockStaffOptions` | `GET /api/supabase/staff` |
| Nhóm dịch vụ | `mockServiceGroupOptions` | `GET /api/supabase/service-categories` |

#### Cleanup
- Xóa `src/lib/mock/report-customer.ts` sau khi thay xong
- Đổi `dateFrom`/`dateTo` mặc định từ hardcode "24/06/2026" → tháng hiện tại

---

### 3.4 Tab CÔNG NỢ — Thay mock bằng Supabase

**Trạng thái:** ❌ 2/2 view hoàn toàn MOCK.

#### View 1: Giao dịch công nợ (`liabilities-transaction-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| type | `'debt'` (tạo công nợ) hoặc `'payment'` (thanh toán) |
| date | `/api/supabase/debt-invoices` → `created_at` |
| linkId | `debt_invoices.invoice_code` hoặc `debt_invoices.debt_id` |
| customerName | Join `debt_invoices` → `debts` → `customers` |
| customerPhone | Join qua `customers` |
| initialDebt | `debts.amount` |
| amount | `debt_invoices.amount` (debt) hoặc payment amount |
| remainingDebt | `debts.remaining_amount` |

**Blueprint:**
```typescript
// Bước 1: Thêm hooks vào report-liabilities-store.ts
function useRawDebts() {
  return useQuery({
    queryKey: ["report-liabilities-debts", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/supabase/debts?${params}`);
      const json = await res.json();
      return json.data || [];
    },
  });
}

function useRawDebtInvoices() {
  return useQuery({
    queryKey: ["report-liabilities-debt-invoices", selectedBranchId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBranchId && selectedBranchId !== "all")
        params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/debt-invoices?${params}`);
      const json = await res.json();
      return json.data || [];
    },
  });
}

// Bước 2: Aggregate transactions
function buildTransactions(debts, debtInvoices): Transaction[] {
  // Mỗi debt_invoices row = 1 giao dịch "debt" (tạo nợ)
  // Mỗi payment activity = 1 giao dịch "payment"
  // → Merge + sort by date
}

// Bước 3: Aggregate customer view
function buildCustomerLiabilities(debts, debtInvoices): CustomerLiability[] {
  // Group by customer_id
  // Per customer: initialDebt, debtIncurred, payment, remainingDebt
}
```

#### View 2: Công nợ theo khách hàng (`liabilities-customer-view.tsx`)

| Trường | Nguồn dữ liệu mục tiêu |
|--------|----------------------|
| customerId | `/api/supabase/debts` → `customer_id` |
| customerName | Join `debts` → `customers` |
| customerPhone | Join `customers` |
| initialDebt | Σ `debts.initial_amount` per customer |
| debtIncurred | Σ `debts.amount` per customer |
| payment | Σ payments per customer |
| remainingDebt | Σ `debts.remaining_amount` per customer |

#### Cleanup
- Xóa `src/lib/mock/report-liabilities.ts` sau khi thay xong

---

### 3.5 Tab KHO HÀNG — Bổ sung dropdown + cân nhắc migrate

**Trạng thái:** ✅ REAL (Prisma/SQLite). 3/3 view hoạt động.

#### Việc cần làm ngay (nhỏ)
```
Bổ sung dropdown nhóm sản phẩm:
  → Thêm hook useProductCategories()
  → GET /api/supabase/product-categories?active=true
  → Đổ vào <Select> (hiện chỉ có "Chọn nhóm sản phẩm" tĩnh)
```

#### Cân nhắc migrate sang Supabase (lớn, tùy chọn)
```
Hiện tại: /api/warehouse/report dùng Prisma (db.product, db.slipItem, db.importSlip...)

Để migrate:
  Bước 1: Tạo /api/supabase/warehouse/report/route.ts
    → Query Supabase tables: import_slips, export_slips, transfer_slips, slip_items, products
    → Mirror logic Prisma hiện tại (inventory, movement, transfer views)

  Bước 2: Cập nhật 3 view components để gọi endpoint mới

  Lưu ý: Cần đảm bảo dữ liệu warehouse đã được sync sang Supabase
  (hiện /api/supabase/warehouse/route.ts đã tồn tại cho individual slips)
```

---

### 3.6 Tab GÓI DỊCH VỤ — Bổ sung dropdown + cân nhắc migrate

**Trạng thái:** ✅ REAL (Prisma/SQLite). 2/2 view hoạt động.

#### Việc cần làm ngay (nhỏ)
```
Bổ sung dropdown nhóm gói:
  → Thêm hook usePackageCategories()
  → GET /api/supabase/package-categories?active=true
  → Đổ vào <Select> (hiện chỉ có "Chọn nhóm" tĩnh)

Bổ sung DateRangePicker:
  → Hiện trang này không có date picker
  → Thêm vào và truyền date_from/date_to cho API
```

#### Cân nhắc migrate sang Supabase (lớn, tùy chọn)
```
Hiện tại: /api/packages/report dùng Prisma (db.customerPackage, db.packageUsage)

Vấn đề: Chưa có bảng customer_packages / package_usages trong Supabase.

Để migrate:
  Bước 1: Tạo bảng Supabase:
    - customer_packages (id, customer_id, package_id, purchase_date, expiry_date, total_uses, used_count, status, branch_id)
    - package_usages (id, customer_package_id, customer_id, package_id, use_date, quantity, invoice_id, staff_id, branch_id)

  Bước 2: Tạo /api/supabase/packages/report/route.ts (GET view=purchased|usage)

  Bước 3: Cập nhật 2 view components để gọi endpoint mới

  Lưu ý: Có thể thay thế "purchased packages" bằng cách aggregate
  invoice items where type='package' (đã có ở revenue > package view)
```

---

## 4. Thứ tự ưu tiên thực hiện

| Ưu tiên | Tab | Mức độ | Công việc | Ước tính |
|---------|-----|--------|-----------|----------|
| **P0** | KHÁCH HÀNG | Cao | Thay 4/4 view mock → Supabase | ~4-6h |
| **P0** | CÔNG NỢ | Cao | Thay 2/2 view mock → Supabase | ~2-3h |
| **P1** | NHÂN VIÊN | Trung bình | Lấp hoa hồng (commissions API) | ~1-2h |
| **P1** | NHÂN VIÊN | Trung bình | Lấp "yêu cầu khách" (bookings API) | ~1-2h |
| **P2** | Cleanup | Thấp | Xóa 2 file mock dead-code + 1 component chết | ~15 phút |
| **P2** | KHO HÀNG | Thấp | Bổ sung dropdown nhóm sản phẩm | ~30 phút |
| **P2** | GÓI DỊCH VỤ | Thấp | Bổ sung dropdown nhóm + date picker | ~30 phút |
| **P3** | NHÂN VIÊN | Tùy chọn | Xây dựng tính năng đánh giá (cần bảng mới) | ~4-6h |
| **P3** | KHO HÀNG | Tùy chọn | Migrate Prisma → Supabase | ~6-8h |
| **P3** | GÓI DỊCH VỤ | Tùy chọn | Migrate Prisma → Supabase (cần bảng mới) | ~8-10h |

---

## 5. Cleanup — Xóa dead code

### Files cần xóa ngay (P2)
```
src/lib/mock/report-revenue.ts        ← Dead code, không import
src/lib/mock/report-staff.ts          ← Dead code, không import
src/components/features/report/revenue-bar-chart.tsx  ← Component chết
```

### Files cần xóa SAU khi thay mock (P0 xong)
```
src/lib/mock/report-customer.ts       ← Đang dùng, xóa sau khi thay Supabase
src/lib/mock/report-liabilities.ts    ← Đang dùng, xóa sau khi thay Supabase
```

### Files GIỮ NGUYÊN (utils, DB-agnostic)
```
src/lib/report-utils.ts               ← Pure functions, hoạt động với data thật
src/lib/report-staff-utils.ts         ← Pure functions
src/lib/report-customer-utils.ts      ← Pure functions
src/lib/report-liabilities-utils.ts   ← Pure functions
```

---

## 6. Appendix: Danh sách Supabase tables & API endpoints

### Tables đã có trong Supabase
| Table | API endpoint | Dùng cho tab |
|-------|-------------|-------------|
| `invoices` | `/api/supabase/invoices` | DOANH THU, NHÂN VIÊN, KHÁCH HÀNG |
| `customers` | `/api/supabase/customers` | KHÁCH HÀNG |
| `customer_groups` | `/api/supabase/customer-groups` | KHÁCH HÀNG (dropdown) |
| `customer_sources` | `/api/supabase/customer-sources` | KHÁCH HÀNG (view nguồn) |
| `staff` | `/api/supabase/staff` | NHÂN VIÊN, KHÁCH HÀNG (dropdown) |
| `staff_groups` | (qua staff.group join) | NHÂN VIÊN (dropdown) |
| `services` | `/api/supabase/services` | — |
| `service_categories` | `/api/supabase/service-categories` | DOANH THU, KHÁCH HÀNG (dropdown) |
| `packages` | `/api/supabase/packages` | — |
| `package_categories` | `/api/supabase/package-categories` | DOANH THU (dropdown) |
| `products` | `/api/supabase/products` | — |
| `product_categories` | `/api/supabase/product-categories` | KHO HÀNG (dropdown) |
| `bookings` | `/api/supabase/bookings` | NHÂN VIÊN (yêu cầu khách) |
| `booking_services` | (qua bookings join) | NHÂN VIÊN |
| `debts` | `/api/supabase/debts` | CÔNG NỢ, KHÁCH HÀNG |
| `debt_invoices` | `/api/supabase/debt-invoices` | CÔNG NỢ |
| `commissions` | `/api/supabase/commissions` | NHÂN VIÊN (hoa hồng) |
| `incentives` | `/api/supabase/incentives` | DOANH THU (khuyến mãi) |
| `branches` | (qua branch join) | Tất cả tabs |
| `import_slips` | `/api/supabase/warehouse` | KHO HÀNG |
| `export_slips` | `/api/supabase/warehouse` | KHO HÀNG |
| `transfer_slips` | `/api/supabase/warehouse` | KHO HÀNG |
| `slip_items` | (qua slips join) | KHO HÀNG |

### Tables CHƯA có trong Supabase (cần tạo nếu muốn dùng)
| Table | Dùng cho | Ghi chú |
|-------|---------|---------|
| `customer_ratings` | NHÂN VIÊN (đánh giá) | Cần tạo schema + API |
| `customer_packages` | GÓI DỊCH VỤ | Hiện chỉ có trong Prisma |
| `package_usages` | GÓI DỊCH VỤ | Hiện chỉ có trong Prisma |

### API endpoints Prisma (SQLite local, không phải Supabase)
| Endpoint | Dùng cho | Ghi chú |
|----------|---------|---------|
| `/api/warehouse/report` | KHO HÀNG | 3 views: inventory, movement, transfer |
| `/api/packages/report` | GÓI DỊCH VỤ | 2 views: purchased, usage |
| `/api/attendance/report` | (chưa dùng) | Có thể bổ sung cho NHÂN VIÊN |

---

> **Kết luận:** Ưu tiên cao nhất là thay mock ở 2 tab KHÁCH HÀNG (P0) và CÔNG NỢ (P0) — đây là 2 tab hoàn toàn dùng dữ liệu giả. Tab NHÂN VIÊN cần bổ sung hoa hồng (P1). Các tab KHO HÀNG và GÓI DỊCH VỤ đã dùng dữ liệu thực (Prisma) — chỉ cần bổ sung dropdown + cân nhắc migrate Supabase sau nếu cần đồng bộ cloud.
