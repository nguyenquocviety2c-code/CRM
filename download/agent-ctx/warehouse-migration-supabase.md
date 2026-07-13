# Warehouse Module Frontend Migration: Prisma API → Supabase API

**Task ID:** warehouse-migration-supabase
**Agent:** Claude Code (Z.ai)
**Date:** 2026-06-XX

## Summary

Migrated the Warehouse module frontend from Prisma-backed `/api/warehouse*` and `/api/products*` routes to the new Supabase-backed `/api/supabase/*` routes. UI/styling kept unchanged; only API endpoints, request bodies, and response field mappings were updated.

## Files Modified

### Tabs (list views)

1. **`src/components/features/product-service/warehouse-available-tab.tsx`**
   - `/api/warehouse?tab=available&...` → `/api/supabase/products?...` (params: `search`, `category_id`, `page`, `limit`)
   - Added a second `useQuery` to fetch categories from `/api/supabase/product-categories` and render them dynamically in the filter dropdown (replacing hardcoded "Nhóm 1")
   - Mapped snake_case → camelCase in `queryFn`:
     - `volume_unit` → `volumeUnit`
     - `product_categories` → `category`
   - Total now read from `json.pagination.total` (was `json.data.total`)

2. **`src/components/features/product-service/warehouse-import-tab.tsx`**
   - `/api/warehouse?tab=import&...` → `/api/supabase/warehouse?type=import&...`
   - Removed the `/api/warehouse/total-debt` fetch (no Supabase equivalent); `totalDebt` is now a constant `0`
   - Field mapping: `created_at` → `importDate`, `created_by` → `createdByEmail`, `slip_items` → `items` (with `products` → `product`), `total_cost` preserved
   - `supplier` is always `null` (no supplier concept in Supabase import_slips)

3. **`src/components/features/product-service/warehouse-export-tab.tsx`**
   - `/api/warehouse?tab=export&...` → `/api/supabase/warehouse?type=export&...`
   - Field mapping: `created_at` → `exportDate`, `created_by` → `createdByEmail`, `type` → `exportType`, `slip_items` → `items`

4. **`src/components/features/product-service/warehouse-transfer-tab.tsx`**
   - `/api/warehouse?tab=transfer&...` → `/api/supabase/warehouse?type=transfer&...`
   - Field mapping: `transfer_date` → `transferDate`, `created_by` → `createdByEmail`, `from_branch` → `fromBranch`, `to_branch` → `toBranch`, `slip_items` → `items`

5. **`src/components/features/product-service/warehouse-list.tsx`** (not currently imported anywhere, but migrated for consistency)
   - Same migration as warehouse-available-tab: `/api/warehouse` → `/api/supabase/products` with snake_case → camelCase mapping

6. **`src/app/product-service/warehouse/page.tsx`** — checked; no API calls in this file (only renders child components). Left unchanged.

### Slip dialogs (create forms)

7. **`src/components/features/product-service/import-slip-dialog.tsx`**
   - Added `useQuery` fetches for products (`/api/supabase/products?active=true&limit=100`) and branches (`/api/supabase/branches`)
   - Products dropdown now renders dynamic list instead of hardcoded "Sản phẩm 1"
   - "Nhà cung cấp" dropdown repurposed to show branches (since suppliers don't exist in Supabase); the selected value is sent as `branch_id` to the API (UI label unchanged per "keep UI unchanged" rule)
   - POST changed from `/api/warehouse/import` to `/api/supabase/warehouse` with body:
     ```json
     { "type": "import", "branch_id": "<selected branch>", "note": "...", "created_by": "...", "items": [{ "product_id": "...", "quantity": N, "cost_price": 0 }] }
     ```

8. **`src/components/features/product-service/export-slip-dialog.tsx`**
   - Same product/branch fetches as import dialog
   - "Tên người nhận" dropdown repurposed to show branches; selected value sent as `branch_id`
   - POST changed from `/api/warehouse/export` to `/api/supabase/warehouse` with body:
     ```json
     { "type": "export", "branch_id": "...", "slip_type": "<use|return|destroy>", "note": "...", "created_by": "...", "items": [...] }
     ```
   - `slip_type` carries the original `exportType` value so the export_slips `type` column is populated.

9. **`src/components/features/product-service/transfer-slip-dialog.tsx`**
   - Added `useQuery` fetches for products and branches
   - Both "Chuyển từ" / "Chuyển tới" dropdowns now render dynamic branches (replacing hardcoded "Chi nhánh 1"/"Chi nhánh 2")
   - Products dropdown rendered dynamically
   - POST changed from `/api/warehouse/transfer` to `/api/supabase/warehouse` with body:
     ```json
     { "type": "transfer", "from_branch_id": "...", "to_branch_id": "...", "transfer_date": "YYYY-MM-DD", "note": "...", "created_by": "...", "items": [...] }
     ```

10. **`src/components/features/product-service/warehouse-settings-dialog.tsx`**
    - Added `useQuery` fetch for branches; uses the first branch as the active `branch_id` (no branch selector in the UI per "keep UI unchanged")
    - Added `useEffect` to GET existing settings from `/api/supabase/warehouse/settings?branch_id=...` when the dialog opens, and populate form fields from `json.data.settings.*` (camelCase form fields)
    - PUT changed from `/api/warehouse/settings` to `/api/supabase/warehouse/settings` with body:
      ```json
      { "branch_id": "...", "settings": { "enableOutOfStockAlert": bool, "outOfStockThreshold": N, "enableLowStockAlert": bool, "lowStockThreshold": N } }
      ```

### Skipped

11. **`src/components/features/product-service/pay-debt-dialog.tsx`**
    - The task instructed "Change `/api/products` → `/api/supabase/products`", but the file does **not** currently call `/api/products`. The only API calls are `/api/warehouse/total-debt` (GET on open) and `/api/warehouse/pay-debt` (POST on submit).
    - The Supabase API surface listed in the task description does **not** include `warehouse/total-debt` or `warehouse/pay-debt` equivalents, so these calls cannot be migrated without new backend routes.
    - File left unchanged. Follow-up needed: implement `/api/supabase/warehouse/total-debt` and `/api/supabase/warehouse/pay-debt` (or rewire pay-debt functionality against Supabase tables) before this dialog can be fully migrated.

## Lint Result

`bun run lint` shows no new errors in any of the migrated files. Only pre-existing `@typescript-eslint/no-explicit-any` / `no-require-imports` errors in unrelated `skills/` and `prisma/seed-*.ts` files, and pre-existing "Compilation Skipped: Use of incompatible library" warnings from `react-hook-form` (present before and after the migration).

## Verification

- `curl http://localhost:3000/product-service/warehouse` returns HTTP 200 with a 37 KB HTML payload, confirming the page compiles and renders successfully after the migration.
- A grep for `/api/(warehouse|products|product-categories|branches)` in `src/components/features/product-service/` shows only the remaining `/api/warehouse/total-debt` and `/api/warehouse/pay-debt` calls in `pay-debt-dialog.tsx` (intentionally not migrated — see above) and unrelated `/api/product-categories/*` calls in `product-category-dialog.tsx` / `product-category-list.tsx` (not in scope of this task).
