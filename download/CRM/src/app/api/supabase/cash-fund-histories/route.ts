import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const CASH_FUND_HISTORY_SELECT = "*, branches(*)";

/**
 * GET /api/supabase/cash-fund-histories
 * List cash fund histories ordered by created_at desc.
 *
 * Query params:
 *   - branch_id: filter by branch FK
 *   - page: 1-based page number (default 1)
 *   - limit: page size (default 50, max 500)
 *
 * Response: { ok, data, pagination }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(500, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("cash_fund_histories").select(
      CASH_FUND_HISTORY_SELECT,
      { count: "exact" }
    );

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/supabase/cash-fund-histories error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    return NextResponse.json({
      ok: true,
      data: data ?? [],
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("GET /api/supabase/cash-fund-histories error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch cash fund histories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supabase/cash-fund-histories
 * Create a new cash fund history entry.
 *
 * Body fields:
 *   previous_value, new_value, reason?, mechanism?, operator?, branch_id?
 *
 * Returns the created history entry.
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

    if (
      body.previous_value === undefined ||
      body.previous_value === null ||
      body.previous_value === "" ||
      isNaN(Number(body.previous_value))
    ) {
      return NextResponse.json(
        { ok: false, error: "previous_value is required and must be a number" },
        { status: 400 }
      );
    }

    if (
      body.new_value === undefined ||
      body.new_value === null ||
      body.new_value === "" ||
      isNaN(Number(body.new_value))
    ) {
      return NextResponse.json(
        { ok: false, error: "new_value is required and must be a number" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      previous_value: Number(body.previous_value),
      new_value: Number(body.new_value),
    };

    if (body.reason !== undefined && body.reason !== null) {
      payload.reason = String(body.reason);
    } else {
      payload.reason = "";
    }

    if (body.mechanism !== undefined && body.mechanism !== null) {
      payload.mechanism = String(body.mechanism);
    } else {
      payload.mechanism = "manual";
    }

    if (body.operator !== undefined && body.operator !== null) {
      payload.operator = String(body.operator);
    } else {
      payload.operator = "system";
    }

    if (body.branch_id !== undefined) {
      payload.branch_id =
        body.branch_id === "" || body.branch_id === null ? null : body.branch_id;
    }

    const { data, error } = await supabaseAdmin
      .from("cash_fund_histories")
      .insert(payload)
      .select(CASH_FUND_HISTORY_SELECT)
      .single();

    if (error) {
      console.error("POST /api/supabase/cash-fund-histories error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/supabase/cash-fund-histories error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create cash fund history" },
      { status: 500 }
    );
  }
}
