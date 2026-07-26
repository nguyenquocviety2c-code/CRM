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
 *
 * AUTO-PROMOTION (per user request): when the user requests "checkin" for a
 * customer slot AND at least one OTHER slot is already at "checkout" (another
 * customer has already completed payment), the requested slot is automatically
 * promoted to "checkout" instead. This lets the cashier quickly process a
 * late-arriving customer in a partially-paid booking without going through the
 * invoice dialog — the customer's services are added to the existing paid
 * invoice and their slot turns yellow immediately. The existing invoice's
 * items + subtotal + final_amount are updated to include the new customer's
 * services.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, slotIndex, status: requestedStatus } = body;
    // Validate actor_staff_id as a UUID — the staff table's `id` column is a
    // UUID, so a non-UUID value (e.g. a username string) would poison the
    // activity-history staff lookup (PostgREST's .in("id", [...]) fails when
    // any value can't be cast to UUID). The auth cookie always contains the
    // UUID; the body fallback should too, but we validate defensively.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bodyActorStaffId = typeof body.actor_staff_id === "string" && UUID_RE.test(body.actor_staff_id.trim())
      ? body.actor_staff_id.trim()
      : null;
    const actorStaffId = getCurrentStaffId(request) || bodyActorStaffId;

    if (!bookingId || typeof slotIndex !== "number" || !requestedStatus) {
      return NextResponse.json(
        { ok: false, error: "bookingId, slotIndex (number), and status are required" },
        { status: 400 }
      );
    }

    // Fetch the booking's current note + status + invoice.
    // NOTE: the invoices table stores tip, promotion, photos, and items inside
    // the `note` column as JSON (not as separate DB columns). We only select
    // real DB columns here; the note JSON is decoded later when needed.
    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status, note, branch_id, customer_id, invoice:invoices(id, code, status, note, total_amount, discount, final_amount)")
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

    // Build the current slotStatuses array (or initialize from booking.status).
    const slotStatuses = parsed.slotStatuses
      ? [...parsed.slotStatuses]
      : parsed.slots.map(() => booking.status as string);
    while (slotStatuses.length < parsed.slots.length) {
      slotStatuses.push(booking.status as string);
    }

    // Capture the OLD status of this slot (before any change) — used to detect
    // a checkout → non-checkout transition (which triggers service removal
    // from the existing paid invoice).
    const oldSlotStatus = slotStatuses[slotIndex] || (booking.status as string);

    // === AUTO-PROMOTION logic ===
    // When the user requests "checkin" for a slot AND at least one OTHER slot
    // is already at "checkout", promote this slot to "checkout" directly. The
    // customer's services will be appended to the existing paid invoice below.
    // This mirrors the flow where the first customer pays: the cashier checked
    // them out, and now a second customer arrives — instead of going through
    // checkin → invoice dialog → pay, the cashier just picks "checkin" and the
    // slot auto-transitions to "checkout" (services added to the same invoice).
    let effectiveStatus = requestedStatus;
    let autoPromoted = false;
    if (requestedStatus === "checkin") {
      const otherSlotsCheckout = slotStatuses.some((s, i) => i !== slotIndex && s === "checkout");
      if (otherSlotsCheckout) {
        effectiveStatus = "checkout";
        autoPromoted = true;
      }
    }

    // Update the slotStatuses array with the effective status.
    slotStatuses[slotIndex] = effectiveStatus;

    // Rebuild the note with the updated slotStatuses.
    const newNote = buildMultiCustomerNote(
      parsed.slots,
      parsed.userNote,
      parsed.serviceSlots,
      slotStatuses
    );

    // Check if ALL slots now share the same status → if so, also update
    // the booking's main `status` field (so legacy code reads correctly).
    const allSame = slotStatuses.every((s) => s === effectiveStatus);

    const updateData: Record<string, unknown> = { note: newNote };
    if (allSame) {
      updateData.status = effectiveStatus;
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

    // Resolve the invoice (may be an array from the join).
    const invRaw = (booking as { invoice?: unknown }).invoice;
    const inv = Array.isArray(invRaw) ? invRaw[0] : invRaw;
    let invoiceId = (inv as { id?: string } | null)?.id;
    let invoiceCode: string | null = (inv as { code?: string } | null)?.code || null;

    // === AUTO-CREATE INVOICE on first checkin ===
    // When a customer checks in (status = "checkin") and no invoice exists yet,
    // create a PENDING invoice with ONLY the checked-in customers' services.
    // The cashier can then open the invoice dialog to add products + pay.
    if (effectiveStatus === "checkin" && !invoiceId) {
      const newInvoice = await createPendingInvoiceForCheckinSlots(
        bookingId,
        booking,
        parsed,
        slotStatuses
      );
      if (newInvoice) {
        invoiceId = newInvoice.id;
        invoiceCode = newInvoice.code || null;
      }
    }

    // === AUTO-PROMOTION: add services to existing paid invoice ===
    // When a slot was auto-promoted from "checkin" → "checkout" because another
    // slot was already checkout, the existing paid invoice needs to be updated
    // to include this customer's services. We fetch the invoice's current items
    // (from its note JSON), append the new services, and recalculate the totals.
    if (autoPromoted && invoiceId) {
      await addCustomerServicesToInvoice(
        invoiceId,
        bookingId,
        slotIndex,
        parsed,
        booking,
        actorStaffId
      );
    }

    // === REVERT: remove services from existing invoice when a paid customer's
    //     status reverts to confirmed / cancelled / no_show (per user request:
    //     "khi slot lịch hẹn của 1 khách đã thanh toán chuyển trạng thái từ đã
    //     thanh toán thành Đã xác nhận, Đã hủy hoặc Không đến thì các dịch vụ
    //     của khách đó trong hóa đơn cũng biến mất").
    //     This removes the customer's service items from the invoice's note JSON
    //     and recalculates the totals. Products are NOT removed (they weren't
    //     tied to a specific customer). If the invoice ends up with no service
    //     items, it stays as-is (the cashier can cancel it separately if needed). ===
    if (
      oldSlotStatus === "checkout" &&
      effectiveStatus !== "checkout" &&
      invoiceId
    ) {
      await removeCustomerServicesFromInvoice(
        invoiceId,
        bookingId,
        slotIndex,
        parsed
      );
    }

    // === Log activity (best-effort) ===
    if (invoiceId) {
      const actionMap: Record<string, string> = {
        checkin: "CHECKIN",
        no_show: "NO_SHOW",
        cancelled: "CANCEL",
        checkout: "CHECKOUT",
        confirmed: "UPDATE_INVOICE",
      };
      const action = actionMap[effectiveStatus] || "UPDATE_INVOICE";
      const detailMap: Record<string, string> = {
        checkin: `Checkin khách #${slotIndex + 1}`,
        no_show: `Đánh dấu không đến khách #${slotIndex + 1}`,
        cancelled: `Hủy khách #${slotIndex + 1}`,
        checkout: autoPromoted
          ? `Tự động thanh toán khách #${slotIndex + 1} (đơn đã có khách thanh toán)`
          : `Hoàn tất khách #${slotIndex + 1}`,
      };
      try {
        await supabaseAdmin.from("invoice_activities").insert({
          invoice_id: invoiceId,
          invoice_code: invoiceCode || null,
          action,
          detail: detailMap[effectiveStatus] || `Cập nhật trạng thái khách #${slotIndex + 1}`,
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
      status: effectiveStatus,
      requestedStatus,
      autoPromoted,
      allSame,
      bookingStatus: allSame ? effectiveStatus : (booking.status as string),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * Create a PENDING invoice for the currently checked-in slots. Called on the
 * FIRST checkin (no invoice exists yet). The invoice includes ONLY the
 * checked-in customers' services (filtered by serviceSlots → slotStatuses).
 */
async function createPendingInvoiceForCheckinSlots(
  bookingId: string,
  booking: Record<string, unknown>,
  parsed: ReturnType<typeof parseMultiCustomerNote>,
  slotStatuses: string[]
): Promise<{ id: string; code: string | null } | null> {
  if (!parsed) return null;
  const svcSlots = parsed.serviceSlots;
  const bookingBranchId = (booking as { branch_id?: string | null }).branch_id || null;
  const customerId = (booking as { customer_id?: string | null }).customer_id || null;
  const checkedInSlotIndices = new Set<number>();
  for (let i = 0; i < slotStatuses.length; i++) {
    if (slotStatuses[i] === "checkin") checkedInSlotIndices.add(i);
  }

  // Fetch the booking's services.
  const { data: bookingServices } = await supabaseAdmin
    .from("booking_services")
    .select("id, service_id, staff_id, sort_order, service:services(id, name, price, duration)")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  const invoiceItems: Array<Record<string, unknown>> = [];
  if (bookingServices && Array.isArray(bookingServices)) {
    (bookingServices as Array<Record<string, unknown>>).forEach((bs, svcIdx) => {
      let slotIdx: number;
      if (svcSlots && svcIdx < svcSlots.length) {
        slotIdx = svcSlots[svcIdx];
      } else {
        slotIdx = svcIdx;
      }
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
        // Tag this item with its owner customer's slot index so it can be
        // removed later if that customer's status reverts from checkout.
        _slotIdx: slotIdx,
      });
    });
  }

  try {
    const { data: newInv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        customer_id: customerId,
        branch_id: bookingBranchId,
        booking_id: bookingId,
        note: JSON.stringify({ __kind: "invoice_meta", items: invoiceItems, note: null, tip: 0, promotion: null, photos: [] }),
        subtotal: invoiceItems.reduce((s, it) => s + (Number(it.price) || 0), 0),
        discount: 0,
        tip: 0,
        final_amount: invoiceItems.reduce((s, it) => s + (Number(it.price) || 0), 0),
        payment_method: null,
        status: "pending",
      })
      .select("id, code")
      .single();
    if (invErr || !newInv) return null;
    return {
      id: (newInv as { id: string }).id,
      code: (newInv as { code?: string | null }).code || null,
    };
  } catch {
    return null;
  }
}

/**
 * Append a specific customer's services to an existing (paid) invoice.
 * Used during auto-promotion: when a confirmed customer is auto-promoted to
 * checkout because another customer already paid, their services are added to
 * the same invoice. The invoice's items (in its note JSON), subtotal, and
 * final_amount are all updated. The promotion/discount/tip are preserved.
 */
async function addCustomerServicesToInvoice(
  invoiceId: string,
  bookingId: string,
  slotIndex: number,
  parsed: ReturnType<typeof parseMultiCustomerNote>,
  booking: Record<string, unknown>,
  _actorStaffId: string | null
): Promise<void> {
  if (!parsed) return;
  const svcSlots = parsed.serviceSlots;

  // Fetch the existing invoice's current state (note JSON + totals).
  // tip, promotion, photos, and items are all stored inside the `note` JSON
  // (not as separate DB columns), so we only select real columns + note.
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("id, note, total_amount, discount, final_amount")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return;

  // Parse the invoice's note JSON to get the current items array.
  // The note column stores: { __kind: "invoice_meta", items: [...], note: "...", tip: N, promotion: {...}, photos: [...] }
  const invNote = inv.note as string | null;
  let existingItems: Array<Record<string, unknown>> = [];
  let promotionMeta: unknown = null;
  let humanNote: string | null = null;
  let tipAmount = 0;
  let photosList: string[] = [];
  if (invNote) {
    try {
      const parsedNote = JSON.parse(invNote) as {
        items?: unknown[];
        note?: string | null;
        tip?: number;
        promotion?: unknown;
        photos?: unknown;
      };
      if (Array.isArray(parsedNote.items)) {
        existingItems = parsedNote.items as Array<Record<string, unknown>>;
      }
      promotionMeta = parsedNote.promotion ?? null;
      humanNote = parsedNote.note ?? null;
      tipAmount = Number(parsedNote.tip) || 0;
      if (Array.isArray(parsedNote.photos)) {
        photosList = parsedNote.photos as string[];
      }
    } catch {
      // best-effort — treat as empty
    }
  }

  // Fetch the booking's services for THIS customer's slot.
  const { data: bookingServices } = await supabaseAdmin
    .from("booking_services")
    .select("id, service_id, staff_id, sort_order, service:services(id, name, price, duration)")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  // Build a set of "itemId:_slotIdx" keys already in the invoice so we don't
  // add duplicates (idempotent — re-triggering the same slot doesn't duplicate
  // services). Using BOTH itemId + _slotIdx means two customers with the SAME
  // service each get their own line item (not deduped against each other).
  const existingItemKeys = new Set<string>();
  existingItems.forEach((it) => {
    const itemId = String(it.itemId || "");
    const si = it._slotIdx;
    if (itemId) existingItemKeys.add(`${itemId}:${si ?? "none"}`);
  });

  // Find the services that belong to this customer's slot.
  const newItems: Array<Record<string, unknown>> = [];
  if (bookingServices && Array.isArray(bookingServices)) {
    (bookingServices as Array<Record<string, unknown>>).forEach((bs, svcIdx) => {
      let slotIdx: number;
      if (svcSlots && svcIdx < svcSlots.length) {
        slotIdx = svcSlots[svcIdx];
      } else {
        slotIdx = svcIdx;
      }
      if (slotIdx !== slotIndex) return; // only this customer's services

      const svc = bs.service as { id?: string; name?: string; price?: number | string } | null;
      if (!svc || !svc.id) return;
      // Skip if this service is already in the invoice for this slot (idempotent).
      if (existingItemKeys.has(`${svc.id}:${slotIdx}`)) return;

      const price = Number(svc.price) || 0;
      newItems.push({
        id: `${svc.id}-${crypto.randomUUID?.() || Date.now()}-${svcIdx}`,
        itemId: svc.id,
        name: svc.name || "Dịch vụ",
        type: "service",
        quantity: 1,
        price,
        discount: 0,
        discountType: "VND",
        total: price,
        staffName: (bs.staff as { name?: string } | null)?.name || undefined,
        // Tag with the owner customer's slot index for later removal.
        _slotIdx: slotIdx,
      });
    });
  }

  if (newItems.length === 0) return; // nothing to add (all services already present)

  // Merge: existing items + new items.
  const allItems = [...existingItems, ...newItems];

  // Recalculate totals. The discount is preserved as-is (it was set when the
  // first customer paid). The new services' prices are added to subtotal and
  // final_amount. If a promotion was applied, its discountAmount is preserved
  // (not re-calculated — the promotion may not apply to the new services, and
  // re-calculating could change the already-paid amount unexpectedly).
  const oldTotalAmount = Number(inv.total_amount) || 0;
  const newServicesTotal = newItems.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const newTotalAmount = oldTotalAmount + newServicesTotal;
  const discount = Number(inv.discount) || 0;
  // final_amount = (total_amount - discount) + tip — same formula as checkout.
  const newFinalAmount = Math.max(0, newTotalAmount - discount) + tipAmount;

  // Rebuild the note JSON with the __kind marker so the invoices API can
  // decode it correctly. All existing fields (human note, tip, promotion,
  // photos) are preserved; only items + totals change.
  const newInvNote = JSON.stringify({
    __kind: "invoice_meta",
    items: allItems,
    note: humanNote,
    tip: tipAmount,
    promotion: promotionMeta,
    photos: photosList,
  });

  try {
    await supabaseAdmin
      .from("invoices")
      .update({
        note: newInvNote,
        total_amount: newTotalAmount,
        final_amount: newFinalAmount,
      })
      .eq("id", invoiceId);
  } catch {
    // best-effort — the slot status still updated successfully
  }
}

/**
 * Remove a specific customer's SERVICE items from an existing invoice.
 * Called when a paid customer's slot status reverts from "checkout" to
 * "confirmed" / "cancelled" / "no_show" (per user request: their services
 * should disappear from the invoice). Products are NOT removed (they aren't
 * tied to a specific customer). The invoice's items (in its note JSON) are
 * filtered, and totals are recalculated.
 *
 * Item matching: each service item carries a `_slotIdx` field (set when it was
 * added via auto-promotion or first-checkin invoice creation). We remove items
 * where `_slotIdx === slotIndex`. For LEGACY items without `_slotIdx`, we fall
 * back to matching by service name against the booking's services for this
 * slot — removing up to the number of services this customer has.
 */
async function removeCustomerServicesFromInvoice(
  invoiceId: string,
  bookingId: string,
  slotIndex: number,
  parsed: ReturnType<typeof parseMultiCustomerNote>
): Promise<void> {
  if (!parsed) return;
  const svcSlots = parsed.serviceSlots;

  // Fetch the existing invoice's current state.
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("id, note, total_amount, discount, final_amount")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return;

  // Parse the invoice's note JSON.
  const invNote = inv.note as string | null;
  let existingItems: Array<Record<string, unknown>> = [];
  let promotionMeta: unknown = null;
  let humanNote: string | null = null;
  let tipAmount = 0;
  let photosList: string[] = [];
  if (invNote) {
    try {
      const parsedNote = JSON.parse(invNote) as {
        items?: unknown[];
        note?: string | null;
        tip?: number;
        promotion?: unknown;
        photos?: unknown;
      };
      if (Array.isArray(parsedNote.items)) {
        existingItems = parsedNote.items as Array<Record<string, unknown>>;
      }
      promotionMeta = parsedNote.promotion ?? null;
      humanNote = parsedNote.note ?? null;
      tipAmount = Number(parsedNote.tip) || 0;
      if (Array.isArray(parsedNote.photos)) {
        photosList = parsedNote.photos as string[];
      }
    } catch {
      // best-effort
    }
  }

  // Fetch the booking's services for THIS customer's slot — used for the
  // legacy fallback (items without _slotIdx).
  const { data: bookingServices } = await supabaseAdmin
    .from("booking_services")
    .select("id, service_id, sort_order, service:services(id, name, price)")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  // Build the list of service names that belong to this customer's slot
  // (for legacy item matching).
  const slotServiceNames: string[] = [];
  if (bookingServices && Array.isArray(bookingServices)) {
    (bookingServices as Array<Record<string, unknown>>).forEach((bs, svcIdx) => {
      let slotIdx: number;
      if (svcSlots && svcIdx < svcSlots.length) {
        slotIdx = svcSlots[svcIdx];
      } else {
        slotIdx = svcIdx;
      }
      if (slotIdx !== slotIndex) return;
      const svc = bs.service as { name?: string } | null;
      if (svc?.name) slotServiceNames.push(svc.name);
    });
  }

  // Track how many legacy matches we've removed per service name (so we don't
  // remove MORE items than this customer actually has).
  const legacyRemovalCount: Record<string, number> = {};

  // Filter items: keep items that DON'T belong to this customer.
  const remainingItems = existingItems.filter((it) => {
    // Only remove SERVICE items (products/packages stay).
    const type = String(it.type || "");
    if (type !== "service") return true; // keep products/packages

    // PREFERRED: match by _slotIdx (set during auto-promotion / first-checkin).
    const itemSlotIdx = it._slotIdx;
    if (itemSlotIdx !== undefined && itemSlotIdx !== null) {
      // Remove if this item belongs to the reverting customer's slot.
      return Number(itemSlotIdx) !== slotIndex;
    }

    // LEGACY FALLBACK: no _slotIdx. Match by service name. Remove only up to
    // the number of services this customer has (so we don't accidentally
    // remove another customer's same-named service).
    const itemName = String(it.name || "");
    if (slotServiceNames.includes(itemName)) {
      const count = legacyRemovalCount[itemName] || 0;
      const maxForName = slotServiceNames.filter((n) => n === itemName).length;
      if (count < maxForName) {
        legacyRemovalCount[itemName] = count + 1;
        return false; // remove this item
      }
    }
    return true; // keep
  });

  // If nothing was removed, skip the update.
  if (remainingItems.length === existingItems.length) return;

  // Recalculate totals. The removed services' prices are subtracted from
  // total_amount and final_amount. Discount + tip are preserved.
  const removedItemsTotal = existingItems
    .filter((it) => !remainingItems.includes(it))
    .reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  const oldTotalAmount = Number(inv.total_amount) || 0;
  const newTotalAmount = Math.max(0, oldTotalAmount - removedItemsTotal);
  const discount = Number(inv.discount) || 0;
  const newFinalAmount = Math.max(0, newTotalAmount - discount) + tipAmount;

  // Rebuild the note JSON.
  const newInvNote = JSON.stringify({
    __kind: "invoice_meta",
    items: remainingItems,
    note: humanNote,
    tip: tipAmount,
    promotion: promotionMeta,
    photos: photosList,
  });

  try {
    await supabaseAdmin
      .from("invoices")
      .update({
        note: newInvNote,
        total_amount: newTotalAmount,
        final_amount: newFinalAmount,
      })
      .eq("id", invoiceId);
  } catch {
    // best-effort — the slot status still updated successfully
  }
}
