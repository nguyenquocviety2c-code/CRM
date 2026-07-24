import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cashcardTopupSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function fetchCardWithRelations(id: string) {
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

/**
 * POST /api/supabase/cashcards/[id]/topup
 * Body: { method, amount, bonus, topupDate, topupCode?, recordedById?, note? }
 *
 * Mirrors the Prisma transaction: insert a cash_card_topups row + atomically
 * increment cash_cards.balance by `total`. Supabase has no transactional
 * multi-table write over the REST API, so we read the current balance first,
 * then UPDATE with the new total — small race window but acceptable for an
 * admin tool with a single cashier at a time.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const result = cashcardTopupSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
    }

    const { method, amount, bonus, topupDate, topupCode, recordedById, note } = result.data;
    const total = amount + bonus;

    // Verify the card exists before writing.
    const { data: existing } = await supabaseAdmin
      .from("cash_cards")
      .select("id, balance")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Thẻ không tồn tại" }, { status: 404 });
    }

    // Insert the topup record.
    const { data: topupRow, error: topupErr } = await supabaseAdmin
      .from("cash_card_topups")
      .insert({
        cash_card_id: id,
        method,
        amount,
        bonus,
        total,
        topup_date: new Date(topupDate).toISOString(),
        topup_code: topupCode || null,
        recorded_by_id: recordedById || null,
        note: note || null,
      })
      .select("*")
      .single();
    if (topupErr) {
      return NextResponse.json({ ok: false, error: topupErr.message }, { status: 500 });
    }

    // Increment the card balance.
    const newBalance = (Number(existing.balance) || 0) + total;
    const { error: updErr } = await supabaseAdmin
      .from("cash_cards")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      // Best-effort: leave the topup row in place; surface the error.
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    const { data: cashCard, error: fetchErr } = await fetchCardWithRelations(id);
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr }, { status: 500 });
    }

    // Map topup row to camelCase for parity with Prisma.
    const topup = {
      id: topupRow.id,
      cashCardId: topupRow.cash_card_id,
      method: topupRow.method,
      amount: Number(topupRow.amount) || 0,
      bonus: Number(topupRow.bonus) || 0,
      total: Number(topupRow.total) || 0,
      topupDate: topupRow.topup_date,
      topupCode: topupRow.topup_code ?? null,
      recordedById: topupRow.recorded_by_id ?? null,
      note: topupRow.note ?? null,
      createdAt: topupRow.created_at,
    };

    return NextResponse.json({ ok: true, data: { topup, cashCard } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
