import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ATTENDANCE_SELECT =
  "*, staff:staff(id, code, name, phone), shift:shifts(id, name, work_start, work_end)";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staff_id");
    const shiftId = searchParams.get("shift_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("attendance")
      .select(ATTENDANCE_SELECT, { count: "exact" });

    if (staffId) query = query.eq("staff_id", staffId);
    if (shiftId) query = query.eq("shift_id", shiftId);
    if (status) query = query.eq("status", status);
    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);
    if (search) {
      query = query.or(`note.ilike.%${search}%`);
    }

    query = query.order("date", { ascending: false }).order("check_in", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      ok: true,
      data: data ?? [],
      pagination: { page, limit, total, totalPages },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staff_id, shift_id, date, check_in, check_out, status, note } = body;

    if (!staff_id) {
      return NextResponse.json({ ok: false, error: "staff_id is required" }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      staff_id,
      shift_id: shift_id || null,
      date,
      check_in: check_in || null,
      check_out: check_out || null,
      status: status || "missing",
      note: note || null,
    };

    const { data: attendance, error } = await supabaseAdmin
      .from("attendance")
      .insert(insertData)
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: attendance }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
