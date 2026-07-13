# Technical Blueprint — Module Số Quỹ Tiền Mặt (Cash Fund)

> **Dựa trên**: Screenshots UI (5 ảnh) + Khảo sát codebase hiện tại
> **Mục tiêu**: Xây dựng Bản kế hoạch kỹ thuật cho Plan Mode, để Act Mode thực thi

---

## 1. TỔNG QUAN YÊU CẦU (Từ Screenshots)

### 1.1. Giao diện chính — Sổ quỹ tiền mặt (Ảnh 1)
- **Header**: Tiêu đề "Số quỹ tiền mặt", chọn chi nhánh, chọn thời điểm, các nút: "Lịch sử cài đặt", "Cài đặt", "+ Phiếu CHI", "+ Phiếu THU"
- **Summary Cards** (4 cards):
  - Quỹ đầu ngày (Opening Balance) — màu xanh lá
  - Tổng thu (Total Revenue) — màu xanh dương
  - Tổng chi (Total Expense) — màu đỏ
  - Quỹ hiện có (Current Balance) — màu vàng
- **Filter Bar**: Tìm kiếm, filter TẤT which/THU/CHI, chọn danh mục
- **Data Table**: Cột — Mã phiếu, Danh mục, Thời gian, Người tạo, Số tiền, Liên kết
- **Pagination**: Hiển thị từ X đến Y trên tổng số Z, chọn số dòng/trang

### 1.2. Dialog — Lịch sử cài đặt (Ảnh 2)
- **Title**: "Lịch sử cài đặt quỹ đầu ngày"
- **Date Range Picker**: Chọn khoảng thời gian
- **Table**: Giá trị, Thời gian, Người thao tác, Lý do,事无巨细 cài đặt
- **Pagination**: Tương tự table chính
- **Empty State**: Icon + chữ "Trống"

### 1.3. Dialog — Cài đặt số quỹ (Ảnh 3)
- **Title**: "Cài đặt số quỹ (Chi nhánh)"
- **Form**:
  - Tiền quỹ đầu ngày: Input số (có icon info)
  - Checkbox: "Quỹ cộng dồn cho ngày kế tiếp"
- **Actions**: Huỷ, OK

### 1.4. Dialog — Tạo phiếu CHI (Ảnh 4)
- **Title**: "Tạo phiếu CHI"
- **Form fields** (có dấu * là bắt buộc):
  - *Người lập phiếu: Input text (readonly, hiển thị email)
  - *Số tiền: Input number (placeholder: "Nhập số tiền")
  - *Hình thức: Select (default: "Tiền mặt")
  - *Lý do tạo phiếu: Textarea (placeholder: "Nhập lý do tạo phiếu")
  - Danh mục: Select (placeholder: "Chọn")
  - Mã phiếu: Input text (placeholder: "Nhập mã hoặc để trống")
  - *Ngày tháng: Date picker (default: today)
- **Actions**: Huỷ, OK

### 1.5. Dialog — Tạo phiếu THU (Ảnh 5)
- **Title**: "Tạo phiếu THU"
- **Form fields**: Giống phiếu CHI, chỉ khác loại phiếu (type = "revenue")

---

## 2. KIẾN TRÚC FILE (File Architecture)

### 2.1. Files CẦN TẠO MỚI

```
prisma/schema.prisma                          # Thêm models: CashFund, CashFundHistory, Transaction (extend)
src/app/api/cash-fund/route.ts                  # API: GET/POST cash fund data
src/app/api/cash-fund/history/route.ts          # API: GET cash fund setting history
src/app/api/cash-fund/setting/route.ts          # API: POST update opening balance
src/app/api/transactions/route.ts               # MODIFY: Extend existing with filters
src/app/rev-exp/page.tsx                        # MODIFY: Main page with CashFund module
src/components/cash-fund/
  ├── CashFundPage.tsx                          # Main container component
  ├── SummaryCards.tsx                          # 4 summary cards
  ├── TransactionTable.tsx                    # Data table with pagination
  ├── FilterBar.tsx                             # Search + filter controls
  ├── dialogs/
  │   ├── HistoryDialog.tsx                     # "Lịch sử cài đặt" dialog
  │   ├── SettingDialog.tsx                     # "Cài đặt số quỹ" dialog
  │   ├── CreateVoucherDialog.tsx               # "Tạo phiếu CHI/THU" dialog
  │   └── index.ts                              # Export all dialogs
  └── index.ts                                  # Export all components
src/lib/validations.ts                          # MODIFY: Add cashFund schemas
src/lib/query-keys.ts                           # MODIFY: Add cashFund query keys
src/stores/cash-fund-store.ts                   # Zustand store for local UI state
```

### 2.2. Files CẦN CHỈNH SỬA

| File | Thay đổi |
|------|----------|
| `prisma/schema.prisma` | Thêm models: `CashFund`, `CashFundHistory` |
| `src/app/api/transactions/route.ts` | Bổ sung filter theo type, category, date range |
| `src/app/rev-exp/page.tsx` | Thay thế placeholder bằng CashFundPage component |
| `src/lib/validations.ts` | Thêm `cashFundSchema`, `cashFundSettingSchema`, `voucherSchema` |
| `src/lib/query-keys.ts` | Thêm `cashFund` query keys |

