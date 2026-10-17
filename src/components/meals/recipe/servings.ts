// Servings for the recipe screen, the cooking mode and the food-log sheet. Pure (unit-tested).
//
// The stepper walks a ladder of kitchen-friendly amounts: quarter steps around one serving
// (where the planner's own picks live: 1¼, 1½, 1¾), half steps to 4, then whole servings up to
// the planned meal's limit of 6 (1 → 2 → 4 when cooking for more). Off-ladder values (a 1.1 from
// somewhere else) step to the next ladder value in that direction.

import { MAX_SERVINGS, MIN_SERVINGS } from "@/lib/data/meals-model";
import { fractionText } from "@/lib/meals/recipe";
import type { WhyReason } from "@/lib/meals/types";

export const SERVING_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6] as const;

const EPS = 1e-6;

/** Clamp to what a planned meal can store (0.25–6), rounded to 2 decimals. */
export function clampServings(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return 1;
  return Math.round(Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, s)) * 100) / 100;
}

/** The next ladder value up (dir 1) or down (dir −1), clamped at the ends. */
export function stepServings(current: number, dir: 1 | -1): number {
  const c = clampServings(current);
  if (dir > 0) return SERVING_STEPS.find((v) => v > c + EPS) ?? SERVING_STEPS[SERVING_STEPS.length - 1];
  for (let i = SERVING_STEPS.length - 1; i >= 0; i--) if (SERVING_STEPS[i] < c - EPS) return SERVING_STEPS[i];
  return SERVING_STEPS[0];
}

export const canStep = (current: number, dir: 1 | -1) => stepServings(current, dir) !== clampServings(current);

/**
 * The planned-meal patch for a new servings count, or null when nothing changes. "Why this
 * meal?" was written for the size the planner picked ("Fits dinner: 952 kcal, 64 g protein"):
 * once the user picks another size that line no longer describes the meal, so it goes. The
 * other reasons (taste, difficulty, favourite) don't depend on the size and stay.
 */
export function servingsPatch(
  meal: { servings: number; reason: readonly WhyReason[] | null },
  servings: number,
): { servings: number; reason?: WhyReason[] } | null {
  const s = clampServings(servings);
  if (Math.abs(s - Number(meal.servings)) < EPS) return null;
  return meal.reason?.some((r) => r.kind === "macro_fit") ? { servings: s, reason: meal.reason.filter((r) => r.kind !== "macro_fit") } : { servings: s };
}

/** "1¼", "½", "2", "1.1" (off-ladder values keep up to 2 decimals). */
export function servingsNumber(s: number): string {
  const c = clampServings(s);
  const t = fractionText(c);
  return /[¼½¾⅓⅔⅛]|^\d+$/.test(t) ? t : String(Math.round(c * 100) / 100);
}
