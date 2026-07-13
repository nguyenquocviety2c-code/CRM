# UI FIX BLUEPRINT — 11 Module Root Pages

## Section A — File Architecture

### Pages to MODIFY (11 files)
| # | File | Current State | Target |
|---|------|---------------|--------|
| 1 | `src/app/cashier/page.tsx` | Placeholder | Full Cashier UI |
| 2 | `src/app/booking/page.tsx` | Placeholder | Full Booking UI |
| 3 | `src/app/customers/page.tsx` | Placeholder | Full Customers UI |
| 4 | `src/app/customer-care/page.tsx` | Placeholder | Full CSKH UI |
| 5 | `src/app/cashcard/page.tsx` | Placeholder | Full Cashcard UI |
| 6 | `src/app/product-service/page.tsx` | Placeholder | Full Product-Service UI |
| 7 | `src/app/rev-exp/page.tsx` | Placeholder | Full Rev-Exp UI |
| 8 | `src/app/report/page.tsx` | Placeholder | Full Report UI |
| 9 | `src/app/gallery/page.tsx` | Placeholder | Full Gallery UI |
| 10 | `src/app/worker-manager/page.tsx` | Placeholder | Full Worker Manager UI |
| 11 | `src/app/setting/page.tsx` | Placeholder | Full Settings UI |

### New Components to CREATE
| Component | Path | Purpose |
|-----------|------|---------|
| `DataTable` | `src/components/shared/data-table.tsx` | Reusable table with sort, filter, pagination |
| `StatCard` | `src/components/shared/stat-card.tsx` | Dashboard stat cards |
| `ModuleTabs` | `src/components/shared/module-tabs.tsx` | Tab navigation for modules |
| `CalendarView` | `src/components/shared/calendar-view.tsx` | Booking calendar display |
| `ImageGallery` | `src/components/shared/image-gallery.tsx` | Gallery grid with upload |
| `TimesheetGrid` | `src/components/shared/timesheet-grid.tsx` | Worker timesheet display |
| `ReportChart` | `src/components/shared/report-chart.tsx` | Chart wrapper for reports |
| `CashierFooter` | `src/components/cashier/cashier-footer.tsx` | Cashier totals footer |
| `ServiceSelector` | `src/components/cashier/service-selector.tsx` | Service/product selector panel |
| `BookingCalendar` | `src/components/booking/booking-calendar.tsx` | Calendar with booking slots |
| `CustomerFilters` | `src/components/customers/customer-filters.tsx` | Advanced filter panel |
| `ProductTabs` | `src/components/product-service/product-tabs.tsx` | Product/Service/Package tabs |
| `TransactionForm` | `src/components/rev-exp/transaction-form.tsx` | Revenue/Expense entry form |
| `ReportTabs` | `src/components/report/report-tabs.tsx` | 9-tab report navigation |
| `SettingsSidebar` | `src/components/setting/settings-sidebar.tsx` | Settings category sidebar |

### New API Routes to CREATE
| Route | Purpose |
|-------|---------|
| `src/app/api/services/route.ts` | GET/POST services |
| `src/app/api/packages/route.ts` | GET/POST packages |
| `src/app/api/cashcards/route.ts` | GET/POST cash cards |
| `src/app/api/reports/route.ts` | GET report data |
| `src/app/api/attendance/route.ts` | GET/POST attendance |
| `src/app/api/settings/route.ts` | GET/PUT settings |

---

## Section B — UI Spec Per Module

### Module 1: Cashier (Thu ng Lump sum)
**Screenshot:** `crm-data/screenshots/cashier.png`
**Structure:** `crm-data/structure/cashier.txt`

**Layout:**
- Full-width page, NO sidebar inside (sidebar is global)
- Header: "Thu ngân" title + date selector + branch selector
- Main: 3-column layout
  - Left (30%): Customer search + info panel
  - Center (40%): Service/Product selector with category tabs
  - Right (30%): Invoice items list + totals
- Footer: Fixed bottom bar with total amount, payment buttons

