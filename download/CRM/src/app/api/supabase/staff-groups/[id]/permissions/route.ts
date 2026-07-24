import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/staff-groups/[id]/permissions
 * Returns the group's permission flags as a flat { [action]: boolean } map.
 * Stored in the `permissions` table with group_id + module='staff_group' +
 * action=<key> + allowed=<bool>.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("permissions")
      .select("action, allowed")
      .eq("group_id", id)
      .eq("module", "staff_group");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const perms: Record<string, boolean> = {};
    for (const row of data ?? []) {
      if (row.action) perms[row.action] = Boolean(row.allowed);
    }
    return NextResponse.json({ ok: true, data: perms });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/supabase/staff-groups/[id]/permissions
 * Body: { permissions: { [action]: boolean } }
 * Replaces the group's permission flags (delete existing group rows, insert
 * the new set). Stored in the `permissions` table.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const perms = (body?.permissions ?? {}) as Record<string, boolean>;
    // Delete existing permission rows for this group.
    const { error: delErr } = await supabaseAdmin
      .from("permissions")
      .delete()
      .eq("group_id", id)
      .eq("module", "staff_group");
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    // Insert the new set (only true/false values, skip non-boolean).
    const rows = Object.entries(perms)
      .filter(([, v]) => typeof v === "boolean")
      .map(([action, allowed]) => ({
        group_id: id,
        module: "staff_group",
        action,
        allowed,
      }));
    if (rows.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("permissions")
        .insert(rows);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, data: perms });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
