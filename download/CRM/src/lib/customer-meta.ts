/**
 * Encoded-note pattern for customer metadata (photos, etc.)
 * ---------------------------------------------------------
 * The Supabase `customers` table has no dedicated photos column and we cannot
 * run DDL from the app. So customer metadata — currently just `photos` (an
 * array of image URLs, typically R2/S3 URLs) — is serialized as JSON into the
 * existing `note` TEXT column.
 *
 * This mirrors the SAME encoded-note pattern the `invoices` table uses for its
 * `items`/`tip`/`promotion`/`photos` fields (see
 * `src/app/api/supabase/invoices/route.ts` ITEMS_MARKER pattern).
 *
 * Encoding shape:
 *   { "__kind": "customer_meta", "note": "<human note text>", "photos": ["https://...url1", "https://...url2"] }
 *
 * The marker `"__kind":"customer_meta"` lets us detect encoded notes vs.
 * plain text notes (legacy / manually entered). When the marker is missing,
 * the note is treated as a plain human note and `photos` defaults to `[]`.
 *
 * Edge cases handled by `decodeCustomerNote`:
 *   - note is null                   -> { note: null, photos: [] }
 *   - note is plain text (no marker) -> { note: <raw text>, photos: [] }
 *   - note is malformed JSON         -> { note: <raw text>, photos: [] }
 *                                          (treated as plain text — never destroy user data)
 *   - note has the marker            -> { note: <decoded note>, photos: <decoded array> }
 *
 * CRITICAL: the human `note` text is ALWAYS preserved when managing photos.
 */

export const CUSTOMER_META_MARKER = '"__kind":"customer_meta"';

export interface DecodedCustomerNote {
  note: string | null;
  photos: string[];
}

/**
 * Decode a customer `note` value into `{ note, photos }`.
 *
 * - null/undefined            -> { note: null, photos: [] }
 * - plain string (no marker)  -> { note: <raw string>, photos: [] }
 * - malformed JSON w/ marker  -> { note: <raw string>, photos: [] } (don't destroy user data)
 * - encoded JSON w/ marker    -> { note: <decoded note>, photos: <decoded array> }
 */
export function decodeCustomerNote(raw: unknown): DecodedCustomerNote {
  if (raw == null) return { note: null, photos: [] };
  if (typeof raw !== "string") return { note: null, photos: [] };
  if (!raw.includes(CUSTOMER_META_MARKER)) {
    // Plain text note (no marker) — return as-is.
    return { note: raw, photos: [] };
  }
  try {
    const parsed = JSON.parse(raw) as {
      __kind?: string;
      note?: string | null;
      photos?: unknown;
    };
    const photos = Array.isArray(parsed.photos)
      ? (parsed.photos as unknown[]).filter(
          (p): p is string => typeof p === "string"
        )
      : [];
    return {
      note:
        typeof parsed.note === "string" || parsed.note === null
          ? (parsed.note ?? null)
          : null,
      photos,
    };
  } catch {
    // Malformed JSON containing the marker — treat as plain text so we don't
    // destroy the user's data.
    return { note: raw, photos: [] };
  }
}

/**
 * Re-encode a `{ note, photos }` pair back into the JSON shape stored in the
 * `note` TEXT column. Always uses the `customer_meta` marker so the next read
 * decodes it back correctly.
 */
export function encodeCustomerNote(
  note: string | null,
  photos: string[]
): string {
  return JSON.stringify({
    __kind: "customer_meta",
    note: note ?? null,
    photos,
  });
}