**Components:**
- CustomerSearch: autocomplete input with phone/name search
- CustomerInfoCard: displays name, phone, debt, rank
- ServiceCategoryTabs: tabs for Services / Products / Packages / Combos
- ServiceGrid: grid of selectable service items with price
- InvoiceItemList: draggable list of added items with qty/price/discount
- CashierFooter: total, discount input, payment method buttons (Cash/Card/Transfer)

**Colors:**
- Primary action: emerald-600 (matches sidebar)
- Total amount: large bold text, emerald color
- Payment buttons: green gradient for "Thanh toán"
- Customer debt: red text if > 0

**Data:**
- Customers (searchable)
- Services/Products/Packages (from DB)
- Invoice items (client state)
- Payment methods

---

### Module 2: Booking (Lịch hẹn)
**Screenshot:** `crm-data/screenshots/booking.png`
**Structure:** `crm-data/structure/booking.txt`

**Layout:**
- Header: "Lịch hẹn" + date picker + branch selector + "Thêm lịch hẹn" button
- Main: Calendar view (week/month toggle)
- Sidebar (right): Booking detail panel when slot selected

**Components:**
- BookingCalendar: week view with time slots (30min intervals), staff columns
- CalendarHeader: prev/next week, date range display
- BookingSlot: clickable slot showing customer name + service
- BookingDetailPanel: customer info, service, staff, status, edit/cancel buttons
- StatusLegend: color codes for pending/confirmed/done/cancelled
- AddBookingModal: form with customer/staff/service/date/time

**Colors:**
- Calendar grid: light gray lines
- Booked slots: emerald-100 background, emerald-800 text
- Confirmed: blue
- Done: green
- Cancelled: red with strikethrough
- Empty slots: white with dashed border

**Data:**
- Bookings (date range filtered)
- Staff list
- Services
- Customers

---

### Module 3: Customers (Khách hàng)
**Screenshot:** `crm-data/screenshots/customers.png`
**Structure:** `crm-data/structure/customers.txt`

**Layout:**
- Header: "Khách hàng" + search + "Thêm khách hàng" button + export
- Filter bar: source, group, rank, debt status filters
- Main: Data table with columns
- Footer: Pagination + total count

**Components:**
- CustomerTable: columns = Code, Name, Phone, Gender, Source, Group, Rank, Total Spent, Debt, Actions
- CustomerFilters: dropdown filters for source/group/rank
- SearchBar: phone/name search with debounce
- AddCustomerModal: form with all fields
- Edit/Delete actions in row
- Pagination: 20/50/100 per page

**Colors:**
- Table header: gray-50 background
- Debt > 0: red text
- Active: green dot
- Inactive: gray dot

**Data:**
- Customers (paginated, filtered)
- Sources, Groups, Ranks (for filters)

---

### Module 4: CSKH (Chăm sóc khách hàng)
**Screenshot:** `crm-data/screenshots/customer-care-customer-set.png`
**Structure:** `crm-data/structure/customer-care.txt`

**Layout:**
- Header: "CSKH" + tabs: "Kháchweed hàng", "Phản hồi", "Khuyến mãi"
- Main: Customer set management (default tab)
- Left: Customer set list with filters
- Right: Customer list in selected set

**Components:**
- CSKHTabs: 3 tabs
- CustomerSetList: groups of customers (VIP, Regular, New...)
- CustomerSetDetail: customers in selected set
- FeedbackList: customer feedback/complaints
- IncentiveList: promotions/campaigns
- SendSMSModal: bulk SMS to selected customers

**Colors:**
- Tabs: underline style
- Customer sets: card layout with count badges
- Priority customers: yellow/orange badges

**Data:**
- Customer sets (groups)
- Customers per set
- Feedback records
- Incentive campaigns

---

### Module 5: Cashcard (Thẻ tiền mặt)
**Screenshot:** `crm-data/screenshots/cashcard.png`
**Structure:** `crm-data/structure/cashcard.txt`

**Layout:**
- Header: "Thẻ tiền mặt" + search + "Thêm thẻ" button
- Main: Card list or table view
- Each card: customer name, card code, balance, status

**Components:**
- CashCardTable: columns = Card Code, Customer, Balance, Status, Created, Actions
- CashCardFilters: status filter (active/inactive)
- AddCashCardModal: link to customer, initial balance
- TopUpModal: add balance to card
- TransactionHistory: show card transactions

