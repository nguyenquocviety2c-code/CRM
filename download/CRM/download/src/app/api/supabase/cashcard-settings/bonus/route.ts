import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { bonusSchema } from "@/lib/validations";

function mapBonus(row: Record<string, unknown>) {
  return {
    id: row.id,
    minTopupAmount: Number(row.min_topup_amount) || 0,
    bonusValue: Number(row.bonus_value) || 0,
    bonusType: row.bonus_type ?? "VND",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/supabase/cashcard-settings/bonus
 *   ?page=&limit=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await supabaseAdmin
      .from("bonus_configs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const items = ((data ?? []) as Record<string, unknown>[]).map(mapBonus);

    return NextResponse.json({
      ok: true,
      data: { items, total: count ?? 0, page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi lấy danh sách bonus";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/cashcard-settings/bonus
 * Body: { minTopupAmount, bonusValue, bonusType }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bonusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { minTopupAmount, bonusValue, bonusType } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("bonus_configs")
      .insert({
        min_topup_amount: minTopupAmount,
        bonus_value: bonusValue,
        bonus_type: bonusType,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: mapBonus(data as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi tạo bonus";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
