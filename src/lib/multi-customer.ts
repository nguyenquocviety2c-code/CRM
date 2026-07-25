/**
 * Multi-customer booking support.
 *
 * The `booking_services` table has NO `customer_id` column — each booking
 * stores only ONE `customer_id` at the booking level. For "Cùng lịch"
 * multi-customer bookings (1 booking, N services, N customers), the per-slot
 * customer mapping is persisted as a structured JSON block inside the booking's
 * `note` field, prefixed with the `[[MULTI]]` marker so it can be detected and
 * parsed by every display site.
 *
 * Storage format (note field value):
 *   `[[MULTI]]{"slots":[{"id","name","phone","walkin"},...],"userNote":"..."}`
 *
 * - `slots[i]` describes the customer for service slot `i` (1:1 with the
 *   booking's services array, in sort order).
 * - `walkin: true` marks slots that had no phone/name entered → resolved to a
 *   "Khách vãng lai" guest record at submit. Display sites render these as
 *   "Khách vãng lai".
 * - `userNote` holds the cashier's own typed note (if any), kept separate from
 *   the structured block so it can still be shown as a plain note.
 *
 * `parseMultiCustomerNote` returns null for plain (non-multi) bookings, so
 * callers can fall back to `booking.customer` — fully backward compatible with
 * existing single-customer and "Khác lịch" bookings.
 */

const MULTI_MARKER = "[[MULTI]]";

export interface SlotCustomer {
  /** Resolved customer_id (always set at submit, even for walk-in guests). */
  id: string;
  /** Display name. For walk-in slots this is "Khách vãng lai". */
  name: string;
  /** Phone (empty string for walk-in). */
  phone: string;
  /** True when the slot had no phone/name entered → walk-in guest. */
  walkin: boolean;
}

export interface MultiCustomerNote {
  slots: SlotCustomer[];
  /** The cashier's own typed note (may be empty). */
  userNote: string;
  /**
   * Optional: maps each service index → customer slot index. Present when a
   * customer has extra services (beyond the 1:1 main service per slot).
   * `serviceSlots[i]` = the customer slot index that owns service `i`.
   * When absent (legacy bookings), display sites fall back to a 1:1 mapping
   * (service i → slot i) + staff-name heuristic for extras.
   */
  serviceSlots?: number[];
  /**
   * Optional: per-customer-slot status. `slotStatuses[i]` = the booking status
   * string for customer slot `i` (e.g. "confirmed", "checkin", "cancelled",
   * "no_show"). When absent, all slots share the booking's main `status`.
   * This enables per-customer status changes in View nhân viên while keeping
   * the booking-level status as the "default" for un-changed slots.
   */
  slotStatuses?: string[];
}

/**
 * Parse a booking `note` value. Returns the structured multi-customer data if
 * the note carries the `[[MULTI]]` marker, otherwise null (plain booking).
 */
export function parseMultiCustomerNote(
  note: string | null | undefined
): MultiCustomerNote | null {
  if (!note || !note.startsWith(MULTI_MARKER)) return null;
  try {
    const json = JSON.parse(note.slice(MULTI_MARKER.length));
    if (
      json &&
      Array.isArray(json.slots) &&
      json.slots.every(
        (s: unknown) =>
          s &&
          typeof s === "object" &&
          "id" in s &&
          "name" in s &&
          "phone" in s
      )
    ) {
      return {
        slots: (json.slots as Array<Record<string, unknown>>).map((s) => ({
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
          phone: String(s.phone ?? ""),
          walkin: Boolean(s.walkin),
        })),
        userNote: typeof json.userNote === "string" ? json.userNote : "",
        serviceSlots: Array.isArray(json.serviceSlots)
          ? (json.serviceSlots as number[])
          : undefined,
        slotStatuses: Array.isArray(json.slotStatuses)
          ? (json.slotStatuses as string[])
          : undefined,
      };
    }
  } catch {
    // Malformed JSON → treat as plain note.
  }
  return null;
}

/**
 * Build the `note` field value for a multi-customer "Cùng lịch" booking.
 * Combines the per-slot customer descriptors with the cashier's own note.
 */
export function buildMultiCustomerNote(
  slots: SlotCustomer[],
  userNote: string,
  serviceSlots?: number[],
  slotStatuses?: string[]
): string {
  const payload: Record<string, unknown> = { slots, userNote: userNote.trim() };
  if (serviceSlots && serviceSlots.length > 0) {
    payload.serviceSlots = serviceSlots;
  }
  if (slotStatuses && slotStatuses.length > 0) {
    payload.slotStatuses = slotStatuses;
  }
  return MULTI_MARKER + JSON.stringify(payload);
}

/**
 * Returns the customer descriptor for a given service slot index, or null if
 * the booking is not multi-customer or the index is out of range.
 */
export function getSlotCustomer(
  note: string | null | undefined,
  slotIndex: number
): SlotCustomer | null {
  const parsed = parseMultiCustomerNote(note);
  if (!parsed) return null;
  return parsed.slots[slotIndex] ?? null;
}

/**
 * Returns the list of all slot customers for a multi-customer booking, or null
 * if the booking is not multi-customer. Used by display sites that list every
 * customer (e.g. the Staff View customer column).
 */
export function getAllSlotCustomers(
  note: string | null | undefined
): SlotCustomer[] | null {
  const parsed = parseMultiCustomerNote(note);
  if (!parsed) return null;
  return parsed.slots;
}
