import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/customer-sets/[id]/members
 *
 * Returns the customers that belong to a customer set (populated automatically
 * when the set is saved — see repopulateSetMembers). Each member row joins the
 * customers table so the caller gets the customer's name/phone/code/etc. Also
 * computes per-customer metrics (totalSpent, serviceCount, lastVisit,
 * avgVisitDays, avgSpendPerVisit) from the invoices table so the view can show
 * a rich table.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // 1. Fetch the member rows joined with the customer.
    let query = supabaseAdmin
      .from("customer_set_members")
      .select(
        "id, added_at, customer:customers(id, name, phone, code, birthday, total_spent, created_at)"
      )
      .eq("customer_set_id", id)
      .order("added_at", { ascending: false });

    if (search) {
      // Search by customer name or phone (case-insensitive).
      query = query.or(`customer.name.ilike.%${search}%,customer.phone.ilike.%${search}%`);
    }

    const { data: members, error } = await query.limit(5000);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // 2. Compute per-customer metrics from the invoices table (completed only):
    //    serviceCount, lastVisit, avgVisitDays, avgSpendPerVisit.
    const customerIds = (members || [])
      .map((m: { customer?: { id?: string } | null }) => m.customer?.id)
      .filter((cid): cid is string => !!cid);
    let metricsMap = new Map<
      string,
      { serviceCount: number; lastVisitMs: number; avgVisitDays: number; avgSpendPerVisit: number }
    >();
    if (customerIds.length > 0) {
      const { data: invoices } = await supabaseAdmin
        .from("invoices")
        .select("customer_id, created_at, final_amount")
        .eq("status", "completed")
        .in("customer_id", customerIds)
        .limit(20000);
      const byCustomer = new Map<string, { dates: number[]; total: number }>();
      for (const inv of invoices || []) {
        const cid = inv.customer_id as string;
        const created = inv.created_at ? new Date(inv.created_at as string).getTime() : NaN;
        const amount = Number(inv.final_amount) || 0;
        const entry = byCustomer.get(cid) || { dates: [], total: 0 };
        if (!isNaN(created)) entry.dates.push(created);
        entry.total += amount;
        byCustomer.set(cid, entry);
      }
      for (const [cid, agg] of byCustomer) {
        const dates = agg.dates.sort((a, b) => a - b);
        const serviceCount = dates.length;
        const lastVisitMs = serviceCount > 0 ? dates[dates.length - 1] : 0;
        let avgVisitDays = 0;
        if (dates.length >= 2) {
          let sumGaps = 0;
          for (let i = 1; i < dates.length; i++) sumGaps += (dates[i] - dates[i - 1]) / 86400000;
          avgVisitDays = sumGaps / (dates.length - 1);
        }
        const totalSpent = agg.total;
        const avgSpendPerVisit = serviceCount > 0 ? totalSpent / serviceCount : 0;
        metricsMap.set(cid, {
          serviceCount,
          lastVisitMs,
          avgVisitDays: Math.round(avgVisitDays),
          avgSpendPerVisit: Math.round(avgSpendPerVisit),
        });
      }
    }

    // 3. Build the response: merge customer info + metrics.
    const result = (members || []).map((m: {
      id: string;
      added_at: string;
      customer?: {
        id?: string;
        name?: string | null;
        phone?: string | null;
        code?: string | null;
        birthday?: string | null;
        total_spent?: number | string | null;
        created_at?: string | null;
      } | null;
    }) => {
      const c = m.customer;
      const cid = c?.id || "";
      const metrics = cid ? metricsMap.get(cid) : undefined;
      return {
        memberId: m.id,
        addedAt: m.added_at,
        customerId: cid,
        name: c?.name || "—",
        phone: c?.phone || null,
        code: c?.code || null,
        birthday: c?.birthday || null,
        totalSpent: Number(c?.total_spent) || 0,
        serviceCount: metrics?.serviceCount ?? 0,
        lastVisitMs: metrics?.lastVisitMs ?? 0,
        avgVisitDays: metrics?.avgVisitDays ?? 0,
        avgSpendPerVisit: metrics?.avgSpendPerVisit ?? 0,
        createdAt: c?.created_at || null,
      };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch members";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
