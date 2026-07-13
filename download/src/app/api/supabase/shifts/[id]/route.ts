import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SHIFT_SELECT = "*, branch:branches(id, name)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("shifts")
      .select(SHIFT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Shift not found" }, { status: 404 });
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
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.work_start !== undefined) updateData.work_start = body.work_start || null;
    if (body.work_end !== undefined) updateData.work_end = body.work_end || null;
    if (body.check_in_start !== undefined) updateData.check_in_start = body.check_in_start || null;
    if (body.check_in_end !== undefined) updateData.check_in_end = body.check_in_end || null;
    if (body.note !== undefined) updateData.note = body.note || null;
    if (body.is_default !== undefined) updateData.is_default = Boolean(body.is_default);
    if (body.status !== undefined) updateData.status = body.status || "active";
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields provided to update" }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (updateData.is_default === true) {
      const fetchCur = await supabaseAdmin.from("shifts").select("branch_id").eq("id", id).maybeSingle();
      const branchId = fetchCur.data?.branch_id ?? null;
      const unsetQuery = supabaseAdmin.from("shifts").update({ is_default: false }).eq("is_default", true).neq("id", id);
      if (branchId) {
        unsetQuery.eq("branch_id", branchId);
      }
      await unsetQuery;
    }

    const { error } = await supabaseAdmin.from("shifts").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("shifts")
      .select(SHIFT_SELECT)
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

    // Check attendance referencing this shift
    const { data: attendance, error: attErr } = await supabaseAdmin
      .from("attendance")
      .select("id")
      .eq("shift_id", id)
      .limit(1);

    if (!attErr && attendance && attendance.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa ca làm vì đang có bản ghi chấm công liên quan đến ca này",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("shifts").delete().eq("id", id);
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