**Colors:**
- Active card: green border
- Inactive: gray border
- Balance: large bold number

**Data:**
- CashCards (with customer relation)
- Card transactions

---

### Module 6: Product-Service (Sản phẩm & Dịch vụ)
**Screenshot:** `crm-data/screenshots/product-service-product.png`
**Structure:** `crm-data/structure/product-service.txt`

**Layout:**
- Header: "Sản phẩm & Dịch vụ" + tabs: "Sản phẩm", "Dịch vụ", "Gói", "Danh mục"
- Main: Table/grid based on active tab
- Actions: Add, Edit, Delete, Import, Export

**Components:**
- ProductServiceTabs: 4 tabs
- ProductTable: code, name, category, price, cost, stock, status
- ServiceTable: code, name, category, price, duration, commission
- PackageTable: code, name, items, total price, discount price
- CategoryManager: tree view of categories
- AddEditModal: form based on type

**Colors:**
- In stock: green
- Low stock: orange
- Out of stock: red
- Active: green dot

**Data:**
- Products, Services, Packages
- Categories

---

### Module 7: Rev-Exp (Thu & Chi)
**Screenshot:** `crm-data/screenshots/rev-exp-cashbook.png`
**Structure:** `crm-data/structure/rev-exp.txt`

**Layout:**
- Header: "Thu & Chi" + tabs: "Sổ quỹ", "Thu", "Chi", "Công nợ"
- Main: Table for selected tab
- Summary cards at top: Total Revenue, Total Expense, Balance

**Components:**
- RevExpTabs: 4 tabs
- CashbookTable: date, type, category, amount, description, branch, user
- RevenueTable: filtered revenue only
- ExpenseTable: filtered expense only
- DebtTable: customer debts with aging
- SummaryCards: 3 stat cards
- AddTransactionModal: form with type/category/amount/description

**Colors:**
- Revenue: green text
- Expense: red text
- Balance: blue if positive, red if negative

**Data:**
- Transactions (all types)
- Categories
- Customer debts

---

### Module 8: Report (Báo cáo)
**Screenshot:** `crm-data/screenshots/report-revenue.png`
**Structure:** `crm-data/structure/report.txt`

**Layout:**
- Header: "Báo cáo" + date range picker
- Tabs: 9 report types (see below)
- Main: Chart + data table

**Components:**
- ReportTabs: 9 tabs in horizontal scroll
  1. Doanh thu (Revenue)
  2. Dịch vụ (Services)
  3. Sản phẩm (Products)
  4. Khách hàng (Customers)
  5. Nhân viên (Staff)
  6. Thu chi (Cash flow)
  7. Lịch hẹn (Bookings)
  8. Marketing
  9. Tổng quan (Overview)
- ReportChart: bar/line chart based on report type
- ReportTable: detailed data
- DateRangePicker: preset ranges (Today, This Week, This Month, Custom)
- ExportButton: export to Excel/PDF

**Colors:**
- Chart: multiple colors per series
- Positive: green
- Negative: red
- Neutral: blue

**Data:**
- Aggregated data per report type
- Date range filtered

---

### Module 9: Gallery (Bộ sưu tập)
**Screenshot:** `crm-data/screenshots/gallery.png`
**Structure:** `crm-data/structure/gallery.txt`

**Layout:**
- Header: "Bộ sưu tập" + upload button + folder filter
- Main: Masonry/grid image gallery
- Sidebar: Folder/category list

**Components:**
- ImageGrid: responsive grid of images
- ImageCard: thumbnail with title, date, actions (view, delete)
- UploadModal: drag-drop upload with preview
- FolderList: sidebar folder navigation
- ImageViewer: lightbox for full-size view

**Colors:**
- Selected folder: emerald background
- Image hover: overlay with actions

**Data:**
- Images (URL, title, folder, uploadedAt)
- Folders

---

### Module 10: Worker Manager (Quản lý nhân viên)
**Screenshot:** `crm-data/screenshots/worker-manager-time-sheet.png`
**Structure:** `crm-data/structure/worker-manager.txt`

