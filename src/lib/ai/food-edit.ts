// Review-screen editing model (pure): portion multiplier / grams edits that recalculate
// macros live, without ever losing the original analysis to rescale from.

import { clamp, round } from "@/lib/food/normalize";
import type { MacroSet } from "@/lib/food/types";
import { macrosForPortion } from "./food-pipeline";
import type { AIFoodItem } from "./food-schemas";

export interface EditableItem extends AIFoodItem {
  key: string;
  /** Portion the analysis returned — every edit rescales from here. */
  base: { grams: number | null; quantity: number; macros: MacroSet };
  mult: number;
}

export const MULT_STEP = 0.25;
export const MULT_MIN = 0.25;
export const MULT_MAX = 8;

export function toEditable(item: AIFoodItem, key: string): EditableItem {
  return { ...item, key, base: { grams: item.grams, quantity: item.quantity, macros: item.macros }, mult: 1 };
}

function recompute(e: EditableItem, grams: number | null, quantity: number, mult: number): EditableItem {
  const macros = macrosForPortion(e, e.base, { grams, quantity });
  return { ...e, grams, quantity, mult, macros };
}

/** ±0.25× portion stepper. */
export function withMultiplier(e: EditableItem, mult: number): EditableItem {
  const m = clamp(round(mult / MULT_STEP) * MULT_STEP, MULT_MIN, MULT_MAX);
  const grams = e.base.grams ? round(e.base.grams * m, 0) : null;
  const quantity = round(e.base.quantity * m, 2);
  return recompute(e, grams, quantity, m);
}

/** Exact grams typed by the user. */
export function withGrams(e: EditableItem, grams: number): EditableItem {
  const g = clamp(round(grams, 0), 1, 5000);
  if (!e.base.grams) {
    // no reference weight: becomes a weight-based item at the same density as the estimate
    const rebased: EditableItem = { ...e, base: { ...e.base, grams: g } };
    return recompute(rebased, g, e.quantity, e.mult);
  }
  const mult = g / e.base.grams;
  return recompute(e, g, round(e.base.quantity * mult, 2), round(mult, 2));
}

/** "1.25×" / "0.5×" */
export function multLabel(m: number) {
  return `${Number.isInteger(m) ? m : m.toFixed(2).replace(/0$/, "")}×`;
}

/** Drop a database match the user disagrees with: back to the model's estimate, same portion. */
export function withEstimate(e: EditableItem): EditableItem {
  const swapped: EditableItem = {
    ...e,
    provenance: "estimate",
    per100g: null,
    source: null,
    note: "Database match removed. Using the photo estimate.",
    base: { ...e.base, macros: e.estimate },
  };
  return recompute(swapped, e.grams, e.quantity, e.mult);
}
