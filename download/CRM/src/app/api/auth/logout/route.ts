import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * Clears the `crm_staff_id` auth cookie.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("crm_staff_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
