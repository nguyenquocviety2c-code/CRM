import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const DEBT_SELECT = "*, customers(*), branches(*), debt_invoices(*)";

/**
 * GET /api/supabase/debts
 * List debts with filters, joins (customers, branches) and the related
 * debt_invoices for each debt.
 *
 * Query params:
 *   - customer_id, branch_id, status: filters
 *   - search: ilike match on customers.name or invoice_code in debt_invoices
 *   - page: 1-based page number (default 1)
 *   - limit: page size (default 50, max 500)
 *
 * Joins:
 *   - customers(*), branches(*), debt_invoices(*)
 *
 * Response: { ok, data, pagination: { page, limit, total, totalPages } }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id") || "";
    const branchId = searchParams.get("branch_id") || "";
    const status = searchParams.get("status") || "";
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(500, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("debts").select(DEBT_SELECT, {
      count: "exact",
    });

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
    if (branchId) {
      query = query.eq("branch_id", branchId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = query.or(
        `customers.name.ilike.%${encodeURIComponent(escaped)}%`
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/supabase/debts error:", error);
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
    console.error("GET /api/supabase/debts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch debts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supabase/debts
 * Create a new debt.
 *
 * Body fields (customer_id and total_amount required):
 *   customer_id, total_amount, branch_id?, status?
 *
 * `status` defaults to "unpaid" when not provided.
 *
 * Returns the created debt with all joins.
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

    if (!body.customer_id || typeof body.customer_id !== "string" || !body.customer_id.trim()) {
      return NextResponse.json(
        { ok: false, error: "customer_id is required" },
        { status: 400 }
      );
    }

    if (
      body.total_amount === undefined ||
      body.total_amount === null ||
      body.total_amount === "" ||
      isNaN(Number(body.total_amount))
    ) {
      return NextResponse.json(
        { ok: false, error: "total_amount is required and must be a number" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      customer_id: body.customer_id,
      total_amount: Number(body.total_amount),
    };

    if (body.branch_id !== undefined) {
      payload.branch_id =
        body.branch_id === "" || body.branch_id === null ? null : body.branch_id;
    }

    if (body.status !== undefined && body.status !== null && body.status !== "") {
      payload.status = String(body.status);
    } else {
      payload.status = "unpaid";
    }

    const { data, error } = await supabaseAdmin
      .from("debts")
      .insert(payload)
      .select(DEBT_SELECT)
      .single();

    if (error) {
      console.error("POST /api/supabase/debts error:", error);
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "A debt with these details already exists" },
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
    console.error("POST /api/supabase/debts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create debt" },
      { status: 500 }
    );
  }
}
