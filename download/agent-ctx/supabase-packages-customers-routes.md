# Task: Supabase API routes for packages and customers modules

## Summary
Created 8 API route files (6 new route files + 2 dynamic [id] files) for the packages
and customers CRM modules, backed by Supabase. All routes follow the established
patterns in the existing `products`/`services`/`product-categories` routes.

## Files Created
1. `src/app/api/supabase/packages/route.ts` — GET (list w/ joins + filters + pagination),
   POST (auto `GOI` + 6-digit code, optional `items: [{service_id, quantity?}]`)
2. `src/app/api/supabase/packages/[id]/route.ts` — GET, PUT (items re-sync via
   delete+insert), PATCH, DELETE (cleans `package_items` first)
3. `src/app/api/supabase/package-categories/route.ts` — GET (ordered by sort_order, name),
   POST
4. `src/app/api/supabase/package-categories/[id]/route.ts` — GET, PUT, PATCH, DELETE
   (blocks delete when packages reference the category → 409)
5. `src/app/api/supabase/customers/route.ts` — GET (search OR across name/phone/code,
   joins source/group/branch, pagination), POST (auto `KH` + 6-digit code)
6. `src/app/api/supabase/customers/[id]/route.ts` — GET, PUT, PATCH, DELETE (blocks
   delete when bookings reference the customer → 409)
7. `src/app/api/supabase/customer-sources/route.ts` — GET (ordered), POST
8. `src/app/api/supabase/customer-groups/route.ts` — GET (ordered), POST

## Patterns Followed
- Import `supabaseAdmin` from `@/lib/supabase`
- Dynamic route params: `{ params }: { params: Promise<{ id: string }> }` + `await params`
- Response shape: `{ ok: true, data }` / `{ ok: true, data, pagination }` /
  `{ ok: false, error }` with appropriate status codes (200, 201, 400, 404, 409, 500)
- Code auto-generation: tries RPC `generate_code` first, falls back to JS counting of
  existing `prefix%` codes
- List endpoints support `?branch_id=`, `?search=`, `?page=`, `?limit=` (default 50)
- Items/sub-rows re-sync on PUT/PATCH: delete existing then re-insert
- Reference checks before DELETE return 409 with Vietnamese error message
- PUT requires all updatable fields; PATCH allows partial field set via allow-list

## Schema Adaptation
The task spec listed `branch_id (FK branches)` on the `packages` table, but the live
Supabase schema cache for `packages` does NOT have a `branch_id` column (verified by
inspecting returned row keys). To keep code working against the real DB while honoring
the spec's intent, the packages routes probe column existence at runtime via a
`packagesHasBranchIdColumn()` helper and only apply the `branch_id` filter / insert
the `branch_id` value when the column exists. This makes the routes forward-compatible:
if the column is added later, no code change is needed.

The `packages` join select omits `branch:branches(...)` (no FK relationship in schema
cache); it joins `package_categories` and `package_items → services` as required.

The `customers` table DOES have `branch_id`, so its routes join
`branch:branches(id, name)` and apply the branch filter directly.

## Verification (all passed)
- `GET /api/supabase/packages?limit=1` → 200, returns packages with category + items
- `POST /api/supabase/packages` → 201, auto-code `GOI000005`, items created
- `PUT /api/supabase/packages/[id]` → 200, name updated, items re-synced to `[]`
- `PATCH /api/supabase/packages/[id]` → 200, `active=false` applied
- `DELETE /api/supabase/packages/[id]` → 200, package_items cleaned first
- `GET /api/supabase/packages/[id]` after delete → 404
- `POST /api/supabase/customers` → 201, auto-code `KH000001`
- `GET /api/supabase/customers?search=Khách` → 200, returns 3 (name match)
- `GET /api/supabase/customers?search=0999000002` → 200, returns 1 (phone match)
- `GET /api/supabase/customers?search=KH00000` → 200, returns 3 (code match)
- `PUT /api/supabase/customers/[id]` → 200, all fields incl. null FKs updated
- `PATCH /api/supabase/customers/[id]` → 200, partial update works
- `DELETE /api/supabase/customers/[id]` → 200
- `DELETE /api/supabase/package-categories/[id]` (referenced) → 409
- `package-categories` / `customer-sources` / `customer-groups` GET (ordered) + POST → 200/201
- `package-categories/[id]` GET / PUT / DELETE (no refs) → 200

## Lint
No ESLint errors or warnings introduced in any of the 8 new files. Pre-existing lint
errors in unrelated files (cashier/page.tsx, booking components, salon-info-view.tsx,
time-picker.tsx) are unchanged.
