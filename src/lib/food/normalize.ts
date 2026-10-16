// Pure helpers shared by the database clients and the AI pipeline: rounding, bounds,
// text sanitising, macro maths. No I/O.

import type { MacroSet } from "./types";

export const ZERO_MACROS: MacroSet = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** Hard ceilings that match the food_entries check constraints (per entry). */
export const ENTRY_LIMITS = { calories: 20000, protein: 2000, carbs: 3000, fat: 2000, grams: 20000 } as const;

export function round(n: number, dp = 0) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** kcal integer, grams to one decimal, never negative or non-finite. */
export function tidyMacros(m: Partial<MacroSet>, limits: MacroSet = ENTRY_LIMITS): MacroSet {
  const f = (v: unknown, hi: number, dp: number) => {
    const n = num(v);
    return n == null ? 0 : round(clamp(n, 0, hi), dp);
  };
  return {
    calories: f(m.calories, limits.calories, 0),
    protein: f(m.protein, limits.protein, 1),
    carbs: f(m.carbs, limits.carbs, 1),
    fat: f(m.fat, limits.fat, 1),
  };
}

export function kcalFromMacros(m: Pick<MacroSet, "protein" | "carbs" | "fat">) {
  return m.protein * 4 + m.carbs * 4 + m.fat * 9;
}

/** Macros for `grams` of a food given its per-100 g values. */
export function macrosForGrams(per100g: MacroSet, grams: number): MacroSet {
  if (!(grams > 0)) return { ...ZERO_MACROS };
  const f = grams / 100;
  return tidyMacros({ calories: per100g.calories * f, protein: per100g.protein * f, carbs: per100g.carbs * f, fat: per100g.fat * f });
}

/** Linear rescale of a macro set (portion multiplier). */
export function scaleMacroSet(m: MacroSet, factor: number): MacroSet {
  if (!(factor >= 0) || !Number.isFinite(factor)) return { ...ZERO_MACROS };
  return tidyMacros({ calories: m.calories * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor });
}

export function sumMacroSets(list: MacroSet[]): MacroSet {
  const t = list.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), {
    ...ZERO_MACROS,
  });
  return { calories: round(t.calories), protein: round(t.protein, 1), carbs: round(t.carbs, 1), fat: round(t.fat, 1) };
}

/**
 * Plausibility of a per-100 g record from a database. Rejects impossible densities and
 * records whose stated energy wildly disagrees with their macros (bad crowd-sourced data).
 */
export function plausiblePer100g(m: MacroSet | null): m is MacroSet {
  if (!m) return false;
  const { calories, protein, carbs, fat } = m;
  if ([calories, protein, carbs, fat].some((v) => !Number.isFinite(v) || v < 0)) return false;
  if (calories > 905 || protein > 100 || carbs > 100 || fat > 100) return false;
  if (protein + carbs + fat > 101) return false;
  if (calories === 0 && protein + carbs + fat === 0) return true; // water, diet soda, black coffee
  const derived = kcalFromMacros(m);
  // Alcohol, polyols and fibre make energy legitimately differ; only reject gross mismatches.
  if (calories < 5 && derived > 40) return false;
  if (derived > 0 && calories > 0 && (calories / derived > 2.6 || derived / calories > 1.6)) return false;
  return true;
}

/* -------------------------------------------------------------- text */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"'\]]+/gi;
const MD_LINK_RE = /\[([^\]]{0,200})\]\((?:[^()\s]|\([^()\s]*\))*\)/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/** Remove every URL (bare or markdown link target) — the model never gets to cite links. */
export function stripUrls(s: string): string {
  return s
    .replace(MD_LINK_RE, "$1")
    .replace(URL_RE, "")
    .replace(/\(\s*\)/g, "");
}

/** Single-line plain text: no control chars, URLs, markdown emphasis or HTML; collapsed and capped. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  let s = stripUrls(v.replace(CONTROL_RE, ""));
  s = s.replace(/<[^>]*>/g, "").replace(/[*_`#>|]+/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

/** Multi-line markdown text from the model, with links stripped and length capped. */
export function cleanMarkdown(v: unknown, max = 2400): string {
  if (typeof v !== "string") return "";
  let s = stripUrls(v.replace(CONTROL_RE, "")).replace(/<[^>]*>/g, "");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

/** "CHICKEN BREAST, BONELESS" → "Chicken breast, boneless" (only for all-caps labels). */
export function tidyName(name: string): string {
  const s = name.replace(/\s+/g, " ").trim();
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    const lower = s.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return s;
}

/** "GIANT EAGLE" → "Giant Eagle" (brands keep their own capitalisation otherwise). */
export function tidyBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const s = brand.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    return s.toLowerCase().replace(/(^|[\s\-/&.(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  }
  return s;
}

/** True only for absolute http(s) URLs on an allow-listed host. */
export function isAllowedUrl(url: unknown, hosts: string[]): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

/** True for any absolute http(s) URL (used for user-pasted handoff sources). */
export function isHttpUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 600) return false;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const DATABASE_HOSTS = ["fdc.nal.usda.gov", "openfoodfacts.org"];

const NO_PLURAL = new Set(["g", "kg", "ml", "l", "oz", "lb", "tbsp", "tsp", "fl oz", "serving size"]);

/** "2 cup" → "2 cups", "1 slice", "250 g", "3 patty" → "3 patties". */
export function unitLabel(quantity: number, unit: string): string {
  const u = unit.trim();
  if (quantity === 1 || NO_PLURAL.has(u.toLowerCase()) || /s$/i.test(u)) return u;
  if (/[^aeiou]y$/i.test(u)) return u.slice(0, -1) + "ies";
  if (/(ch|sh|x)$/i.test(u)) return u + "es";
  return u + "s";
}
