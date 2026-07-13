import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const invoiceId = searchParams.get("invoice_id");
    const action = searchParams.get("action");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("invoice_activities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (branchId && branchId !== "all") query = query.eq("branch_id", branchId);
    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    if (action) query = query.eq("action", action);
    if (search) query = query.ilike("invoice_code", `%${search}%`);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Enrich each activity with the creator's name (invoice_activities has no
    // FK to staff, so we fetch staff names separately and merge them in).
    const staffIds = Array.from(
      new Set(
        (data ?? [])
          .map((a: { created_by?: string | null }) => a.created_by)
          .filter((id): id is string => typeof id === "string" && !!id.trim())
      )
    );
    let staffMap: Record<string, { name: string; username?: string | null }> = {};
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from("staff")
        .select("id, name, username")
        .in("id", staffIds);
      for (const s of staffRows ?? []) {
        staffMap[s.id as string] = { name: s.name as string, username: s.username as string | null };
      }
    }

    // Kiosk special case: activities with null created_by originate from the
    // public "Đặt lịch" kiosk where a CUSTOMER placed the booking/order. We
    // fetch each such invoice's customer name so the activity table can show
    // "Khách hàng: <name>" instead of "Hệ thống".
    const invoiceIdsForCustomer = Array.from(
      new Set(
        (data ?? [])
          .filter(
            (a: { created_by?: string | null; invoice_id?: string | null }) =>
              !a.created_by && typeof a.invoice_id === "string" && !!a.invoice_id
          )
          .map((a: { invoice_id?: string | null }) => a.invoice_id as string)
      )
    );
    let invoiceCustomerMap: Record<string, { name: string; phone?: string | null }> = {};
    if (invoiceIdsForCustomer.length > 0) {
      const { data: invoiceRows } = await supabaseAdmin
        .from("invoices")
        .select("id, customer:customers(name, phone)")
        .in("id", invoiceIdsForCustomer);
      for (const inv of invoiceRows ?? []) {
        const c = (inv as { customer?: { name?: string; phone?: string | null } | null }).customer;
        if (c?.name) {
          invoiceCustomerMap[inv.id as string] = { name: c.name, phone: c.phone ?? null };
        }
      }
    }

    const enriched = (data ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      created_by_staff:
        typeof a.created_by === "string" && staffMap[a.created_by]
          ? staffMap[a.created_by]
          : null,
      created_by_customer:
        !a.created_by && typeof a.invoice_id === "string" && invoiceCustomerMap[a.invoice_id as string]
          ? invoiceCustomerMap[a.invoice_id as string]
          : null,
    }));

    return NextResponse.json({
      ok: true,
      data: enriched,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoice_id, invoice_code, action, detail, value, branch_id, created_by } = body;

    if (!action) return NextResponse.json({ ok: false, error: "Action is required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("invoice_activities")
      .insert({
        invoice_id: invoice_id || null,
        invoice_code: invoice_code || null,
        action,
        detail: detail || null,
        value: value || null,
        branch_id: branch_id || null,
        created_by: created_by || null,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
