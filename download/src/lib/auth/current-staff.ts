import type { NextRequest } from "next/server";

/**
 * Read the currently-logged-in staff's id from the `crm_staff_id` httpOnly
 * cookie set by /api/auth/login. Returns null when not logged in.
 *
 * Used by API routes that log invoice/booking activities so each activity
 * records who performed it (the "Người thực hiện" column in the activity
 * history table).
 */
export function getCurrentStaffId(request: NextRequest): string | null {
  const staffId = request.cookies.get("crm_staff_id")?.value;
  if (!staffId || typeof staffId !== "string" || !staffId.trim()) return null;
  return staffId.trim();
}
