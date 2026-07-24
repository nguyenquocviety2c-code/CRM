export interface ServiceCategory {
  id: string;
  name: string;
  branchId?: string | null;
}

export interface PackageCategory {
  id: string;
  name: string;
}

/**
 * Package entity aligned with the Supabase `packages` table shape.
 *
 * Supabase row fields (snake_case):
 *   id, code, name, total_price, discount_price, active,
 *   category_id, created_at, updated_at,
 *   package_categories: { id, name, ... },
 *   package_items: [{ service_id, quantity, services: {...} }]
 */
export interface Package {
  id: string;
  code: string;
  name: string;
  totalPrice: number;
  discountPrice: number;
  active: boolean;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  items: Array<Record<string, unknown>>;
  createdAt: string;
}
