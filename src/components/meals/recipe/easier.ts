// "Make this easier" on the recipe screen: what changes, and how the easier recipe is swapped
// into a planned meal. Pure (unit-tested); the engine's simplifyRecipe finds the easier recipe.

import { HISTORY_CAP } from "@/lib/data/meals-model";
import { ingredientCount, recipeMacros } from "@/lib/meals/recipe";
import type { PlannedMeal, Recipe, WhyReason } from "@/lib/meals/types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The planned-meal patch that swaps in the easier recipe. The old pick goes on `history`, so
 * Undo (the engine's undoRegenerate) puts it back. "Why this meal?" keeps only the taste reasons
 * (tags survive simplifying) and leads with what was made easier; reasons quoting the old
 * recipe's own numbers (time, macros, cost, what you have) no longer hold, so they go.
 */
export function easierSwapPatch(
  meal: Pick<PlannedMeal, "recipe_key" | "servings" | "reason" | "history">,
  next: Pick<Recipe, "key" | "minutes" | "ingredients" | "steps">,
): Pick<PlannedMeal, "recipe_key" | "reason" | "history"> {
  const kept = (meal.reason ?? []).filter((r) => r.kind === "liked_similar" || r.kind === "liked_cuisine");
  const made: WhyReason = {
    kind: "difficulty_fit",
    text: `Made easier: ${next.minutes} min, ${plural(ingredientCount(next), "ingredient")}, ${plural(next.steps.length, "step")}`,
    weight: 1,
  };
  return {
    recipe_key: next.key,
    reason: [made, ...kept],
    history: [...(meal.history ?? []), { recipe_key: meal.recipe_key, servings: meal.servings, reason: meal.reason ?? null }].slice(-HISTORY_CAP),
  };
}

export interface CompareRow {
  label: string;
  before: string;
  after: string;
  /** The easier version is better on this line (shown in a success tone); equal or worse stays quiet. */
  better: boolean;
}

/** Before → after for the confirm sheet: time, ingredients, steps, and the per-serving estimate. */
export function compareRecipes(a: Recipe, b: Recipe): CompareRow[] {
  const ma = recipeMacros(a, 1);
  const mb = recipeMacros(b, 1);
  const ia = ingredientCount(a);
  const ib = ingredientCount(b);
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  return [
    { label: "Time", before: `${a.minutes} min`, after: `${b.minutes} min`, better: b.minutes < a.minutes },
    { label: "Ingredients", before: String(ia), after: String(ib), better: ib < ia },
    { label: "Steps", before: String(a.steps.length), after: String(b.steps.length), better: b.steps.length < a.steps.length },
    { label: "Calories", before: fmt(ma.kcal), after: fmt(mb.kcal), better: false },
    { label: "Protein", before: `${fmt(ma.protein)} g`, after: `${fmt(mb.protein)} g`, better: false },
  ];
}
