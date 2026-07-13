import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cashcardCreateSchema } from "@/lib/validations";

/**
 * Map a raw cash_cards row (snake_case) into the camelCase shape the UI expects,
 * including the nested `customer` + `coOwner` objects the Prisma route returned.
 */
function mapCashCardRow(
  row: Record<string, unknown>,
  customerMap: Map<string, { id: string; name: string; phone: string } | null>
) {
  const customerId = row.customer_id as string | null;
  const coOwnerId = row.co_owner_id as string | null;
  return {
    id: row.id,
    code: row.code,
    balance: Number(row.balance) || 0,
    status: row.status ?? "active",
    expiryDate: row.expiry_date ?? null,
    lockedUntil: row.locked_until ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerId: customerId ?? null,
    coOwnerId: coOwnerId ?? null,
    customer: customerId ? customerMap.get(customerId) ?? null : null,
    coOwner: coOwnerId ? customerMap.get(coOwnerId) ?? null : null,
  };
}

/**
 * GET /api/supabase/cashcards
 *   ?search=&customerSearch=&status=&page=&limit=
 *
 * Mirrors the original Prisma route's where-clause:
 *   - search: case-insensitive code contains
 *   - customerSearch: customer.name OR customer.phone contains (resolved via
 *     a separate customers lookup because PostgREST can't OR across FK columns)
 *   - status: exact match
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const customerSearch = searchParams.get("customerSearch") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Resolve customer ids matching the customerSearch filter (name OR phone).
    let customerIds: string[] | null = null;
    if (customerSearch) {
      const { data: matched } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`);
      customerIds = (matched ?? []).map((r: { id: string }) => r.id);
      if (customerIds.length === 0) {
        // No customer matched → no cash cards can match.
        return NextResponse.json({ ok: true, data: { cashCards: [], total: 0, page, limit } });
      }
    }

    let query = supabaseAdmin
      .from("cash_cards")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike("code", `%${search}%`);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (customerIds) {
      query = query.in("customer_id", customerIds);
    }

    const { data, count, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    // Enrich with customer + coOwner objects (matches the Prisma `include` shape).
    const idSet = new Set<string>();
    for (const r of rows) {
      if (r.customer_id) idSet.add(r.customer_id as string);
      if (r.co_owner_id) idSet.add(r.co_owner_id as string);
    }
    const customerMap = new Map<string, { id: string; name: string; phone: string } | null>();
    if (idSet.size > 0) {
      const { data: customers } = await supabaseAdmin
        .from("customers")
        .select("id,name,phone")
        .in("id", Array.from(idSet));
      for (const c of (customers ?? []) as { id: string; name: string; phone: string | null }[]) {
        customerMap.set(c.id, { id: c.id, name: c.name, phone: c.phone ?? "" });
      }
    }

    const cashCards = rows.map((r) => mapCashCardRow(r, customerMap));

    return NextResponse.json({
      ok: true,
      data: { cashCards, total: count ?? 0, page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/cashcards
 * Body: { code, customerId, coOwnerId?, expiryDate? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = cashcardCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
    }

    const { code, customerId, coOwnerId, expiryDate } = result.data;

    // Check code uniqueness.
    const { data: existing } = await supabaseAdmin
      .from("cash_cards")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: false, error: "Mã thẻ đã tồn tại" }, { status: 400 });
    }

    const insertData = {
      code,
      customer_id: customerId,
      co_owner_id: coOwnerId || null,
      expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
      balance: 0,
      status: "active",
    };

    const { data, error } = await supabaseAdmin
      .from("cash_cards")
      .insert(insertData)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Enrich with customer + coOwner for parity with the Prisma route.
    const idSet = new Set<string>([customerId]);
    if (coOwnerId) idSet.add(coOwnerId);
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id,name,phone")
      .in("id", Array.from(idSet));
    const customerMap = new Map<string, { id: string; name: string; phone: string } | null>();
    for (const c of (customers ?? []) as { id: string; name: string; phone: string | null }[]) {
      customerMap.set(c.id, { id: c.id, name: c.name, phone: c.phone ?? "" });
    }

    return NextResponse.json({ ok: true, data: mapCashCardRow(data as Record<string, unknown>, customerMap) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
