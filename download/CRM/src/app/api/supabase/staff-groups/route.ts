import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = searchParams.get("search");

    let query = supabaseAdmin.from("staff_groups").select("*");

    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    // Order by sort_order, then name
    query = query
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: data ?? [] });
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
    const { name, is_office_staff, active, sort_order } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Group name is required" },
        { status: 400 }
      );
    }

    const insertData: Record<string, unknown> = {
      name: name.trim(),
      is_office_staff:
        is_office_staff !== undefined ? Boolean(is_office_staff) : false,
      active: active !== undefined ? Boolean(active) : true,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
    };

    const { data, error } = await supabaseAdmin
      .from("staff_groups")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
