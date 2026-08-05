import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = searchParams.get("search");
    const branchId = searchParams.get("branch_id");

    // If filtering by branch, use junction table to find matching categories
    if (branchId && branchId !== "all") {
      const { data: junctionData, error: junctionError } = await supabaseAdmin
        .from("service_category_branches")
        .select("service_category_id")
        .eq("branch_id", branchId);

      if (junctionError) {
        return NextResponse.json({ ok: false, error: junctionError.message }, { status: 500 });
      }

      const categoryIds = (junctionData || []).map((r: { service_category_id: string }) => r.service_category_id);
      if (categoryIds.length === 0) {
        return NextResponse.json({ ok: true, data: [] });
      }

      let query = supabaseAdmin.from("service_categories").select("*").in("id", categoryIds);
      if (active === "true") query = query.eq("active", true);
      else if (active === "false") query = query.eq("active", false);
      if (search) query = query.ilike("name", `%${search}%`);
      query = query.order("sort_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true });

      const { data, error } = await query;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      // Fetch branch assignments for these categories
      const { data: sbData } = await supabaseAdmin
        .from("service_category_branches")
        .select("service_category_id, branch_id")
        .in("service_category_id", categoryIds);

      const branchMap: Record<string, string[]> = {};
      for (const sb of sbData || []) {
        if (!branchMap[sb.service_category_id]) branchMap[sb.service_category_id] = [];
        branchMap[sb.service_category_id].push(sb.branch_id);
      }

      const enriched = (data || []).map((c: Record<string, unknown>) => ({
        ...c,
        branches: branchMap[c.id as string] || [],
      }));

      return NextResponse.json({ ok: true, data: enriched });
    }

    // No branch filter — return all
    let query = supabaseAdmin.from("service_categories").select("*");
    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    if (search) query = query.ilike("name", `%${search}%`);
    query = query.order("sort_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true });

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Fetch all branch assignments
    const catIds = (data || []).map((c: { id: string }) => c.id);
    const { data: sbData } = await supabaseAdmin
      .from("service_category_branches")
      .select("service_category_id, branch_id")
      .in("service_category_id", catIds.length > 0 ? catIds : ["00000000-0000-0000-0000-000000000000"]);

    const branchMap: Record<string, string[]> = {};
    for (const sb of sbData || []) {
      if (!branchMap[sb.service_category_id]) branchMap[sb.service_category_id] = [];
      branchMap[sb.service_category_id].push(sb.branch_id);
    }

    const enriched = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      branches: branchMap[c.id as string] || [],
    }));

    return NextResponse.json({ ok: true, data: enriched });
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
    const { name, active, sort_order, branch_ids, requires_contact } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    const insertData: Record<string, unknown> = {
      name: name.trim(),
      active: active !== undefined ? Boolean(active) : true,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      requires_contact: requires_contact !== undefined ? Boolean(requires_contact) : false,
    };

    const { data, error } = await supabaseAdmin
      .from("service_categories")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Insert multi-branch assignments
    const bids: string[] = Array.isArray(branch_ids) ? branch_ids : [];
    if (bids.length > 0) {
      const rows = bids.map((bid: string) => ({
        service_category_id: data.id,
        branch_id: bid,
      }));
      await supabaseAdmin.from("service_category_branches").insert(rows);
    }

    return NextResponse.json({ ok: true, data: { ...data, branches: bids } }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
