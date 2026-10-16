// The "pick a food, choose an amount" model shared by Search, Saved and Recent, plus the
// rules for rescaling a logged entry from its stored base macros.

import type { Database } from "@/lib/supabase/database.types";
import { GRAMS_PER_UNIT, scaleMacros, type Macros, type Meal } from "@/lib/nutrition";
import { round } from "@/lib/units";
import type { ISODate } from "@/lib/dates";
import { confidenceForSource, safeUrl } from "./provenance";
import type { SearchResult } from "./search";

type Tables = Database["public"]["Tables"];
export type FoodRow = Tables["food_entries"]["Row"];
export type FoodInsert = Omit<Tables["food_entries"]["Insert"], "user_id" | "id"> & { id: string };
export type FoodUpdate = Tables["food_entries"]["Update"];
export type SavedFoodRow = Tables["saved_foods"]["Row"];
export type SavedFoodInsert = Omit<Tables["saved_foods"]["Insert"], "user_id">;

export const FOOD_SOURCES = ["manual", "saved_food", "saved_meal", "photo_ai", "chat_ai", "usda", "off", "assistant_handoff", "quick"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];
export type Confidence = "logged" | "verified" | "database" | "estimate";

export function asSource(s: string | null | undefined): FoodSource {
  return (FOOD_SOURCES as readonly string[]).includes(s ?? "") ? (s as FoodSource) : "manual";
}
export function asConfidence(c: string | null | undefined): Confidence {
  return c === "verified" || c === "database" || c === "estimate" ? c : "logged";
}

export interface PortionUnit {
  /** Stored unit ("g", "serving", "cup" …). */
  unit: string;
  /** Explains a generic serving, e.g. "1 serving = 2 cookies · 30 g". */
  hint?: string | null;
  /** Macros in `base` are for exactly `baseAmount` of `unit`. */
  baseAmount: number;
  base: Macros;
  gramsPerBase: number | null;
}

export interface FoodCandidate {
  key: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  confidence: Confidence;
  sourceName: string | null;
  sourceUrl: string | null;
  savedFoodId: string | null;
  units: PortionUnit[];
  defaultUnit: number;
  defaultAmount: number;
}

/* -------------------------------------------------------------- units */

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gr: "g", gram: "g", grams: "g", grm: "g",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  oz: "oz", ounce: "oz", ounces: "oz",
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece",
  slice: "slice", slices: "slice",
  scoop: "scoop", scoops: "scoop",
  bowl: "bowl", bowls: "bowl",
  plate: "plate", plates: "plate",
  serving: "serving", servings: "serving", portion: "serving",
};

