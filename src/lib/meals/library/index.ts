// The recipe library: every built-in recipe, normalised from the ingredient database.
// Treat these objects as read-only (copy before changing anything).

import { normalizeRecipe } from "../recipe";
import type { Recipe, Slot } from "../types";
import { BREAKFAST } from "./breakfast";
import { DINNER } from "./dinner";
import { LUNCH } from "./lunch";
import { SNACKS } from "./snacks";

/** Recipes exactly as written in the library files (before normalisation). For tests and tooling. */
export const LIBRARY_SOURCE: Recipe[] = [...BREAKFAST, ...LUNCH, ...DINNER, ...SNACKS];

/** All library recipes with grams, nutrition (per serving), allergens, kinds and cost filled in. */
export const LIBRARY: Recipe[] = LIBRARY_SOURCE.map(normalizeRecipe);

const BY_KEY: ReadonlyMap<string, Recipe> = new Map(LIBRARY.map((r) => [r.key, r]));

/** A library recipe by key ("lib:spaghetti-bolognese"), or undefined. */
export function getLibraryRecipe(key: string): Recipe | undefined {
  return BY_KEY.get(key);
}

/** Library recipes that can be planned in a slot. */
export function libraryForSlot(slot: Slot): Recipe[] {
  return LIBRARY.filter((r) => r.slots.includes(slot));
}
