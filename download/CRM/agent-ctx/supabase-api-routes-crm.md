# Task: Supabase API routes — bookings, invoices, staff, staff-groups

## Summary

Created 8 Next.js App Router API route files under
`src/app/api/supabase/` for the four CRM modules: `bookings`, `invoices`,
`staff`, `staff-groups`. Each module has a collection route (`route.ts`)
and a dynamic `[id]/route.ts`.

All routes follow the conventions established by the existing modules
(`services`, `customers`, `packages`, etc.):
- Import `supabaseAdmin` from `@/lib/supabase`
- Use `NextRequest` / `NextResponse`
- Dynamic route params typed as `Promise<{ id: string }>` (Next.js 16)
- Response envelope `{ ok: true, data }` or `{ ok: false, error }` with
  status codes 200/201/400/404/409/500
- Auto-generated codes via RPC `generate_code` with JS fallback counting
- List endpoints support `?branch_id=`, `?search=`, `?page=`, `?limit=`
  (default 50), plus module-specific filters, and return `{ ok, data, pagination }`
- Code generation patterns:
  - bookings → `LH` + 6-digit (e.g. `LH000001`)
  - invoices → `HD` + 6-digit (e.g. `HD000001`)
  - staff → `NV` + 6-digit (e.g. `NV000021`)

## Files Created

| # | File | Methods |
|---|------|---------|
| 1 | `src/app/api/supabase/bookings/route.ts` | GET (list+filters+pagination), POST (create+services) |
| 2 | `src/app/api/supabase/bookings/[id]/route.ts` | GET, PUT (full+services sync), PATCH (status), DELETE (cascade) |
| 3 | `src/app/api/supabase/invoices/route.ts` | GET (list+filters+pagination), POST |
| 4 | `src/app/api/supabase/invoices/[id]/route.ts` | GET, PUT, DELETE |
| 5 | `src/app/api/supabase/staff/route.ts` | GET (list+filters+pagination), POST |
| 6 | `src/app/api/supabase/staff/[id]/route.ts` | GET, PUT, PATCH (active toggle), DELETE (ref-check) |
| 7 | `src/app/api/supabase/staff-groups/route.ts` | GET (ordered), POST |
| 8 | `src/app/api/supabase/staff-groups/[id]/route.ts` | GET, PUT, PATCH, DELETE (ref-check) |

## Key Implementation Notes

### Bookings — manual customer enrichment
The Supabase schema does NOT register FK constraints from
`bookings.customer_id` → `customers.id` (nor `customer_source_id` →
`customer_sources.id`), and the `customer_channels` table does not exist
in the actual database (even though `bookings.customer_channel_id` is a
column). Per the spec wording ("Enrich with customer data"), the bookings
routes:

1. Use PostgREST embedded-resource joins only for what works:
   - `branch:branches!branch_id(id, name)`
   - `services:booking_services!booking_id(... service:services!service_id(...) , category:service_categories!service_category_id(...))`
2. Manually batch-fetch customer records (and customer source records)
   by `id` after the main query, and attach them as `customer` / `source`
   fields via an `enrichBookings()` helper.
3. Leave `customer_channel_id` as a raw column (no join) since the table
   does not exist.

### Bookings — NOT NULL defaults
`bookings.duration` (default 60), `status` (default "pending") and
`number_of_customers` (default 1) are NOT NULL with DB defaults. The
POST route only sets these fields when the caller provides them, so DB
defaults apply when omitted. (Passing `null` explicitly would violate
the NOT NULL constraint.)

### Booking services — re-sync pattern
The PUT route uses the same delete-then-reinsert pattern as
`packages/[id]` for `booking_services` (via `syncBookingServices()`).
PATCH also supports re-sync. DELETE removes `booking_services` rows
explicitly before deleting the booking (defensive — the FK is supposed
to be `ON DELETE CASCADE` but may not always be configured).

### Invoices, staff, staff-groups
- `invoices` joins work natively (FK constraints registered): customer,
  branch, staff joins return as nested objects.
- `staff` joins work natively for `group:staff_groups` and
  `branch:branches`.
- `staff-groups` is a flat table (no joins); DELETE checks for staff
  references before deleting and returns 409 if any staff belongs to the
  group (Vietnamese error message consistent with the rest of the
  codebase).
- `staff` DELETE checks both `invoices.staff_id` and
  `booking_services.staff_id` (which is `text`, not FK) before deleting.

## Verification

All routes were exercised end-to-end via curl against the dev server:

- **Bookings**: POST created `LH000001` with services array, GET returned
  full record with nested `service` and `branch` joins + enriched
  `customer`, PATCH updated status → "confirmed", PUT re-synced services
  (staff_id changed from `NV1` to `NV2`), DELETE succeeded.
- **Invoices**: POST created `HD000001` with customer/branch/staff joins,
  GET, PUT (note + final_amount), list filter by `customer_id` returned
  count=1, DELETE succeeded.
- **Staff**: POST created `NV000021` with `group` ("Artist") and `branch`
  ("Level 1 Minh Khai") joins, GET, PATCH active=false, PUT (name+role),
  DELETE succeeded.
- **Staff-groups**: POST, GET, PUT (name+sort_order), PATCH active=false,
  DELETE all succeeded.

`bun run lint` shows zero errors / warnings in any of the 8 new files.
The 4 pre-existing lint errors (in `cashier/page.tsx`, `date-picker.tsx`,
`time-picker.tsx`, `salon-info-view.tsx`) are unrelated and were not
touched.

Dev server log shows all new endpoints responding with 200/201 — no 500
errors, no compile failures.
