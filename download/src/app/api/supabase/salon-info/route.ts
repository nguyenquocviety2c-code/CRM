import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/salon-info
 * Get salon info (single record, optionally filter by branch_id)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");

    let query = supabaseAdmin
      .from("salon_info")
      .select("*, branch:branches(id, name)")
      .order("created_at", { ascending: false })
      .limit(1);

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("GET /api/supabase/salon-info error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch salon info";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/salon-info
 * Create salon info (if not exists)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, branch_name, address, phone, email, website, fanpage, open_time, close_time, logo, branch_id } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "Salon name is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("salon_info")
      .insert({
        name: name.trim(),
        branch_name: branch_name || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        fanpage: fanpage || null,
        open_time: open_time || null,
        close_time: close_time || null,
        logo: logo || null,
        branch_id: branch_id || null,
      })
      .select("*, branch:branches(id, name)")
      .single();

    if (error) {
      console.error("POST /api/supabase/salon-info error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create salon info";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
