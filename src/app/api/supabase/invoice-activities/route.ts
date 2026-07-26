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
    //
    // IMPORTANT: the staff table's `id` column is a UUID. Some legacy activity
    // rows may have a non-UUID `created_by` (e.g. a username string from older
    // code paths or manual API testing). If we pass a non-UUID string to
    // PostgREST's `.in("id", [...])`, the ENTIRE query fails with a UUID cast
    // error — so even the VALID UUIDs in the same batch return no results,
    // making EVERY activity show "—" for the performer. To prevent this, we
    // filter `staffIds` to only include valid UUID strings before the query.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const staffIds = Array.from(
      new Set(
        (data ?? [])
          .map((a: { created_by?: string | null }) => a.created_by)
          .filter((id): id is string =>
            typeof id === "string" && !!id.trim() && UUID_RE.test(id.trim())
          )
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

    // Kiosk special case: an activity with null created_by represents a
    // CUSTOMER action ONLY when the action is a CREATE (the order was placed
    // by a customer via the public "Đặt lịch" kiosk, with no staff logged in).
    // All other actions (CHECKIN, PAYMENT, CHECKOUT, UPDATE_INVOICE, NO_SHOW,
    // CANCEL) are ALWAYS staff-performed — a null created_by there is just
    // stale historical data, and must NOT be labeled "Khách hàng". Those rows
    // fall through to "Hệ thống" in the frontend.
    // (We only fetch the customer name for CREATE_* actions so the table can
    // show "Khách hàng: <name>" for genuine kiosk-created orders.)
    const CREATE_ACTIONS = new Set(["CREATE_INVOICE", "CREATE_INVOICE_FROM_BOOKING"]);
    const invoiceIdsForCustomer = Array.from(
      new Set(
        (data ?? [])
          .filter(
            (a: { created_by?: string | null; invoice_id?: string | null; action?: string | null }) =>
              !a.created_by &&
              typeof a.action === "string" &&
              CREATE_ACTIONS.has(a.action) &&
              typeof a.invoice_id === "string" &&
              !!a.invoice_id
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

    const enriched = (data ?? []).map((a: Record<string, unknown>) => {
      const actionStr = typeof a.action === "string" ? (a.action as string) : "";
      const isCreateAction = CREATE_ACTIONS.has(actionStr);
      const invId = typeof a.invoice_id === "string" ? (a.invoice_id as string) : "";
      return {
        ...a,
        created_by_staff:
          typeof a.created_by === "string" && staffMap[a.created_by]
            ? staffMap[a.created_by]
            : null,
        // Only CREATE_* actions with null created_by represent a customer action
        // (kiosk-placed order). For all other actions, a null created_by is stale
        // historical data and must NOT be labeled "Khách hàng" — it falls through
        // to "Hệ thống" in the frontend.
        created_by_customer:
          !a.created_by && isCreateAction && invoiceCustomerMap[invId]
            ? invoiceCustomerMap[invId]
            : null,
      };
    });

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
