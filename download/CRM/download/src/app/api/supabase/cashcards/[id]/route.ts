import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cashcardUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function fetchWithRelations(id: string) {
  const { data: row, error } = await supabaseAdmin
    .from("cash_cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message, data: null };
  if (!row) return { error: "Thẻ không tồn tại", data: null };

  const idSet = new Set<string>();
  if (row.customer_id) idSet.add(row.customer_id);
  if (row.co_owner_id) idSet.add(row.co_owner_id);
  const { data: customers } = await supabaseAdmin
    .from("customers")
    .select("id,name,phone")
    .in("id", Array.from(idSet));
  const customerMap = new Map<string, { id: string; name: string; phone: string } | null>();
  for (const c of (customers ?? []) as { id: string; name: string; phone: string | null }[]) {
    customerMap.set(c.id, { id: c.id, name: c.name, phone: c.phone ?? "" });
  }

  const data = {
    id: row.id,
    code: row.code,
    balance: Number(row.balance) || 0,
    status: row.status ?? "active",
    expiryDate: row.expiry_date ?? null,
    lockedUntil: row.locked_until ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerId: row.customer_id ?? null,
    coOwnerId: row.co_owner_id ?? null,
    customer: row.customer_id ? customerMap.get(row.customer_id) ?? null : null,
    coOwner: row.co_owner_id ? customerMap.get(row.co_owner_id) ?? null : null,
  };
  return { error: null, data };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { data, error } = await fetchWithRelations(id);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: error === "Thẻ không tồn tại" ? 404 : 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const result = cashcardUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
    }
    const { code, customerId, coOwnerId, expiryDate } = result.data;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (code !== undefined) updateData.code = code;
    if (customerId !== undefined) updateData.customer_id = customerId;
    if (coOwnerId !== undefined) updateData.co_owner_id = coOwnerId || null;
    if (expiryDate !== undefined) updateData.expiry_date = expiryDate ? new Date(expiryDate).toISOString() : null;

    const { error } = await supabaseAdmin.from("cash_cards").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data, error: fetchErr } = await fetchWithRelations(id);
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("cash_cards").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
