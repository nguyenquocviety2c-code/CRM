import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password hashing utilities for staff accounts.
 *
 * Uses Node's built-in `crypto.scrypt` (no external dependencies) — scrypt is
 * the OWASP-recommended password hash. The stored format is:
 *
 *   scrypt$<salt-hex>$<hash-hex>
 *
 * where salt is 16 random bytes and the derived key is 64 bytes. This is
 * ~150 chars, well within a `text` column.
 *
 * `verifyPassword` returns `false` for any stored value that doesn't start
 * with `scrypt$` (e.g. legacy plaintext or null), so old rows simply fail
 * verification rather than crashing.
 */

const KEY_LEN = 64;
const SALT_LEN = 16;
const PREFIX = "scrypt$";

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LEN).toString("hex");
  return `${PREFIX}${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.startsWith(PREFIX)) return false;
  const rest = stored.slice(PREFIX.length);
  const dollarIdx = rest.indexOf("$");
  if (dollarIdx <= 0) return false;
  const salt = rest.slice(0, dollarIdx);
  const hashHex = rest.slice(dollarIdx + 1);
  if (!salt || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LEN) return false;
  const computed = scryptSync(plain, salt, KEY_LEN);
  // timingSafeEqual requires equal lengths — guaranteed by the check above.
  return timingSafeEqual(computed, expected);
}

/**
 * Returns true only when `stored` is a valid scrypt password hash (i.e. the
 * account has a REAL login password). Returns false for null, empty string,
 * or any non-scrypt value (legacy/corrupt). Used to decide whether the "old
 * password" field is required when changing/setting a password.
 */
export function hasPasswordHash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!stored.startsWith(PREFIX)) return false;
  const rest = stored.slice(PREFIX.length);
  const dollarIdx = rest.indexOf("$");
  if (dollarIdx <= 0) return false;
  const salt = rest.slice(0, dollarIdx);
  const hashHex = rest.slice(dollarIdx + 1);
  if (!salt || !hashHex) return false;
  return true;
}
