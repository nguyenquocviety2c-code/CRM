import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cardExpirySchema } from "@/lib/validations";

function mapExpiry(row: Record<string, unknown>) {
  return {
    id: row.id,
    expiryType: row.expiry_type ?? "FIXED",
    expiryValue: Number(row.expiry_value) || 1,
    expiryUnit: row.expiry_unit ?? "MONTH",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/supabase/cashcard-settings/expiry
 * Returns the most recent settings row, or defaults if none exist.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("card_expiry_settings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const settings = data
      ? mapExpiry(data as Record<string, unknown>)
      : { expiryType: "FIXED", expiryValue: 1, expiryUnit: "MONTH" };

    return NextResponse.json({ ok: true, data: settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi lấy cấu hình hạn sử dụng";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/supabase/cashcard-settings/expiry
 * Body: { expiryType, expiryValue, expiryUnit }
 * Upserts: updates the most recent row if one exists, otherwise inserts a new row.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = cardExpirySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { expiryType, expiryValue, expiryUnit } = parsed.data;

    // Find the most recent settings row (mirrors the Prisma findFirst orderBy desc).
    const { data: existing } = await supabaseAdmin
      .from("card_expiry_settings")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      expiry_type: expiryType,
      expiry_value: expiryValue,
      expiry_unit: expiryUnit,
      updated_at: new Date().toISOString(),
    };

    let row: Record<string, unknown> | null = null;
    let lastError: string | null = null;

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("card_expiry_settings")
        .update(payload)
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error) lastError = error.message;
      else row = data as Record<string, unknown>;
    } else {
      const { data, error } = await supabaseAdmin
        .from("card_expiry_settings")
        .insert(payload)
        .select("*")
        .single();
      if (error) lastError = error.message;
      else row = data as Record<string, unknown>;
    }

    if (lastError || !row) {
      return NextResponse.json({ ok: false, error: lastError ?? "Lỗi khi cập nhật cấu hình hạn sử dụng" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: mapExpiry(row) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi cập nhật cấu hình hạn sử dụng";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
