import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchStaffPermissions } from "@/lib/auth/permissions";

/**
 * GET /api/auth/me
 * Returns the currently-logged-in staff's public profile (based on the
 * `crm_staff_id` httpOnly cookie), or { ok: false, data: null } when not
 * logged in. Used by the client auth store to hydrate on page load.
 *
 * The response includes `permissions` — a flat { [action]: boolean } map
 * merged from all the staff's group(s). The frontend uses this to
 * show/hide features based on the staff's role (e.g. assign_staff,
 * view_all_invoices).
 */
export async function GET(_request: NextRequest) {
  try {
    const staffId = _request.cookies.get("crm_staff_id")?.value;
    if (!staffId) {
      return NextResponse.json({ ok: false, data: null });
    }
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, name, username, email, role, avatar, active, group:staff_groups(id, name)")
      .eq("id", staffId)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ ok: false, data: null });
    }
    if (data.active === false) {
      return NextResponse.json({ ok: false, data: null });
    }
    const group = data.group as { id?: string; name?: string } | null;
    // Fetch the staff's effective permissions from their group(s).
    const permissions = await fetchStaffPermissions(data.id);
    return NextResponse.json({
      ok: true,
      data: {
        id: data.id,
        name: data.name,
        username: data.username,
        email: data.email,
        role: data.role,
        avatar: data.avatar,
        groupName: group?.name ?? null,
        groupId: group?.id ?? null,
        permissions,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, data: null });
  }
}
