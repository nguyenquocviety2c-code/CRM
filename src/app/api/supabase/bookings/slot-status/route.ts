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
    let invoiceId = (inv as { id?: string } | null)?.id;
    let invoiceCode = (inv as { code?: string } | null)?.code;

    // AUTO-CREATE INVOICE on first checkin: when a customer checks in (status
    // = "checkin") and no invoice exists yet, create a PENDING invoice so the
    // "Thanh toán" column shows "Hóa đơn" immediately. The invoice includes
    // ONLY the checked-in customer's services (the booking's services are
    // filtered by which slot is checked in). The cashier can then open the
    // invoice dialog to add products + process payment.
    if (status === "checkin" && !invoiceId) {
      // Gather the checked-in customers' services. A service belongs to a
      // checked-in customer if its serviceSlots mapping points to a slot whose
      // slotStatuses is "checkin". For legacy bookings without serviceSlots,
      // only the directly-checked-in slot's main service is included.
      const svcSlots = parsed.serviceSlots;
      const bookingBranchId = (booking as { branch_id?: string | null }).branch_id || null;
      const checkedInSlotIndices = new Set<number>();
      for (let i = 0; i < slotStatuses.length; i++) {
        if (slotStatuses[i] === "checkin") checkedInSlotIndices.add(i);
      }

      // Fetch the booking's services to build invoice items.
      const { data: bookingServices } = await supabaseAdmin
        .from("booking_services")
        .select("id, service_id, staff_id, sort_order, service:services(id, name, price, duration)")
        .eq("booking_id", bookingId)
        .order("sort_order", { ascending: true });

      const invoiceItems: Array<Record<string, unknown>> = [];
      if (bookingServices && Array.isArray(bookingServices)) {
        (bookingServices as Array<Record<string, unknown>>).forEach((bs, svcIdx) => {
          // Determine which customer slot this service belongs to.
          let slotIdx: number;
          if (svcSlots && svcIdx < svcSlots.length) {
            slotIdx = svcSlots[svcIdx];
          } else {
            slotIdx = svcIdx; // legacy 1:1
          }
          // Only include services whose customer is checked in.
          if (!checkedInSlotIndices.has(slotIdx)) return;

          const svc = bs.service as { id?: string; name?: string; price?: number | string } | null;
          if (!svc || !svc.id) return;
          const price = Number(svc.price) || 0;
          invoiceItems.push({
            id: `${svc.id}-${crypto.randomUUID?.() || Date.now()}-${svcIdx}`,
            itemId: svc.id,
            name: svc.name || "Dịch vụ",
            type: "service",
            quantity: 1,
            price,
            discount: 0,
            discountType: "VND",
            total: price,
          });
        });
      }

      // Get the booking's customer_id for the invoice.
      const customerId = (booking as { customer_id?: string }).customer_id || null;

      try {
        const { data: newInv, error: invErr } = await supabaseAdmin
          .from("invoices")
          .insert({
            customer_id: customerId,
            branch_id: bookingBranchId,
            booking_id: bookingId,
            note: JSON.stringify({ items: invoiceItems, promotion: null }),
            subtotal: invoiceItems.reduce((s, it) => s + (Number(it.price) || 0), 0),
            discount: 0,
            tip: 0,
            final_amount: invoiceItems.reduce((s, it) => s + (Number(it.price) || 0), 0),
            payment_method: null,
            status: "pending",
          })
          .select("id, code")
          .single();

        if (!invErr && newInv) {
          invoiceId = (newInv as { id: string }).id;
          invoiceCode = (newInv as { code?: string }).code || null;
        }
      } catch {
        // best-effort — the slot status still updated successfully
      }
    }

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