**Layout:**
- Header: "Quản lý nhân viên" + tabs: "Nhân viên", "Chấm công", "Bảng lương", "Hoa hồng"
- Main: Based on active tab
- Timesheet: Grid with staff rows, date columns

**Components:**
- WorkerTabs: 4 tabs
- StaffListTable: name, phone, role, shift, status, actions
- TimesheetGrid: staff × dates, cells show shift/attendance status
- TimesheetLegend: color codes for onTime/late/early/missing/absent
- PayrollTable: staff, base salary, commission, deductions, total
- CommissionTable: staff, service, rate, amount
- AttendanceModal: check-in/check-out form

**Colors:**
- On time: green
- Late: orange
- Early: yellow
- Missing: gray
- Absent: red

**Data:**
- Users (staff)
- Attendance records
- Shifts
- Commissions

---

### Module 11: Settings (Cài đặt)
**Screenshot:** `crm-data/screenshots/setting-salon.png`
**Structure:** `crm-data/structure/setting.txt`

**Layout:**
- Two hub page with cards for each setting category
- OR sidebar with categories + main content area

**Components:**
- SettingsGrid: card grid of setting categories
- SettingCategoryCard: icon, title, description, click to navigate
- OR SettingsSidebar: vertical list of categories
- SettingForm: dynamic form based on selected category

**Setting Categories (from screenshots):**
1. Thông tin salon (Salon Info)
2. Ca làm việc (Shifts)
3. Nhân viên (Staff)
4. Khách hàng - Kênh (Customer Sources)
5. Khách hàng - Nhóm (Customer Groups)
6. Khách hàng - Hạng (Customer Ranks)
7. Khuyến mãi (Promotions)
8. Hoa hồng (Commission)
9. Website đặt lịch (Booking Website)
10. Khác (Other)

**Colors:**
- Category cards: white with colored top border
- Active category: emerald border

**Data:**
- Settings (key-value per section)

---

## Section C — Task Decomposition

### Task FIX-1: Cashier UI Fix
**Files:** `src/app/cashier/page.tsx`, new components: `CashierFooter`, `ServiceSelector`, `CustomerSearch`
**API:** Use existing `/api/customers`, `/api/invoices`, need `/api/services`, `/api/products`
**Acceptance:**
- [ ] 3-column layout visible
- [ ] Customer search works
- [ ] Service selector with tabs
- [ ] Invoice items list with totals
- [ ] Payment footer fixed at bottom
- [ ] bun run lint pass

### Task FIX-2: Booking UI Fix
**Files:** `src/app/booking/page.tsx`, new components: `BookingCalendar`, `CalendarView`
**API:** Use existing `/api/bookings`
**Acceptance:**
- [ ] Calendar week view renders
- [ ] Staff columns visible
- [ ] Booking slots clickable
- [ ] Add booking modal works
- [ ] bun run lint pass

### Task FIX-3: Customers UI Fix
**Files:** `src/app/customers/page.tsx`, new components: `CustomerTable`, `CustomerFilters`
**API:** Use existing `/api/customers`
**Acceptance:**
- [ ] Data table with all columns
- [ ] Search/filter works
- [ ] Pagination works
- [ ] Add/Edit modal works
- [ ] bun run lint pass

### Task FIX-4: CSKH UI Fix
**Files:** `src/app/customer-care/page.tsx`, new components: `CSKHTabs`, `CustomerSetList`
**API:** Need new endpoints for sets, feedback, incentives
**Acceptance:**
- [ ] 3 tabs visible
- [ ] Customer sets display
- [ ] Feedback list works
- [ ] bun run lint pass

### Task FIX-5: Cashcard UI Fix
**Files:** `src/app/cashcard/page.tsx`, new components: `CashCardTable`
**API:** Need `/api/cashcards`
**Acceptance:**
- [ ] Card list/table visible
- [ ] Balance display
- [ ] Status filters work
- [ ] bun run lint pass

### Task FIX-6: Product-Service UI Fix
**Files:** `src/app/product-service/page.tsx`, new components: `ProductTabs`, `ProductTable`, `ServiceTable`
**API:** Use existing `/api/products`, need `/api/services`, `/api/packages`
**Acceptance:**
- [ ] 4 tabs visible
- [ ] Product table with stock status
- [ ] Service table with duration
- [ ] Package table visible
- [ ] bun run lint pass

