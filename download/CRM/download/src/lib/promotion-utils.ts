/**
 * Pure utilities for promotion (incentive) calculations.
 * No DB dependency — safe to unit test and use on both client and server.
 *
 * Field shape mirrors the Supabase `incentives` table (camelCase form used
 * by the UI / API layer). The Supabase API route maps snake_case <-> camelCase.
 */

export interface IncentiveShape {
  id: string;
  code: string | null;
  name: string;
  applyScope: string | null;
  startDate: string | null;
  endDate: string | null;
  branchIds: string | null; // JSON string array, e.g. '["uuid1","uuid2"]'
  serviceIds: string | null; // JSON string array; null/empty = apply to all
  discountType: string; // SERVICE_DISCOUNT | PRODUCT_DISCOUNT | SERVICE_GIFT | PRODUCT_GIFT
  discountValue: number; // percentage (0-100)
  usageLimit: number;
  usedCount: number;
  type: string; // promotion | voucher
}

export interface AppliedPromotion {
  id: string;
  code: string | null;
  name: string;
  discountValue: number;
  discountType: string;
  discountAmount: number; // the computed discount in VND
}

/**
 * Is the promotion currently active (within date range and still has usage)?
 */
export function isPromotionActive(
  promo: Pick<IncentiveShape, "startDate" | "endDate" | "usageLimit" | "usedCount">,
  now: Date = new Date()
): boolean {
  const current = now.getTime();
  if (promo.startDate) {
    const start = new Date(promo.startDate).getTime();
    if (isNaN(start) || current < start) return false;
  }
  if (promo.endDate) {
    const end = new Date(promo.endDate).getTime();
    if (isNaN(end) || current > end) return false;
  }
  if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) return false;
  return true;
}

/**
 * Does the promotion apply to the given branch?
 * branchIds === null/empty/"[\"all\"]" -> applies to all branches.
 * (The UI stores the "Tất cả cửa hàng" sentinel as the literal string "all"
 * inside the branchIds JSON array, so we treat it as "all branches".)
 */
export function isPromotionForBranch(
  promo: Pick<IncentiveShape, "branchIds">,
  branchId: string | null
): boolean {
  if (!promo.branchIds) return true; // all branches
  try {
    const ids = JSON.parse(promo.branchIds) as string[];
    if (!Array.isArray(ids) || ids.length === 0) return true; // treat empty as all
    if (ids.includes("all")) return true; // "Tất cả cửa hàng" sentinel
    if (!branchId) return false;
    return ids.includes(branchId);
  } catch {
    return false;
  }
}

/**
 * Get the list of service IDs the promotion applies to.
 * Returns null when the promotion applies to ALL services.
 */
export function getPromotionServiceIds(
  promo: Pick<IncentiveShape, "serviceIds">
): string[] | null {
  if (!promo.serviceIds) return null;
  try {
    const ids = JSON.parse(promo.serviceIds) as string[];
    if (!Array.isArray(ids) || ids.length === 0) return null;
    return ids;
  } catch {
    return null;
  }
}

/**
 * Compute the discount amount (in VND) for a given set of services.
 *
 * Only percentage-discount types apply a discount. Both the legacy enum values
 * (SERVICE_DISCOUNT / PRODUCT_DISCOUNT) and the newer short values
 * (service / service_category / product) created in the CSKH dialog are treated
 * as percentage discounts. GIFT types are out of MVP scope -> return 0.
 *
 * Matching against `serviceIdsMatch`:
 * - null/empty -> apply to ALL services.
 * - discountType === "service_category" -> match by service `category_id`.
 * - otherwise -> match by `service_id`.
 *
 * `services` items should carry `service_id` (UUID), `category_id` (UUID, for
 * service_category matching), and `price` (number).
 */
export function calculatePromotionDiscount(
  promo: Pick<IncentiveShape, "discountType" | "discountValue">,
  services: Array<{ service_id?: string | null; category_id?: string | null; price: number }>,
  serviceIdsMatch: string[] | null
): number {
  const type = promo.discountType;
  const DISCOUNT_TYPES = new Set([
    "SERVICE_DISCOUNT",
    "PRODUCT_DISCOUNT",
    "service",
    "service_category",
    "product",
  ]);
  if (!DISCOUNT_TYPES.has(type)) {
    return 0;
  }
  const pct = Number(promo.discountValue) || 0;
  if (pct <= 0) return 0;

  let eligible: typeof services;
  if (!serviceIdsMatch || serviceIdsMatch.length === 0) {
    // No specific services selected -> apply to all.
    eligible = services;
  } else if (type === "service_category") {
    // Match by the service's category id.
    eligible = services.filter(
      (s) => s.category_id && serviceIdsMatch.includes(s.category_id)
    );
  } else {
    // Match by the service's own id.
    eligible = services.filter(
      (s) => s.service_id && serviceIdsMatch.includes(s.service_id)
    );
  }

  const subtotal = eligible.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const discount = (subtotal * pct) / 100;
  // Round to nearest VND (no sub-unit).
  return Math.round(discount);
}

/**
 * Filter the promotion list down to the ones that are active and apply to the
 * booking's branch.
 */
export function getActivePromotionsForBooking(
  promos: IncentiveShape[],
  opts: { branchId: string | null; now?: Date }
): IncentiveShape[] {
  return promos.filter(
    (p) => isPromotionActive(p, opts.now) && isPromotionForBranch(p, opts.branchId)
  );
}
