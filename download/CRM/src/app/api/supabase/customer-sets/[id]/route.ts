import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { customerSetSchema } from "@/lib/validations";

interface RawCondition {
  id?: string;
  condition_type?: string;
  condition_value?: string | null;
}

interface RawCustomerSet {
  id: string;
  name: string;
  note: string | null;
  auto_update: boolean;
  created_at: string;
  updated_at: string;
  conditions?: RawCondition[];
}

function mapCustomerSet(row: RawCustomerSet) {
  return {
    id: row.id,
    name: row.name,
    note: row.note ?? null,
    autoUpdate: Boolean(row.auto_update),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    conditions: (row.conditions ?? []).map((c) => ({
      id: c.id ?? null,
      customerSetId: row.id,
      conditionType: c.condition_type ?? "",
      conditionValue: c.condition_value ?? null,
    })),
  };
}

const SELECT_WITH_CONDITIONS = "*, conditions:customer_set_conditions(*)";

/**
 * GET /api/supabase/customer-sets/[id]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("customer_sets")
      .select(SELECT_WITH_CONDITIONS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Customer set not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: mapCustomerSet(data as RawCustomerSet) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch customer set";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/supabase/customer-sets/[id]
 * Replace the customer set and its conditions.
 * The FK on customer_set_conditions has ON DELETE CASCADE, so we delete +
 * re-insert conditions cleanly (the parent update is a separate call).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = customerSetSchema.parse(body);
    const { conditions, ...setData } = validated;

    // 1. Update parent row.
    const { error: updErr } = await supabaseAdmin
      .from("customer_sets")
      .update({
        name: setData.name,
        note: setData.note || null,
        auto_update: Boolean(setData.autoUpdate),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    // 2. Replace conditions: delete then re-insert.
    const { error: delErr } = await supabaseAdmin
      .from("customer_set_conditions")
      .delete()
      .eq("customer_set_id", id);
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    if (Array.isArray(conditions) && conditions.length > 0) {
      const conditionRows = conditions.map((c) => ({
        customer_set_id: id,
        condition_type: c.conditionType,
        condition_value: c.conditionValue || null,
      }));
      const { error: condErr } = await supabaseAdmin
        .from("customer_set_conditions")
        .insert(conditionRows);
      if (condErr) {
        return NextResponse.json({ ok: false, error: condErr.message }, { status: 500 });
      }
    }

    // 3. Re-fetch with conditions.
    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("customer_sets")
      .select(SELECT_WITH_CONDITIONS)
      .eq("id", id)
      .single();
    if (fetchErr || !refreshed) {
      return NextResponse.json(
        { ok: false, error: fetchErr?.message || "Failed to reload customer set" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: mapCustomerSet(refreshed as RawCustomerSet) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update customer set";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/supabase/customer-sets/[id]
 * The FK ON DELETE CASCADE removes child conditions automatically.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin
      .from("customer_sets")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete customer set";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
