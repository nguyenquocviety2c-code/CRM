import { parseMultiCustomerNote } from "@/lib/multi-customer";

/**
 * Transition a booking to the "checkout" (paid) state after an invoice is paid.
 *
 * For multi-customer "Cùng lịch" bookings that have per-customer `slotStatuses`
 * stored in their [[MULTI]] note, this updates ONLY the slots whose status is
 * "checkin" to "checkout" — other slots keep their existing status (confirmed,
 * cancelled, no_show) so the View khách hàng list colors each customer correctly
 * (only paid customers turn yellow). The slot-status API auto-updates the
 * booking-level `status` to "checkout" only when ALL slots become "checkout".
 *
 * For single-customer bookings (or multi-customer bookings without slotStatuses),
 * this directly PATCHes the booking's `status` to "checkout" — the legacy
 * behavior.
 *
 * This helper is shared between the Booking module (invoice dialog's `onPaid`)
 * and the Cashier module (the `shouldSyncBooking` block in the checkout
 * mutation) so both flows stay consistent.
 *
 * @param booking  The booking that was just paid (needs at least `id` + `note`).
 * @param actorStaffId  Optional — the staff member performing the checkout, used
 *                      for invoice_activity attribution.
 * @returns A Promise that resolves when all API calls settle (best-effort —
 *          network errors are swallowed so a failed sync doesn't roll back the
 *          already-completed invoice).
 */
export async function transitionBookingToCheckout(
  booking: {
    id: string;
    note?: string | null;
    status?: string | null;
    number_of_customers?: number | null;
  },
  actorStaffId?: string
): Promise<void> {
  if (!booking?.id) return;

  const multi = parseMultiCustomerNote(booking.note ?? null);
  const isMulti =
    !!multi &&
    (booking.number_of_customers ?? 1) >= 2 &&
    multi.slots.length > 1;
  const hasSlotStatuses = !!(
    multi?.slotStatuses &&
    multi.slotStatuses.length > 0
  );

  if (isMulti && hasSlotStatuses) {
    // Multi-customer booking with per-customer statuses: update ONLY the
    // checked-in slots to "checkout". Slots that are already "checkout" are
    // included (idempotent — re-paying the same invoice doesn't error). Slots
    // that are confirmed/cancelled/no_show are left untouched — their customers
    // haven't paid and shouldn't turn yellow.
    const slotStatuses = multi.slotStatuses!;
    const paidSlotIndices = new Set<number>();
    slotStatuses.forEach((st, idx) => {
      if (st === "checkin" || st === "checkout") paidSlotIndices.add(idx);
    });

    if (paidSlotIndices.size === 0) {
      // No checked-in slots — fall back to a direct booking PATCH so the
      // booking-level status still transitions to "checkout".
      await patchBookingStatus(booking.id, "checkout", actorStaffId);
      return;
    }

    // Call the slot-status API SEQUENTIALLY for each paid slot. The slot-status
    // API does a read-modify-write on the booking's [[MULTI]] note (it reads the
    // current slotStatuses array, updates ONE slot, and writes the whole note
    // back), so concurrent calls would race and clobber each other's updates.
    // Sequential calls guarantee each update builds on the previous one. The
    // API handles the "allSame" booking-level status update internally (when
    // every slot ends up at "checkout", booking.status is set to "checkout"
    // too) — the last call in the sequence is the one that triggers it.
    for (const slotIdx of Array.from(paidSlotIndices)) {
      await patchSlotStatus(booking.id, slotIdx, "checkout", actorStaffId);
    }
    return;
  }

  // Single-customer or multi-customer without slotStatuses — direct PATCH.
  await patchBookingStatus(booking.id, "checkout", actorStaffId);
}

/**
 * PATCH /api/supabase/bookings/:id — sets the booking-level `status`. Used for
 * single-customer checkouts and as a fallback when no slots are checked in.
 * Best-effort: network errors are swallowed.
 */
async function patchBookingStatus(
  bookingId: string,
  status: string,
  actorStaffId?: string
): Promise<void> {
  try {
    await fetch(`/api/supabase/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        actor_staff_id: actorStaffId,
      }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * PATCH /api/supabase/bookings/slot-status — updates ONE customer slot's
 * status in a multi-customer "Cùng lịch" booking. Best-effort: network errors
 * are swallowed.
 */
async function patchSlotStatus(
  bookingId: string,
  slotIndex: number,
  status: string,
  actorStaffId?: string
): Promise<void> {
  try {
    await fetch(`/api/supabase/bookings/slot-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId,
        slotIndex,
        status,
        actor_staff_id: actorStaffId,
      }),
    });
  } catch {
    /* best-effort */
  }
}
