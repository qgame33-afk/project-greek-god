// Canonical storage units: pounds, inches, millilitres. Conversion happens only at display/input.

export type WeightUnit = "lb" | "kg";
export type LengthUnit = "in" | "cm";

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export function lbToKg(lb: number) {
  return lb / LB_PER_KG;
}
export function kgToLb(kg: number) {
  return kg * LB_PER_KG;
}

/** Convert a stored pound value to the display unit. */
export function toDisplayWeight(lb: number, unit: WeightUnit) {
  return unit === "kg" ? lbToKg(lb) : lb;
}

/** Convert a value typed in the display unit back to pounds for storage. */
export function fromDisplayWeight(v: number, unit: WeightUnit) {
  return unit === "kg" ? kgToLb(v) : v;
}

export function round(n: number, dp = 1) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** "183.4 lb" / "83.2 kg". Bodyweight always shows one decimal. */
export function formatBodyweight(lb: number | null | undefined, unit: WeightUnit, withUnit = true) {
  if (lb == null || !Number.isFinite(lb)) return "—";
  const v = round(toDisplayWeight(lb, unit), 1).toFixed(1);
  return withUnit ? `${v} ${unit}` : v;
}

/** Load on the bar: whole numbers when they are whole, else one decimal. kg snaps to the 0.5 kg grid (training/loads.ts displayLoad). */
export function formatLoad(lb: number | null | undefined, unit: WeightUnit, withUnit = true) {
  if (lb == null || !Number.isFinite(lb)) return "—";
  const v = unit === "kg" ? round(Math.round(toDisplayWeight(lb, unit) * 2) / 2, 1) : round(toDisplayWeight(lb, unit), 1);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return withUnit ? `${s} ${unit}` : s;
}

/** Signed change: "+1.2 lb" / "−0.4 kg" (uses a real minus sign). */
export function formatDelta(lb: number | null | undefined, unit: WeightUnit, dp = 1) {
  if (lb == null || !Number.isFinite(lb)) return "—";
  const v = round(toDisplayWeight(lb, unit), dp);
  if (v === 0) return `0 ${unit}`;
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)} ${unit}`;
}

export function toDisplayLength(inches: number, unit: LengthUnit) {
  return unit === "cm" ? inches * CM_PER_IN : inches;
}
export function fromDisplayLength(v: number, unit: LengthUnit) {
  return unit === "cm" ? v / CM_PER_IN : v;
}
export function formatLength(inches: number | null | undefined, unit: LengthUnit, withUnit = true) {
  if (inches == null || !Number.isFinite(inches)) return "—";
  const v = round(toDisplayLength(inches, unit), unit === "cm" ? 1 : 2);
  const s = unit === "cm" ? v.toFixed(1) : String(v);
  return withUnit ? `${s} ${unit}` : s;
}

/** 189.2 cm → 6′2.5″ */
export function formatHeight(cm: number | null | undefined, unit: LengthUnit) {
  if (cm == null) return "—";
  if (unit === "cm") return `${round(cm, 1)} cm`;
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = round(totalIn - ft * 12, 1);
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  return `${ft}′${Number.isInteger(inch) ? inch : inch.toFixed(1)}″`;
}

export function feetInchesToCm(ft: number, inch: number) {
  return (ft * 12 + inch) * CM_PER_IN;
}

export function formatMl(ml: number) {
  return ml >= 1000 ? `${round(ml / 1000, 2)} L` : `${Math.round(ml)} mL`;
}

export function formatLiters(ml: number, dp = 1) {
  return `${(ml / 1000).toFixed(dp)} L`;
}

/** Thousands separators without locale surprises: 3300 → "3,300" */
export function formatInt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Parse typed input. A comma grouping digits in threes is a thousands separator ("1,200" →
 * 1200); a lone comma is a decimal comma ("72,5" → 72.5); anything ambiguous ("1.234,5") or
 * malformed returns null rather than a guess.
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = input.trim().replace(/\s+/g, "");
  if (s === "") return null;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  let t: string;
  if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(body)) t = body.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(body)) t = body.replace(",", ".");
  else if (/^\d*\.?\d+$|^\d+\.$/.test(body)) t = body;
  else return null;
  const n = Number(t) * (neg ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}
