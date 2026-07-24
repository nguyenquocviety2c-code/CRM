import { supabaseAdmin } from "@/lib/supabase";

/**
 * Fetch the effective permissions for a staff member.
 *
 * A staff belongs to one or more groups (primary `group_id` on the staff
 * table + additional group IDs in `permissions.group_ids` JSONB). For each
 * group, the `permissions` table stores per-action flags (module='staff_group',
 * action=<key>, allowed=<bool>).
 *
 * The effective permission for an action is `true` if ANY of the staff's
 * groups has that action set to `true`. This lets a staff with multiple
 * groups inherit the union of all permissions.
 *
 * Returns a flat `{ [action]: boolean }` map, e.g.:
 *   { assign_staff: true, view_all_invoices: false, create_invoice: true }
 */
export async function fetchStaffPermissions(staffId: string): Promise<Record<string, boolean>> {
  try {
    // 1. Fetch the staff's primary group_id + permissions JSONB (which may
    //    contain group_ids for multi-group assignment).
    const { data: staffRow } = await supabaseAdmin
      .from("staff")
      .select("group_id, permissions")
      .eq("id", staffId)
      .maybeSingle();

    if (!staffRow) return {};

    // Collect all group IDs: primary + from permissions.group_ids.
    const groupIds = new Set<string>();
    if (staffRow.group_id) groupIds.add(staffRow.group_id as string);

    const perm = staffRow.permissions as Record<string, unknown> | null;
    if (perm && Array.isArray(perm.group_ids)) {
      for (const gid of perm.group_ids) {
        if (typeof gid === "string") groupIds.add(gid);
      }
    }

    if (groupIds.size === 0) return {};

    // 2. Fetch all permission rows for these groups from the permissions table.
    const { data: permRows } = await supabaseAdmin
      .from("permissions")
      .select("action, allowed")
      .in("group_id", Array.from(groupIds))
      .eq("module", "staff_group");

    // 3. Merge: if ANY group has allowed=true for an action, the staff has it.
    const result: Record<string, boolean> = {};
    for (const row of permRows || []) {
      const action = row.action as string;
      const allowed = Boolean(row.allowed);
      // Union: once true, stays true.
      if (allowed || result[action] === undefined) {
        result[action] = allowed;
      }
    }

    return result;
  } catch {
    return {};
  }
}
