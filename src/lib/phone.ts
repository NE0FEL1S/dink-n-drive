/**
 * PH mobile numbers: customers type `09XXXXXXXXX`; the database stores
 * `+639XXXXXXXXX` (checked by a constraint).
 */

/** Accepts 09XXXXXXXXX (spaces/dashes allowed), +639XXXXXXXXX or 639XXXXXXXXX. Returns +639XXXXXXXXX or null. */
export function toE164PhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const match = /^(?:\+?63|0)(9\d{9})$/.exec(digits);
  return match ? `+63${match[1]}` : null;
}

/** +639171234567 → 09171234567 (the format customers type). */
export function toLocalPhMobile(e164: string | null | undefined): string {
  if (!e164) return "";
  return /^\+639\d{9}$/.test(e164) ? `0${e164.slice(3)}` : e164;
}
