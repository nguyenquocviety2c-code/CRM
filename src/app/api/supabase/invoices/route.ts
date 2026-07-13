import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentStaffId } from "@/lib/auth/current-staff";

/**
 * Storage note
 * ------------
 * The Supabase `invoices` table has no dedicated `invoice_items` table (and DDL
 * is unavailable from the app), so line items are serialized as JSON into the
 * existing `note` TEXT column using the shape:
 *   { "__kind": "invoice_meta", "items": [...], "note": "<human note>", "tip": <number> }
 * The `tip` field (tiền khách thưởng cho thợ) is stored alongside the items.
 * The `promotion` field (applied promotion metadata) is also stored here.
 * The `photos` field (array of base64 data URLs or R2/S3 URLs) is stored here.
 * The GET handler below decodes this back into `items` + `note` + `tip` + `promotion` + `photos` fields.
 */
const ITEMS_MARKER = '"__kind":"invoice_meta"';

interface InvoiceItemInput {
  id?: string;
  itemId?: string;
  name: string;
  type?: string;
  quantity: number;
  price: number;
  discount?: number;
  // Discount unit: "VND" (đ — fixed amount) or "PERCENT" (% — of price*qty).
  // Defaults to "VND" when omitted (backward compatibility with older clients).
  discountType?: "VND" | "PERCENT";
  total: number;
  staffId?: string;
  staffName?: string;
}

/**
 * Generate an invoice code: "HD" + 6-digit zero-padded sequence.
 * Mirrors the bookings code-generator: try RPC, then JS fallback.
 */
async function generateInvoiceCode(): Promise<string> {
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "HD", table_name: "invoices" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  const { data: existing } = await supabaseAdmin
    .from("invoices")
    .select("code")
    .like("code", "HD%")
    .order("code", { ascending: false })
    .limit(1);

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^HD/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `HD${String(next).padStart(6, "0")}`;
}

