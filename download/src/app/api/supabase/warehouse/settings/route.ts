import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SETTINGS_SELECT = "*, branch:branches(id, name)";

// Allowed warehouse settings fields
const ALLOWED_FIELDS = [
  "low_stock_alert",
  "low_stock_threshold",
  "auto_generate_code",
  "default_currency",
  "enable_batch_tracking",
  "require_cost_price",
  "allow_negative_stock",
  "default_payment_method",
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");

    let query = supabaseAdmin
      .from("warehouse_settings")
      .select(SETTINGS_SELECT)
      .order("created_at", { ascending: false })
      .limit(1);
    if (branchId) query = query.eq("branch_id", branchId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: data || null });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const branchId = body.branch_id || null;

    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] === undefined) continue;
      const val = body[field];
      if (
        field === "low_stock_alert" ||
        field === "auto_generate_code" ||
        field === "enable_batch_tracking" ||
        field === "require_cost_price" ||
        field === "allow_negative_stock"
      ) {
        updateData[field] = Boolean(val);
      } else if (
        field === "low_stock_threshold"
      ) {
        updateData[field] = Number(val);
      } else {
        updateData[field] = val || null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    // Try to find existing settings for the branch (or globally if no branch)
    let existingId: string | null = null;
    const findQuery = supabaseAdmin
      .from("warehouse_settings")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    if (branchId) {
      findQuery.eq("branch_id", branchId);
    }
    const { data: existing } = await findQuery.maybeSingle();

    // If maybeSingle returns null/empty, try array fallback
    if (!existing) {
      const arrQuery = supabaseAdmin
        .from("warehouse_settings")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);
      if (branchId) {
        arrQuery.eq("branch_id", branchId);
      }
      const { data: arr } = await arrQuery;
      if (arr && arr.length > 0) {
        existingId = arr[0].id;
      }
    } else {
      existingId = existing.id;
    }

    if (existingId) {
      const { error } = await supabaseAdmin
        .from("warehouse_settings")
        .update(updateData)
        .eq("id", existingId);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      const { data: refreshed, error: fetchErr } = await supabaseAdmin
        .from("warehouse_settings")
        .select(SETTINGS_SELECT)
        .eq("id", existingId)
        .single();
      if (fetchErr) {
        return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, data: refreshed });
    }

    // No existing record — create one
    const insertData: Record<string, unknown> = { ...updateData };
    if (branchId) insertData.branch_id = branchId;
    const { data: created, error: insErr } = await supabaseAdmin
      .from("warehouse_settings")
      .insert(insertData)
      .select(SETTINGS_SELECT)
      .single();
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
