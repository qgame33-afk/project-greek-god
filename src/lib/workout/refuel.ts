// The Inscription's refuel card (docs/DESIGN-V2.md §3.3) as a pure rule: which planned meal to
// offer once a session is sealed, and how much of today's protein gap it closes. Arithmetic on
// the plan and the food log only (CALC) — the hook in components/workout/inscription/data.ts
// gathers the inputs.

import type { PlanMeal } from "@/lib/data/meals-model";
import type { Recipe } from "@/lib/meals/types";

export interface RefuelMeal {
  planned: PlanMeal;
  recipe: Recipe;
  /** Planned time, minutes since local midnight. */
  at: number;
  protein: number;
  kcal: number;
  carbs: number;
  fat: number;
}

export interface Refuel {
  /** "eaten": the meal just marked eaten on the card (still in the food log), kept as its confirmation. */
  kind: "meal" | "none" | "met" | "eaten";
  /** Grams of protein still to eat today (never below 0). */
  gap: number;
  goal: number;
  eaten: number;
  meal?: RefuelMeal;
}

/** Planned meals this many minutes before the session ended still count as the refuel (the Day Engine's rule). */
export const REFUEL_LEAD_MIN = 30;

export function pickRefuel(input: {
  date: string;
  /** Today's protein goal in grams (0 when unknown). */
  goal: number;
  /** Protein logged today, grams. */
  proteinEaten: number;
  meals: PlanMeal[];
  isLogged: (plannedMealId: string) => boolean;
  /** The meal's recipe, planned time and macros; null when its recipe is unknown. */
  resolve: (m: PlanMeal) => RefuelMeal | null;
  /** When the session ended, minutes since local midnight. */
  endMin: number;
  /**
   * The planned meal tapped Eaten on the card. While the food log holds it the card confirms that
   * meal instead of moving on to the next one (which would then sit beside "Eaten"); once it is
   * undone it is simply a candidate again.
   */
  keepId?: string | null;
}): Refuel {
  const goal = input.goal > 0 ? input.goal : 0;
  const eaten = Math.round(input.proteinEaten);
  const gap = Math.max(0, goal - eaten);
  if (input.keepId) {
    const kept = input.meals.find((m) => m.id === input.keepId && m.local_date === input.date && input.isLogged(m.id));
    const meal = kept ? input.resolve(kept) : null;
    if (meal) return { kind: "eaten", gap, goal, eaten, meal };
  }
  if (goal > 0 && gap === 0) return { kind: "met", gap, goal, eaten };
  const next = input.meals
    .filter((m) => m.local_date === input.date && !input.isLogged(m.id))
    .map((m) => input.resolve(m))
    .filter((x): x is RefuelMeal => !!x && x.at >= input.endMin - REFUEL_LEAD_MIN)
    .sort((a, b) => a.at - b.at)[0];
  return next ? { kind: "meal", gap, goal, eaten, meal: next } : { kind: "none", gap, goal, eaten };
}
