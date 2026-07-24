/**
 * Mask a phone number for staff without the `view_customer_phone` permission.
 *
 * Shows the first 4 and last 2 digits, replacing the middle with dots, e.g.
 * "0901234567" → "0901•••67". Short numbers are fully masked. Empty/null
 * returns "—".
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const s = String(phone).trim();
  if (s.length <= 6) return "•".repeat(s.length || 3);
  const head = s.slice(0, 4);
  const tail = s.slice(-2);
  return `${head}•••${tail}`;
}
