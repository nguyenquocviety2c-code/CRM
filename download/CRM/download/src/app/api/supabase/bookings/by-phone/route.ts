import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/bookings/by-phone?phone=...&excludeBookingId=...
 *
 * Returns the customer's NON-cancelled bookings (with date/time, services,
 * staff, branch, status) so the booking UI can show them a "you already have
 * an appointment on ..." confirmation prompt before creating a new one.
 *
 * Returns:
 *   { ok: true, data: [{ date_time, status, services: [{name, staffName}], branchName }] }
 */
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
      return NextResponse.json({ ok: true, data: [] });
    }
    const customerId = customers[0].id as string;

    // 2. Fetch the customer's non-cancelled bookings. Use the same select as
    //    the main bookings route so we get services + branch + category.
    const BOOKING_SELECT =
      "*, branch:branches!branch_id(id, name), services:booking_services!booking_id(id, booking_id, service_id, staff_id, service_category_id, sort_order, service:services!service_id(id, name, code, price, duration), category:service_categories!service_category_id(id, name))";
    const { data: bookings, error: bkErr } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("customer_id", customerId)
      .order("date_time", { ascending: true });
    if (bkErr) {
      return NextResponse.json({ ok: false, error: bkErr.message }, { status: 500 });
    }

    // 3. Enrich: fetch staff names for the services (booking_services doesn't
    //    join staff here to keep the select simple). Build a flat staff map.
    const staffIds = new Set<string>();
    for (const b of bookings || []) {
      for (const s of (b.services as Array<{ staff_id?: string | null }>) || []) {
        if (s.staff_id) staffIds.add(s.staff_id);
      }
    }
    const staffMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from("staff")
        .select("id, name")
        .in("id", Array.from(staffIds));
      for (const st of staffRows || []) {
        staffMap.set(st.id as string, st.name as string);
      }
    }

    // 4. Build the response list — only UNPAID bookings (not checkout, not
    //    cancelled, not no_show). The confirmation dialog is meant to warn
    //    about existing appointments that haven't been paid yet. If all prior
    //    bookings are paid, the customer can book again without a prompt.
    const result = (bookings || [])
      .filter(
        (b: { id: string; status?: string }) =>
          b.status !== "checkout" &&
          b.status !== "cancelled" &&
          b.status !== "no_show" &&
          (excludeBookingId ? b.id !== excludeBookingId : true)
      )
      .map((b: {
        id: string;
        date_time: string;
        status: string;
        branch?: { name?: string } | null;
        services?: Array<{
          service?: { name?: string; duration?: number } | null;
          staff_id?: string | null;
          category?: { name?: string } | null;
        }>;
      }) => {
        // Format date/time from the ISO string. The stored date_time is
        // "YYYY-MM-DDTHH:MM:SS+00:00" — extract HH:MM + dd/mm/yyyy directly
        // to avoid timezone shifts (same convention as the booking dialog).
        const isoMatch = String(b.date_time || "").match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
        );
        const dateStr = isoMatch ? `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}` : "";
        const timeStr = isoMatch ? `${isoMatch[4]}:${isoMatch[5]}` : "";
        const services = (b.services || []).map((s) => ({
          name: s.service?.name || s.category?.name || "Dịch vụ",
          staffName: s.staff_id ? staffMap.get(s.staff_id) || "" : "",
        }));
        return {
          id: b.id,
          date: dateStr,
          time: timeStr,
          status: b.status,
          branchName: b.branch?.name || "",
          services,
        };
      });

    return NextResponse.json({ ok: true, data: result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
