# MODULE SPECS

## Module 2: Booking (Lịch hẹn)

### Overview
Module Booking quản lý lịch hẹn dịch vụ salon tóc nam với 2 chế độ xem: Khách hàng và Nhân viên.

### Views
1. **Customer View** (`/booking` - default)
   - Bảng 8 cột: Ngày đặt, Giờ, Mã, Người đặt, Ghi chú & dịch vụ, Thanh toán, Nhắc lịch, Trạng thái
   - Status dropdown per row (Mới/Đã xác nhận/Checkin/Checkout/Không đến/Đã hủy)
   - Pagination

2. **Staff View** (`/booking` - toggle)
   - Calendar grid: Time × Staff columns
   - Slot height = duration (30min = 1 slot, 60' = 2 slots, 90' = 3 slots)
   - Staff columns với count: "Chưa xếp nhân viên (N)" | "Tên NV(N)"
   - Time slots: 09:00 - 21:00, 30min intervals

### VERIFIED Items (from real screenshots)
- [VERIFIED] Header: "Lịch hẹn" + "Chào mừng: Level 1 Van Bảo" + "Xuất excel" + "Tạo mới"
- [VERIFIED] Filter: "Hôm nay" | "Ngày mai" | "7 ngày đến" + Date range + View toggle
- [VERIFIED] Customer view: Bảng 8 cột với status dropdown
- [VERIFIED] Staff view: Calendar grid với slot height theo duration
- [VERIFIED] Dialog: Khách hàng, Dịch vụ, Nhân viên, Ngày/giờ, Duration, Ghi chú, Trạng thái, Nhắc lịch

### Dialog "Tạo mới lịch hẹn" [VERIFIED]
**Layout:** Modal ~600px, 2 cột
- **Header:** "Tạo mới lịch hẹn" + nút X (đóng)
- **Body:** 2 cột (trái: thông tin KH + lịch hẹn, phải: thông tin dịch vụ)
- **Footer:** "Hủy" (trắng) + "Lưu" (xanh)

**Column TRÁI — Section 1: Thông tin khách hàng:**
- Số điện thoại (input + autocomplete from customers)
- Tên KH hoặc Mã KH (input + autocomplete)

**Column TRÁI — Section 2: Thông tin lịch hẹn:**
- Ngày (date picker, DD/MM/YYYY)
- Giờ (time picker, HH:MM)
- Nguồn khách hàng (select — CustomerSource)
- Kênh đặt lịch (select — CustomerChannel)
- Số khách (number, default 1, min 1)
- Trạng thái (select: Mới/Đã xác nhận/Checkin/Checkout/Không đến/Đã hủy, default "Đã xác nhận")
- Ghi chú (textarea)