---

## 3. GIẢI THUẬT & STATE (Algorithms & State)

### 3.1. Database Schema (Prisma)

```prisma
// Thêm vào schema.prisma

model CashFund {
  id            String   @id @default(cuid())
  branchId      String
  openingBalance Decimal @default(0)
  currentBalance Decimal @default(0)
  totalRevenue   Decimal @default(0)
  totalExpense   Decimal @default(0)
  date          DateTime @default(now())
  carryForward  Boolean  @default(false) // Quỹ cộng dồn
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  branch        Branch   @relation(fields: [branchId], references: [id])
  histories     CashFundHistory[]

  @@unique([branchId, date])
  @@map("cash_funds")
}

model CashFundHistory {
  id          String   @id @default(cuid())
  cashFundId  String
  value       Decimal  // Giá trị quỹ đầu ngày
  reason      String?  // Lý do thay đổi
  mechanism   String   // Cơ chế cài đặt: "manual", "auto_carry_forward"
  createdById String
  createdAt   DateTime @default(now())

  cashFund    CashFund @relation(fields: [cashFundId], references: [id], onDelete: Cascade)
  createdBy   User     @relation(fields: [createdById], references: [id])

  @@map("cash_fund_histories")
}

// Extend Transaction model
model Transaction {
  // ... existing fields ...
  voucherCode   String?  // Mã phiếu
  paymentMethod String   @default("cash") // "cash", "transfer", "card"
  // Thêm relation nếu cần
}
```

### 3.2. Core Functions (API Routes)

#### `GET /api/cash-fund`
- **Params**: `branchId`, `date` (optional, default today)
- **Returns**: `{ ok, data: { openingBalance, totalRevenue, totalExpense, currentBalance, transactions[] } }`
- **Logic**: 
  1. Tìm CashFund theo branchId + date
  2. Nếu không có, tạo mới với openingBalance = 0
  3. Tính totalRevenue, totalExpense từ Transaction
  4. currentBalance = openingBalance + totalRevenue - totalExpense

#### `POST /api/cash-fund/setting`
- **Body**: `{ branchId, openingBalance, carryForward, reason? }`
- **Returns**: `{ ok, data: CashFund }`
- **Logic**:
  1. Upsert CashFund cho branchId + date
  2. Tạo CashFundHistory record
  3. Nếu carryForward = true, cập nhật ngày mai với openingBalance = currentBalance

#### `GET /api/cash-fund/history`
- **Params**: `branchId`, `startDate`, `endDate`, `page`, `limit`
- **Returns**: `{ ok, data: { histories[], total, page, limit } }`

#### `POST /api/transactions` (Extend)
- **Body**: `{ type, category, amount, description, branchId, voucherCode?, paymentMethod?, date? }`
- **Returns**: `{ ok, data: Transaction }`
- **Logic**: Tạo transaction + cập nhật CashFund.currentBalance

### 3.3. State Management (Zustand)

```typescript
// src/stores/cash-fundadge-store.ts
interface CashFundState {
  // Filters
  branchId: string;
  date: Date;
  searchQuery: string;
  filterType: "all" | "revenue" | "expense";
  filterCategory: string;
  
  // Pagination
  page: number;
  limit: number;
  \ residue Dialog state
  isHistoryOpen: boolean;
  isSettingOpen: boolean;
  isVoucherOpen: boolean;
  voucherType: "expense" | "revenue";
  
  // Actions
  setBranchId: (id: string) => void;
  setDate: (date: Date) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: "all" | "revenue" | "expense") => void;
  setPage: (page: number) => void;
  openHistory: () => void;
  openSetting: () => void;
  openVoucher: (type: "expense" | "revenue") => void;
  closeAllDialogs: () => void;
}
```

### 3.4. TanStack Query Keys

```typescript
// Thêm vào src/lib/query-keys.ts
cashFund: {
  all: ["cashFund"] as const,
  detail: (branchId: string, date: string) => 
    ["cashFund", "detail", branchId, date] as const,
  history: (filters?: Record<string, unknown>) => 
    ["cashFund", "history", filters] as const,
  transactions: (filters?: Record<string, unknown>) => 
    ["cashFund", "transactions", filters] as const,
}
```

---

## 4. PHÂN RÃ TASK (Sequential Task Decomposition)

### Task 1: Database Schema & Migration
**Files**: `prisma/schema.prisma`
**Mô tả**: Thêm models CashFund, CashFundHistory, extend Transaction
**Acceptance**:
- [ ] Schema hợp lệ, không lỗi syntax
- [ ] `bun run db:push` thành công
- [ ] `bun run db:generate` thành công

### Task 2: Validation Schemas
**Files**: `src/lib/validations.ts`
**Mô tả**: Thêm Zod schemas cho cash fund operations
**Schemas cần thêm**:
- `cashFundSettingSchema`: branchId, openingBalance, carryForward, reason
- `voucherSchema`: type, amount, paymentMethod, description, category, voucherCode, date, branchId
- `cashFundHistoryFilterSchema`: branchId, startDate, endDate, page, limit

