/**
 * Phone number search & relevance ranking utilities.
 *
 * The CRM's customer search boxes used to match phone numbers by PREFIX only
 * (`phone.startsWith(query)`). That meant typing a suffix or a middle chunk of
 * a phone number returned nothing. These helpers enable SUBSTRING matching
 * (the query can appear anywhere in the phone: prefix, middle, or suffix) AND
 * rank results by relevance so the best matches are suggested first.
 *
 * Ranking rule (per the product requirement:
 * "các khách hàng có số tương ứng nhiều nhất thì gợi ý đưa lên đầu tiên"):
 *   1. Exact match          → highest priority
 *   2. More occurrences      → "số tương ứng nhiều nhất" → suggested first
 *   3. Prefix match bonus    → "đầu số"
 *   4. Suffix match bonus    → "đuôi số"
 *   5. Closer length          → slight bonus (less noise around the query)
 *
 * A score of 0 means "no match" — the phone does not contain the query at all.
 */

/** Count non-overlapping occurrences of `needle` inside `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Score how well a phone number matches a search query.
 *
 * The query may appear ANYWHERE in the phone (substring / suffix / prefix).
 * Returns 0 when the phone does not contain the query.
 */
export function scorePhoneMatch(
  phone: string | null | undefined,
  query: string | null | undefined
): number {
  if (!phone || !query) return 0;
  const p = String(phone).trim();
  const q = String(query).trim();
  if (!p || !q) return 0;
  // Phone shorter than the query cannot contain it.
  if (p.length < q.length) return 0;

  const occurrences = countOccurrences(p, q);
  if (occurrences === 0) return 0;

  // Each occurrence is the primary signal — "số tương ứng nhiều nhất".
  let score = occurrences * 100;

  if (p === q) score += 1000; // exact match → always first
  if (p.startsWith(q)) score += 50; // "đầu số" bonus
  if (p.endsWith(q)) score += 30; // "đuôi số" bonus

  // Prefer phones whose length is close to the query (less surrounding noise).
  // e.g. searching "098" → "0981234567" beats "098000000098" when both have 1
  // occurrence, because the first is closer in length to what was typed.
  score += Math.max(0, 20 - (p.length - q.length));

  return score;
}

/**
 * Does the phone CONTAIN the query anywhere (substring/suffix/prefix)?
 * Cheaper than `scorePhoneMatch` when you only need a boolean.
 */
export function phoneContains(
  phone: string | null | undefined,
  query: string | null | undefined
): boolean {
  if (!phone || !query) return false;
  const p = String(phone).trim();
  const q = String(query).trim();
  if (!p || !q || p.length < q.length) return false;
  return p.includes(q);
}

/**
 * Sort a list of items (anything with a `phone` field) by phone relevance to
 * the query, best matches first. Items that don't match keep their relative
 * order (stable sort). Returns a NEW array.
 */
export function sortByPhoneRelevance<T extends { phone?: string | null }>(
  items: T[],
  query: string | null | undefined
): T[] {
  const q = query?.trim() ?? "";
  if (!q) return items;
  return items
    .map((item) => ({ item, score: scorePhoneMatch(item.phone, q) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/**
 * Decide whether a free-text search term should be treated as a PHONE query
 * (and thus trigger phone-relevance ranking) vs. a name/code query.
 *
 * A term is "phone-like" when it contains NO letters and at least 2 digits
 * (after stripping common phone separators: spaces, dashes, dots, plus,
 * parentheses). Vietnamese letters are treated as letters so names like
 * "Nguyễn" or codes like "KH001" are NOT considered phone-like.
 */
export function isPhoneLikeQuery(search: string | null | undefined): boolean {
  if (!search) return false;
  const s = search.trim();
  if (s.length < 2) return false;
  // Any letter (incl. Vietnamese) → name/code search, not a phone search.
  if (/[a-zA-Zà-ỹÀ-Ỹ]/.test(s)) return false;
  const digits = s.replace(/[\s\-+.()]/g, "");
  return digits.length >= 2 && /^\d+$/.test(digits);
}
