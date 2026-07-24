import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PAYROLL_SELECT = "*, staff:staff(id, code, name, phone)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("payroll_payments")
      .select(PAYROLL_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Payroll payment not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.staff_id !== undefined) updateData.staff_id = body.staff_id || null;
    if (body.payment_type !== undefined) updateData.payment_type = body.payment_type || "salary";
    if (body.amount !== undefined) updateData.amount = Number(body.amount);
    if (body.payment_method !== undefined) updateData.payment_method = body.payment_method || "cash";
    if (body.payment_date !== undefined) updateData.payment_date = body.payment_date || null;
    if (body.note !== undefined) updateData.note = body.note || null;
    if (body.created_by !== undefined) updateData.created_by = body.created_by || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields provided to update" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("payroll_payments").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("payroll_payments")
      .select(PAYROLL_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("payroll_payments").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
