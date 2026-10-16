// The "Add to food log" confirm sheet's form state. Pure (unit-tested).
//
// The kcal / protein / carbs / fat fields start as the recipe's estimate for the chosen
// servings and follow the servings stepper. Once the user types over a value, the sheet keeps
// their numbers: changing servings then scales what they typed by the same ratio, and "Use the
// estimate" puts the recipe's values back.

import { kcalFromMacros } from "@/lib/nutrition";
import type { Macros } from "@/lib/meals/types";

export type MacroField = "kcal" | "protein" | "carbs" | "fat";
export const MACRO_FIELDS: MacroField[] = ["kcal", "protein", "carbs", "fat"];

export const MACRO_LIMITS: Record<MacroField, number> = { kcal: 20000, protein: 2000, carbs: 3000, fat: 2000 };

export interface LogDraft {
  servings: number;
  fields: Record<MacroField, string>;
  /** True once the user typed over any value. */
  edited: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Display text for a value: kcal whole, grams to one decimal (no trailing ".0"). */
export function fieldText(k: MacroField, v: number): string {
  if (!Number.isFinite(v)) return "";
  return k === "kcal" ? String(Math.round(v)) : String(r1(v));
}

/** The recipe's estimate for `servings` (per-serving macros × servings). */
export function estimateFor(perServing: Macros, servings: number): Macros {
  return {
    kcal: Math.round(perServing.kcal * servings),
    protein: r1(perServing.protein * servings),
    carbs: r1(perServing.carbs * servings),
    fat: r1(perServing.fat * servings),
  };
}

function fieldsOf(m: Macros): Record<MacroField, string> {
  return { kcal: fieldText("kcal", m.kcal), protein: fieldText("protein", m.protein), carbs: fieldText("carbs", m.carbs), fat: fieldText("fat", m.fat) };
}

export function newDraft(perServing: Macros, servings: number): LogDraft {
  return { servings, fields: fieldsOf(estimateFor(perServing, servings)), edited: false };
}

/** A typed number ("42", "42.5", "42,5", " 1,200 ") or null when it isn't one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!t) return null;
  // "1,200" (thousands) vs "42,5" (decimal comma)
  const norm = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** New servings: the estimate follows, or the user's own numbers scale by the same ratio. */
export function withServings(d: LogDraft, servings: number, perServing: Macros): LogDraft {
  if (!(servings > 0) || servings === d.servings) return d;
  if (!d.edited) return newDraft(perServing, servings);
  const ratio = servings / d.servings;
  const fields = { ...d.fields };
  for (const k of MACRO_FIELDS) {
    const n = parseNumber(d.fields[k]);
    if (n != null) fields[k] = fieldText(k, n * ratio);
  }
  return { servings, fields, edited: true };
}

export function editField(d: LogDraft, k: MacroField, text: string): LogDraft {
  // keep what the user types (only digits and one separator), never reformat mid-typing
  const clean = text.replace(/[^\d.,]/g, "").slice(0, 8);
  return { ...d, fields: { ...d.fields, [k]: clean }, edited: true };
}

export function resetDraft(d: LogDraft, perServing: Macros): LogDraft {
  return newDraft(perServing, d.servings);
}

export type DraftResult = { ok: true; macros: Macros } | { ok: false; errors: Partial<Record<MacroField, string>> };

/** Validated totals for the entry, or a readable error per field. */
export function draftMacros(d: LogDraft): DraftResult {
  const errors: Partial<Record<MacroField, string>> = {};
  const out = {} as Macros;
  for (const k of MACRO_FIELDS) {
    const n = parseNumber(d.fields[k]);
    if (n == null) errors[k] = "Enter a number";
    else if (n < 0 || n > MACRO_LIMITS[k]) errors[k] = `0–${MACRO_LIMITS[k].toLocaleString("en-US")}`;
    else out[k] = k === "kcal" ? Math.round(n) : r1(n);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, macros: out };
}

/**
 * A soft check (never blocks): typed macros that don't add up to the calories, beyond 15 % and
 * 60 kcal. "Protein, carbs and fat add up to 812 kcal; you entered 700."
 */
export function macroMismatch(m: Macros): string | null {
  const fromMacros = kcalFromMacros({ protein: m.protein, carbs: m.carbs, fat: m.fat });
  if (!(fromMacros > 0) && !(m.kcal > 0)) return null;
  const diff = Math.abs(fromMacros - m.kcal);
  if (diff <= 60 || diff <= 0.15 * Math.max(fromMacros, m.kcal)) return null;
  return `Protein, carbs and fat add up to ${Math.round(fromMacros).toLocaleString("en-US")} kcal; you entered ${Math.round(m.kcal).toLocaleString("en-US")}.`;
}
