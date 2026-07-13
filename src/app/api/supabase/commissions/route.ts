import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const staffId = searchParams.get("staff_id");
    const groupId = searchParams.get("group_id");

    let query = supabaseAdmin
      .from("commissions")
      .select("*, staff:staff(id, name), group:staff_groups(id, name), branch:branches(id, name)")
      .order("created_at", { ascending: false });

    if (branchId) query = query.eq("branch_id", branchId);
    if (staffId) query = query.eq("staff_id", staffId);
    if (groupId) query = query.eq("group_id", groupId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staff_id, group_id, branch_id, service_type, commission_percent, fixed_amount, active, note } = body;

    const { data, error } = await supabaseAdmin
      .from("commissions")
      .insert({
        staff_id: staff_id || null,
        group_id: group_id || null,
        branch_id: branch_id || null,
        service_type: service_type || null,
        commission_percent: commission_percent ?? 0,
        fixed_amount: fixed_amount ?? 0,
        active: active ?? true,
        note: note || null,
      })
      .select("*, staff:staff(id, name), group:staff_groups(id, name), branch:branches(id, name)")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
