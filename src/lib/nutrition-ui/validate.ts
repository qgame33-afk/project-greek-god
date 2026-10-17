// Validation for hand-entered foods (manual log, edit-macros, saved food editor).
// Hard limits mirror the database checks; the calorie/macro mismatch is a soft note only.

import { kcalFromMacros, macrosConsistent, type Macros } from "@/lib/nutrition";
import { formatInt, round } from "@/lib/units";
import { parseFoodNumber } from "./number";
import { normalizeUnit } from "./portion";

export interface FoodForm {
  name: string;
  brand: string;
  amount: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export type FoodErrors = Partial<Record<keyof FoodForm, string>>;

export interface ValidFood {
  name: string;
  brand: string | null;
  amount: number;
  unit: string;
  macros: Macros;
  /** True when calories were left blank and taken from the macros. */
  caloriesFromMacros: boolean;
}

export const LIMITS = {
  name: 120,
  brand: 80,
  unit: 24,
  amount: 100000,
  calories: 20000,
  protein: 2000,
  carbs: 3000,
  fat: 2000,
} as const;

function num(raw: string, label: string, max: number, required: boolean): { value: number | null; error?: string } {
  const t = raw.trim();
  if (t === "") return required ? { value: null, error: `Enter ${label}.` } : { value: 0 };
  const n = parseFoodNumber(t);
  if (n == null) return { value: null, error: "Enter a number." };
  if (n < 0) return { value: null, error: "Can't be negative." };
  if (n > max) return { value: null, error: `That's above ${formatInt(max)}. Check the number.` };
  return { value: n };
}

export function validateFoodForm(f: FoodForm, opts: { requireName?: boolean } = {}): { ok: true; value: ValidFood } | { ok: false; errors: FoodErrors } {
  const errors: FoodErrors = {};
  const name = f.name.trim().replace(/\s+/g, " ");
  if (opts.requireName !== false) {
    if (!name) errors.name = "Enter a food name.";
    else if (name.length > LIMITS.name) errors.name = `Keep it under ${LIMITS.name} characters.`;
  }
  const brand = f.brand.trim();
  if (brand.length > LIMITS.brand) errors.brand = `Keep it under ${LIMITS.brand} characters.`;

  const amountT = f.amount.trim();
  const amount = parseFoodNumber(amountT);
  if (amountT === "") errors.amount = "Enter an amount.";
  else if (amount == null) errors.amount = "Enter a number.";
  else if (amount <= 0) errors.amount = "Enter an amount above 0.";
  else if (amount > LIMITS.amount) errors.amount = "That amount is too large.";

  const unitRaw = f.unit.trim();
  const unit = normalizeUnit(unitRaw) ?? unitRaw.toLowerCase();
  if (!unit) errors.unit = "Choose a unit.";
  else if (unit.length > LIMITS.unit) errors.unit = `Keep it under ${LIMITS.unit} characters.`;

  const p = num(f.protein, "protein", LIMITS.protein, false);
  const c = num(f.carbs, "carbs", LIMITS.carbs, false);
  const fa = num(f.fat, "fat", LIMITS.fat, false);
  if (p.error) errors.protein = p.error;
  if (c.error) errors.carbs = c.error;
  if (fa.error) errors.fat = fa.error;

  const anyMacro = (p.value ?? 0) + (c.value ?? 0) + (fa.value ?? 0) > 0;
  let caloriesFromMacros = false;
  let calories: number | null = null;
  if (f.calories.trim() === "" && anyMacro && !p.error && !c.error && !fa.error) {
    calories = Math.round(kcalFromMacros({ protein: p.value ?? 0, carbs: c.value ?? 0, fat: fa.value ?? 0 }));
    caloriesFromMacros = true;
    if (calories > LIMITS.calories) errors.calories = "Those macros add up to too many calories.";
  } else {
    const k = num(f.calories, "calories (0 is fine)", LIMITS.calories, true);
    if (k.error) errors.calories = k.error;
    calories = k.value;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      brand: brand || null,
      amount: round(amount!, 2),
      unit,
      macros: { calories: Math.round(calories!), protein: round(p.value ?? 0, 1), carbs: round(c.value ?? 0, 1), fat: round(fa.value ?? 0, 1) },
      caloriesFromMacros,
    },
  };
}

/** Live preview of what the form currently adds up to (ignores invalid fields). */
export function previewMacros(f: Pick<FoodForm, "calories" | "protein" | "carbs" | "fat">): { macros: Macros; derived: number; caloriesBlank: boolean } {
  const n = (s: string) => {
    const v = parseFoodNumber(s);
    return v != null && v >= 0 ? v : 0;
  };
  const protein = n(f.protein);
  const carbs = n(f.carbs);
  const fat = n(f.fat);
  const derived = Math.round(kcalFromMacros({ protein, carbs, fat }));
  const caloriesBlank = f.calories.trim() === "";
  return { macros: { calories: caloriesBlank ? derived : n(f.calories), protein, carbs, fat }, derived, caloriesBlank };
}

/**
 * "Macros add to 612 kcal; you entered 540." — null when they agree (±10%) or there is
 * nothing to compare. 0 kcal is fine for a food with no macros (water, black coffee), but
 * 0 kcal with 50 g of protein is a slip worth pointing out.
 */
export function consistencyNote(m: Macros): string | null {
  const derived = Math.round(kcalFromMacros(m));
  if (derived === 0 || m.calories < 0) return null;
  if (m.calories > 0 && macrosConsistent(m, 0.1)) return null;
  return `Macros add to ${formatInt(derived)} kcal; you entered ${formatInt(m.calories)}.`;
}

/**
 * Why a computed entry (a rescaled amount or a picked portion) can't be saved: the
 * database's per-entry limits. Null when it fits. Shown in place of Save, never after it.
 */
export function limitError(m: Macros): string | null {
  if (round(m.calories, 1) > LIMITS.calories) return `That's ${formatInt(m.calories)} kcal, above ${formatInt(LIMITS.calories)}. Lower the amount.`;
  const grams: [number, number, string][] = [
    [m.protein, LIMITS.protein, "protein"],
    [m.carbs, LIMITS.carbs, "carbs"],
    [m.fat, LIMITS.fat, "fat"],
  ];
  for (const [value, max, label] of grams) {
    if (round(value, 1) > max) return `That's ${formatInt(value)} g ${label}, above ${formatInt(max)} g. Lower the amount.`;
  }
  return null;
}

/** Soft check for a likely extra digit: one entry bigger than most people's whole day. */
export const BIG_ENTRY_KCAL = 4000;
export function sizeNote(m: Macros): string | null {
  if (!(m.calories > BIG_ENTRY_KCAL)) return null;
  return `${formatInt(m.calories)} kcal in one entry. Check for an extra digit.`;
}

/** Macros that physically can't fit in the stated weight (only checkable for grams). */
export function weightNote(amount: number | null, unit: string, m: Macros): string | null {
  if (amount == null || !(amount > 0) || unit !== "g") return null;
  const total = m.protein + m.carbs + m.fat;
  if (total <= amount * 1.02) return null;
  return `Macros weigh ${formatInt(total)} g, more than the ${formatInt(amount)} g portion.`;
}

export function emptyForm(partial: Partial<FoodForm> = {}): FoodForm {
  return { name: "", brand: "", amount: "1", unit: "serving", calories: "", protein: "", carbs: "", fat: "", ...partial };
}

/** Number → text field value without trailing noise ("12.5", "0", ""). */
export function fieldText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(round(n, 2));
}
