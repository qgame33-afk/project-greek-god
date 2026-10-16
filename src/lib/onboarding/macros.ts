import { carbsForGoal, kcalFromMacros } from "@/lib/nutrition";
import { formatInt } from "@/lib/units";

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroLine {
  /** True when protein × 4 + carbs × 4 + fat × 9 lands within `tolerance` kcal of the calorie goal. */
  ok: boolean;
  /** Calories implied by the macros. */
  total: number;
  /** total − calories (positive = macros add up to more than the goal). */
  diff: number;
  /** "Macros = 3,301 kcal ✓" or "Macros total 3,520 kcal, 220 above target". */
  text: string;
}

/**
 * Consistency line for a set of calorie + macro targets. Targets are allowed a small rounding
 * window (carbs are whole grams, so ±2 kcal is normal); anything beyond it is called out.
 */
export function macroLine(t: MacroTargets, tolerance = 25): MacroLine {
  const total = Math.round(kcalFromMacros({ protein: t.protein, carbs: t.carbs, fat: t.fat }));
  const diff = total - Math.round(t.calories);
  const ok = Math.abs(diff) <= tolerance;
  const text = ok
    ? `Macros = ${formatInt(total)} kcal ✓`
    : `Macros total ${formatInt(total)} kcal, ${formatInt(Math.abs(diff))} ${diff > 0 ? "above" : "below"} target`;
  return { ok, total, diff, text };
}

/** Carbs that balance the calorie goal after protein and fat, never negative. */
export function balancedCarbs(calories: number, protein: number, fat: number) {
  return carbsForGoal(calories, protein, fat);
}

/** True when protein and fat alone already exceed the calorie goal (carbs would be negative). */
export function macrosOverflow(calories: number, protein: number, fat: number) {
  return protein * 4 + fat * 9 > calories;
}
