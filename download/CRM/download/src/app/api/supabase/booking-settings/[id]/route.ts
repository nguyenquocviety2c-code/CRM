import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.allow_booking !== undefined) updateData.allow_booking = body.allow_booking;
    if (body.allow_overlap !== undefined) updateData.allow_overlap = body.allow_overlap;
    if (body.view_all_bookings !== undefined) updateData.view_all_bookings = body.view_all_bookings;
    if (body.edit_bookings !== undefined) updateData.edit_bookings = body.edit_bookings;
    if (body.min_advance_hours !== undefined) updateData.min_advance_hours = body.min_advance_hours;
    if (body.max_advance_days !== undefined) updateData.max_advance_days = body.max_advance_days;
    if (body.slot_duration !== undefined) updateData.slot_duration = body.slot_duration;
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id || null;
    const { data, error } = await supabaseAdmin.from("booking_settings").update(updateData).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
