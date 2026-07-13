import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Date helpers — timezone-safe (Vietnam, UTC+7).
// ---------------------------------------------------------------------------
// The app's staff and customers are in Vietnam (Asia/Bangkok, UTC+7). Dates
// stored in Supabase are UTC. To filter "all records on a given Vietnam day",
// we must convert the local day boundaries to UTC ISO strings WITH an explicit
// offset (or Z) — otherwise PostgREST interprets a bare "2026-07-13T00:00:00"
// as UTC, which is 07:00 in Vietnam and shifts the window by 7 hours.
//
// VN_OFFSET_MINUTES = +420 minutes (UTC+7).
const VN_OFFSET_MINUTES = 7 * 60;

/**
 * Convert a local (Vietnam) calendar day "YYYY-MM-DD" to the inclusive UTC
 * ISO string marking the START of that Vietnam day.
 *
 *   "2026-07-13" (VN) → "2026-07-12T17:00:00.000Z"
 *
 * because 2026-07-13 00:00:00+07:00 == 2026-07-12 17:00:00 UTC.
 */
export function localDayStartUtc(dayStr: string): string {
  // Build a Date representing local-midnight, then read its UTC instant.
  // We construct it with the explicit +07:00 offset so `new Date()` parses
  // it correctly regardless of the host machine's timezone.
  const d = new Date(`${dayStr}T00:00:00+07:00`);
  return d.toISOString();
}

/**
 * Convert a local (Vietnam) calendar day "YYYY-MM-DD" to the inclusive UTC
 * ISO string marking the END of that Vietnam day (23:59:59.999 local).
 *
 *   "2026-07-13" (VN) → "2026-07-13T16:59:59.999Z"
 */
export function localDayEndUtc(dayStr: string): string {
  const d = new Date(`${dayStr}T23:59:59.999+07:00`);
  return d.toISOString();
}

/**
 * Convenience: get { from, to } UTC ISO strings for a local (Vietnam) day.
 * Use with API params `date_from` / `date_to`.
 */
export function localDayToUtcRange(dayStr: string): { from: string; to: string } {
  return { from: localDayStartUtc(dayStr), to: localDayEndUtc(dayStr) };
}

/**
 * The configured Vietnam offset in minutes (always +420). Exported so other
 * modules can use it for date arithmetic without hard-coding the magic number.
 */
export const VN_OFFSET = VN_OFFSET_MINUTES;

/**
 * Format a Date (or ISO string / epoch ms) as a Vietnam calendar day
 * "YYYY-MM-DD". Uses the UTC+7 offset regardless of the host machine's
 * timezone, so the same instant always maps to the same Vietnam day.
 *
 *   epoch for 2026-07-13T02:00:00+07:00 → "2026-07-13"
 *   epoch for 2026-07-13T06:00:00Z      → "2026-07-13"  (13:00 VN same day)
 */
export function toVietnamDay(input: Date | string | number): string {
  const ms = typeof input === "number" ? input
    : input instanceof Date ? input.getTime()
    : new Date(input).getTime();
  const vn = new Date(ms + VN_OFFSET_MINUTES * 60 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(vn.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Format a Date (or ISO string / epoch ms) as a Vietnam wall-clock time
 * "HH:mm". Uses the UTC+7 offset regardless of the host machine's timezone, so
 * the same instant always maps to the same Vietnam time.
 *
 *   "2026-07-13T02:30:00+00:00"  → "09:30"   (UTC instant → VN time)
 *   "2026-07-13T09:30:00+07:00"  → "09:30"   (already VN time)
 *
 * Use this instead of naively regex-extracting the "THH:MM" segment of an ISO
 * string — Supabase normalizes stored offsets to +00:00 (UTC), so the segment
 * is the UTC time, NOT the Vietnam time the user entered.
 */
export function toVietnamTime(input: Date | string | number): string {
  const ms = typeof input === "number" ? input
    : input instanceof Date ? input.getTime()
    : new Date(input).getTime();
  const vn = new Date(ms + VN_OFFSET_MINUTES * 60 * 1000);
  return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Return { from, to } Date objects representing the start (00:00:00) and end
 * (23:59:59.999) of a given Vietnam calendar day "YYYY-MM-DD", expressed as
 * UTC instants. Use this when a component needs Date objects (not ISO strings)
 * for a DateRangePicker state, but wants the range to be Vietnam-day-correct
 * regardless of the host timezone.
 */
export function vietnamDayRangeDates(dayStr: string): { from: Date; to: Date } {
  return {
    from: new Date(`${dayStr}T00:00:00+07:00`),
    to: new Date(`${dayStr}T23:59:59.999+07:00`),
  };
}

/**
 * Return the Vietnam "today" day string "YYYY-MM-DD" based on the current
 * wall-clock time (uses host timezone; intended for client-side use where
 * the browser reflects the user's local time = Vietnam).
 */
export function vietnamToday(): string {
  return toVietnamDay(Date.now());
}