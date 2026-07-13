import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

// Note: the `bookings` table does not have FK constraints registered
// for `customer_id` -> `customers.id` or `customer_source_id` -> `customer_sources.id`
// in this Supabase schema, and the `customer_channels` table does not exist.
// So we only join booking_services and branches here, and enrich the customer
// (and source) data manually after fetching.
const BOOKING_SELECT =
  "*, branch:branches!branch_id(id, name), services:booking_services!booking_id(id, booking_id, service_id, staff_id, service_category_id, sort_order, service:services!service_id(id, name, code, price, duration), category:service_categories!service_category_id(id, name))";

/**
 * Generate a booking code: "LH" + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generateBookingCode(): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "LH", table_name: "bookings" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback: count existing rows with code starting with "LH"
  const { data: existing, error: countError } = await supabaseAdmin
    .from("bookings")
    .select("code")
    .like("code", "LH%")
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    const ts = Date.now().toString().slice(-6);
    return `LH${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^LH/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `LH${String(next).padStart(6, "0")}`;
}

/**
 * Enrich a list of booking rows with customer, customer source, and staff data.
 * Done as manual batch lookups because the FKs are not registered in PostgREST.
 */
async function enrichBookings(
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const customerIds = new Set<string>();
  const sourceIds = new Set<string>();
  const channelIds = new Set<string>();
  const staffIds = new Set<string>();
  const bookingIds = new Set<string>();
  for (const r of rows) {
    if (r.customer_id) customerIds.add(String(r.customer_id));
    if (r.customer_source_id) sourceIds.add(String(r.customer_source_id));
    if (r.customer_channel_id) channelIds.add(String(r.customer_channel_id));
    if (r.id) bookingIds.add(String(r.id));
    // Collect the booking's creator staff id (created_by) so we can attach
    // their name for the "Tạo bởi" display. Null created_by = kiosk/customer.
    if (r.created_by) staffIds.add(String(r.created_by));
    // Collect staff_id from each booking_service entry.
    const services = Array.isArray(r.services) ? r.services : [];
    for (const s of services) {
      const sid = (s as Record<string, unknown>)?.staff_id;
      if (sid) staffIds.add(String(sid));
    }
  }

  const customerMap = new Map<string, Record<string, unknown>>();
  const sourceMap = new Map<string, Record<string, unknown>>();
  const channelMap = new Map<string, Record<string, unknown>>();
  const staffMap = new Map<string, Record<string, unknown>>();
  // Fetch linked invoices (id, code, status, final_amount, payment_method) by
  // booking_id so the booking list can show the paid amount inline.
  const invoiceByBooking = new Map<string, Record<string, unknown>>();

  // Run all enrichment queries IN PARALLEL. The old code awaited each query
  // sequentially (5 round-trips back-to-back), which made /api/supabase/bookings
  // noticeably slow. Promise.all fires them all at once — total latency ≈ the
  // slowest single query instead of the sum.
  const [
    customersResult,
    sourcesResult,
    channelsResult,
    staffResult,
    invoicesResult,
  ] = await Promise.all([
    customerIds.size > 0
      ? supabaseAdmin.from("customers").select("id, code, name, phone, email").in("id", Array.from(customerIds))
      : Promise.resolve({ data: null, error: null }),
    sourceIds.size > 0
      ? supabaseAdmin.from("customer_sources").select("id, name").in("id", Array.from(sourceIds))
      : Promise.resolve({ data: null, error: null }),
    channelIds.size > 0
      ? supabaseAdmin.from("booking_channels").select("id, name").in("id", Array.from(channelIds))
      : Promise.resolve({ data: null, error: null }),
    staffIds.size > 0
      ? supabaseAdmin.from("staff").select("id, name").in("id", Array.from(staffIds))
      : Promise.resolve({ data: null, error: null }),
    bookingIds.size > 0
      ? supabaseAdmin.from("invoices").select("id, code, status, final_amount, payment_method, booking_id").in("booking_id", Array.from(bookingIds))
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (customersResult.data) {
    for (const c of customersResult.data as Array<Record<string, unknown>>) {
      customerMap.set(String(c.id), c);
    }
  }
  if (sourcesResult.data) {
    for (const s of sourcesResult.data as Array<Record<string, unknown>>) {
      sourceMap.set(String(s.id), s);
    }
  }
  if (channelsResult.data) {
    for (const c of channelsResult.data as Array<Record<string, unknown>>) {
      channelMap.set(String(c.id), c);
    }
  }
  if (staffResult.data) {
    for (const s of staffResult.data as Array<Record<string, unknown>>) {
      staffMap.set(String(s.id), s);
    }
  }
  if (invoicesResult.data) {
    for (const inv of invoicesResult.data as Array<Record<string, unknown>>) {
      const bid = inv.booking_id;
      if (bid) invoiceByBooking.set(String(bid), inv);
    }
  }

  for (const r of rows) {
    const cid = r.customer_id ? String(r.customer_id) : null;
    r.customer = cid ? customerMap.get(cid) ?? null : null;
    const sid = r.customer_source_id ? String(r.customer_source_id) : null;
    r.source = sid ? sourceMap.get(sid) ?? null : null;
    const chid = r.customer_channel_id ? String(r.customer_channel_id) : null;
    r.channel = chid ? channelMap.get(chid) ?? null : null;
    // Attach the linked invoice (paid amount) for the Thanh toán column.
    const bid = r.id ? String(r.id) : null;
    r.invoice = bid ? invoiceByBooking.get(bid) ?? null : null;
    // Attach the creator staff ({ id, name }) for the "Tạo bởi" display.
    // created_by null = booking placed by a customer via the /dat-lich kiosk →
    // createdBy stays null and the frontend shows "Khách hàng".
    const cby = r.created_by ? String(r.created_by) : null;
    r.createdBy = cby ? staffMap.get(cby) ?? null : null;
    // Attach staff name to each booking_service entry.
    const services = Array.isArray(r.services) ? r.services : [];
    for (const s of services) {
      const svc = s as Record<string, unknown>;
      const stid = svc.staff_id ? String(svc.staff_id) : null;
      svc.staff = stid ? staffMap.get(stid) ?? null : null;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const customerId = searchParams.get("customer_id");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT, { count: "exact" });

    if (branchId) query = query.eq("branch_id", branchId);
    if (customerId) query = query.eq("customer_id", customerId);
    if (status) query = query.eq("status", status);
    if (dateFrom) query = query.gte("date_time", dateFrom);
    if (dateTo) query = query.lte("date_time", dateTo);
    if (search) {
      // The placeholder says "Tìm theo tên hoặc sđt" (search by name or phone),
      // but the bookings table doesn't join customers (no FK constraint), so we
      // first fetch customer IDs whose name or phone matches the search term,
      // then filter bookings by those IDs (in addition to code/note matches).
      // This makes the search box actually work as advertised.
      let matchingCustomerIds: string[] = [];
      try {
        const { data: matchingCustomers, error: custErr } = await supabaseAdmin
          .from("customers")
          .select("id")
          .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
          .limit(500);
        if (!custErr && matchingCustomers) {
          matchingCustomerIds = matchingCustomers.map(
            (c: Record<string, unknown>) => String(c.id)
          );
        }
      } catch {
        // best-effort — fall through to code/note-only search
      }

      if (matchingCustomerIds.length > 0) {
        // Match booking code OR note OR any of the matching customer IDs.
        // The customer_id IN (...) is expressed as repeated `customer_id.eq.X` ORs
        // because Supabase's `.or()` filter string doesn't support `in()` directly
        // mixed with column filters — but `.in()` works as a separate filter.
        // We use `.or()` for code/note + a chained `.in()` for customer_id, joined
        // by ORing the two via a nested `.or()` filter.
        const customerFilter = matchingCustomerIds
          .map((id) => `customer_id.eq.${id}`)
          .join(",");
        query = query.or(
          `code.ilike.%${search}%,note.ilike.%${search}%,${customerFilter}`
        );
      } else {
        // No customer matches — only search code + note.
        query = query.or(`code.ilike.%${search}%,note.ilike.%${search}%`);
      }
    }

    query = query.order("date_time", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    await enrichBookings(rows);

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      ok: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
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
      date_time,
      duration,
      status,
      note,
      number_of_customers,
      customer_source_id,
      customer_channel_id,
      customer_id,
      branch_id,
      created_by,
      code,
      services,
    } = body;

    if (!date_time) {
      return NextResponse.json(
        { ok: false, error: "Booking date_time is required" },
        { status: 400 }
      );
    }

    if (!customer_id) {
      return NextResponse.json(
        { ok: false, error: "customer_id is required" },
        { status: 400 }
      );
    }

    // A booking MUST have at least 1 service — "không có dịch vụ được hẹn thì
    // lấy đâu ra lịch hẹn" (no services = no booking). This prevents orphan
    // bookings from cluttering Lịch hẹn with empty slots that can't be clicked
    // or edited.
    if (!Array.isArray(services) || services.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng chọn ít nhất 1 dịch vụ" },
        { status: 400 }
      );
    }

    // Business-hours validation: the salon accepts bookings from 08:30 to
    // 19:30 (Vietnam time). Reject any booking whose start time falls outside
    // this window — the TimePicker dropdown only shows 08-19, but the user can
    // TYPE any time directly into the input. If the TimePicker's blur handler
    // doesn't fire (e.g., the user clicks OK without blurring), the raw typed
    // value (e.g. "23:30") would be sent as-is. This server-side check is the
    // last line of defense against out-of-hours bookings.
    try {
      const dt = new Date(date_time);
      if (!isNaN(dt.getTime())) {
        // Convert to Vietnam time (UTC+7) to check the wall-clock hour.
        const vnMs = dt.getTime() + 7 * 60 * 60 * 1000;
        const vnDate = new Date(vnMs);
        const vnHour = vnDate.getUTCHours();
        const vnMinute = vnDate.getUTCMinutes();
        const vnTotalMin = vnHour * 60 + vnMinute;
        const OPEN_MIN = 8 * 60 + 30;   // 08:30
        const CLOSE_MIN = 19 * 60 + 30; // 19:30
        if (vnTotalMin < OPEN_MIN || vnTotalMin > CLOSE_MIN) {
          return NextResponse.json(
            { ok: false, error: `Giờ hẹn phải trong khung 08:30 - 19:30 (đã chọn ${String(vnHour).padStart(2,"0")}:${String(vnMinute).padStart(2,"0")})` },
            { status: 400 }
          );
        }
      }
    } catch {
      // If date parsing fails, let the existing flow handle it.
    }

    // === Server-side staff conflict validation ===
    // A staff member cannot have overlapping bookings. Services in the new
    // booking run CONSECUTIVELY: the booking's date_time is the start of the
    // FIRST service; each subsequent service starts right after the previous
    // one ends. We compute each service's [start, end] slot this way, then
    // check both within-form overlap (same staff in this booking) and overlap
    // with existing (non-cancelled) bookings for the same staff on the same
    // day. This is a safety net on top of the client-side validation.
    if (Array.isArray(services) && services.length > 0) {
      const bookingStart = new Date(date_time).getTime();
      if (!isNaN(bookingStart)) {
        // Fetch service durations for the new booking's services.
        const newServiceIds = services
          .map((s: { service_id?: string }) => s.service_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const newDurations = new Map<string, number>();
        if (newServiceIds.length > 0) {
          const { data: svcRows } = await supabaseAdmin
            .from("services")
            .select("id, duration")
            .in("id", newServiceIds);
          for (const r of svcRows || []) {
            newDurations.set(r.id, Number(r.duration) || 60);
          }
        }

        // Build new slots running in PARALLEL: every service starts at the
        // booking-level start time (each service runs on a DIFFERENT staff,
        // simultaneously). Previously services ran consecutively (the 2nd
        // started after the 1st ended) — that didn't match the salon's
        // parallel-staff workflow.
        const newSlots = services
          .map((s: { service_id?: string; staff_id?: string | null }) => {
            if (!s.staff_id || !s.service_id) return null;
            const dur = (newDurations.get(s.service_id) || 60) * 60 * 1000;
            const start = bookingStart;
            const end = start + dur;
            return { staffId: s.staff_id, start, end };
          })
          .filter((x): x is { staffId: string; start: number; end: number } => x !== null);

        // 2a. Within-form conflict: in the parallel model, two services with
        // the SAME staff both start at bookingStart → overlap → reject. This
        // enforces "within one booking, each service must use a DIFFERENT staff".
        for (let i = 0; i < newSlots.length; i++) {
          for (let j = i + 1; j < newSlots.length; j++) {
            const a = newSlots[i];
            const b = newSlots[j];
            if (a.staffId === b.staffId && a.start < b.end && b.start < a.end) {
              return NextResponse.json(
                { ok: false, error: "Không thể đặt lịch vì trùng nhân viên trong cùng phiếu: mỗi dịch vụ trong một lịch hẹn phải dùng thợ khác nhau." },
                { status: 400 }
              );
            }
          }
        }

        // 2b. Conflict with existing bookings for the same Vietnam day + branch.
        // bookingStart is a UTC ms epoch; convert to the Vietnam calendar day
        // (UTC+7) so the conflict window matches the day the staff/user sees.
        const dayStart = new Date(bookingStart);
        const vnDay = new Date(bookingStart + 7 * 60 * 60 * 1000);
        const isoDay = `${vnDay.getUTCFullYear()}-${String(vnDay.getUTCMonth() + 1).padStart(2, "0")}-${String(vnDay.getUTCDate()).padStart(2, "0")}`;
        let existingQuery = supabaseAdmin
          .from("bookings")
          .select(BOOKING_SELECT)
          .gte("date_time", localDayStartUtc(isoDay))
          .lte("date_time", localDayEndUtc(isoDay))
          .order("date_time", { ascending: false });
        if (branch_id) existingQuery = existingQuery.eq("branch_id", branch_id);
        const { data: existingBookings } = await existingQuery;

        // Pre-fetch staff names for all staff referenced by the existing
        // bookings so the conflict error message can name the conflicting
        // technician (not just "nhân viên"). One batched query — no N+1.
        const conflictStaffIds = new Set<string>();
        const conflictCustomerIds = new Set<string>();
        for (const ex of existingBookings || []) {
          for (const s of (ex.services || []) as Array<{ staff_id?: string | null }>) {
            if (s.staff_id) conflictStaffIds.add(String(s.staff_id));
          }
          if (ex.customer_id) conflictCustomerIds.add(String(ex.customer_id));
        }
        const conflictStaffMap = new Map<string, string>();
        if (conflictStaffIds.size > 0) {
          const { data: conflictStaffRows } = await supabaseAdmin
            .from("staff")
            .select("id, name")
            .in("id", Array.from(conflictStaffIds));
          for (const st of conflictStaffRows || []) {
            conflictStaffMap.set(String(st.id), String(st.name));
          }
        }
        const conflictCustomerMap = new Map<string, string>();
        if (conflictCustomerIds.size > 0) {
          const { data: conflictCustomerRows } = await supabaseAdmin
            .from("customers")
            .select("id, name")
            .in("id", Array.from(conflictCustomerIds));
          for (const c of conflictCustomerRows || []) {
            conflictCustomerMap.set(String(c.id), String(c.name));
          }
        }

        // Helper: convert a UTC ms epoch to a Vietnam "HH:MM" wall-clock string.
        const toVnTime = (ms: number): string => {
          const d = new Date(ms + 7 * 60 * 60 * 1000);
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        };

        for (const ex of existingBookings || []) {
          if (ex.status === "cancelled" || ex.status === "no_show") continue;
          const exStart = new Date(ex.date_time).getTime();
          if (isNaN(exStart)) continue;
          for (const exSvc of (ex.services || []) as Array<{ staff_id?: string | null; service?: { duration?: number; name?: string } | null }>) {
            if (!exSvc.staff_id) continue;
            const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
            const exEnd = exStart + exDur;
            for (const ns of newSlots) {
              if (ns.staffId === exSvc.staff_id && ns.start < exEnd && exStart < ns.end) {
                // exStart is a UTC ms epoch. Convert to Vietnam wall-clock time
                // (UTC+7) for the error message — using timeZone: UTC would show
                // the UTC hour ("03:00"), confusing the user who entered 10:00.
                const exTime = toVnTime(exStart);
                const exEndTime = toVnTime(exEnd);
                const nsTime = toVnTime(ns.start);
                const nsEndTime = toVnTime(ns.end);
                const exDateStr = isoDay.split("-").reverse().join("/");
                const staffName = conflictStaffMap.get(String(exSvc.staff_id)) || "nhân viên";
                const svcName = exSvc.service?.name || "dịch vụ";
                const exCode = ex.code ? String(ex.code) : "";
                const exCustomerName = ex.customer_id
                  ? (conflictCustomerMap.get(String(ex.customer_id)) || "")
                  : "";
                const exBranchName = (ex.branch as { name?: string } | null)?.name || "";
                const exDurationMin = Math.round(exDur / 60000);
                // Translate the raw booking status into a human-readable VN label
                // so the staff understands whether the existing booking is pending,
                // confirmed, or already paid/checkout.
                const statusLabel: Record<string, string> = {
                  pending: "Chờ xác nhận",
                  confirmed: "Đã xác nhận",
                  checkin: "Đang phục vụ",
                  checkout: "Đã thanh toán",
                  cancelled: "Đã huỷ",
                  no_show: "Không đến",
                };
                const exStatusLabel = ex.status
                  ? statusLabel[String(ex.status)] || String(ex.status)
                  : "";
                // Detailed conflict message: identify the blocking booking
                // precisely — booking code, customer, service, staff, the
                // FULL time range (start → end) of the existing booking, the
                // branch, the status, AND the new service's time range that
                // overlaps it. Without the end time + duration the staff can't
                // tell how long the existing appointment runs, which is exactly
                // the scenario the user described (9:30 90-min service would
                // overlap a 10:30-12:00 booking).
                const codeLine = exCode ? `Lịch ${exCode}` : "Một lịch đã đặt trước đó";
                const custLine = exCustomerName ? `• Khách: ${exCustomerName}\n` : "";
                const branchLine = exBranchName ? `• Chi nhánh: ${exBranchName}\n` : "";
                const statusLine = exStatusLabel ? `• Trạng thái: ${exStatusLabel}\n` : "";
                return NextResponse.json(
                  {
                    ok: false,
                    error:
                      `Không thể đặt lịch vì trùng thời gian với một lịch đã đặt trước đó.\n` +
                      `${codeLine}:\n` +
                      custLine +
                      `• Thợ: ${staffName}\n` +
                      `• Dịch vụ: ${svcName} (${exDurationMin} phút)\n` +
                      `• Thời gian: ${exTime} - ${exEndTime} ngày ${exDateStr}\n` +
                      branchLine +
                      statusLine +
                      `→ Trùng với dịch vụ mới bạn đang đặt (${nsTime} - ${nsEndTime} ngày ${exDateStr}). ` +
                      `Vui lòng chọn khung giờ hoặc thợ khác.`,
                  },
                  { status: 400 }
                );
              }
            }
          }
        }
      }
    }

    // Auto-generate code if not provided
    const finalCode =
      typeof code === "string" && code.trim()
        ? code.trim()
        : await generateBookingCode();

    // Only set fields that are provided so DB defaults (e.g. duration=60,
    // status="pending", number_of_customers=1) can take effect when the
    // caller omits them. These columns have NOT NULL constraints.
    const insertData: Record<string, unknown> = {
      code: finalCode,
      date_time,
      customer_id,
    };
    if (duration !== undefined && duration !== null)
      insertData.duration = Number(duration);
    if (status) insertData.status = status;
    if (note !== undefined) insertData.note = note || null;
    if (number_of_customers !== undefined && number_of_customers !== null)
      insertData.number_of_customers = Number(number_of_customers);
    if (customer_source_id !== undefined)
      insertData.customer_source_id = customer_source_id || null;
    if (customer_channel_id !== undefined)
      insertData.customer_channel_id = customer_channel_id || null;
    if (branch_id !== undefined) insertData.branch_id = branch_id || null;
    // Record who created this booking: prefer an explicit created_by, fall
    // back to the currently-logged-in staff (from the auth cookie). When a
    // CUSTOMER places the booking via the public "Đặt lịch" kiosk, no staff
    // is logged in → created_by stays null. This null is the marker the
    // invoice route uses to attribute the "Khởi tạo" activity to the customer.
    insertData.created_by =
      (typeof created_by === "string" && created_by.trim()) ||
      getCurrentStaffId(request) ||
      null;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const bookingId = booking.id;

    // Insert booking_services
    if (Array.isArray(services) && services.length > 0) {
      const serviceRows = services
        .map(
          (
            s: {
              service_id?: string;
              staff_id?: string;
              service_category_id?: string;
              sort_order?: number;
            },
            idx: number
          ) => ({
            booking_id: bookingId,
            service_id: s.service_id || null,
            staff_id: s.staff_id ?? null,
            service_category_id: s.service_category_id || null,
            sort_order: s.sort_order !== undefined ? Number(s.sort_order) : idx,
          })
        )
        .filter(
          (s: { service_id?: string }) => s.service_id
        );
      if (serviceRows.length > 0) {
        const { error: svcErr } = await supabaseAdmin
          .from("booking_services")
          .insert(serviceRows);
        if (svcErr) {
          // Best effort: cleanup created booking
          await supabaseAdmin.from("bookings").delete().eq("id", bookingId);
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to create booking services: ${svcErr.message}`,
            },
            { status: 500 }
          );
        }
      }
    }

    // Fetch full booking with joins
    const { data: fullBooking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", bookingId)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    // Enrich with customer + source data
    await enrichBookings([fullBooking as Record<string, unknown>]);

    return NextResponse.json({ ok: true, data: fullBooking }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