### Task FIX-7: Rev-Exp UI Fix
**Files:** `src/app/rev-exp/page.tsx`, new components: `RevExpTabs`, `CashbookTable`, `SummaryCards`
**API:** Use existing `/api/transactions`
**Acceptance:**
- [ ] 4 tabs visible
- [ ] Summary cards at top
- [ ] Transaction table with type colors
- [ ] bun run lint pass

### Task FIX-8: Report UI Fix
**Files:** `src/app/report/page.tsx`, new components: `ReportTabs`, `ReportChart`
**API:** Need `/api/reports`
**Acceptance:**
- [ ] 9 tabs visible
- [ ] Chart renders
- [ ] Date range picker works
- [ ] bun run lint pass

### Task FIX-9: Gallery UI Fix
**Files:** `src/app/gallery/page.tsx`, new components: `ImageGallery`, `ImageGrid`
**API:** Need image upload/storage endpoint
**Acceptance:**
- [ ] Image grid visible
- [ ] Upload modal works
- [ ] Image viewer works
- [ ] bun run lint pass

### Task FIX-10: Worker Manager UI Fix
**Files:** `src/app/worker-manager/page.tsx`, new components: `TimesheetGrid`, `WorkerTabs`
**API:** Need `/api/attendance`
**Acceptance:**
- [ ] 4 tabs visible
- [ ] Timesheet grid renders
- [ ] Attendance colors correct
- [ ] bun run lint pass

### Task FIX-11: Settings UI Fix
**Files:** `src/app/setting/page.tsx`, new components: `SettingsGrid`, `SettingsSidebar`
**API:** Need `/api/settings`
**Acceptance:**
- [ ] Setting categories visible
- [ ] Category cards clickable
- [ ] Forms for each category
- [ ] bun run lint pass

---

## Section D — Acceptance Criteria

### Overall Acceptance
1. **UI Match ≥ 90%**: Each module's UI matches its screenshot in layout, colors, and component placement
2. **Navigation**: All 11 modules accessible from sidebar
3. **Responsive**: Works at 1280px+ width (desktop focus)
4. **No placeholders**: All "đang được phát triển" text removed

### Per-Task Gate (§9.5)
After EACH task:
1. `bun run lint` → 0 errors
2. `tsc --noEmit` → 0 type errors
3. Page renders without console errors
4. API routes return `{ ok, data?, error? }` shape

### Final Quality Gate
1. All 11 pages render correctly
2. Sidebar navigation highlights active page
3. Data flows from API → UI correctly
4. No broken imports or missing components
5. Consistent styling across all modules

---

## Implementation Notes for Act Mode

### Priority Order (complexity-based):
1. **Cashier** (most complex: 3-col + service selector + invoice logic)
2. **Booking** (calendar component)
3. **Report** (9 tabs + charts)
4. **Worker Manager** (timesheet grid)
5. **Product-Service** (4 tabs)
6. **Customers** (data table with filters)
7. **Rev-Exp** (summary + table)
8. **CSKH** (3 tabs)
9. **Cashcard** (simple table)
10. **Gallery** (grid + upload)
11. **Settings** (category grid + forms)

### Shared Components to Build First:
- `DataTable` (used by: Customers, Cashcard, Products, Services, Transactions)
- `ModuleTabs` (used by: Product-Service, Rev-Exp, Report, Worker, CSKH, Settings)
- `StatCard` (used by: Rev-Exp, Report, Dashboard)

### API Dependencies:
- Existing: `/api/customers`, `/api/invoices`, `/api/bookings`, `/api/products`, `/api/transactions`
- Need to create: `/api/services`, `/api/packages`, `/api/cashcards`, `/api/reports`, `/api/attendance`, `/api/settings`

### Color Palette (from screenshots):
- Primary: emerald-600 (matches existing sidebar)
- Success: green-500
- Warning: orange-500
- Danger: red-500
- Info: blue-500
- Background: gray-50 (page), white (cards)
- Text: gray-900 (headings), gray-600 (body), gray-400 (muted)
