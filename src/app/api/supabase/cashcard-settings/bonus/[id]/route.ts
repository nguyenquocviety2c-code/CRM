import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { bonusSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

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

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = bonusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { minTopupAmount, bonusValue, bonusType } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("bonus_configs")
      .update({
        min_topup_amount: minTopupAmount,
        bonus_value: bonusValue,
        bonus_type: bonusType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: mapBonus(data as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi cập nhật bonus";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("bonus_configs").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi xóa bonus";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
