/**
 * Masks a sensitive numeric-ish identifier (bank account number, ID
 * number, etc.) for display — keeps the last 4 characters, replaces
 * everything before that with bullets. Used only in admin-facing
 * responses: decrypt server-side, mask server-side, never send the
 * plaintext to a client at all (see MASTER REQUIREMENTS §3 — "never
 * expose full banking details unnecessarily").
 *
 * A short input (<=4 chars) is returned unmasked rather than as an
 * all-bullet string with no distinguishing digits — there's nothing
 * meaningful left to hide once every character is "the last 4," and an
 * admin still needs to be able to tell two short values apart.
 */
export function maskAccountNumber(plain: string): string {
  if (plain.length <= 4) return plain;
  const last4 = plain.slice(-4);
  return "•".repeat(plain.length - 4) + last4;
}
