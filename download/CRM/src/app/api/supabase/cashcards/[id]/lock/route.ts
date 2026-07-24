import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cashcardLockSchema } from "@/lib/validations";

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

/**
 * POST /api/supabase/cashcards/[id]/lock
 * Body: { lockedUntil, note? }
 *
 * Mirrors the Prisma route: sets locked_until + status='locked'.
 * Caller is the existing lock-dialog (POST with lockedUntil in body).
 * A future "unlock" UI can pass an empty/blank lockedUntil to clear the lock
 * and restore status='active' — kept here for forward compat.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const result = cashcardLockSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
    }
    const { lockedUntil } = result.data;

    const updateData: Record<string, unknown> = {
      locked_until: new Date(lockedUntil).toISOString(),
      status: "locked",
      updated_at: new Date().toISOString(),
    };

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

/**
 * PATCH /api/supabase/cashcards/[id]/lock
 * Toggle is_locked: pass { isLocked: true, lockedUntil?: string } to lock,
 * or { isLocked: false } to unlock (clears locked_until + sets status='active').
 *
 * Added per task spec ("PATCH (toggle is_locked)") — supports both patterns.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const isLocked = Boolean(body?.isLocked);
    const lockedUntil = body?.lockedUntil as string | undefined;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (isLocked) {
      updateData.locked_until = lockedUntil ? new Date(lockedUntil).toISOString() : new Date().toISOString();
      updateData.status = "locked";
    } else {
      updateData.locked_until = null;
      updateData.status = "active";
    }

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
