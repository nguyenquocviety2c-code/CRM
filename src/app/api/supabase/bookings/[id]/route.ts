import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

// Note: the `bookings` table does not have FK constraints registered
// for `customer_id` -> `customers.id` or `customer_source_id` -> `customer_sources.id`
// in this Supabase schema, and the `customer_channels` table does not exist.
// So we only join booking_services and branches here, and enrich the customer
// (and source) data manually after fetching.
const BOOKING_SELECT =
  "*, branch:branches!branch_id(id, name), services:booking_services!booking_id(id, booking_id, service_id, staff_id, service_category_id, sort_order, service:services!service_id(id, name, code, price, duration), category:service_categories!service_category_id(id, name))";

/**
 * Enrich a list of booking rows with customer (and customer source) data.
 * Done as a manual batch lookup because the FK is not registered in PostgREST.
 */
async function enrichBookings(
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const customerIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const r of rows) {
    if (r.customer_id) customerIds.add(String(r.customer_id));
    if (r.customer_source_id) sourceIds.add(String(r.customer_source_id));
  }

  const customerMap = new Map<string, Record<string, unknown>>();
  if (customerIds.size > 0) {
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, code, name, phone, email")
      .in("id", Array.from(customerIds));
    if (customers) {
      for (const c of customers) {
        customerMap.set(String(c.id), c as Record<string, unknown>);
      }
    }
  }

  const sourceMap = new Map<string, Record<string, unknown>>();
  if (sourceIds.size > 0) {
    const { data: sources } = await supabaseAdmin
      .from("customer_sources")
      .select("id, name")
      .in("id", Array.from(sourceIds));
    if (sources) {
      for (const s of sources) {
        sourceMap.set(String(s.id), s as Record<string, unknown>);
      }
    }
  }

  for (const r of rows) {
    const cid = r.customer_id ? String(r.customer_id) : null;
    r.customer = cid ? customerMap.get(cid) ?? null : null;
    const sid = r.customer_source_id ? String(r.customer_source_id) : null;
    r.source = sid ? sourceMap.get(sid) ?? null : null;
  }
}

/**
 * Re-sync booking_services for a booking: delete existing rows and re-insert.
 */
