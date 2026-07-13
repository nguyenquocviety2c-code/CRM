import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.staff_id !== undefined) updateData.staff_id = body.staff_id || null;
    if (body.group_id !== undefined) updateData.group_id = body.group_id || null;
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id || null;
    if (body.service_type !== undefined) updateData.service_type = body.service_type;
    if (body.commission_percent !== undefined) updateData.commission_percent = body.commission_percent;
    if (body.fixed_amount !== undefined) updateData.fixed_amount = body.fixed_amount;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.note !== undefined) updateData.note = body.note;

    const { data, error } = await supabaseAdmin
      .from("commissions")
      .update(updateData)
      .eq("id", id)
      .select("*, staff:staff(id, name), group:staff_groups(id, name), branch:branches(id, name)")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("commissions").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
