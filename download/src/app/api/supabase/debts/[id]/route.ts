import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const DEBT_SELECT = "*, customers(*), branches(*), debt_invoices(*)";

const NUMERIC_FIELDS: ReadonlySet<string> = new Set(["total_amount"]);

const FK_FIELDS: ReadonlySet<string> = new Set(["customer_id", "branch_id"]);

const TEXT_FIELDS: ReadonlySet<string> = new Set(["status"]);

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

  return payload;
}

/**
 * GET /api/supabase/debts/[id]
 * Fetch a single debt by ID with customer, branch, and debt_invoices joins.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Debt id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("debts")
      .select(DEBT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/supabase/debts/[id] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Debt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("GET /api/supabase/debts/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch debt" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/supabase/debts/[id]
 * Full update of a debt by ID. Commonly used to update total_amount after a payment.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Debt id is required" },
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
      body.total_amount !== undefined &&
      body.total_amount !== null &&
      body.total_amount !== "" &&
      isNaN(Number(body.total_amount))
    ) {
      return NextResponse.json(
        { ok: false, error: "total_amount must be a number" },
        { status: 400 }
      );
    }

    const payload = buildUpdatePayload(body);
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("debts")
      .update(payload)
      .eq("id", id)
      .select(DEBT_SELECT)
      .maybeSingle();

    if (error) {
      console.error("PUT /api/supabase/debts/[id] error:", error);
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

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Debt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("PUT /api/supabase/debts/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update debt" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/supabase/debts/[id]
 * Partial update of a debt by ID. Commonly used for status changes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Debt id is required" },
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
      .from("debts")
      .update(payload)
      .eq("id", id)
      .select(DEBT_SELECT)
      .maybeSingle();

    if (error) {
      console.error("PATCH /api/supabase/debts/[id] error:", error);
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

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Debt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("PATCH /api/supabase/debts/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update debt" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/supabase/debts/[id]
 * Delete a debt by ID. Cascades to debt_invoices automatically (DB-level).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Debt id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("debts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("DELETE /api/supabase/debts/[id] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: null });
  } catch (error) {
    console.error("DELETE /api/supabase/debts/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete debt" },
      { status: 500 }
    );
  }
}