async function syncBookingServices(
  bookingId: string,
  services: unknown
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabaseAdmin
    .from("booking_services")
    .delete()
    .eq("booking_id", bookingId);
  if (delErr) {
    return { error: `Failed to clear booking services: ${delErr.message}` };
  }

  if (!Array.isArray(services) || services.length === 0) {
    return { error: null };
  }

  const rows = (
    services as Array<{
      service_id?: string;
      staff_id?: string;
      service_category_id?: string;
      sort_order?: number;
      id?: string;
    }>
  )
    .map((s, idx) => ({
      booking_id: bookingId,
      service_id: s.service_id || null,
      staff_id: s.staff_id ?? null,
      service_category_id: s.service_category_id || null,
      sort_order: s.sort_order !== undefined ? Number(s.sort_order) : idx,
    }))
    .filter((s) => s.service_id);

  if (rows.length === 0) {
    return { error: null };
  }

  const { error: insErr } = await supabaseAdmin
    .from("booking_services")
    .insert(rows);
  if (insErr) {
    return { error: `Failed to update booking services: ${insErr.message}` };
  }
  return { error: null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    await enrichBookings([data as Record<string, unknown>]);
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const { services, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    if (rest.code !== undefined) updateData.code = rest.code || null;
    if (rest.date_time !== undefined)
      updateData.date_time = rest.date_time || null;
    if (rest.duration !== undefined)
      updateData.duration =
        rest.duration === null ? null : Number(rest.duration);
    if (rest.status !== undefined) updateData.status = rest.status || null;
    if (rest.note !== undefined) updateData.note = rest.note || null;
    if (rest.number_of_customers !== undefined)
      updateData.number_of_customers =
        rest.number_of_customers === null
          ? null
          : Number(rest.number_of_customers);
    if (rest.customer_source_id !== undefined)
      updateData.customer_source_id = rest.customer_source_id || null;
    if (rest.customer_channel_id !== undefined)
      updateData.customer_channel_id = rest.customer_channel_id || null;
    if (rest.customer_id !== undefined)
      updateData.customer_id = rest.customer_id || null;
    if (rest.branch_id !== undefined)
      updateData.branch_id = rest.branch_id || null;
    if (rest.created_by !== undefined)
      updateData.created_by = rest.created_by || null;

    // === Server-side staff conflict validation (edit mode) ===
    // PARALLEL model: every service in the booking starts at the SAME
    // booking-level start time (each runs on a different staff, simultaneously).
    // Skip the booking being edited itself when checking existing bookings.
    const effectiveDateTime =
      typeof updateData.date_time === "string" ? updateData.date_time : null;
    if (effectiveDateTime && Array.isArray(services) && services.length > 0) {
      const bookingStart = new Date(effectiveDateTime).getTime();
      if (!isNaN(bookingStart)) {
        // Fetch service durations for the new booking's services.
        const newServiceIds = services
          .map((s: { service_id?: string }) => s.service_id)
          .filter((sid): sid is string => typeof sid === "string" && sid.length > 0);
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

        // Build new slots running in PARALLEL (all start at bookingStart).
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

        // 2b. Conflict with existing bookings (skip the one being edited).
        // bookingStart is a UTC ms epoch; convert to the Vietnam calendar day
        // (UTC+7) so the conflict window matches the day the staff/user sees.
        const dayStart = new Date(bookingStart);
        const vnDay = new Date(bookingStart + 7 * 60 * 60 * 1000);
        const isoDay = `${vnDay.getUTCFullYear()}-${String(vnDay.getUTCMonth() + 1).padStart(2, "0")}-${String(vnDay.getUTCDate()).padStart(2, "0")}`;
        let existingQuery = supabaseAdmin
          .from("bookings")
          .select(BOOKING_SELECT)
          .gte("date_time", localDayStartUtc(isoDay))
          .lte("date_time", localDayEndUtc(isoDay));
        if (updateData.branch_id) existingQuery = existingQuery.eq("branch_id", updateData.branch_id);
        const { data: existingBookings } = await existingQuery;

        // Pre-fetch staff + customer names for the conflict message (batched).
        const editConflictStaffIds = new Set<string>();
        const editConflictCustomerIds = new Set<string>();
        for (const ex of existingBookings || []) {
          for (const s of (ex.services || []) as Array<{ staff_id?: string | null }>) {
            if (s.staff_id) editConflictStaffIds.add(String(s.staff_id));
          }
          if (ex.customer_id) editConflictCustomerIds.add(String(ex.customer_id));
        }
        const editStaffMap = new Map<string, string>();
        if (editConflictStaffIds.size > 0) {
          const { data: rows } = await supabaseAdmin
            .from("staff")
            .select("id, name")
            .in("id", Array.from(editConflictStaffIds));
          for (const r of rows || []) editStaffMap.set(String(r.id), String(r.name));
        }
        const editCustMap = new Map<string, string>();
        if (editConflictCustomerIds.size > 0) {
          const { data: rows } = await supabaseAdmin
            .from("customers")
            .select("id, name")
            .in("id", Array.from(editConflictCustomerIds));
          for (const r of rows || []) editCustMap.set(String(r.id), String(r.name));
        }
        const toVnTimeEdit = (ms: number): string => {
          const d = new Date(ms + 7 * 60 * 60 * 1000);
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        };
        const statusLabelEdit: Record<string, string> = {
          pending: "Chờ xác nhận",
          confirmed: "Đã xác nhận",
          checkin: "Đang phục vụ",
          checkout: "Đã thanh toán",
          cancelled: "Đã huỷ",
          no_show: "Không đến",
        };

        for (const ex of existingBookings || []) {
          if (ex.id === id) continue; // skip the booking being edited
          if (ex.status === "cancelled" || ex.status === "no_show") continue;
          const exStart = new Date(ex.date_time).getTime();
          if (isNaN(exStart)) continue;
          for (const exSvc of (ex.services || []) as Array<{ staff_id?: string | null; service?: { duration?: number; name?: string } | null }>) {
            if (!exSvc.staff_id) continue;
            const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
            const exEnd = exStart + exDur;
            for (const ns of newSlots) {
              if (ns.staffId === exSvc.staff_id && ns.start < exEnd && exStart < ns.end) {
                const exTime = toVnTimeEdit(exStart);
                const exEndTime = toVnTimeEdit(exEnd);
                const nsTime = toVnTimeEdit(ns.start);
                const nsEndTime = toVnTimeEdit(ns.end);
                const exDateStr = isoDay.split("-").reverse().join("/");
                const staffName = editStaffMap.get(String(exSvc.staff_id)) || "nhân viên";
                const svcName = exSvc.service?.name || "dịch vụ";
                const exCode = ex.code ? String(ex.code) : "";
                const exCustomerName = ex.customer_id
                  ? (editCustMap.get(String(ex.customer_id)) || "")
                  : "";
                const exBranchName = (ex.branch as { name?: string } | null)?.name || "";
                const exDurationMin = Math.round(exDur / 60000);
                const exStatusLabel = ex.status
                  ? statusLabelEdit[String(ex.status)] || String(ex.status)
                  : "";
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

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("bookings")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    // Sync services if provided
    if (services !== undefined) {
      const { error: svcErr } = await syncBookingServices(id, services);
      if (svcErr) {
        return NextResponse.json(
          { ok: false, error: svcErr },
          { status: 500 }
        );
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    await enrichBookings([refreshed as Record<string, unknown>]);
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const { services, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "date_time",
      "duration",
      "status",
      "note",
      "number_of_customers",
      "customer_source_id",
      "customer_channel_id",
      "customer_id",
      "branch_id",
      "created_by",
      "reminder_at",
    ];

    for (const field of allowedFields) {
      if (rest[field] === undefined) continue;
      if (["duration", "number_of_customers"].includes(field)) {
        updateData[field] = rest[field] === null ? null : Number(rest[field]);
      } else {
        updateData[field] = rest[field] === null ? null : rest[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("bookings")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    if (services !== undefined) {
      const { error: svcErr } = await syncBookingServices(id, services);
      if (svcErr) {
        return NextResponse.json(
          { ok: false, error: svcErr },
          { status: 500 }
        );
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    await enrichBookings([refreshed as Record<string, unknown>]);
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // booking_services has ON DELETE CASCADE, but we still clean explicitly
    // to be safe across deployments that may not have the FK configured.
    await supabaseAdmin.from("booking_services").delete().eq("booking_id", id);

    const { error } = await supabaseAdmin
      .from("bookings")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