### Task 3: API Routes — Cash Fund
**Files**: 
- `src/app/api/cash-fund/route.ts` (GET, POST)
- `src/app/api/cash-fund/history/route.ts` (GET)
- `src/app/api/cash-fund/setting/route.ts` (POST)
**Mô tả**: Implement API endpoints cho cash fund operations
**Acceptance**:
- [ ] GET /api/cash-fund trả về đúng structure
- [ ] POST /api/cash-fund/setting cập nhật opening balance
- [ ] GET /api/cash-fund/history trả về danh sách có pagination

### Task 4: API Routes — Extend Transactions
**Files**: `src/app/api/transactions/route.ts`
**Mô tả**: Mở rộng API hiện tại để hỗ trợ filter và tạo phiếu thu/chi
**Acceptance**:
- [ ] GET hỗ trợ filter theo type, category, date range
- [ ] POST tạo transaction với đầy đủ fields

### Task 5: Zustand Store & Query Keys
**Files**: 
- `src/stores/cash-fund-store.ts` (NEW)
- `src/lib/query-keys.ts` (MODIFY)
**Mô tả**: Tạo store cho UI state và thêm query keys
**Acceptance**:
- [ ] Store quản lý filters, pagination, dialog state
- [ ] Query keys định nghĩa đúng pattern

### Task 6: UI Components — Summary Cards & Filter Bar
**Files**: 
- `src/components/cash-fund/SummaryCards.tsx`
- `src/components/cash-fund/FilterBar.tsx`
**Mô tả**: Tạo 4 summary cards và filter bar
**Acceptance**:
- [ ] Hiển thị đúng 4 cards với màu sắc tương ứng
- [ ] Filter bar có search, type filter, category select

### Task 7: UI Components — Transaction Table
**Files**: `src/components/cash-fund/TransactionTable.tsx`
**Mô tả**: Table hiển thị danh sách giao dịch với pagination
**Acceptance**:
- [ ] Hiển thị đúng columns: Mã phiếu, Danh mục, Thời gian, Người tạo, Số tiền, Liên kết
- [ ] Pagination hoạt động đúng
- [ ] Empty state khi không có data

### Task 8: Dialogs — History & Setting
**Files**: 
- `src/components/cash-fund/dialogs/HistoryDialog.tsx`
- `src/components/cash-fund/dialogs/SettingDialog.tsx`
**Mô tả**: Tạo 2 dialogs cho lịch sử và cài đặt
**Acceptance**:
- [ ] HistoryDialog: Date range picker, table, pagination
- [ ] SettingDialog: Form với input số, checkbox, validation

### Task 9: Dialog — Create Voucher (CHI/THU)
**Files**: `src/components/cash-fund/dialogs/CreateVoucherDialog.tsx`
**Mô tả**: Dialog tạo phiếu thu/chi
**Acceptance**:
- [ ] Form đầy đủ fields theo yêu cầu
- [ ] Validation với Zod
- [ ] Phân biệt CHI/THU qua prop type

### Task 10: Main Page Integration
**Files**: 
- `src/app/rev-exp/page.tsx`
- `src/components/cash-fund/CashFundPage.tsx`
**Mô tả**: Tích hợp tất cả components vào page chính
**Acceptance**:
- [ ] Page hiển thị đầy đủ các components
- [ ] Data fetching hoạt động đúng
- [ ] Dialogs mở/đóng đúng

---

## 5. ACCEPTANCE CRITERIA (Whole Blueprint)

1. **Database**: Schema đúng, migration thành công
2. **API**: Tất cả endpoints trả về đúng format `{ ok, data?, error? }`
3. **UI**: Giống 100% screenshots (layout, colors, fonts)
4. **Functionality**:
   - [ ] Hiển thị summary cards đúng số liệu
   - [ ] Filter và search hoạt động
   - [ ] Tạo phiếu thu/chi lưu vào DB
   - [ ] Cài đặt quỹ đầu ngày lưu history
   - [ ] Lịch sử cài đặt hiển thị đúng
5. **Quality Gate**:
   - [ ] `bun run lint` pass
   - [ ] TypeScript check pass
   - [ ] API test với curl/browser

---

## 6. LƯU Ý ĐẶC BIỆT

### 6.1. Tính toán số dư
```
Current Balance = Opening Balance + Total Revenue - Total Expense
```

### 6.2. Carry Forward Logic
- Nếu `carryForward = true`:
  - Ngày mai: `openingBalance = today.currentBalance`
  - Tạo CashFund record mới cho ngày mai

### 6.3. Mã phiếu tự động
- Nếu user không nhập mã phiếu, tự động generate theo pattern: `PC{timestamp}` hoặc `PT{timestamp}`

### 6.4. Phân quyền
- Chỉ admin/manager có quyền "Cài đặt số quỹ"
- Staff có quyền tạo phiếu thu/chi

---

*Blueprint này được tạo bởi Plan Mode (DeepSeek V4 Pro) để Act Mode (Kimi K2.6) thực thi.*