/**
 * GET /api/supabase/invoices
 * List invoices with optional filters
 * Query params: ?branch_id= &customer_id= &staff_id= &status= &date_from= &date_to= &search= &page= &limit=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const customerId = searchParams.get("customer_id");
    const staffId = searchParams.get("staff_id");
    const bookingId = searchParams.get("booking_id");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search");
    // lite=true → strip the `photos` array from each invoice's decoded note.
    // Photos are stored as base64 data URLs (up to ~2.6MB each) in the note
    // JSON. When the report module fetches 1000 invoices, including photos
    // balloons the response to ~7.7MB and 2+ seconds. The report views only
    // need summary fields + items (for service/package/sales aggregation) —
    // NOT photos. lite mode cuts the payload by >95% with zero data loss for
    // the report's use case. Detail views (invoice detail dialog, cashier
    // history) do NOT use lite — they need photos for display.
    const lite = searchParams.get("lite") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("invoices")
      .select("*, customer:customers(id, name, phone, code), branch:branches(id, name), staff:staff(id, name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (branchId) query = query.eq("branch_id", branchId);
    if (customerId) query = query.eq("customer_id", customerId);
    if (staffId) query = query.eq("staff_id", staffId);
    if (bookingId) query = query.eq("booking_id", bookingId);
    if (status) query = query.eq("status", status);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);
    if (search) query = query.ilike("code", `%${search}%`);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Decode items JSON stored in `note` back into structured fields.
    const decoded = (data ?? []).map((row: Record<string, unknown>) => {
      const rawNote = row.note;
      let decoded_row: Record<string, unknown>;
      if (typeof rawNote === "string" && rawNote.includes(ITEMS_MARKER)) {
        try {
          const parsed = JSON.parse(rawNote) as {
            items?: InvoiceItemInput[];
            note?: string;
            tip?: number;
            promotion?: unknown;
            photos?: unknown;
          };
          decoded_row = {
            ...row,
            items: Array.isArray(parsed.items) ? parsed.items : [],
            note: parsed.note ?? null,
            tip: Number(parsed.tip) || 0,
            promotion: parsed.promotion ?? null,
            // lite mode: drop photos (base64 data URLs, up to MBs each) to
            // keep the report's 1000-invoice payload small. Non-lite callers
            // (detail views) get the full photos array as before.
            photos: lite ? [] : (Array.isArray(parsed.photos) ? (parsed.photos as string[]) : []),
          };
        } catch {
          decoded_row = { ...row, items: [], tip: 0, promotion: null, photos: [] };
        }
      } else {
        decoded_row = { ...row, items: [], tip: 0, promotion: null, photos: [] };
      }
      return decoded_row;
    });

    // Enrich customer data with source + channel info.
    // Source/channel may come from 2 places:
    //   1. The customer's own source_id (set when creating the customer).
    //   2. The booking's customer_source_id / customer_channel_id (set when
    //      creating the booking — often richer than the customer record).
    // We try the booking first (via invoice.booking_id), then fall back to the
    // customer's source_id. Channel always comes from the booking.

    // Collect booking_ids from invoices.
    const bookingIds = [...new Set(
      decoded
        .map((r) => r.booking_id as string | null)
        .filter((id): id is string => !!id)
    )];

    // Fetch bookings to get their source + channel.
    const bookingSourceMap = new Map<string, { id: string; name: string } | null>();
    const bookingChannelMap = new Map<string, { id: string; name: string } | null>();
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_source_id, customer_channel_id")
        .in("id", bookingIds);
      // Collect all source + channel ids for batch lookup.
      const bSourceIds = [...new Set(
        (bookings || [])
          .map((b: { customer_source_id?: string | null }) => b.customer_source_id)
          .filter((id): id is string => !!id)
      )];
      const bChannelIds = [...new Set(
        (bookings || [])
          .map((b: { customer_channel_id?: string | null }) => b.customer_channel_id)
          .filter((id): id is string => !!id)
      )];
      // Fetch source names.
      const bSourceNameMap = new Map<string, { id: string; name: string }>();
      if (bSourceIds.length > 0) {
        const { data: sources } = await supabaseAdmin
          .from("customer_sources")
          .select("id, name")
          .in("id", bSourceIds);
        for (const s of sources || []) {
          bSourceNameMap.set(s.id, { id: s.id, name: s.name });
        }
      }
      // Fetch channel names.
      const bChannelNameMap = new Map<string, { id: string; name: string }>();
      if (bChannelIds.length > 0) {
        const { data: channels } = await supabaseAdmin
          .from("booking_channels")
          .select("id, name")
          .in("id", bChannelIds);
        for (const c of channels || []) {
          bChannelNameMap.set(c.id, { id: c.id, name: c.name });
        }
      }
      // Build per-booking source + channel maps.
      for (const b of bookings || []) {
        const bid = (b as { id: string }).id;
        const sid = (b as { customer_source_id?: string | null }).customer_source_id;
        const cid = (b as { customer_channel_id?: string | null }).customer_channel_id;
        bookingSourceMap.set(bid, sid ? (bSourceNameMap.get(sid) ?? null) : null);
        bookingChannelMap.set(bid, cid ? (bChannelNameMap.get(cid) ?? null) : null);
      }
    }

    // Also fetch customer-level source (fallback if booking has none).
    const customerIds = [...new Set(
      decoded
        .map((r) => (r.customer as { id?: string } | null)?.id)
        .filter((id): id is string => !!id)
    )];
    const customerSourceMap = new Map<string, { id: string; name: string } | null>();
    if (customerIds.length > 0) {
      const { data: customers } = await supabaseAdmin
        .from("customers")
        .select("id, source_id")
        .in("id", customerIds);
      const cSourceIds = [...new Set(
        (customers || [])
          .map((c: { source_id?: string | null }) => c.source_id)
          .filter((id): id is string => !!id)
      )];
      const cSourceNameMap = new Map<string, { id: string; name: string }>();
      if (cSourceIds.length > 0) {
        const { data: sources } = await supabaseAdmin
          .from("customer_sources")
          .select("id, name")
          .in("id", cSourceIds);
        for (const s of sources || []) {
          cSourceNameMap.set(s.id, { id: s.id, name: s.name });
        }
      }
      for (const c of customers || []) {
        const cid = (c as { id: string }).id;
        const sid = (c as { source_id?: string | null }).source_id;
        customerSourceMap.set(cid, sid ? (cSourceNameMap.get(sid) ?? null) : null);
      }
    }

    // Attach source + channel to each invoice's customer.
    // Priority: booking source > customer source. Channel: booking only.
    for (const row of decoded) {
      const cust = row.customer as { id?: string; source?: unknown; channel?: unknown } | null;
      if (!cust) continue;
      const bid = row.booking_id as string | null;
      // Source: try booking first, then customer.
      const bSource = bid ? (bookingSourceMap.get(bid) ?? null) : null;
      const cSource = cust.id ? (customerSourceMap.get(cust.id) ?? null) : null;
      cust.source = bSource || cSource || null;
      // Channel: from booking only.
      cust.channel = bid ? (bookingChannelMap.get(bid) ?? null) : null;
    }

    return NextResponse.json({
      ok: true,
      data: decoded,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch invoices";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/invoices
 * Create a new invoice (with line items + activity log).
 * Body: {
 *   customer_id, branch_id, staff_id?, items[], subtotal?, discount?, tip?, promotion?, final_amount?,
 *   payment_method?, status?, note?, created_by?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customer_id,
      branch_id,
      staff_id,
      items,
      subtotal,
      discount,
      tip,
      promotion,
      final_amount,
      payment_method,
      status,
      note,
      created_by,
      booking_id,
    } = body;

    if (!customer_id) {
      return NextResponse.json({ ok: false, error: "customer_id is required" }, { status: 400 });
    }
    if (!branch_id) {
      return NextResponse.json({ ok: false, error: "branch_id is required" }, { status: 400 });
    }

    // Normalize line items and derive amounts when not provided.
    const itemRows: InvoiceItemInput[] = Array.isArray(items)
      ? items.filter((it: InvoiceItemInput) => it && it.name).map((it: InvoiceItemInput, idx: number) => ({
          id: it.id,
          itemId: it.itemId,
          name: it.name,
          type: it.type,
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
          discount: Number(it.discount) || 0,
          // Persist the discount unit so paid invoices display correctly
          // (e.g. "10%" vs "10000đ"). Defaults to "VND" for older clients.
          discountType: it.discountType === "PERCENT" ? "PERCENT" : "VND",
          total: Number(it.total) || (Number(it.quantity) || 1) * (Number(it.price) || 0),
          staffId: it.staffId,
          staffName: it.staffName,
          // keep sort_order conceptually via array order
          ...(idx !== undefined ? {} : {}),
        }))
      : [];

    const computedSubtotal = itemRows.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const subtotalAmount = subtotal != null ? Number(subtotal) : computedSubtotal;
    const discountAmount = Number(discount) || 0;
    const tipAmount = Number(tip) || 0;
    const promotionMeta = promotion || null;
    const finalAmount = final_amount != null ? Number(final_amount) : Math.max(0, subtotalAmount - discountAmount + tipAmount);

    const finalCode = await generateInvoiceCode();

    // Serialize items into the note column (see storage note at top of file).
    const photosList: string[] = Array.isArray(body.photos)
      ? (body.photos as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    const notePayload = JSON.stringify({
      __kind: "invoice_meta",
      items: itemRows,
      note: note || null,
      tip: tipAmount,
      promotion: promotionMeta,
      photos: photosList,
    });

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        code: finalCode,
        customer_id,
        branch_id,
        staff_id: staff_id || null,
        booking_id: booking_id || null,
        total_amount: subtotalAmount,
        discount: discountAmount,
        final_amount: finalAmount,
        payment_method: payment_method || "cash",
        status: status || "completed",
        note: notePayload,
        created_by: created_by || null,
      })
      .select("*, customer:customers(id, name, phone, code), branch:branches(id, name), staff:staff(id, name)")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Resolve who created this invoice: prefer the body's created_by, fall back
    // to the currently-logged-in staff (from the auth cookie). This is the
    // "Người thực hiện" shown in the activity history table.
    const actorStaffId = (typeof created_by === "string" && created_by.trim()) || getCurrentStaffId(request) || null;

    // Kiosk special case: if this invoice is created from a booking that was
    // placed by a CUSTOMER via the public "Đặt lịch" kiosk (booking.created_by
    // is null — no staff created it), the "Khởi tạo" activity's executor is the
    // CUSTOMER (recorded as null created_by, enriched with the customer name on
    // read). Subsequent actions (payment, edits) performed by the logged-in
    // staff still attribute to that staff.
    let isKioskBooking = false;
    if (booking_id) {
      try {
        const { data: bookingRow } = await supabaseAdmin
          .from("bookings")
          .select("created_by")
          .eq("id", booking_id)
          .maybeSingle();
        isKioskBooking = !bookingRow?.created_by;
      } catch {
        // best-effort: treat as staff-created if the lookup fails
      }
    }
    const createActorId = isKioskBooking ? null : actorStaffId;

    // Log a create activity (best-effort, non-blocking). When the invoice is
    // created from a booking with status "pending" (the checkin flow), label
    // it CHECKIN; otherwise CREATE_INVOICE (standalone) or
    // CREATE_INVOICE_FROM_BOOKING (booking linked but completed directly).
    try {
      const isCheckinFlow = !!booking_id && status === "pending";
      const createAction = isCheckinFlow
        ? "CHECKIN"
        : booking_id
          ? "CREATE_INVOICE_FROM_BOOKING"
          : "CREATE_INVOICE";
      await supabaseAdmin.from("invoice_activities").insert({
        invoice_id: data.id,
        invoice_code: finalCode,
        action: createAction,
        detail:
          isCheckinFlow
            ? `Checkin - tạo hóa đơn ${finalCode} từ lịch hẹn - ${itemRows.length} mặt hàng`
            : `Tạo hóa đơn ${finalCode} - ${itemRows.length} mặt hàng${tipAmount > 0 ? ` - thưởng thợ ${tipAmount}` : ""}`,
        value: String(finalAmount),
        branch_id,
        created_by: createActorId,
      });
    } catch {
      // Activity logging is best-effort; don't fail the invoice creation.
    }

    // If the invoice was created directly in "completed" status (checkout at
    // the cashier), also log a PAYMENT activity so the history table shows a
    // "Thanh toán" row alongside the create row. The payment is always
    // performed by the logged-in staff (even for kiosk bookings).
    if (status === "completed") {
      try {
        await supabaseAdmin.from("invoice_activities").insert({
          invoice_id: data.id,
          invoice_code: finalCode,
          action: "PAYMENT",
          detail: `Thanh toán hóa đơn ${finalCode} - ${finalAmount}đ${payment_method ? ` (${payment_method})` : ""}`,
          value: String(finalAmount),
          branch_id,
          created_by: actorStaffId,
        });
      } catch {
        // best-effort
      }
    }

    // When an invoice is created directly in "completed" status (paid at the
    // cashier), mark the linked booking as "checkout" so the orders list shows
    // "Đã thanh toán". This lets a booking be paid WITHOUT a prior checkin —
    // the user wants unpaid/un-checked-in orders to be payable directly, then
    // become "Đã thanh toán" immediately. Best-effort: don't fail the invoice
    // if the booking update errors.
    if (booking_id && (status === "completed" || status === undefined)) {
      try {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "checkout" })
          .eq("id", booking_id);
      } catch {
        // best-effort
      }
    }

    // If a promotion was applied, increment its used_count (best-effort) so the
    // CSKH promotion table's "Đã sử dụng" / "Chưa sử dụng" columns reflect usage.
    const promoId =
      promotionMeta && typeof promotionMeta === "object"
        ? (promotionMeta as { id?: string }).id
        : undefined;
    if (promoId) {
      try {
        // Fetch current used_count then set +1 (avoids race with concurrent inserts).
        const { data: cur } = await supabaseAdmin
          .from("incentives")
          .select("used_count")
          .eq("id", promoId)
          .maybeSingle();
        const next = (Number(cur?.used_count) || 0) + 1;
        await supabaseAdmin
          .from("incentives")
          .update({ used_count: next, updated_at: new Date().toISOString() })
          .eq("id", promoId);
      } catch {
        // Best-effort; don't fail the invoice creation.
      }
    }

    // Promote a walk-in guest customer now that an invoice has been paid — this
    // makes the customer visible in the Customers module (business rule: only
    // customers with a paid invoice are stored/listed). A guest is identified
    // by source_id = the walk-in source + null phone. We clear the walk-in
    // source_id so the row no longer matches the guest filter. Best-effort.
    try {
      const WALKIN_SOURCE_ID = "779ddad6-01fa-4887-8647-134ce699d643";
      const { data: cust } = await supabaseAdmin
        .from("customers")
        .select("source_id, phone")
        .eq("id", customer_id)
        .maybeSingle();
      if (cust?.source_id === WALKIN_SOURCE_ID && !cust?.phone) {
        await supabaseAdmin
          .from("customers")
          .update({ source_id: null, updated_at: new Date().toISOString() })
          .eq("id", customer_id);
      }
    } catch {
      // Best-effort.
    }

    // Attach decoded items + tip + promotion + photos to the response.
    const responseData = { ...data, items: itemRows, note: note || null, tip: tipAmount, promotion: promotionMeta, photos: photosList };

    return NextResponse.json({ ok: true, data: responseData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