**Column PHẢI — Section 3: Khách #1 (thông tin dịch vụ):**
- Nhóm dịch vụ (select — ServiceCategory)
- Chọn dịch vụ (select — Service, filter theo category)
- Chọn nhân viên (select — Staff)
- Nút xóa (thùng rác) — xóa service entry này
- Button "Thêm dịch vụ" (xanh) — thêm service entry mới (Khách #2, #3, ...)
- "0 d | 0 Phút" (text — tự tính tổng duration từ các services)
- Checkbox "Hiển ghi chú"

**Dynamic Logic:**
- Khi chọn "Thêm dịch vụ" → thêm section "Khách #N" mới (cùng fields)
- Tổng duration = sum(durations của các services đã chọn)
- Format duration: "X d | Y Phút" (d = days, Phút = minutes)
- Autocomplete cho SĐT + Tên KH/Mã KH (search /api/customers)

**API:**
- POST /api/bookings:
  body: {
    customerId: string,
    date: string (DD/MM/YYYY),
    time: string (HH:MM),
    customerSourceId: string,
    customerChannelId: string,
    numberOfCustomers: number,
    status: BookingStatus,
    note: string,
    services: Array<{
      serviceCategoryId: string,
      serviceId: string,
      staffId: string,
      showNote: boolean
    }>
  }

### Status Enum
- `NEW` → "Mới"
- `CONFIRMED` → "Đã xác nhận"
- `CHECKIN` → "Checkin"
- `CHECKOUT` → "Checkout"
- `NO_SHOW` → "Không đến"
- `CANCELLED` → "Đã hủy"

### Files
- `src/app/booking/page.tsx` — Main page with view toggle
- `src/components/features/booking/booking-filter.tsx` — Filter bar
- `src/components/features/booking/booking-customer-view.tsx` — Customer table view
- `src/components/features/booking/booking-staff-view.tsx` — Staff calendar view
- `src/components/features/booking/booking-dialog.tsx` — Create/Edit dialog
- `src/stores/booking-store.ts` — Zustand store
- `src/app/api/bookings/route.ts` — API routes
- `src/lib/constants.ts` — Booking status enum + labels

---

## Module 4: CSKH (Chăm sóc khách hàng)

### Overview
Module CSKH quản lý tập khách hàng, phản hồi dịch vụ và chương trình khuyến mãi.

### Sub-pages
1. **Tập khách hàng** (`/customer-care/customer-set`)
2. **Phản hồi dịch vụ** (`/customer-care/customer-feedback`)
3. **Chương trình khuyến mãi** (`/customer-care/incentives`)

---

### VERIFIED Items (from crawl data)

#### Layout (All 3 sub-pages)
- [VERIFIED] Sidebar: Global sidebar with menu items
- [VERIFIED] Main content area with CSKH heading
- [VERIFIED] Tabs: "Tập khách hàng" | "Phản hồi dịch vụ" | "Chương trình khuyến mãi"

#### customer-set Sub-page
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tab: "Tập khách hàng" (active)
- [VERIFIED] Sub-heading: "Tập khách hàng"
- [VERIFIED] Button: "Tạo mới" (icon: plus)

#### customer-feedback Sub-page
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tab: "Phản hồi dịch vụ" (active)
- [VERIFIED] Sub-heading: "Phản hồi dịch vụ"

#### incentives Sub-page
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tab: "Chương trình khuyến mãi" (active)
- [VERIFIED] Sub-heading: "Khuyến mãi"

---

### INFERRED Items (from context/patterns)

#### Data Models
- [INFERRED] `CustomerSet` model: id, name, note, createdAt, updatedAt
- [INFERRED] `CustomerFeedback` model: id, customerId, serviceId, rating, content, status, createdAt, updatedAt
- [INFERRED] `Incentive` model: id, name, description, discountType, discountValue, startDate, endDate, status, createdAt, updatedAt

#### API Routes
- [INFERRED] `GET/POST /api/customer-care/customer-set`
- [INFERRED] `GET/PUT/DELETE /api/customer-care/customer-set/[id]`
- [INFERRED] `GET/POST /api/customer-care/customer-feedback`
- [INFERRED] `GET/PUT/DELETE /api/customer-care/customer-feedback/[id]`
- [INFERRED] `GET/POST /api/customer-care/incentives`
- [INFERRED] `GET/PUT/DELETE /api/customer-care/incentives/[id]`

#### Components
- [INFERRED] `CustomerSetDialog`: Form dialog for creating/editing customer set
- [INFERRED] `CustomerFeedbackDialog`: Form dialog for creating/editing feedback
- [INFERRED] `IncentiveDialog`: Form dialog for creating/editing incentives
- [INFERRED] `CustomerSetColumns`: Table column definitions for customer sets
- [INFERRED] `CustomerFeedbackColumns`: Table column definitions for feedback
- [INFERRED] `IncentiveColumns`: Table column definitions for incentives

---

### UNKNOWN Items (need confirmation)

#### customer-set
- [UNKNOWN] Table columns: Not visible in crawl data (table was empty)
- [UNKNOWN] Dialog form fields: Not visible in crawl data (dialog was closed)
- [UNKNOWN] Filter/Search: Not visible in crawl data

#### customer-feedback
- [UNKNOWN] Table columns: Not visible in crawl data
- [UNKNOWN] Dialog form fields: Not visible in crawl data
- [UNKNOWN] Filter/Search: Not visible in crawl data

#### incentives
- [UNKNOWN] Table columns: Not visible in crawl data
- [UNKNOWN] Dialog form fields: Not visible in crawl data
- [UNKNOWN] Filter/Search: Not visible in crawl data

---

### Implementation Notes
- Use existing patterns from Module 3 (Customers) for CRUD operations
- Use TanStack Query for server state management
- Use Zustand for client state (dialogs, filters)
- Use shadcn/ui DataTable component for tables
- Implement placeholder for UNKNOWN items (do not fabricate)

---

## Module 1: Cashier (Update)

### Overview
Module Thu ngân đã được mở rộng với 2 sub-pages mới để quản lý danh sách đơn hàng và lịch sử hoạt động trên hóa đơn.

### Sub-pages (new)
1. **Danh sách đơn hàng** (`/cashier/invoices`) — [VERIFIED from structure.txt]
2. **Lịch sử hoạt động trên hóa đơn** (`/cashier/activity`) — [INFERRED from UI button]

---

### VERIFIED Items

#### /cashier/invoices — Danh sách đơn hàng
- [VERIFIED] Header: "Danh sách đơn hàng" + button "Lịch sử hóa đơn" (right)
- [VERIFIED] Filter: branch dropdown, date range (2 inputs + "~"), search input, 4 status radio buttons
- [VERIFIED] Table 11 columns: checkbox, STT, Mã đơn hàng, Tên KH, Số dịch vụ, Ngày tạo, Người tạo, Xếp NV, Trạng thái, Số lần in, Tổng tiền
- [VERIFIED] Status badges: Chưa thanh toán (vàng), Đã thanh toán (xanh), Đã hủy (đỏ)
- [VERIFIED] Staff badges: Chưa xếp NV (xám), Đã xếp NV (xanh)
- [VERIFIED] Pagination: "Hiển thị từ X đến Y trên tổng số Z", page size selector

#### /cashier/activity — Lịch sử hoạt động trên hóa đơn
- [VERIFIED] Header: "Lịch sử thao tác trên hóa đơn" + branch dropdown + "Chọn thời điểm" button
- [VERIFIED] Filter: search input "Tìm kiếm hóa đơn", action type dropdown
- [VERIFIED] Table 6 columns: Mã hóa đơn, Hành động, Chi tiết hóa đơn, Giá trị, Thời gian, Người thao tác
- [VERIFIED] Action badges 7 types with distinct colors

---

### INFERRED Items

#### Data Models
- [INFERRED] `InvoiceActivity` model: id, invoiceId, invoiceCode, action, detail, value, branchId, createdById, createdAt

#### API Routes
- [VERIFIED] GET /api/invoices?branchId=&from=&to=&search=&status=&page=&limit=
- [INFERRED] GET /api/invoices/[id]
- [INFERRED] GET /api/cashier/activity?branchId=&from=&to=&search=&action=&page=&limit=

#### Components
- [INFERRED] `InvoiceListTable`: 11-column table with status/staff badges
- [INFERRED] `InvoiceActivityTable`: 6-column table with action badges

---

### Navigation Flow
- `/cashier` (POS) → "Danh sách đơn hàng" button → `/cashier/invoices`
- `/cashier/invoices` → "Lịch sử hóa đơn" button → `/cashier/activity`

---

### Implementation Notes
- Status badge colors: vàng (chưa TT), xanh (đã TT), đỏ (đã hủy), xám (chưa xếp NV), xanh (đã xếp NV)
- Action badge colors: xanh (tạo HD), đỏ (xóa mặt hàng), cam (thay đổi giá/xếp NV/khuyến mãi), xanh lá (thanh toán)
- Date format: "HH:mm DD/MM/YYYY"
- Money format: "220,000" (no currency symbol)

---

## Module 3: Customers (Khách hàng) [UPDATED]

### Overview
Module Customers quản lý danh sách khách hàng salon tóc nam với list view 7 cột và dialog thêm/sửa 14 fields.

### VERIFIED Items (from real screenshots)

#### List View (`/customers`)
- [VERIFIED] Header: "Khách hàng" + "Nhận" (bell icon) + "Xuất excel" + "Thêm khách hàng" (xanh)
- [VERIFIED] Filter bar: Search "Tìm kiếm..." + Dropdown "Nhóm" + Dropdown "Nguồn"
- [VERIFIED] Table 7 columns: Mã, Họ tên & ghi chú, Điện thoại, Điểm tích lũy, Lịch sử chăm sóc, Lịch hẹn gần nhất, Actions (edit)

#### Dialog "Thêm khách hàng" [VERIFIED]
- [VERIFIED] Modal ~600px width, header + scrollable body + sticky footer
- [VERIFIED] 14 fields, 2-column layout (label trái 140px, input phải)
- [VERIFIED] Scrollbar dọc bên phải (max-height: 80vh, overflow-y: auto)
- [VERIFIED] Footer cố định: "Hủy" (xám) + "OK" (xanh)

**Fields:**
1. [VERIFIED] * Họ tên (input, required)
2. [VERIFIED] * Số điện thoại (input, required, VN phone format)
3. [VERIFIED] Mã khách hàng (input, optional)
4. [VERIFIED] Địa chỉ (input)
5. [VERIFIED] Email (input, type email)
6. [VERIFIED] Nhận (select: Email/SMS/Không nhận)
7. [VERIFIED] Ngày khởi tạo hồ sơ (date picker)
8. [VERIFIED] Nhóm khách (select — CustomerGroup)
9. [VERIFIED] Nguồn khách (select — CustomerSource)
10. [VERIFIED] Người giới thiệu (input, autocomplete placeholder)
11. [VERIFIED] Sinh nhật (date picker)
12. [VERIFIED] Giới tính (radio: Nam/Nữ)
13. [VERIFIED] ☐ Là khách quen (checkbox)
14. [VERIFIED] Ghi chú (textarea)

#### Special Links
- [VERIFIED] "Thêm lịch sử" (xanh) — mở dialog thêm care history
- [VERIFIED] "Đặt lịch" / date (xanh, icon calendar) — lịch hẹn gần nhất

### API
- [VERIFIED] GET /api/customers?search=&page=&limit=&groupId=&sourceId=
- [VERIFIED] POST /api/customers (14 fields)
- [VERIFIED] GET /api/customers/[id] (detail)
- [VERIFIED] PUT /api/customers/[id] (update)
- [VERIFIED] DELETE /api/customers/[id] (delete)

### Files
- `src/app/customers/page.tsx` — Main page with filter bar
- `src/components/features/customers/customer-columns.tsx` — 7-column table
- `src/components/features/customers/customer-dialog.tsx` — 14-field dialog with scrollbar
- `src/components/features/customers/customer-delete-dialog.tsx` — Delete confirmation
- `src/app/api/customers/route.ts` — API with groupId/sourceId filters
- `src/lib/validations.ts` — customerSchema with 14 fields
- `src/stores/customer-store.ts` — Zustand store

### Implementation Notes
- Dialog body: `max-height: calc(80vh - 120px); overflow-y: auto;`
- Custom scrollbar: thin, gray, smooth (webkit + firefox)
- Footer: sticky bottom with `border-t bg-white`
- Required validation: Họ tên + SĐT
- Edit mode: load data from API, populate all 14 fields

---

## Module 4: CSKH (Chăm sóc khách hàng) [UPDATED]

### Overview
Module CSKH quản lý tập khách hàng, phản hồi dịch vụ và chương trình khuyến mãi với 3 sub-pages có tabs navigation.

### Sub-Pages

#### 1. Tập khách hàng (`/customer-care`)
- [VERIFIED] Tabs: 3 sub-tabs (Tập khách hàng active, Phản hồi dịch vụ, Chương trình khuyến mãi)
- [VERIFIED] Header: "Tập khách hàng" + button "Tạo mới" (xanh, +icon, right)
- [VERIFIED] Filter: Search "Tìm kiếm..." (left)
- [VERIFIED] Table 2 columns: Tên tập, Mô tả hoặc ghi chú (with "..." actions)
- [VERIFIED] Actions dropdown: Edit, Delete

##### Dialog "Tạo mới tập khách hàng" [VERIFIED]
- [VERIFIED] Modal ~500-600px width, header + scrollable body + sticky footer
- [VERIFIED] Footer: "Hủy" (xám) + "Lưu" (xanh)

**Fields (5 fields):**
1. [VERIFIED] * Tên (input, placeholder "Nhập tên", required)
2. [VERIFIED] Mô tả hoặc ghi chú (textarea, placeholder "Nhập mô tả hoặc ghi chú")
3. [VERIFIED] ☐ Tự động cập nhật danh sách khách hàng (checkbox)
4. [VERIFIED] Điều kiện áp dụng (select dropdown, placeholder "Chọn điều kiện")
   - Mỗi điều kiện có nút xóa (thùng rác) bên phải
   - Button "Thêm điều kiện" (xanh) — dynamic add more conditions
5. [VERIFIED] (Dynamic) Multiple conditions — mỗi condition là 1 select với nút xóa

#### 2. Phản hồi dịch vụ (`/customer-care/feedback`)
- [VERIFIED] Tabs: 3 sub-tabs (Tập khách hàng, Phản hồi dịch vụ active, Chương trình khuyến mãi)
- [VERIFIED] Header: "Phản hồi dịch vụ" (no button)
- [VERIFIED] Filter: Dropdown "Đánh giá" (filter by rating: 1-5 stars)
- [VERIFIED] Table 4 columns: Đánh giá, Khách hàng, Dịch vụ, Thời gian
- [VERIFIED] Empty state:Ezreal "Trống" + text "Trống"
- [VERIFIED] Pagination: "Hiển thị từ X đến Y trên tổng số Z" + rows per page selector

#### 3. Chương trình khuyến mãi (`/customer-care/incentives`)
- [VERIFIED] Tabs: 2 sub-tabs (Khuyến mãi | Voucher)
- [VERIFIED] Header: "Khuyến mãi" + button "Tạo mới" (xanh, +icon, right) — chỉ tab Khuyến mãi

##### Tab "Khuyến mãi" [VERIFIED]
- [VERIFIED] Table 8 columns: Mã, Tên khuyến mãi, Giảm giá, Áp dụng, Số lượng, Đã sử dụng, Chưa sử dụng, Hết hạn
- [VERIFIED] Actions: nút "..." (ba chấm) per row → Edit, Delete
- [VERIFIED] Pagination: "Hiển thị từ X đến Y trên tổng số Z"

##### Tab "Voucher" [VERIFIED]
- [VERIFIED] Table 9 columns: Mã, Tên chương trình, Thời gian khả dụng, Giảm giá, Áp dụng, Số lượng, Đã sử dụng, Chưa sử dụng, Chi phí
- [VERIFIED] Empty state: Icon + text "Trống"
- [VERIFIED] Pagination: "Hiển thị từ X đến Y trên tổng số Z" + "20 / trang" dropdown

##### Dialog "Tạo mới chương trình khuyến mãi" [VERIFIED]
- [VERIFIED] Modal ~90% width, max-height 80vh
- [VERIFIED] Header: "Tạo mới chương trình khuyến mãi" + nút X
- [VERIFIED] Body: scrollable (max-height: calc(80vh - 120px), overflow-y: auto) — scrollbar dọc bên phải
- [VERIFIED] Footer: "Hủy" (trái, xám) + "OK Ossie" (phải, xanh) — cố định

**Fields (10 fields):**
1. [VERIFIED] Mã khuyến mãi (input, placeholder "Mã tự động")
2. [VERIFIED] *Tên khuyến mãi (input, placeholder "Nhập tên khuyến mãi") [required]
3. [VERIFIED] Áp dụng (select: Khoảng thời gian, Tất cả khách hàng, Chỉ thành viên)
4. [VERIFIED] Hết hạn sau (date range: Từ ngày + Đến ngày)
5. [VERIFIED] *Chỉ dành cho (tag input multi-select — branches) [required]
6. [VERIFIED] Loại giảm giá (select: Giảm giá dịch vụ, Giảm giá sản phẩm, Tặng dịch vụ, Tặng sản phẩm)
7. [VERIFIED] *Chọn dịch vụ (input/select) [required]
8. [VERIFIED] *Giảm giá (input + "%", placeholder "Nhập giảm giá") [required]
9. [VERIFIED] *Số lần sử dụng (input, default "1") [required]
10. [VERIFIED] Tự động áp dụng (select, placeholder "Chọn nhóm khách hàng mục tiêu")

### API
- [VERIFIED] GET /api/customer-care/customer-set?search=&page=&limit=
- [VERIFIED] POST /api/customer-care/customer-set
- [VERIFIED] GET /api/customer-care/customer-set/[id]
- [VERIFIED] PUT /api/customer-care/customer-set/[id]
- [VERIFIED] DELETE /api/customer-care/customer-set/[id]
- [VERIFIED] GET /api/customer-care/feedback?rating=&page=&limit=
- [VERIFIED] GET /api/customer-care/incentives?search=&page=&limit=&type=promotion
- [VERIFIED] POST /api/customer-care/incentives
- [VERIFIED] GET /api/customer-care/incentives/[id]
- [VERIFIED] PUT /api/customer-care/incentives/[id]
- [VERIFIED] DELETE /api/customer-care/incentives/[id]
- [VERIFIED] GET /api/customer-care/vouchers?search=&page=&limit=

### Files
- `src/app/customer-care/page.tsx` — Tập khách hàng page
- `src/app/customer-care/feedback/page.tsx` — Phản hồi dịch vụ page
- `src/app/customer-care/incentives/page.tsx` — Chương trình khuyến mãi page
- `src/components/features/customer-care/customer-care-tabs.tsx` — Shared 3-tabs component
- `src/components/features/customer-care/customer-set-list.tsx` — 2-column table
- `src/components/features/customer-care/customer-set-dialog.tsx` — 5-field dialog with dynamic conditions
- `src/components/features/customer-care/customer-set-actions.tsx` — "..." dropdown menu
- `src/components/features/customer-care/customer-set-delete-dialog.tsx` — Delete confirmation
- `src/components/features/customer-care/feedback-list.tsx` — 4-column table
- `src/components/features/customer-care/feedback-filter.tsx` — Rating dropdown filter
- `src/components/features/customer-care/empty-state.tsx` — "Trống" empty state
- `src/components/features/customer-care/incentives-tabs.tsx` — 2 sub-tabs (Khuyến mãi | Voucher)
- `src/components/features/customer-care/promotion-list.tsx` — 8-column promotion table
- `src/components/features/customer-care/voucher-list.tsx` — 9-column voucher table
- `src/components/features/customer-care/incentive-dialog.tsx` — 10-field dialog with scrollbar
- `src/components/features/customer-care/incentive-actions.tsx` — "..." dropdown menu
- `src/stores/customer-care-store.ts` — Zustand store
- `src/app/api/customer-care/customer-set/route.ts` — GET/POST API
- `src/app/api/customer-care/customer-set/[id]/route.ts` — GET/PUT/DELETE API
- `src/app/api/customer-care/feedback/route.ts` — GET API with rating filter
- `src/app/api/customer-care/incentives/route.ts` — GET/POST API
- `src/app/api/customer-care/incentives/[id]/route.ts` — GET/PUT/DELETE API
- `src/app/api/customer-care/vouchers/route.ts` — GET API

---

## Module 7: Thu Chi (Revenue & Expenditure)

### Overview
Module Thu Chi quản lý sổ quỹ tiền mặt, phiếu thu và phiếu chi với mock data.

### Part 1: Sổ quỹ tiền mặt (Cash Fund) — DONE
- URL: `/rev-exp`
- Already implemented (see CASHFUND-BLUEPRINT.md)

### Part 2: Phiếu thu (Revenue Voucher) — DONE
- URL: `/rev-exp/revenue`

#### List View
- Header: "Phiếu thu" + Branch selector + Date picker + "Loại phiếu thu" button + "Tạo phiếu thu" button
- Search bar: filter by code, category, or creator
- Table 8 columns: Mã phiếu, Danh mục, Thời gian, Người tạo, Số tiền, Thanh toán bằng, Liên kết, Hành động
- Pagination: "Hiển thị từ X đến Y trên tổng số Z"
- Empty state: "Trống"

#### Modal 1: Danh sách loại phiếu thu
- Title: "Danh sách loại phiếu thu"
- Table 3 columns: Tên loại, Mã, Hành động (Delete)
- Button "Thêm loại phiếu thu" → opens Dialog 2
- Pagination

#### Dialog 2: Thêm loại phiếu thu
- Title: "Thêm loại phiếu thu"
- 1 field: Tên loại (required)
- Buttons: Hủy + OK

#### Dialog 3: Tạo phiếu thu
- Title: "Tạo phiếu thu"
- 7 fields: Người lập phiếu (readonly), Số tiền, Hình thức, Lý do tạo phiếu, Danh mục, Mã phiếu, Ngày tháng
- Buttons: Hủy + OK

#### View 4: Chi tiết phiếu thu
- Title: "Chi tiết phiếu thu #{code}"
- Info section: Mã phiếu, Khách hàng, SĐT, Ngày giờ, Số thứ tự, Trạng thái
- Services table 7 columns
- Image gallery placeholder
- Payment summary
- Footer 5 buttons (all toast "Tính năng sẽ khả dụng ở giai đoạn lõi")

### Files
- `src/app/(dashboard)/rev-exp/revenue/page.tsx` — Page entry
- `src/components/features/revenue-voucher/revenue-voucher-page.tsx` — Main container
- `src/components/features/revenue-voucher/receipt-table.tsx` — Receipt table
- `src/components/features/revenue-voucher/receipt-row-actions.tsx` — Edit/Delete actions
- `src/components/features/revenue-voucher/category-modal.tsx` — Modal 1
- `src/components/features/revenue-voucher/category-form-dialog.tsx` — Dialog 2
- `src/components/features/revenue-voucher/create-receipt-dialog.tsx` — Dialog 3
- `src/components/features/revenue-voucher/receipt-detail-dialog.tsx` — View 4
- `src/types/revenue-voucher.ts` — Types
- `src/lib/mock/revenue-voucher.ts` — Mock data
- `src/stores/revenue-voucher-store.ts` — Zustand store
- `src/lib/revenue-voucher-utils.ts` — Utils

## Module 8: Báo cáo (Reports)

### Overview
Module Báo cáo gồm 9 tabs: DOANH THU, NHÂN VIÊN, KHÁCH HÀNG, CÔNG NỢ, THU CHI, KHO HÀNG, THẺ TIỀN MẶT, GÓI DỊCH VỤ, TÍCH ĐIỂM. Tab DOANH THU có 3 chế độ xem.

### Tab 1: DOANH THU (`/report/revenue`)

#### 9 View Modes
1. **Hóa đơn** (default)
    - 4 summary cards: SỐ LƯỢNG HÓA ĐƠN, DOANH THU HÓA ĐƠN, ĐÃ THANH TOÁN, NỢ
    - Table 8 cột: STT, Mã hóa đơn, Ngày tạo, Khách hàng, Tổng tiền, Phụ thu, Thuế VAT, Đã thanh toán
    - Pagination + "In tổng hợp" button

2. **Phương thức thanh toán**
    - 2 summary cards: method cao nhất + Tổng cộng
    - Table 9 cột: Ngày, Tiền mặt, Chuyển khoản, Quẹt thẻ, Thẻ tài khoản, Điểm tích lũy, Khác, Ghi nợ, Tổng cộng
    - Pagination

3. **Thống kê theo thời gian**
    - Toggle Giờ/Ngày/Tháng
    - Bar chart (Recharts) — trục X: thời gian, trục Y: doanh thu
    - Table 7 cột: Thời gian, Số lượng đơn hàng, Tổng tiền, Chiết khấu, Hoa hồng, Đã thanh toán, Tổng doanh thu
    - Footer "Tổng cộng" row

4. **Dịch vụ**
    - Filter: dropdown "chọn nhóm dịch vụ" (reuse ServiceCategory from Module 6)
    - Table 6 cột: Dịch vụ, Số lượng, Đơn giá gốc, Tổng tiền (sky), Giảm giá, Doanh thu
    - Footer "TỔNG CỘNG" row (sum all numeric columns)
    - "Xuất excel" button → toast
    - NO pagination, NO summary cards, NO chart

5. **Gói dịch vụ**
    - Filters: dropdown "Bán gói dịch vụ" (Tất cả/Bán mới/Gia hạn/Nâng cấp) + dropdown "chọn nhóm" (reuse PackageCategory)
    - Table 6 cột: Dịch vụ, Số lượng, Đơn giá, Tổng tiền (sky), Giảm giá, Doanh thu
    - Pagination: "Hiển thị từ X đến Y trên tổng số Z"
    - Empty state: "Trống"
    - "Xuất excel" button → toast
    - NO summary cards, NO chart, NO footer total

6. **Liệu trình**
    - Filters: dropdown "Bản liệu trình" (Tất cả/Bản 1/Bản 2/Bản 3) + dropdown "chọn nhóm" (Tất cả/Nhóm 1/Nhóm 2)
    - Table 6 cột: Liệu trình, Số lượng, Đơn giá, Tổng tiền (sky), Giảm giá, Doanh thu
    - Pagination: "Hiển thị từ X đến Y trên tổng số Z"
    - Empty state: "Trống" (mock empty)
    - "X categorical" button → toast
    - NO summary cards, NO chart, NO footer total

7. **Bán hàng** [NEW]
    - Table 8 cột: Mã sản phẩm, Tên sản phẩm, Số lượng, Số đơn hàng, Đơn giá, Tổng tiền (sky), Giảm giá, Doanh thu
    - Footer "TỔNG CỘNG" row (sum all numeric columns)
    - "Xuất excel" button → toast
    - NO pagination, NO summary cards, NO chart, NO filter

8. **Bán/nạp thẻ (Thu ngân)** [NEW]
    - Filters: dropdown "Loại" (Tất cả/Bán thẻ/Nạp thẻ) + search input "Tìm khách hàng..."
    - 4 summary cards: Bán thẻ (count + amount), Nạp thẻ (count + amount), Tổng cộng (amount), Thưởng (bonus)
    - Table 7 cột: Mã thẻ, Mã hóa đơn, Khách hàng, Loại, Ngày tạo, Số tiền (sky), Thưởng
    - "Xuất excel" button → toast
    - NO pagination, NO chart, NO footer total

9. **Khách hàng** [NEW]
    - Bar chart (Recharts) — Top 10 khách hàng theo doanh thu
    - 1 summary card: Tổng doanh thu
    - Table 7 cột: Tên khách hàng, Số điện thoại, Số đơn hàng, Số lượng DV sử dụng, Số lượng SP mua, Số lượng gói mua, Doanh thu (sky)
    - "Xuất excel" button → toast
    - NO pagination, NO filter, NO footer total

### Types Added
- `SalesRevenue` — View 7: id, productCode, productName, quantity, orderCount, unitPrice, totalAmount, discount, revenue
- `CashCardRevenue` — View 8: id, cardCode, invoiceCode, customerName, type, createdAt, amount, bonus
- `CashCardRevenueSummary` — View 8 summary: sellCardCount, sellCardAmount, topupCount, topupAmount, totalAmount, totalBonus
- `CustomerRevenue` — View 9: id, customerName, customerPhone, orderCount, serviceUsedCount, productBoughtCount, packageBoughtCount, revenue

### Utils Added
- `computeSalesRevenueTotal(rows)` → CategoryRevenueTotal + orderCount
- `computeCashCardRevenueSummary(items)` → CashCardRevenueSummary
- `filterCashCardRevenue(items, subType, customerSearch)` → filtered CashCardRevenue[]
- `computeCustomerRevenueTotal(items)` → number (total revenue)

### Store Updates
- Added state: `salesData`, `cashCardData`, `customerData`, `cashCardSubTypeFilter`, `customerSearch`
- Added actions: `setCashCardSubTypeFilter`, `setCustomerSearch`
- Added selectors: `useSalesRevenueData()`, `useCashCardRevenueData()`, `useCustomerRevenueData()`

### New Components
- `src/components/features/report/revenue-sales-view.tsx` — View 7: Bán hàng
- `src/components/features/report/revenue-cash-card-view.tsx` — View 8: Bán/nạp thẻ
- `src/components/features/report/revenue-customer-view.tsx` — View 9: Khách hàng

### Updated Components
- `src/components/features/report/revenue-view-mode-toggle.tsx` — Added 3 new options: sales, cash-card, customer
- `src/app/(dashboard)/report/revenue/page.tsx` — Added 3 new conditional render blocks

### Mock Data
- `mockSalesRevenue: SalesRevenue[]LSL []` (empty)
- `mockCashCardRevenue: CashCardRevenue[]` (empty)
- `mockCashCardSubTypeOptions = ["Tất cả", "Bán thẻ", "Nạp thẻ"]`
- `mockCustomerRevenue: CustomerRevenue[]` — 5 rows with revenue=220,000 + 6 empty rows (revenue=0) for chart

---

### Tab 2: NHÂN VIÊN (`/report/staff`) — DONE

#### 4 View Modes
1. **Hoa hồng** (default)
   - Filter: dropdown "Tất cả nhóm nhân viên" + "Xuất excel" button
   - Table 6 cột: Nhóm nhân viên, Tên nhân viên, Hoa hồng làm dịch vụ, Thưởng thêm, Tổng, Actions (Xuất excel, Xem chi tiết)
   - Footer total row
   - Pagination: "Hiển thị từ X đến Y trên tổng số Z"

2. **Năng suất làm việc**
   - Filter: dropdown "Tất cả nhóm nhân viên" + "Xuất excel" button
   - Table 6 cột: Tên nhân viên, Nhóm, Số lượt làm dịch vụ, Số lượt khách yêu cầu, Giá trị làm dịch vụ, Giá trị làm dịch vụ khách yêu cầu
   - Footer total row
   - Pagination

3. **Đánh giá khách hàng**
   - Filter: dropdown "Điểm đánh giá" | "Phản hồi của khách" + "Xuất excel" button
   - 7 summary cards: Tổng lượt đánh giá, Kém, Trung bình, Tốt, Rất tốt, Tổng điểm đánh giá, Điểm trung bình
   - Table 9 cột: Nhân viên, Nhóm nhân viên, SL Kém, SL Trung bình, SL Tốt, SL Rất tốt, Tổng lượt, Tổng điểm, Điểm trung bình
   - Footer total row
   - Pagination

4. **Doanh thu**
   - Filter: dropdown "Tất cả" + search "Tìm tên nhân viên" + "Xuất excel" button
   - Table 17 cột: Tên nhân viên, Số lượng làm DV, Làm dịch vụ, Số lượng bán DV, Bán dịch vụ, Số lượng bán SP, Bán sản phẩm, Số lượng bán/nạp thẻ, Bán/nạp thẻ, Số lượng bán gói, Bán gói, Số lượng bán liệu trình, Bán liệu trình, Số lượng thu khác, Thu khác, Tổng, Xuất File
   - Footer total row
   - Pagination

#### Types Added
- `StaffViewMode` — "commission" | "productivity" | "rating" | "revenue"
- `RatingSubType` — "score" | "feedback"
- `StaffCommission` — id, staffGroup, staffName, serviceCommission, extraBonus, total
- `StaffProductivity` — id, staffName, staffGroup, serviceCount, customerRequestCount, serviceValue, customerRequestValue
- `StaffRating` — id, staffName, staffGroup, poorCount, averageCount, goodCount, excellentCount, totalReviews, totalScore, averageScore
- `StaffRevenue` — id, staffName, staffGroup, serviceCount, serviceRevenue, serviceSaleCount, productSaleCount, productRevenue, topupCount, topupRevenue, packageCount, packageRevenue, treatmentCount, treatmentRevenue, otherIncome, otherCount, total

#### Utils Added
- `computeCommissionSummary(commissions)` → { totalServiceCommission, totalExtraBonus, total }
- `computeProductivitySummary(productivity)` → { totalServiceCount, totalCustomerRequestCount, totalServiceValue, totalCustomerRequestValue }
- `computeRatingSummary(ratings)` → { totalPoor, totalAverage, totalGood, totalExcellent, totalReviews, totalScore, averageScore }
- `computeRevenueSummary(revenues)` → { totalServiceCount, totalServiceRevenue, totalProductRevenue, totalTopupRevenue, totalPackageRevenue, totalTreatmentRevenue, totalOtherIncome, total }
- `filter*ByGroup(data, group)` → filtered data by staff group

#### Store
- `useReportStaffStore` — Zustand store with viewMode, staffGroupFilter, ratingSubType, pagination, data
- Selectors: `useCommissionReportData()`, `useProductivityReportData()`, `useRatingReportData()`, `useRevenueReportData()`

#### Components
- `src/components/features/report/staff-report-page.tsx` — Main container with view toggle + filter
- `src/components/features/report/staff-view-mode-toggle.tsx` — View mode dropdown (4 options)
- `src/components/features/report/staff-filter-button.tsx` — Group filter + export button
- `src/components/features/report/staff-commission-view.tsx` — View 1: Hoa hồng
- `src/components/features/report/staff-productivity-view.tsx` — View 2: Năng suất làm việc
- `src/components/features/report/staff-rating-view.tsx` — View 3: Đánh giá khách hàng
- `src/components/features/report/staff-revenue-view.tsx` — View 4: Doanh thu

#### Constants Added
- `StaffViewModeLabel` — Record<StaffViewMode, string>
- `StaffGroupOptions` — string[]
- `RatingSubTypeOptions` — string[]

### Module 8 Part 3: Báo cáo / Tab KHÁCH HÀNG (`/report/customer`)

#### Overview
Tab KHÁCH HÀNG với 4 chế độ xem: Hóa đơn, Dịch vụ, Tần suất, Nguồn khách. UI clone với mock data.

#### Views
1. **Hóa đơn (Invoice)** — `CustomerInvoiceView`
   - 4 summary cards: KHÁCH CŨ, KHÁCH MỚI, KHÁCH VÀNG LAI, TỔNG SỐ KHÁCH
   - Filter bar: dropdown nhóm KH, search tên KH, dropdown nhân viên
   - Table 12 cột: Khách hàng, Hóa đơn, Dịch vụ, Sản phẩm, Mua Gói, Làm gói, Nạp thẻ, Giảm giá, Thanh toán, Nợ, Thanh Toán Nợ, Chi tiết
   - Pagination

2. **Dịch vụ (Service)** — `CustomerServiceView`
   - Filter: dropdown nhóm dịch vụ
   - Table 4 cột: Tên dịch vụ, Lượt sử dụng, Khách hàng sử dụng, Tổng lượt(bao gồm đơn giá phụ)
   - Pagination

3. **Tần suất (Frequency)** — `CustomerFrequencyView`
   - Toggle Giờ/Ngày
   - 2 summary cards: THEO SỐ LƯỢNG, THEO DOANH THU
   - Recharts BarChart (theo số lượng)
   - Table 3 cột: Ngày trong tuần, Lượng khách, Doanh thu
   - Footer TỔNG CỘNG

4. **Nguồn khách (Source)** — `CustomerSourceView`
   - Table 8 cột: Nguồn khách, Số khách, Số hóa đơn, Số gói, Số sản phẩm, Số dịch vụ, Giảm giá, Doanh thu
   - Pagination

#### Types Added
- `CustomerViewMode` — "invoice" | "service" | "frequency" | "source"
- `CustomerType` — "old" | "new" | "kol"
- `FrequencyUnit` — "hour" | "day"
- `CustomerInvoice` — id, customerCode, customerName, phone, createdDate, customerType, invoiceCount, serviceCount, productCount, buyPackageCount, usePackageCount, cardCount, discount, payment, debt, debtPayment
- `CustomerService` — id, serviceName, usageCount, customerCount, totalUsage
- `CustomerFrequency` — id, dayOfWeek, customerCount, revenue
- `CustomerSource` — id, sourceName, customerCount, invoiceCount, packageCount, productCount, serviceCount, discount, revenue

#### Utils Added
- `computeInvoiceSummary(invoices)` → { oldCount, oldRevenue, newCount, newRevenue, kolCount, kolRevenue, totalCount, totalRevenue }
- `filterCustomerByName(data, search)` → filtered by customer name
- `filterByCustomerType(data, type)` → filtered by customer type
- `computeFrequencyTotal(data)` → { customerCount, revenue }
- `getChartData(data)` → chart data for Recharts

#### Store
- `useReportCustomerStore` — Zustand store with viewMode, customerGroupFilter, customerNameSearch, staffFilter, customerTypeFilter, frequencyUnit, page, pageSize
- Selectors: `useCustomerInvoiceData()`, `useCustomerServiceData()`, `useCustomerFrequencyData()`, `useCustomerSourceData()`

#### Components
- `src/components/features/report/customer-report-page.tsx` — Main container
- `src/components/features/report/customer-view-mode-toggle.tsx` — View mode dropdown (4 options)
- `src/components/features/report/customer-filter-button.tsx` — Customer type filter (Khách cũ/mới/KOL)
- `src/components/features/report/customer-invoice-view.tsx` — View 1: Hóa đơn
- `src/components/features/report/customer-service-view.tsx` — View 2: Dịch vinz vụ
- `src/components/features/report/customer-frequency-view.tsx` — View 3: Tần suất
- `src/components/features/report/customer-source-view.tsx` — View 4: Nguồn khách

#### Constants Added
- `CustomerViewModeLabel` — Record<CustomerViewMode, string>
- `CustomerTypeFilterOptions` — string[]
- `CustomerGroupFilterOptions` — string[]
- `StaffOptions` — string[]
- `ServiceGroupOptions` — string[]

### Module 8 Part 5: Báo cáo / Tab THU CHI (`/report/revexp`) — DONE

#### Overview
Tab THU CHI với 3 chế độ xem: Tất cả, THU, CHI. UI clone với mock data.

#### Views
1. **Tất cả (All)** — Hiển thị cả thu và chi
2. **THU** — Chỉ hiển thị phiếu thu
3. **CHI** — Chỉ hiển thị phiếu chi

- Filter bar: dropdown "Tất cả/THU/CHI" + dropdown "Danh mục" + dropdown "Phương thức thanh toán" + "Xuất excel" button
- 3 summary cards: LỢI NHUẬN (= TỔNG THU - TỔNG CHI), TỔNG THU, TỔNG CHI
- Table 8 cột: Loại phiếu, Ngày, Mã phiếu, Người nhập/nộp, Danh mục, Lý do, Thanh toán bằng, Số tiền
- Pagination: "Hiển thị từ X đến Y trên tổng số Z"
- Empty state: "Trống"

#### Types Added
- `RevexpViewMode` — "all" | "revenue" | "expense"
- `RevexpTransaction` — id, type, date, code, createdBy, categoryId, categoryName, reason, paymentMethod, amount
- `RevexpSummary` — totalRevenue, totalExpense, profit

#### Utils Added
- `filterRevexpTransactions(transactions, viewMode, categoryId?)` → filtered transactions
- `filterByPaymentMethod(transactions, paymentMethod)` → filtered by payment method
- `computeRevexpSummary(transactions)` → { totalRevenue, totalExpense, profit }
- `getUniqueCategories(transactions, type?)` → unique categories for dropdown
- `sortRevexpTransactions(transactions)` → sorted by date descending

#### Store
- `useReportRevexpStore` — Zustand store with viewMode, categoryFilter, paymentMethodFilter, page, pageSize
- Selector: `useRevexpTransactionData()` → { data, summary, page, pageSize, total }

#### Components
- `src/components/features/report/revexp-report-page.tsx` — Main container with header, ReportTabs, filter bar, RevexpTransactionView
- `src/components/features/report/revexp-view-mode-toggle.tsx` — View mode dropdown (3 options)
- `src/components/features/report/revexp-transaction-view.tsx` — Summary cards + data table + pagination

#### Constants Added
- `RevexpViewModeLabel` — Record<RevexpViewMode, string>
- `PaymentMethodOptions` — { value, label }[]

### 6 Tabs còn lại (placeholder)
- `/report/liabilities`, `/report/warehouse`, `/report/cashcard`, `/report/service-package`, `/report/loyalty`
- Render placeholder: "Tính năng sẽ khả dụng ở giai đoạn sau"

### Files
- `src/app/(dashboard)/report/revenue/page.tsx` — Page entry
- `src/app/(dashboard)/report/revenue/layout.tsx` — Layout
- `src/app/(dashboard)/report/page.tsx` — Redirect to /report/revenue
- `src/app/(dashboard)/report/layout.tsx` — Shared report layout
- `src/components/features/report/report-tabs.tsx` — 9 tabs navigation
- `src/components/features/report/report-placeholder.tsx` — Placeholder for 8 tabs
- `src/components/features/report/revenue-view-mode-toggle.tsx` — View mode dropdown (9 options)
- `src/components/features/report/revenue-invoice-view.tsx` — View 1: Hóa đơn
- `src/components/features/report/revenue-payment-method-view.tsx` — View 2: Phương thức thanh toán
- `src/components/features/report/revenue-time-statistic-view.tsx` — View 3: Thống kê theo thời gian
- `src/components/features/report/revenue-summary-cards.tsx` — Summary cards component
- `src/components/features/report/revenue-bar-chart.tsx` — Recharts bar chart
- `src/components/features/report/revenue-category-table.tsx` — Reusable table (View 4-9)
- `src/components/features/report/revenue-service-view.tsx` — View 4: Dịch vụ
- `src/components/features/report/revenue-package-view.tsx` — View 5: Gói dịch vụ
- `src/components/features/report/revenue-treatment-view.tsx` — View 6: Liệu trình
- `src/components/features/report/revenue-sales-view.tsx` — View 7: Bán hàng
- `src/components/features/report/revenue-cash-card-view.tsx` — View 8: Bán/nạp thẻ
- `src/components/features/report/revenue-customer-view.tsx` — View 9: Khách hàng
- `src/types/report.ts` — Types (9 view modes + interfaces)
- `src/lib/mock/report-revenue.ts` — Mock data (all 9 views)
- `src/stores/report-revenue-store.ts` — Zustand store (9 views state + selectors)
