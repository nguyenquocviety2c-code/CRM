import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SHIFT_SELECT = "*, branch:branches(id, name)";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const active = searchParams.get("active");
    const search = searchParams.get("search");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("shifts")
      .select(SHIFT_SELECT, { count: "exact" });

    if (branchId) query = query.eq("branch_id", branchId);
    if (active === "true") query = query.eq("status", "active");
    else if (active === "false") query = query.neq("status", "active");
    if (search) {
      query = query.or(`name.ilike.%${search}%,note.ilike.%${search}%`);
    }

    query = query.order("is_default", { ascending: false }).order("name", { ascending: true }).range(from, to);

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
    const { name, work_start, work_end, check_in_start, check_in_end, note, is_default, status, branch_id } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "Shift name is required" }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      name: name.trim(),
      work_start: work_start || null,
      work_end: work_end || null,
      check_in_start: check_in_start || null,
      check_in_end: check_in_end || null,
      note: note || null,
      is_default: is_default !== undefined ? Boolean(is_default) : false,
      status: status || "active",
      branch_id: branch_id || null,
    };

    // If this shift is set as default, unset other defaults (optionally scoped by branch)
    if (insertData.is_default) {
      const unsetQuery = supabaseAdmin.from("shifts").update({ is_default: false }).eq("is_default", true);
      if (branchId) {
        unsetQuery.eq("branch_id", branchId);
      }
      await unsetQuery;
    }

    const { data: shift, error } = await supabaseAdmin
      .from("shifts")
      .insert(insertData)
      .select(SHIFT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: shift }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
