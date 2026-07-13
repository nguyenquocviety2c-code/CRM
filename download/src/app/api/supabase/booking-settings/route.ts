import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    let query = supabaseAdmin.from("booking_settings").select("*").order("created_at", { ascending: false }).limit(1);
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query.maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { allow_booking, allow_overlap, view_all_bookings, edit_bookings, min_advance_hours, max_advance_days, slot_duration, branch_id } = body;
    const { data, error } = await supabaseAdmin
      .from("booking_settings")
      .insert({
        allow_booking: allow_booking ?? true,
        allow_overlap: allow_overlap ?? false,
        view_all_bookings: view_all_bookings ?? true,
        edit_bookings: edit_bookings ?? true,
        min_advance_hours: min_advance_hours ?? 0,
        max_advance_days: max_advance_days ?? 30,
        slot_duration: slot_duration ?? 60,
        branch_id: branch_id || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
