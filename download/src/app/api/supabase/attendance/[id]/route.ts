import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ATTENDANCE_SELECT =
  "*, staff:staff(id, code, name, phone), shift:shifts(id, name, work_start, work_end)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("attendance")
      .select(ATTENDANCE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Attendance not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.staff_id !== undefined) updateData.staff_id = body.staff_id || null;
    if (body.shift_id !== undefined) updateData.shift_id = body.shift_id || null;
    if (body.date !== undefined) updateData.date = body.date || null;
    if (body.check_in !== undefined) updateData.check_in = body.check_in || null;
    if (body.check_out !== undefined) updateData.check_out = body.check_out || null;
    if (body.status !== undefined) updateData.status = body.status || "missing";
    if (body.note !== undefined) updateData.note = body.note || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields provided to update" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("attendance").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("attendance")
      .select(ATTENDANCE_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("attendance").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
