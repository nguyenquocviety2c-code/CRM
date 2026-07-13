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
 *   { ok: true, data: { exists: boolean, existingDate?: "dd/mm/yyyy", existingBookingId?: string } }
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

    // 1. Find the customer by exact phone match.
    const { data: customers, error: custErr } = await supabaseAdmin
      .from("customers")
      .select("id")
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

    // 2. Fetch this customer's non-cancelled bookings, then check each one's
    //    services for the new-customer-cut category. We fetch booking_services
    //    via the bookings list + a separate booking_services query because the
    //    REST join may not be available for all FK configs.
    const { data: bookings, error: bkErr } = await supabaseAdmin
      .from("bookings")
      .select("id, date_time, status")
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
    const bookingIds = validBookings.map((b: { id: string }) => b.id);
    // Fetch booking_services rows matching the new-customer-cut category.
    let query = supabaseAdmin
      .from("booking_services")
      .select("booking_id")
      .in("booking_id", bookingIds)
      .eq("service_category_id", NEW_CUSTOMER_CUT_CATEGORY_ID);
    if (excludeBookingId) {
      query = query.neq("booking_id", excludeBookingId);
    }
    const { data: cutServices, error: svcErr } = await query;
    if (svcErr) {
      return NextResponse.json({ ok: false, error: svcErr.message }, { status: 500 });
    }
    if (!cutServices || cutServices.length === 0) {
      return NextResponse.json({ ok: true, data: { exists: false } });
    }
    // Found an existing new-customer-cut booking. Return its date (dd/mm/yyyy)
    // for the warning message.
    const existingBookingId = cutServices[0].booking_id as string;
    const existing = validBookings.find(
      (b: { id: string }) => b.id === existingBookingId
    );
    let existingDate = "";
    if (existing?.date_time) {
      const m = String(existing.date_time).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) existingDate = `${m[3]}/${m[2]}/${m[1]}`;
    }
    return NextResponse.json({
      ok: true,
      data: { exists: true, existingDate, existingBookingId },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
