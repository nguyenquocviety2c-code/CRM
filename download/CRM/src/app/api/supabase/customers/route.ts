import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { decodeCustomerNote } from "@/lib/customer-meta";

const CUSTOMER_SELECT =
  "*, source:customer_sources(id, name), group:customer_groups(id, name), branch:branches(id, name)";

/**
 * Generate a customer code: "KH" + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generateCustomerCode(): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "KH", table_name: "customers" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback: count existing rows with code starting with "KH"
  const { data: existing, error: countError } = await supabaseAdmin
    .from("customers")
    .select("code")
    .like("code", "KH%")
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    const ts = Date.now().toString().slice(-6);
    return `KH${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^KH/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `KH${String(next).padStart(6, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const sourceId = searchParams.get("source_id");
    const groupId = searchParams.get("group_id");
    const search = searchParams.get("search");
    const active = searchParams.get("active");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("customers")
      .select(CUSTOMER_SELECT, { count: "exact" });

    // Hide walk-in guest customers from the Customers module. A guest is
    // identified by source_id = the "Khách vãng lai" source AND a null/empty
    // phone. Guests are only promoted to visible (gain a phone or a different
    // source) when an invoice is paid. include_guests=true brings them back.
    const includeGuests = searchParams.get("include_guests") === "true";
    const WALKIN_SOURCE_ID = "779ddad6-01fa-4887-8647-134ce699d643";
    if (!includeGuests) {
      // Keep rows where source_id != walk-in OR phone is not null.
      query = query.or(`source_id.neq.${WALKIN_SOURCE_ID},phone.not.is.null`);
    }

    if (branchId) query = query.eq("branch_id", branchId);
    if (sourceId) query = query.eq("source_id", sourceId);
    if (groupId) query = query.eq("group_id", groupId);
    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,code.ilike.%${search}%`
      );
    }

    // IMPORTANT: when the customer_type filter is requested, we must fetch
    // ALL matching customers (no DB-level pagination) because customer_type
    // is computed in JS (it depends on whether the customer has a completed
    // invoice). If we paginate at the DB level first, customers who are
    // "old" but appear on a later page get excluded — the filter would
    // silently drop them. So when customer_type is set, we fetch everything
    // and paginate in JS after enrichment. When customer_type is NOT set,
    // we paginate at the DB level as usual (more efficient).
    const customerTypeFilter = searchParams.get("customer_type");
    const needsFullFetch = !!customerTypeFilter;

    query = query.order("created_at", { ascending: false });
    if (!needsFullFetch) {
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Enrich each customer with customer_type ("old" = has >=1 completed invoice,
    // "new" = no completed invoice). Phone is the unique identifier per business rule.
    const customers = (data ?? []) as Array<Record<string, unknown>>;
    const customerIds = customers
      .map((c) => c.id)
      .filter(Boolean) as string[];

    const customerTypeMap = new Map<string, "old" | "new">();
    // Bookings query for source/channel enrichment — runs IN PARALLEL with the
    // customer_type invoices query (they're independent). Result is consumed
    // later after the enrichment section.
    const oldCustomerIds = customers.map((c) => c.id as string);

    const [invResult, bookingsResult] = await Promise.all([
      // customer_type invoices query — a customer is "khách cũ" ONLY if they
      // have ≥1 completed invoice with ≥1 SERVICE item (type === "service").
      // Invoices with only products do NOT qualify — per the business rule:
      // "khách cũ = đã làm dịch vụ và thanh toán".
      //
      // Optimization: instead of fetching the full `note` column (which
      // contains items JSON + base64 photos, up to MBs per row) and parsing
      // it in JS, we use a Supabase ilike filter on the note column. The
      // invoice's items are serialized as JSON.stringify({ items: [...], ... })
      // which produces compact JSON with no spaces — so a service item always
      // appears as the exact substring `"type":"service"`. Filtering at the DB
      // level means only matching rows are transferred (tiny payload: just
      // customer_id), and no JS parsing is needed. This cuts the query from
      // ~1s (fetching + parsing hundreds of KB of note JSON) to ~50ms.
      customerIds.length > 0
        ? supabaseAdmin
            .from("invoices")
            .select("customer_id")
            .eq("status", "completed")
            .in("customer_id", customerIds)
            .ilike("note", '%"type":"service"%')
        : Promise.resolve({ data: null, error: null }),
      // Bookings query for source/channel enrichment (independent of the
      // invoices query above, so it runs in the same Promise.all batch).
      oldCustomerIds.length > 0
        ? supabaseAdmin
            .from("bookings")
            .select("id, customer_id, customer_source_id, customer_channel_id, date_time")
            .in("customer_id", oldCustomerIds)
            .order("date_time", { ascending: false })
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (invResult.data) {
      // Any customer who has ≥1 completed invoice with a service item is "old".
      // The ilike filter already ensured only matching invoices were returned,
      // so we just collect the distinct customer_ids.
      const oldIds = new Set<string>();
      for (const r of invResult.data as Array<Record<string, unknown>>) {
        const cid = r.customer_id as string | undefined;
        if (cid) oldIds.add(cid);
      }
      for (const id of customerIds) {
        customerTypeMap.set(id, oldIds.has(id) ? "old" : "new");
      }
    }

    const enriched = customers.map((c) => {
      // Decode the `note` field: customers with photos now store their note as
      // an encoded JSON blob ({"__kind":"customer_meta","note":null,"photos":[...]}).
      // Decode it so the list response exposes the plain human `note` text +
      // `photos` array as separate fields (matching the /customers/[id] route).
      const decoded = decodeCustomerNote(c.note);
      return {
        ...c,
        note: decoded.note,
        photos: decoded.photos,
        has_completed_invoice: customerTypeMap.get(c.id as string) === "old",
        customer_type: customerTypeMap.get(c.id as string) ?? "new",
      };
    });

    // Enrich source + channel from the customer's most recent booking (the
    // customer table may not have source_id set, but bookings do). The bookings
    // were already fetched in parallel above (bookingsResult); we just need to
    // build the per-customer source/channel map + fetch the names.
    if (oldCustomerIds.length > 0 && bookingsResult.data) {
      const custBookings = bookingsResult.data as Array<Record<string, unknown>>;
      // Build a map: customer_id -> { source_id, channel_id } from the most
      // recent booking that has them. Bookings are already ordered by date_time
      // descending (the query above set .order("date_time", { ascending: false })).
      const custBookingSourceMap = new Map<string, { source_id?: string | null; channel_id?: string | null }>();
      for (const b of custBookings) {
        const cid = b.customer_id as string;
        if (!cid || custBookingSourceMap.has(cid)) continue; // already have the most recent
        custBookingSourceMap.set(cid, {
          source_id: (b.customer_source_id as string | null) ?? null,
          channel_id: (b.customer_channel_id as string | null) ?? null,
        });
      }

      // Fetch source + channel names IN PARALLEL (independent queries).
      const bSourceIds = [...new Set(
        [...custBookingSourceMap.values()]
          .map((v) => v.source_id)
          .filter((id): id is string => !!id)
      )];
      const bChannelIds = [...new Set(
        [...custBookingSourceMap.values()]
          .map((v) => v.channel_id)
          .filter((id): id is string => !!id)
      )];
      const [sourcesResult, channelsResult] = await Promise.all([
        bSourceIds.length > 0
          ? supabaseAdmin.from("customer_sources").select("id, name").in("id", bSourceIds)
          : Promise.resolve({ data: null, error: null }),
        bChannelIds.length > 0
          ? supabaseAdmin.from("booking_channels").select("id, name").in("id", bChannelIds)
          : Promise.resolve({ data: null, error: null }),
      ]);
      const sourceNameMap = new Map<string, { id: string; name: string }>();
      for (const s of (sourcesResult.data as Array<{ id: string; name: string }> | null) ?? []) {
        sourceNameMap.set(s.id, { id: s.id, name: s.name });
      }
      const channelNameMap = new Map<string, { id: string; name: string }>();
      for (const c of (channelsResult.data as Array<{ id: string; name: string }> | null) ?? []) {
        channelNameMap.set(c.id, { id: c.id, name: c.name });
      }

      // Attach source + channel to each customer (fallback: use booking data
      // if customer.source_id is null).
      for (const c of enriched) {
        const custId = c.id as string;
        const bookingData = custBookingSourceMap.get(custId);
        // Source: prefer customer's own source, fallback to booking's.
        if (!c.source && bookingData?.source_id) {
          const src = sourceNameMap.get(bookingData.source_id);
          if (src) c.source = src;
        }
        // Channel: always from booking (customer table has no channel).
        if (bookingData?.channel_id) {
          const ch = channelNameMap.get(bookingData.channel_id);
          if (ch) (c as Record<string, unknown>).channel = ch;
        } else {
          (c as Record<string, unknown>).channel = null;
        }
      }
    }

    // Optional derived filter: customer_type=old restricts the result to only
    // customers who have at least one completed invoice ("khách cũ"). Because
    // customer_type is computed in JS (not a DB column), this filter must run
    // AFTER the rows are fetched and enriched. When the filter is set we fetched
    // ALL matching customers (no DB pagination — see needsFullFetch above), so
    // we paginate in JS here after filtering.
    let finalData = enriched;
    let finalTotal = total;
    let finalTotalPages = totalPages;
    if (customerTypeFilter === "old") {
      const filtered = enriched.filter(
        (c) => (c.customer_type as string) === "old"
      );
      finalTotal = filtered.length;
      finalTotalPages = Math.max(1, Math.ceil(finalTotal / limit));
      // JS-level pagination: slice the filtered list to the requested page.
      finalData = filtered.slice(from, from + limit);
    }

    return NextResponse.json({
      ok: true,
      data: finalData,
      pagination: {
        page,
        limit,
        total: finalTotal,
        totalPages: finalTotalPages,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      phone,
      email,
      gender,
      birthday,
      address,
      note,
      total_spent,
      debt,
      active,
      source_id,
      group_id,
      branch_id,
      code,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Customer name is required" },
        { status: 400 }
      );
    }

    // Phone uniqueness: phone is the business key for distinguishing customers.
    // If a customer with the same phone already exists, reject creation and
    // return the existing customer so the caller can select it instead.
    const trimmedPhone = (phone || "").trim();
    if (trimmedPhone) {
      const { data: existing, error: dupErr } = await supabaseAdmin
        .from("customers")
        .select(CUSTOMER_SELECT)
        .eq("phone", trimmedPhone)
        .limit(1);
      if (dupErr) {
        return NextResponse.json(
          { ok: false, error: dupErr.message },
          { status: 500 }
        );
      }
      if (existing && existing.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Số điện thoại đã tồn tại",
            existing_customer: existing[0],
          },
          { status: 409 }
        );
      }
    }

    // Auto-generate code if not provided
    const finalCode =
      typeof code === "string" && code.trim()
        ? code.trim()
        : await generateCustomerCode();

    const insertData: Record<string, unknown> = {
      code: finalCode,
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      gender: gender || null,
      birthday: birthday || null,
      address: address || null,
      note: note || null,
      total_spent: total_spent !== undefined ? Number(total_spent) : 0,
      debt: debt !== undefined ? Number(debt) : 0,
      active: active !== undefined ? Boolean(active) : true,
      source_id: source_id || null,
      group_id: group_id || null,
      branch_id: branch_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from("customers")
      .insert(insertData)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
