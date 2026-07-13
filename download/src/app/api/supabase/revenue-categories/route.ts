import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/revenue-categories
 * List all revenue categories ordered by sort_order then name.
 *
 * Query params:
 *   - active: "true" | "false" -> only active/inactive
 *   - search: ilike match on name or code
 *
 * Response: { ok, data }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = (searchParams.get("search") || "").trim();

    let query = supabaseAdmin.from("revenue_categories").select("*");

    if (active === "true") {
      query = query.eq("active", true);
    } else if (active === "false") {
      query = query.eq("active", false);
    }

    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = query.or(
        `name.ilike.%${encodeURIComponent(escaped)}%,code.ilike.%${encodeURIComponent(
          escaped
        )}%`
      );
    }

    const { data, error } = await query
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      console.error("GET /api/supabase/revenue-categories error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("GET /api/supabase/revenue-categories error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch revenue categories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supabase/revenue-categories
 * Create a new revenue category.
 *
 * Body fields (name required):
 *   name, code?, active?, sort_order?
 *
 * Returns the created category.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      name: body.name.trim(),
    };

    if (body.code !== undefined && body.code !== null) {
      const code = String(body.code).trim();
      if (code) payload.code = code;
    }

    if (body.active !== undefined && body.active !== null) {
      payload.active = Boolean(body.active);
    } else {
      payload.active = true;
    }

    if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== "") {
      const num = Number(body.sort_order);
      if (!isNaN(num)) {
        payload.sort_order = num;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("revenue_categories")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("POST /api/supabase/revenue-categories error:", error);
      if (error.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            error: "A revenue category with this code already exists",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/supabase/revenue-categories error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create revenue category" },
      { status: 500 }
    );
  }
}
