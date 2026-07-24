import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const DEBT_INVOICE_SELECT = "*, debts(*)";

/**
 * GET /api/supabase/debt-invoices
 * List debt invoices. Most commonly filtered by `?debt_id=`.
 *
 * Query params:
 *   - debt_id: filter by debt FK
 *   - status: filter by status (e.g. "unpaid" | "partial" | "paid")
 *   - search: ilike match on invoice_code
 *   - page: 1-based page number (default 1)
 *   - limit: page size (default 50, max 500)
 *
 * Response: { ok, data, pagination: { page, limit, total, totalPages } }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const debtId = searchParams.get("debt_id") || "";
    const status = searchParams.get("status") || "";
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(500, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("debt_invoices").select(DEBT_INVOICE_SELECT, {
      count: "exact",
    });

    if (debtId) {
      query = query.eq("debt_id", debtId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = query.ilike("invoice_code", `%${escaped}%`);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/supabase/debt-invoices error:", error);
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
    console.error("GET /api/supabase/debt-invoices error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch debt invoices" },
      { status: 500 }
    );
  }
}
