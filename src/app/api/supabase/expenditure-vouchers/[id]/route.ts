import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const EXPENDITURE_VOUCHER_SELECT =
  "*, expenditure_categories(*), branches(*)";

const NUMERIC_FIELDS: ReadonlySet<string> = new Set(["amount"]);

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
 * Build an update payload from the request body for a given allow-list of fields.
 */
function buildUpdatePayload(body: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (value === null) {
      payload[field] = null;
      continue;
    }
    const str = String(value).trim();
    if (str) {
      payload[field] = str;
    }
  }

  for (const field of FK_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    payload[field] = value === "" || value === null ? null : value;
  }

  for (const field of NUMERIC_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (value === null || value === "") {
      payload[field] = 0;
      continue;
    }
    const num = Number(value);
    if (!isNaN(num)) {
      payload[field] = num;
    }
  }

  if (body.voucher_date !== undefined && body.voucher_date !== null) {
    const str = String(body.voucher_date).trim();
    if (str) {
      payload.voucher_date = str;
    }
  }

  if (body.code !== undefined && body.code !== null) {
    const str = String(body.code).trim();
    if (str) {
      payload.code = str;
    }
  }

  return payload;
}

/**
 * GET /api/supabase/expenditure-vouchers/[id]
 * Fetch a single expenditure voucher by ID with all joins.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Voucher id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("expenditure_vouchers")
      .select(EXPENDITURE_VOUCHER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/supabase/expenditure-vouchers/[id] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Expenditure voucher not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("GET /api/supabase/expenditure-vouchers/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch expenditure voucher" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/supabase/expenditure-vouchers/[id]
 * Full update of an expenditure voucher by ID.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Voucher id is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (
      body.amount !== undefined &&
      body.amount !== null &&
      body.amount !== "" &&
      isNaN(Number(body.amount))
    ) {
      return NextResponse.json(
        { ok: false, error: "Amount must be a number" },
        { status: 400 }
      );
    }

    const payload = buildUpdatePayload(body);
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("expenditure_vouchers")
      .update(payload)
      .eq("id", id)
      .select(EXPENDITURE_VOUCHER_SELECT)
      .maybeSingle();

    if (error) {
      console.error("PUT /api/supabase/expenditure-vouchers/[id] error:", error);
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

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Expenditure voucher not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("PUT /api/supabase/expenditure-vouchers/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update expenditure voucher" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/supabase/expenditure-vouchers/[id]
 * Partial update of an expenditure voucher by ID.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Voucher id is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const payload = buildUpdatePayload(body);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("expenditure_vouchers")
      .update(payload)
      .eq("id", id)
      .select(EXPENDITURE_VOUCHER_SELECT)
      .maybeSingle();

    if (error) {
      console.error("PATCH /api/supabase/expenditure-vouchers/[id] error:", error);
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

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Expenditure voucher not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("PATCH /api/supabase/expenditure-vouchers/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update expenditure voucher" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/supabase/expenditure-vouchers/[id]
 * Delete an expenditure voucher by ID.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Voucher id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("expenditure_vouchers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("DELETE /api/supabase/expenditure-vouchers/[id] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: null });
  } catch (error) {
    console.error("DELETE /api/supabase/expenditure-vouchers/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete expenditure voucher" },
      { status: 500 }
    );
  }
}
