import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const CUSTOMER_SELECT =
  "*, source:customer_sources(id, name), group:customer_groups(id, name), branch:branches(id, name)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }
    // Enrich with customer_type: "old" if has >=1 completed invoice, else "new".
    const { data: invRows } = await supabaseAdmin
      .from("invoices")
      .select("customer_id")
      .eq("customer_id", id)
      .eq("status", "completed")
      .limit(1);
    const hasCompletedInvoice = (invRows ?? []).length > 0;
    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        has_completed_invoice: hasCompletedInvoice,
        customer_type: hasCompletedInvoice ? "old" : "new",
      },
    });
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
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.gender !== undefined)
      updateData.gender = body.gender === null ? null : String(body.gender);
    if (body.birthday !== undefined)
      updateData.birthday = body.birthday || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    if (body.note !== undefined) updateData.note = body.note || null;
    if (body.total_spent !== undefined)
      updateData.total_spent = Number(body.total_spent);
    if (body.debt !== undefined)
      updateData.debt = body.debt === null ? null : Number(body.debt);
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.source_id !== undefined)
      updateData.source_id = body.source_id || null;
    if (body.group_id !== undefined)
      updateData.group_id = body.group_id || null;
    if (body.branch_id !== undefined)
      updateData.branch_id = body.branch_id || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "name",
      "phone",
      "email",
      "gender",
      "birthday",
      "address",
      "note",
      "total_spent",
      "debt",
      "active",
      "source_id",
      "group_id",
      "branch_id",
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if (["total_spent", "debt"].includes(field)) {
        updateData[field] =
          body[field] === null ? null : Number(body[field]);
      } else if (field === "active") {
        updateData[field] = Boolean(body[field]);
      } else if (field === "gender") {
        updateData[field] =
          body[field] === null ? null : String(body[field]);
      } else if (field === "name") {
        updateData[field] = body[field]?.trim() || null;
      } else {
        updateData[field] = body[field] || null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data });
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

    // Check bookings referencing this customer
    const { data: bookings, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("customer_id", id)
      .limit(1);

    if (!bookingErr && bookings && bookings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa khách hàng vì đang có lịch hẹn liên quan đến khách hàng này",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("customers")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
