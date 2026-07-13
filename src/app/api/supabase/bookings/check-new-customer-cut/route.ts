import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/bookings/check-new-customer-cut?phone=...&excludeBookingId=...
 *
 * Checks whether the given phone number already has a NON-cancelled booking
 * containing a service in the "Dành cho khách hàng mới - DV Cắt" category.
 * That category is a one-time-only offer per phone: a customer who already
 * booked it cannot book it again on a different day (they must edit/cancel
 * the existing booking or contact CSKH).
 *
 * Returns:
 *   { ok: true, data: { exists: boolean, existingDate?: "dd/mm/yyyy",
 *     existingTime?: "HH:MM", existingServiceName?: string,
 *     existingStaffName?: string, existingBranchName?: string,
 *     existingCustomerName?: string, existingStatus?: string,
 *     existingBookingId?: string } }
 *
 * `excludeBookingId` (optional) skips a booking (used when editing so the
 * booking being edited doesn't count as a conflict with itself).
 */
const NEW_CUSTOMER_CUT_CATEGORY_ID = "4cb10a73-cc13-496a-baf2-e060ebfa02f8";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = (searchParams.get("phone") || "").trim();
    const excludeBookingId = searchParams.get("excludeBookingId") || "";
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Thiếu số điện thoại" },
        { status: 400 }
      );
    }

    // 1. Find the customer by exact phone match. Select name + phone too so
    //    the "cannot book" message can identify WHICH customer the blocking
    //    booking belongs to (the staff may be booking for a customer whose
    //    phone collides with another, or may not realize the matched customer
    //    already used the one-time offer).
    const { data: customers, error: custErr } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone")
      .eq("phone", phone)
      .limit(1);
    if (custErr) {
      return NextResponse.json({ ok: false, error: custErr.message }, { status: 500 });
    }
    if (!customers || customers.length === 0) {
      // No customer with this phone → no existing new-customer-cut booking.
      return NextResponse.json({ ok: true, data: { exists: false } });
    }
    const customerId = customers[0].id as string;
    const customerName = (customers[0].name as string) || "";

    // 2. Fetch this customer's non-cancelled bookings WITH branch + services
    //    joins so we can report the full details (service name, staff name,
    //    exact date/time, branch) in the "cannot book" message. Previously we
    //    only returned the date, which left the customer guessing about which
    //    existing booking was blocking them.
    const BOOKING_SELECT =
      "id, date_time, status, branch:branches!branch_id(id, name), services:booking_services!booking_id(id, service_id, staff_id, service_category_id, service:services!service_id(id, name), category:service_categories!service_category_id(id, name))";
    const { data: bookings, error: bkErr } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (bkErr) {
      return NextResponse.json({ ok: false, error: bkErr.message }, { status: 500 });
    }
    const validBookings = (bookings || []).filter(
      (b: { status?: string }) => b.status !== "cancelled" && b.status !== "no_show"
    );
    if (validBookings.length === 0) {
      return NextResponse.json({ ok: true, data: { exists: false } });
    }
    // Find the first booking that contains a service in the new-customer-cut
    // category. We inspect the joined booking_services rows directly (no need
    // for a separate query now that the select includes the join).
    let existingBooking: {
      id: string;
      date_time: string;
      status: string;
      branch?: { name?: string } | null;
      services?: Array<{
        service_category_id?: string | null;
        service?: { name?: string } | null;
        category?: { name?: string } | null;
        staff_id?: string | null;
      }> | null;
    } | null = null;
    let existingServiceRow: {
      service?: { name?: string } | null;
      category?: { name?: string } | null;
      staff_id?: string | null;
    } | null = null;
    for (const b of validBookings) {
      if (excludeBookingId && b.id === excludeBookingId) continue;
      const match = (b.services || []).find(
        (s) => s.service_category_id === NEW_CUSTOMER_CUT_CATEGORY_ID
      );
      if (match) {
        existingBooking = b;
        existingServiceRow = match;
        break;
      }
    }
    if (!existingBooking || !existingServiceRow) {
      return NextResponse.json({ ok: true, data: { exists: false } });
    }

    // 3. Fetch the staff name for the matching service (booking_services
    //    doesn't join staff in the select above, so we look it up directly).
    let existingStaffName = "";
    if (existingServiceRow.staff_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("staff")
        .select("name")
        .eq("id", existingServiceRow.staff_id)
        .limit(1)
        .maybeSingle();
      if (staffRow?.name) existingStaffName = staffRow.name as string;
    }

    // 4. Format date + time from the ISO string. Extract directly to avoid
    //    timezone shifts (same convention as the by-phone route).
    let existingDate = "";
    let existingTime = "";
    const isoMatch = String(existingBooking.date_time || "").match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
    );
    if (isoMatch) {
      existingDate = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      existingTime = `${isoMatch[4]}:${isoMatch[5]}`;
    }
    const existingServiceName =
      existingServiceRow.service?.name ||
      existingServiceRow.category?.name ||
      "Dịch vụ cắt";
    const existingBranchName = existingBooking.branch?.name || "";

    return NextResponse.json({
      ok: true,
      data: {
        exists: true,
        existingDate,
        existingTime,
        existingServiceName,
        existingStaffName,
        existingBranchName,
        existingCustomerName: customerName,
        existingStatus: existingBooking.status,
        existingBookingId: existingBooking.id,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
