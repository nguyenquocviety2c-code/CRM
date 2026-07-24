# FIX-4: CSKH (Module 4) — 3 Sub-Pages Mini-Blueprint

## Section A — File Architecture

### Files to CREATE
| # | File | Purpose |
|---|------|---------|
| 1 | `src/app/(dashboard)/customer-care/customer-set/page.tsx` | Customer set list page |
| 2 | `src/app/(dashboard)/customer-care/customer-feedback/page.tsx` | Customer feedback list page |
| 3 | `src/app/(dashboard)/customer-care/incentives/page.tsx` | Incentives/promotions list page |
| 4 | `src/app/api/customer-care/customer-set/route.ts` | Customer set API (GET/POST) |
| 5 | `src/app/api/customer-care/customer-set/[id]/route.ts` | Customer set single item API (GET/PUT/DELETE) |
| 6 | `src/app/api/customer-care/customer-feedback/route.ts` | Customer feedback API (GET/POST) |
| 7 | `src/app/api/customer-care/customer-feedback/[id]/route.ts` | Customer feedback single item API (GET/PUT/DELETE) |
| 8 | `src/app/api/customer-care/incentives/route.ts` | Incentives API (GET/POST) |
| 9 | `src/app/api/customer-care/incentives/[id]/route.ts` | Incentives single item API (GET/PUT/DELETE) |
| 10 | `src/components/features/customer-care/customer-set-dialog.tsx` | Dialog for create/edit customer set |
| 11 | `src/components/features/customer-care/customer-feedback-dialog.tsx` | Dialog for create/edit feedback |
| 12 | `src/components/features/customer-care/incentive-dialog.tsx` | Dialog for create/edit incentive |
| 13 | `src/components/features/customer-care/customer-set-columns.tsx` | Table columns for customer set |
| 14 | `src/components/features/customer-care/customer-feedback-columns.tsx` | Table columns for feedback |
| 15 | `src/components/features/customer-care/incentive-columns.tsx` | Table columns for incentives |

### Files to MODIFY
| # | File | Purpose |
|---|------|---------|
| 1 | `prisma/schema.prisma` | Add CustomerSet, CustomerFeedback, Incentive models |

---

## Section B — UI Spec Per Sub-Page

### customer-set
- [VERIFIED] Layout: sidebar + main
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tabs: "Tập khách hàng" | "Phản hồi dịch vụ" | "Chương trình khuyến mãi"
- [VERIFIED] Sub-heading: "Tập khách hàng"
- [VERIFIED] Button: "Tạo mới" (icon: plus)
- [UNKNOWN] Table columns: placeholder (to be confirmed)
- [UNKNOWN] Dialog form fields: placeholder (to be confirmed)

### customer-feedback
- [VERIFIED] Layout: sidebar + main
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tabs: "Tập khách hàng" | "Phản hồi dịch vụ" | "Chương trình khuyến mãi"
- [VERIFIED] Sub-heading: "Phản hồi dịch vụ"
- [UNKNOWN] Table columns: placeholder (to be confirmed)
- [UNKNOWN] Dialog form fields: placeholder (to be confirmed)

### incentives
- [VERIFIED] Layout: sidebar + main
- [VERIFIED] Heading: "CSKH"
- [VERIFIED] Tabs: "Tập khách hàng" | "Phản hồi dịch vụ" | "Chương trình khuyến mãi"
- [VERIFIED] Sub-heading: "Khuyến mãi"
- [UNKNOWN] Table columns: placeholder (to be confirmed)
- [UNKNOWN] Dialog form fields: placeholder (to be confirmed)

---

## Section C — Task Decomposition

### FIX-4.1: Prisma Schema
- Add `CustomerSet` model
- Add `CustomerFeedback` model
- Add `Incentive` model
- Run `db:push` and `db:generate`

### FIX-4.2: API Routes
- Create customer-set API routes (GET/POST, GET/PUT/DELETE)
- Create customer-feedback API routes (GET/POST, GET/PUT/DELETE)
- Create incentives API routes (GET/POST, GET/PUT/DELETE)

### FIX-4.3: customer-set Page
- Create page with VERIFIED layout
- Implement tabs navigation
- Add "Tạo mới" button
- Add placeholder table
- Add placeholder dialog

### FIX-4.4: customer-feedback Page
- Create page with VERIFIED layout
- Implement tabs navigation
- Add placeholder table
- Add placeholder dialog

### FIX-4.5: incentives Page
- Create page with VERIFIED layout
- Implement tabs navigation
- Add placeholder table
- Add placeholder dialog

---

## Section D — Acceptance Criteria

- [ ] 3 sub-pages render without errors
- [ ] UI matches [VERIFIED] items from structure.txt
- [ ] [UNKNOWN] items implemented as placeholders (not fabricated)
- [ ] Lint passes with 0 errors
- [ ] Build succeeds
- [ ] Per-Task Gate §9.5 passed

---

## Section E — UNKNOWN Items List

| Sub-page | Item | Status |
|----------|------|--------|
| customer-set | Table columns | Need confirmation |
| customer-set | Dialog form fields | Need confirmation |
| customer-set | Filter/Search | Need confirmation |
| customer-feedback | Table columns | Need confirmation |
| customer-feedback | Dialog form fields | Need confirmation |
| customer-feedback | Filter/Search | Need confirmation |
| incentives | Table columns | Need confirmation |
| incentives | Dialog form fields | Need confirmation |
| incentives | Filter/Search | Need confirmation |

---

## Section F — MODULE_SPECS.md Addition

See `MODULE_SPECS.md` for full Module 4 specification.