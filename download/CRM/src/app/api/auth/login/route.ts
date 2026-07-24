import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyPassword } from "@/lib/password";

/**
 * POST /api/auth/login
 * Body: { login: string, password: string }
 *   - `login` may be a username OR an email (case-insensitive match).
 *
 * Authenticates against the `staff` table (password is scrypt-hashed). On
 * success, sets an httpOnly cookie `crm_staff_id` with the staff's id (7-day
 * expiry) so subsequent requests are authenticated. Returns the staff's public
 * profile (id, name, username, email, group, avatar) — never the password.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!login || !password) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập tên đăng nhập/email và mật khẩu" },
        { status: 400 }
      );
    }

    // Look up the staff by username OR email (case-insensitive). Supabase REST
    // `or` filter supports ilike; we match exact (lowercased) for safety.
    const lower = login.toLowerCase();
    const { data: candidates, error } = await supabaseAdmin
      .from("staff")
      .select("id, name, username, email, password, active, role, avatar, group:staff_groups(id, name)")
      .or(`username.eq.${lower},email.eq.${lower}`);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    // Find an exact match (username or email, case-insensitive). The `or` may
    // return partial-ish rows; filter client-side for exactness.
    const staff = (candidates ?? []).find(
      (s: { username?: string | null; email?: string | null }) =>
        (s.username && s.username.toLowerCase() === lower) ||
        (s.email && s.email.toLowerCase() === lower)
    );
    if (!staff) {
      return NextResponse.json(
        { ok: false, error: "Tài khoản không tồn tại" },
        { status: 401 }
      );
    }
    if (staff.active === false) {
      return NextResponse.json(
        { ok: false, error: "Tài khoản đã bị khóa" },
        { status: 403 }
      );
    }
    if (!verifyPassword(password, staff.password)) {
      return NextResponse.json(
        { ok: false, error: "Mật khẩu không đúng" },
        { status: 401 }
      );
    }

    // Build the public profile (strip password).
    const group = staff.group as { id?: string; name?: string } | null;
    // Fetch the staff's effective permissions from their group(s).
    const { fetchStaffPermissions } = await import("@/lib/auth/permissions");
    const permissions = await fetchStaffPermissions(staff.id);
    const profile = {
      id: staff.id,
      name: staff.name,
      username: staff.username,
      email: staff.email,
      role: staff.role,
      avatar: staff.avatar,
      groupName: group?.name ?? null,
      groupId: group?.id ?? null,
      permissions,
    };

    const res = NextResponse.json({ ok: true, data: profile });
    // httpOnly cookie → JS can't read it (XSS-resistant). SameSite=lax so the
    // cookie is sent on same-site navigations. 7-day expiry.
    res.cookies.set("crm_staff_id", staff.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Đăng nhập thất bại" },
      { status: 500 }
    );
  }
}
