import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    let query = supabaseAdmin.from("booking_channels").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (branchId) query = query.eq("branch_id", branchId);
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
    const { name, description, active, sort_order, branch_id } = body;
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("booking_channels")
      .insert({ name: name.trim(), description: description || null, active: active ?? true, sort_order: sort_order ?? 0, branch_id: branch_id || null })
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
