import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * PUT /api/supabase/staff/reorder
 * Body: { items: [{ id: string, sort_order: number }] }
 *
 * Persists a custom display order for staff. The order is stored as a
 * `sort_order` number inside each staff row's `permissions` JSONB column (no
 * dedicated DB column needed). The booking dialog + dat-lich read this value
 * and sort the staff list client-side by it (ascending; unset → last).
 *
 * The `permissions` JSONB also holds group_ids + per-staff permission flags, so
 * we MERGE sort_order into the existing object (fetch → spread → update) rather
 * than overwriting it.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items (non-empty array) is required" },
        { status: 400 }
      );
    }

    // Validate + normalize each entry.
    const normalized: Array<{ id: string; sort_order: number }> = [];
    for (const it of items) {
      const id = typeof it?.id === "string" ? it.id : null;
      const so = typeof it?.sort_order === "number" ? it.sort_order : Number(it?.sort_order);
      if (!id || isNaN(so)) continue;
      normalized.push({ id, sort_order: so });
    }
    if (normalized.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid items" },
        { status: 400 }
      );
    }

    // Fetch the current permissions JSONB for all target staff in one query.
    const ids = normalized.map((n) => n.id);
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("staff")
      .select("id, permissions")
      .in("id", ids);
    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }
    const permsById = new Map<string, Record<string, unknown> | null>();
    for (const row of existing ?? []) {
      permsById.set(row.id as string, (row.permissions as Record<string, unknown> | null) ?? null);
    }

    // Update each staff's permissions JSONB with the merged sort_order.
    const errors: string[] = [];
    for (const { id, sort_order } of normalized) {
      const current = permsById.get(id) ?? {};
      const merged = { ...(current || {}), sort_order };
      const { error: updErr } = await supabaseAdmin
        .from("staff")
        .update({ permissions: merged })
        .eq("id", id);
      if (updErr) errors.push(`${id}: ${updErr.message}`);
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Some updates failed: ${errors.join("; ")}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, updated: normalized.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
