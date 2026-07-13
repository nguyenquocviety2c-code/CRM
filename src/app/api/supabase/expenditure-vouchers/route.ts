import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const EXPENDITURE_VOUCHER_SELECT =
  "*, expenditure_categories(*), branches(*)";

const FK_FIELDS: ReadonlySet<string> = new Set([
  "category_id",
  "branch_id",
]);

const TEXT_FIELDS: ReadonlySet<string> = new Set([
  "payment_method",
  "reason",
  "supplier_name",
  "created_by",
]);

/**
 * Generate a unique expenditure voucher code with prefix "PC" and 6-digit
 * padding (e.g. PC000001).
 *
 * Strategy:
 *   1. Try the RPC function `generate_code(prefix, table_name)` if it exists.
 *   2. Fall back to JS-based generation: query the max code with prefix "PC",
 *      parse the numeric portion, increment.
 *   3. Final fallback: "PC000001".
 */
async function generateExpenditureVoucherCode(): Promise<string> {
  const PREFIX = "PC";
  const PAD = 6;

  // 1) Try the RPC function generate_code(prefix, table_name).
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: PREFIX, table_name: "expenditure_vouchers" }
    );
    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      const code = String(rpcData);
      if (code) {
        if (code.startsWith(PREFIX)) {
          return code;
        }
        const num = parseInt(code, 10);
        if (!isNaN(num)) {
          return `${PREFIX}${String(num).padStart(PAD, "0")}`;
        }
        return code;
      }
    }
  } catch (err) {
    console.warn("generate_code RPC failed, falling back to JS:", err);
  }

  // 2) JS-based fallback: query the highest code starting with "PC".
  const { data: maxRows, error: maxErr } = await supabaseAdmin
    .from("expenditure_vouchers")
    .select("code")
    .like("code", `${PREFIX}%`)
    .order("code", { ascending: false })
    .limit(1);

  if (maxErr) {
    console.error("Failed to query max expenditure voucher code:", maxErr);
    return `${PREFIX}${String(1).padStart(PAD, "0")}`;
  }

  let nextNum = 1;
  if (maxRows && maxRows.length > 0 && maxRows[0]?.code) {
    const numPart = String(maxRows[0].code).slice(PREFIX.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      nextNum = parsed + 1;
    }
  }

  return `${PREFIX}${String(nextNum).padStart(PAD, "0")}`;
}

/**
 * GET /api/supabase/expenditure-vouchers
 * List expenditure vouchers with filters, joins and pagination.
 *
 * Query params:
 *   - category_id, branch_id: FK filters
 *   - date_from, date_to: voucher_date range (yyyy-mm-dd)
 *   - search: ilike match on code, reason, supplier_name
 *   - page: 1-based page number (default 1)
 *   - limit: page size (default 50, max 500)
 *
 * Joins:
 *   - expenditure_categories(*), branches(*)
 *
 * Response: { ok, data, pagination: { page, limit, total, totalPages } }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id") || "";
    const branchId = searchParams.get("branch_id") || "";
    const dateFrom = searchParams.get("date_from") || "";
    const dateTo = searchParams.get("date_to") || "";
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(500, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("expenditure_vouchers").select(
      EXPENDITURE_VOUCHER_SELECT,
      { count: "exact" }
    );

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    if (branchId) {
      query = query.eq("branch_id", branchId);
    }
    if (dateFrom) {
      query = query.gte("voucher_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("voucher_date", dateTo);
    }
    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = query.or(
        `code.ilike.%${encodeURIComponent(escaped)}%,reason.ilike.%${encodeURIComponent(
          escaped
        )}%,supplier_name.ilike.%${encodeURIComponent(escaped)}%`
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/supabase/expenditure-vouchers error:", error);
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
    console.error("GET /api/supabase/expenditure-vouchers error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch expenditure vouchers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supabase/expenditure-vouchers
 * Create a new expenditure voucher. Auto-generates code with prefix "PC" (6-digit).
 *
 * Body fields (amount required):
 *   amount, payment_method?, reason?, category_id?, branch_id?,
 *   supplier_name?, created_by?, voucher_date?
 *
 * Returns the created voucher with all joins.
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
      body.amount === undefined ||
      body.amount === null ||
      body.amount === "" ||
      isNaN(Number(body.amount))
    ) {
      return NextResponse.json(
        { ok: false, error: "Amount is required and must be a number" },
        { status: 400 }
      );
    }

    const code = await generateExpenditureVoucherCode();

    const payload: Record<string, unknown> = {
      code,
      amount: Number(body.amount),
    };

    for (const field of TEXT_FIELDS) {
      if (body[field] !== undefined && body[field] !== null) {
        const value = String(body[field]).trim();
        if (value) {
          payload[field] = value;
        }
      }
    }

    for (const field of FK_FIELDS) {
      if (body[field] !== undefined) {
        payload[field] =
          body[field] === "" || body[field] === null ? null : body[field];
      }
    }

    if (body.voucher_date !== undefined && body.voucher_date !== null && body.voucher_date !== "") {
      payload.voucher_date = String(body.voucher_date);
    } else {
      payload.voucher_date = new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await supabaseAdmin
      .from("expenditure_vouchers")
      .insert(payload)
      .select(EXPENDITURE_VOUCHER_SELECT)
      .single();

    if (error) {
      console.error("POST /api/supabase/expenditure-vouchers error:", error);
      if (error.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            error: "An expenditure voucher with this code already exists",
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
    console.error("POST /api/supabase/expenditure-vouchers error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create expenditure voucher" },
      { status: 500 }
    );
  }
}
