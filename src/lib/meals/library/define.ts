// Authoring helpers for the recipe library. Library files describe ONE serving with these
// helpers; `index.ts` normalises every recipe (grams, nutrition, allergens, kinds and cost come
// from the ingredient database, never from these files).

import type { Recipe, RecipeIngredient, RecipeStep, Unit } from "../types";

export type LibraryRecipeDef = Omit<Recipe, "servings" | "origin" | "cost" | "nutrition" | "allergens" | "kinds" | "baseKey"> & {
  key: `lib:${string}`;
};

/** A library recipe before normalisation. `cost` is a placeholder until `normalizeRecipe` prices it. */
export function lib(def: LibraryRecipeDef): Recipe {
  return { ...def, servings: 1, origin: "library", cost: 1 };
}

/** An ingredient line for one serving. */
export function i(key: string, qty: number, unit: Unit, note?: string): RecipeIngredient {
  return note ? { key, qty, unit, note } : { key, qty, unit };
}

/** An optional line (garnish, topping, dip): shown, but not counted in nutrition or effort. */
export function opt(key: string, qty: number, unit: Unit, note?: string): RecipeIngredient {
  return { ...i(key, qty, unit, note), optional: true };
}

/** A step. `timer` is in seconds and is offered as a timer in cooking mode. */
export function s(text: string, extra: { timer?: number; safety?: string } = {}): RecipeStep {
  const step: RecipeStep = { text };
  if (extra.timer) step.timerSec = extra.timer;
  if (extra.safety) step.safety = extra.safety;
  return step;
}

export const min = (m: number) => Math.round(m * 60);

/** Health Canada safe internal temperatures and handling notes, in plain words. */
export const SAFE = {
  chicken: "Cook chicken to 74°C (165°F) inside, with no pink. Wash your hands and board after touching it raw.",
  turkey: "Cook ground turkey to 74°C (165°F): no pink left.",
  groundBeef: "Cook ground beef to 71°C (160°F): no pink left.",
  pork: "Cook pork to 71°C (160°F) inside.",
  steak: "Beef steak is safe from 63°C (145°F) inside (medium-rare). Cook to 71°C (160°F) for medium.",
  fish: "Cook fish to 70°C (158°F): it turns opaque and flakes easily with a fork.",
  breaded: "Frozen breaded chicken can be raw inside. Cook until 74°C (165°F), even if it looks golden.",
  reheat: "Reheat until steaming hot all the way through, 74°C (165°F).",
  leftovers: "Refrigerate leftovers within 2 hours. They keep 3 days.",
  thaw: "Thaw frozen seafood in the fridge or in cold water, never on the counter.",
} as const;
