import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    let query = supabaseAdmin.from("branches").select("*");
    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, phone, email, active } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "Branch name is required" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("branches")
      .insert({
        name: name.trim(),
        address: address || null,
        phone: phone || null,
        email: email || null,
        active: active !== undefined ? active : true,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
