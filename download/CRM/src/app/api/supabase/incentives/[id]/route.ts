import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("incentives")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      code,
      name,
      applyScope,
      startDate,
      endDate,
      branchIds,
      discountType,
      serviceIds,
      discountValue,
      usageLimit,
      autoApplyTarget,
      type,
    } = body;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (applyScope !== undefined) updateData.apply_scope = applyScope;
    if (startDate !== undefined) updateData.start_date = startDate || null;
    if (endDate !== undefined) updateData.end_date = endDate || null;
    if (branchIds !== undefined) updateData.branch_ids = Array.isArray(branchIds) && branchIds.length > 0 ? JSON.stringify(branchIds) : null;
    if (discountType !== undefined) updateData.discount_type = discountType;
    if (serviceIds !== undefined) updateData.service_ids = Array.isArray(serviceIds) && serviceIds.length > 0 ? JSON.stringify(serviceIds) : null;
    if (discountValue !== undefined) updateData.discount_value = Number(discountValue) || 0;
    if (usageLimit !== undefined) updateData.usage_limit = Number(usageLimit) || 1;
    if (autoApplyTarget !== undefined) updateData.auto_apply_target = autoApplyTarget || null;
    if (type !== undefined) updateData.type = type;

    const { data, error } = await supabaseAdmin
      .from("incentives")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("incentives").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