/** Map a free-form unit to one of the app's units, or null when it isn't one. */
export function normalizeUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  return UNIT_ALIASES[u.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

export function stepFor(unit: string): number {
  switch (unit) {
    case "g":
      return 5;
    case "ml":
      return 10;
    case "oz":
    case "piece":
    case "slice":
    case "scoop":
    case "tbsp":
    case "tsp":
      return 0.5;
    default:
      return 0.25;
  }
}

export function amountBounds(unit: string): { min: number; max: number } {
  if (unit === "g" || unit === "ml") return { min: 1, max: 5000 };
  if (unit === "oz") return { min: 0.25, max: 200 };
  return { min: 0.25, max: 100 };
}

function gramsFixed(unit: string, amount: number): number | null {
  const per = GRAMS_PER_UNIT[unit];
  return per ? amount * per : null;
}

function saneGrams(gr: number | null): number | null {
  if (gr == null || !Number.isFinite(gr) || gr < 0 || gr > 20000) return null;
  return round(gr, 1);
}

/** Macros + grams for `amount` of a portion unit. */
export function portion(u: PortionUnit, amount: number): { macros: Macros; grams: number | null } {
  const macros = scaleMacros(u.base, u.baseAmount, amount);
  const gr = u.gramsPerBase != null && u.baseAmount > 0 ? (amount / u.baseAmount) * u.gramsPerBase : gramsFixed(u.unit, amount);
  return { macros, grams: saneGrams(gr) };
}

const macrosOf = (r: { calories: number; protein_g: number; carbs_g: number; fat_g: number }): Macros => ({
  calories: Number(r.calories) || 0,
  protein: Number(r.protein_g) || 0,
  carbs: Number(r.carbs_g) || 0,
  fat: Number(r.fat_g) || 0,
});

/* -------------------------------------------------------- candidates */

export function fromSearchResult(r: SearchResult): FoodCandidate {
  const su = normalizeUnit(r.servingUnit);
  const units: PortionUnit[] = [];
  let defaultAmount: number;
  if (su === "g" || su === "ml") {
    if (r.per100g && su === "g") units.push({ unit: "g", baseAmount: 100, base: r.per100g, gramsPerBase: 100 });
    else units.push({ unit: su, baseAmount: r.servingAmount, base: r.perServing, gramsPerBase: su === "g" ? r.servingAmount : r.servingGrams });
    defaultAmount = r.servingAmount;
    if (r.servingAmount !== 100) {
      units.push({
        unit: "serving",
        hint: `1 serving = ${round(r.servingAmount, 1)} ${su === "ml" ? "mL" : "g"}`,
        baseAmount: 1,
        base: r.perServing,
        gramsPerBase: su === "g" ? r.servingAmount : r.servingGrams,
      });
    }
  } else {
    const unit = su ?? "serving";
    const baseAmount = unit === "serving" ? 1 : r.servingAmount;
    const describe = unit === "serving" && !/^servings?$/i.test(r.servingUnit.trim());
    const hintParts = [describe ? `1 serving = ${round(r.servingAmount, 2)} ${r.servingUnit.trim()}` : null, r.servingGrams ? `${round(r.servingGrams, 0)} g` : null].filter(Boolean);
    units.push({ unit, hint: hintParts.length ? hintParts.join(" · ") : null, baseAmount, base: r.perServing, gramsPerBase: r.servingGrams });
    defaultAmount = baseAmount;
    if (r.per100g) units.push({ unit: "g", baseAmount: 100, base: r.per100g, gramsPerBase: 100 });
  }
  return {
    key: `${r.source}:${r.id}`,
    name: r.name.slice(0, 120),
    brand: r.brand ? r.brand.slice(0, 80) : null,
    source: r.source,
    confidence: "database",
    sourceName: r.sourceName ?? (r.source === "usda" ? "USDA FoodData Central" : "Open Food Facts"),
    sourceUrl: safeUrl(r.sourceUrl),
    savedFoodId: null,
    units,
    defaultUnit: 0,
    defaultAmount,
  };
}

export function fromSavedFood(f: SavedFoodRow): FoodCandidate {
  const unit = normalizeUnit(f.serving_unit) ?? (f.serving_unit.trim().slice(0, 24) || "serving");
  const base = macrosOf(f);
  const amount = Number(f.serving_amount) > 0 ? Number(f.serving_amount) : 1;
  const grams = f.grams != null && Number(f.grams) > 0 ? Number(f.grams) : null;
  const units: PortionUnit[] = [{ unit, baseAmount: amount, base, gramsPerBase: grams ?? gramsFixed(unit, amount) }];
  if (grams && unit !== "g") units.push({ unit: "g", baseAmount: grams, base, gramsPerBase: grams });
  return {
    key: `saved:${f.id}`,
    name: f.name,
    brand: f.brand,
    source: "saved_food",
    confidence: confidenceForSource(f.source),
    sourceName: f.source_name ?? (f.source === "usda" ? "USDA FoodData Central" : f.source === "off" ? "Open Food Facts" : null),
    sourceUrl: safeUrl(f.source_url),
    savedFoodId: f.id,
    units,
    defaultUnit: 0,
    defaultAmount: amount,
  };
}

/** Base macros for an entry; falls back to its current macros when no base was stored. */
export function entryBase(e: Pick<FoodRow, "amount" | "base_amount" | "base_calories" | "base_protein_g" | "base_carbs_g" | "base_fat_g" | "calories" | "protein_g" | "carbs_g" | "fat_g">): {
  baseAmount: number;
  base: Macros;
} {
  const ba = Number(e.base_amount);
  const base: Macros = {
    calories: Number(e.base_calories) || 0,
    protein: Number(e.base_protein_g) || 0,
    carbs: Number(e.base_carbs_g) || 0,
    fat: Number(e.base_fat_g) || 0,
  };
  const hasBase = ba > 0 && (base.calories > 0 || base.protein > 0 || base.carbs > 0 || base.fat > 0);
  const current = macrosOf(e);
  const currentEmpty = !current.calories && !current.protein && !current.carbs && !current.fat;
  if (hasBase || (ba > 0 && currentEmpty)) return { baseAmount: ba, base };
  return { baseAmount: Number(e.amount) > 0 ? Number(e.amount) : 1, base: current };
}

function entryGramsPerBase(e: Pick<FoodRow, "grams" | "amount">, baseAmount: number): number | null {
  const gr = e.grams != null ? Number(e.grams) : null;
  const amt = Number(e.amount);
  if (!gr || !(amt > 0)) return null;
  return round((gr * baseAmount) / amt, 2);
}

export function fromEntry(e: FoodRow): FoodCandidate {
  const { baseAmount, base } = entryBase(e);
  const gpb = entryGramsPerBase(e, baseAmount);
  const units: PortionUnit[] = [{ unit: e.unit, baseAmount, base, gramsPerBase: gpb }];
  if (gpb && e.unit !== "g") units.push({ unit: "g", baseAmount: gpb, base, gramsPerBase: gpb });
  return {
    key: `entry:${e.id}`,
    name: e.name,
    brand: e.brand,
    source: asSource(e.source),
    confidence: asConfidence(e.confidence),
    sourceName: e.source_name,
    sourceUrl: safeUrl(e.source_url),
    savedFoodId: e.saved_food_id,
    units,
    defaultUnit: 0,
    defaultAmount: Number(e.amount) > 0 ? Number(e.amount) : baseAmount,
  };
}

/* ---------------------------------------------------- writing entries */

export function buildEntry(
  c: FoodCandidate,
  o: { id: string; unitIndex: number; amount: number; meal: Meal; date: ISODate; eatenAt: string; groupId?: string | null },
): FoodInsert {
  const u = c.units[o.unitIndex] ?? c.units[0];
  const { macros, grams } = portion(u, o.amount);
  return {
    id: o.id,
    local_date: o.date,
    eaten_at: o.eatenAt,
    meal: o.meal,
    name: c.name.trim().slice(0, 120),
    brand: c.brand,
    amount: round(o.amount, 2),
    unit: u.unit.slice(0, 24),
    grams,
    calories: macros.calories,
    protein_g: macros.protein,
    carbs_g: macros.carbs,
    fat_g: macros.fat,
    base_amount: round(u.baseAmount, 2),
    base_calories: round(u.base.calories, 1),
    base_protein_g: round(u.base.protein, 1),
    base_carbs_g: round(u.base.carbs, 1),
    base_fat_g: round(u.base.fat, 1),
    source: c.source,
    confidence: c.confidence,
    source_name: c.sourceName,
    source_url: c.sourceUrl,
    saved_food_id: c.savedFoodId,
    meal_group_id: o.groupId ?? null,
  };
}

/** New macros for a changed amount, rescaled from the stored base (200 g → 300 g = ×1.5). */
export function rescaleEntry(e: FoodRow, amount: number): FoodUpdate {
  const { baseAmount, base } = entryBase(e);
  const m = scaleMacros(base, baseAmount, amount);
  const gpb = entryGramsPerBase(e, baseAmount);
  const gr = gpb ? (amount / baseAmount) * gpb : gramsFixed(e.unit, amount);
  return {
    amount: round(amount, 2),
    calories: m.calories,
    protein_g: m.protein,
    carbs_g: m.carbs,
    fat_g: m.fat,
    grams: saneGrams(gr),
    base_amount: round(baseAmount, 2),
    base_calories: round(base.calories, 1),
    base_protein_g: round(base.protein, 1),
    base_carbs_g: round(base.carbs, 1),
    base_fat_g: round(base.fat, 1),
  };
}

export function macrosEqual(a: Macros, b: Macros): boolean {
  return Math.round(a.calories) === Math.round(b.calories) && round(a.protein, 1) === round(b.protein, 1) && round(a.carbs, 1) === round(b.carbs, 1) && round(a.fat, 1) === round(b.fat, 1);
}

/**
 * "Edit macros directly": the typed numbers become the new base for the typed amount.
 * When the numbers really change they are the user's own, so database/AI provenance is cleared.
 */
export function directEdit(e: FoodRow, v: { amount: number; unit: string; macros: Macros }): FoodUpdate {
  const sameUnitGrams = v.unit === e.unit && e.grams != null && Number(e.amount) > 0 ? (Number(e.grams) * v.amount) / Number(e.amount) : null;
  const out: FoodUpdate = {
    amount: round(v.amount, 2),
    unit: v.unit.slice(0, 24),
    grams: saneGrams(gramsFixed(v.unit, v.amount) ?? sameUnitGrams),
    calories: Math.round(v.macros.calories),
    protein_g: round(v.macros.protein, 1),
    carbs_g: round(v.macros.carbs, 1),
    fat_g: round(v.macros.fat, 1),
    base_amount: round(v.amount, 2),
    base_calories: Math.round(v.macros.calories),
    base_protein_g: round(v.macros.protein, 1),
    base_carbs_g: round(v.macros.carbs, 1),
    base_fat_g: round(v.macros.fat, 1),
  };
  if (!macrosEqual(v.macros, macrosOf(e))) {
    out.source = "manual";
    out.confidence = "logged";
    out.source_name = null;
    out.source_url = null;
  }
  return out;
}

/* -------------------------------------------------------- saved foods */

export function savedFoodFromPortion(c: FoodCandidate, unitIndex: number, amount: number, favorite: boolean): SavedFoodInsert {
  const u = c.units[unitIndex] ?? c.units[0];
  const { macros, grams } = portion(u, amount);
  return {
    name: c.name.trim().slice(0, 120),
    brand: c.brand,
    serving_amount: round(amount, 2),
    serving_unit: u.unit.slice(0, 24),
    grams,
    calories: macros.calories,
    protein_g: macros.protein,
    carbs_g: macros.carbs,
    fat_g: macros.fat,
    is_favorite: favorite,
    source: c.source === "saved_food" ? "manual" : c.source,
    source_name: c.sourceName,
    source_url: c.sourceUrl,
  };
}

export function savedFoodFromEntry(e: FoodRow, favorite = false): SavedFoodInsert {
  const m = macrosOf(e);
  return {
    name: e.name,
    brand: e.brand,
    serving_amount: Number(e.amount) > 0 ? round(Number(e.amount), 2) : 1,
    serving_unit: e.unit,
    grams: e.grams != null ? Number(e.grams) : null,
    calories: m.calories,
    protein_g: m.protein,
    carbs_g: m.carbs,
    fat_g: m.fat,
    is_favorite: favorite,
    source: e.source === "saved_food" || e.source === "saved_meal" || e.source === "quick" ? "manual" : e.source,
    source_name: e.source_name,
    source_url: safeUrl(e.source_url),
  };
}

/** A copy of a logged entry on another day/time (used by "Copy to today"). Keeps base macros and provenance. */
export function cloneEntry(e: FoodRow, o: { id: string; date: ISODate; eatenAt: string; groupId: string | null }): FoodInsert {
  return {
    id: o.id,
    local_date: o.date,
    eaten_at: o.eatenAt,
    meal: e.meal,
    name: e.name,
    brand: e.brand,
    amount: Number(e.amount),
    unit: e.unit,
    grams: e.grams != null ? Number(e.grams) : null,
    calories: Number(e.calories),
    protein_g: Number(e.protein_g),
    carbs_g: Number(e.carbs_g),
    fat_g: Number(e.fat_g),
    base_amount: Number(e.base_amount),
    base_calories: Number(e.base_calories),
    base_protein_g: Number(e.base_protein_g),
    base_carbs_g: Number(e.base_carbs_g),
    base_fat_g: Number(e.base_fat_g),
    source: asSource(e.source),
    confidence: asConfidence(e.confidence),
    source_name: e.source_name,
    source_url: safeUrl(e.source_url),
    saved_food_id: e.saved_food_id,
    meal_group_id: o.groupId,
  };
}

/** Rows for a manually typed food: the typed numbers are the base for the typed amount. */
export function manualEntry(
  v: { name: string; brand: string | null; amount: number; unit: string; macros: Macros },
  o: { id: string; meal: Meal; date: ISODate; eatenAt: string; savedFoodId?: string | null },
): FoodInsert {
  return {
    id: o.id,
    local_date: o.date,
    eaten_at: o.eatenAt,
    meal: o.meal,
    name: v.name,
    brand: v.brand,
    amount: round(v.amount, 2),
    unit: v.unit.slice(0, 24),
    grams: saneGrams(gramsFixed(v.unit, v.amount)),
    calories: Math.round(v.macros.calories),
    protein_g: round(v.macros.protein, 1),
    carbs_g: round(v.macros.carbs, 1),
    fat_g: round(v.macros.fat, 1),
    base_amount: round(v.amount, 2),
    base_calories: Math.round(v.macros.calories),
    base_protein_g: round(v.macros.protein, 1),
    base_carbs_g: round(v.macros.carbs, 1),
    base_fat_g: round(v.macros.fat, 1),
    source: "manual",
    confidence: "logged",
    source_name: null,
    source_url: null,
    saved_food_id: o.savedFoodId ?? null,
    meal_group_id: null,
  };
}
