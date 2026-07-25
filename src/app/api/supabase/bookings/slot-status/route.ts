import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parseMultiCustomerNote, buildMultiCustomerNote } from "@/lib/multi-customer";
import { getCurrentStaffId } from "@/lib/auth/current-staff";

/**
 * PATCH /api/supabase/bookings/slot-status
 * Body: { bookingId: string, slotIndex: number, status: string, actor_staff_id?: string }
 *
 * Updates the status of ONE customer slot in a multi-customer "Cùng lịch"
 * booking. The slot status is stored in the [[MULTI]] note's `slotStatuses`
 * array (not in a separate DB column — avoids DDL). The booking's main
 * `status` field is NOT changed (it stays as the default for un-changed slots).
 *
 * When ALL slots share the same status, the booking's main status is also
 * updated to that value (so legacy code that reads booking.status still works).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, slotIndex, status } = body;
    const actorStaffId = getCurrentStaffId(request) ||
      (typeof body.actor_staff_id === "string" && body.actor_staff_id.trim() ? body.actor_staff_id.trim() : null);

    if (!bookingId || typeof slotIndex !== "number" || !status) {
      return NextResponse.json(
        { ok: false, error: "bookingId, slotIndex (number), and status are required" },
        { status: 400 }
      );
    }

    // Fetch the booking's current note + status + invoice.
    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status, note, branch_id, invoice:invoices(id, code)")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json(
        { ok: false, error: fetchErr?.message || "Booking not found" },
        { status: 404 }
      );
    }

    const note = booking.note as string | null;
    const parsed = parseMultiCustomerNote(note);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "This booking is not a multi-customer booking" },
        { status: 400 }
      );
    }

    if (slotIndex < 0 || slotIndex >= parsed.slots.length) {
      return NextResponse.json(
        { ok: false, error: `slotIndex ${slotIndex} out of range (0..${parsed.slots.length - 1})` },
        { status: 400 }
      );
    }

    // Update the slotStatuses array.
    const slotStatuses = parsed.slotStatuses
      ? [...parsed.slotStatuses]
      : parsed.slots.map(() => booking.status as string);

    // Ensure the array is long enough.
    while (slotStatuses.length < parsed.slots.length) {
      slotStatuses.push(booking.status as string);
    }

    slotStatuses[slotIndex] = status;

    // Rebuild the note with the updated slotStatuses.
    const newNote = buildMultiCustomerNote(
      parsed.slots,
      parsed.userNote,
      parsed.serviceSlots,
      slotStatuses
    );

    // Check if ALL slots now share the same status → if so, also update
    // the booking's main `status` field (so legacy code reads correctly).
    const allSame = slotStatuses.every((s) => s === status);

    const updateData: Record<string, unknown> = { note: newNote };
    if (allSame) {
      updateData.status = status;
    }

    const { error: updErr } = await supabaseAdmin
      .from("bookings")
      .update(updateData)
      .eq("id", bookingId);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 500 }
      );
    }

    // Log activity (best-effort) when the booking has an invoice.
    const invRaw = (booking as { invoice?: unknown }).invoice;
    const inv = Array.isArray(invRaw) ? invRaw[0] : invRaw;
    const invoiceId = (inv as { id?: string } | null)?.id;
    const invoiceCode = (inv as { code?: string } | null)?.code;
    if (invoiceId) {
      const actionMap: Record<string, string> = {
        checkin: "CHECKIN",
        no_show: "NO_SHOW",
        cancelled: "CANCEL",
        checkout: "CHECKOUT",
        confirmed: "UPDATE_INVOICE",
      };
      const action = actionMap[status] || "UPDATE_INVOICE";
      const detailMap: Record<string, string> = {
        checkin: `Checkin khách #${slotIndex + 1}`,
        no_show: `Đánh dấu không đến khách #${slotIndex + 1}`,
        cancelled: `Hủy khách #${slotIndex + 1}`,
        checkout: `Hoàn tất khách #${slotIndex + 1}`,
      };
      try {
        await supabaseAdmin.from("invoice_activities").insert({
          invoice_id: invoiceId,
          invoice_code: invoiceCode || null,
          action,
          detail: detailMap[status] || `Cập nhật trạng thái khách #${slotIndex + 1}`,
          value: null,
          branch_id: (booking as { branch_id?: string | null }).branch_id || null,
          created_by: actorStaffId,
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({
      ok: true,
      slotIndex,
      status,
      allSame,
      bookingStatus: allSame ? status : (booking.status as string),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
