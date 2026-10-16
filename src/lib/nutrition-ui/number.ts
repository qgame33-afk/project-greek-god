// Typed numbers in food forms. A comma is read as a thousands separator when it groups
// digits in threes ("1,200" kcal = 1200), otherwise as a decimal comma ("12,5" g = 12.5).
// Anything ambiguous or malformed is rejected rather than guessed at, so "1,200" can
// never be stored as 1.2.

const GROUPED = /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/;
const PLAIN = /^\d*\.?\d+$|^\d+\.$/;
const DECIMAL_COMMA = /^\d+,\d+$/;

/** A non-negative number from a food field, or null when it can't be read unambiguously. */
export function parseFoodNumber(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = input.trim().replace(/\s+/g, "");
  if (s === "") return null;
  let t: string;
  if (GROUPED.test(s)) t = s.replace(/,/g, "");
  else if (DECIMAL_COMMA.test(s)) t = s.replace(",", ".");
  else if (PLAIN.test(s)) t = s;
  else if (/^-\d*\.?\d+$/.test(s)) t = s; // negative: parsed so validation can say "Can't be negative."
  else return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
