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

/**
 * Map a Supabase customer_set row (snake_case, with optional nested
 * conditions) to the camelCase shape that the UI expects — matching the
 * original Prisma API surface so callers don't need to change their parsing.
 */
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
 * GET /api/supabase/customer-sets
 * List customer sets with their conditions.
 * Query params: ?search=  &page=  &limit=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("customer_sets")
      .select(SELECT_WITH_CONDITIONS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      // Case-insensitive contains on name OR note.
      query = query.or(`name.ilike.%${search}%,note.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const customerSets = (data ?? []).map((row) =>
      mapCustomerSet(row as RawCustomerSet)
    );

    return NextResponse.json({
      ok: true,
      data: { customerSets, total: count ?? 0, page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch customer sets";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/customer-sets
 * Create a new customer set with optional conditions.
 * Body matches `customerSetSchema` (camelCase):
 *   { name, note?, autoUpdate?, conditions?: [{ conditionType, conditionValue? }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = customerSetSchema.parse(body);
    const { conditions, ...setData } = validated;

    // 1. Insert the parent customer_set row.
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("customer_sets")
      .insert({
        name: setData.name,
        note: setData.note || null,
        auto_update: Boolean(setData.autoUpdate),
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { ok: false, error: insErr?.message || "Failed to create customer set" },
        { status: 500 }
      );
    }

    const newId = inserted.id as string;

    // 2. Insert conditions if any.
    if (Array.isArray(conditions) && conditions.length > 0) {
      const conditionRows = conditions.map((c) => ({
        customer_set_id: newId,
        condition_type: c.conditionType,
        condition_value: c.conditionValue || null,
      }));
      const { error: condErr } = await supabaseAdmin
        .from("customer_set_conditions")
        .insert(conditionRows);
      if (condErr) {
        // Best-effort cleanup: delete the parent so we don't leave an orphan row.
        await supabaseAdmin.from("customer_sets").delete().eq("id", newId);
        return NextResponse.json(
          { ok: false, error: condErr.message },
          { status: 500 }
        );
      }
    }

    // 3. Re-fetch with conditions to return the full shape.
    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("customer_sets")
      .select(SELECT_WITH_CONDITIONS)
      .eq("id", newId)
      .single();

    if (fetchErr || !refreshed) {
      return NextResponse.json(
        { ok: false, error: fetchErr?.message || "Failed to reload customer set" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, data: mapCustomerSet(refreshed as RawCustomerSet) },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create customer set";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
