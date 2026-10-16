// Hard filters for the planner (docs/MEALS.md §4, step 1). A recipe that fails any of the
// "never" checks — allergies, diets, disliked ingredients, missing equipment, unknown
// ingredients — is never suggested anywhere. The softer hard filters (already used this week,
// the time cap) may be relaxed only when nothing else fits; the "never" checks never are.

import { daysBetween, type ISODate } from "@/lib/dates";
import { recipeConflicts, type Conflict, type ConstraintPrefs } from "../recipe";
import type { MealPrefs, Recipe, Slot } from "../types";
import type { LearnedModel } from "./prefs";

/** Favourites (with repeat_ok) may repeat within a week when at least this many days apart. */
export const FAVOURITE_REPEAT_GAP_DAYS = 3;

export type Exclusion =
  | { kind: "slot" }
  | { kind: "conflict"; conflict: Conflict }
  | { kind: "blocked"; reason: "thumbs_down" | "dont_like" | "ate_recently"; until: string }
  | { kind: "used_this_week"; date: ISODate }
  | { kind: "too_long"; minutes: number; max: number }
  | { kind: "excluded" };

export interface Favourite {
  recipe_key: string;
  repeat_ok: boolean;
}

export interface FilterContext {
  slot: Slot;
  date: ISODate;
  prefs: ConstraintPrefs & Pick<MealPrefs, "maxMinutes">;
  learned?: Pick<LearnedModel, "blocked">;
  /** Other meals of the same plan week (not the one being chosen). */
  weekUses?: readonly { recipe_key: string; local_date: ISODate }[];
  favourites?: ReadonlyMap<string, Favourite>;
  /** Keys that must not be picked (current recipe and those already shown when regenerating). */
  exclude?: ReadonlySet<string>;
  /** 0 = strict; 1 = repeats within the week allowed; 2 = also past the time cap. */
  relax?: 0 | 1 | 2;
}

const constraintCache = new WeakMap<Recipe, { key: string; conflicts: Conflict[] }>();

function prefsKey(p: ConstraintPrefs): string {
  return [p.allergies, p.diets, p.dislikedIngredients, p.equipment].map((a) => [...(a ?? [])].sort().join(",")).join("|");
}

/** recipeConflicts, memoised per recipe object for the same constraint set (week generation scores ~100 recipes × 30 slots). */
export function conflictsFor(recipe: Recipe, prefs: ConstraintPrefs): Conflict[] {
  const key = prefsKey(prefs);
  const hit = constraintCache.get(recipe);
  if (hit && hit.key === key) return hit.conflicts;
  const conflicts = recipeConflicts(recipe, prefs);
  constraintCache.set(recipe, { key, conflicts });
  return conflicts;
}

/** The "never" checks: allergies, diets, disliked ingredients, equipment, unknown ingredients. */
export function hardAllowed(recipe: Recipe, prefs: ConstraintPrefs): boolean {
  return conflictsFor(recipe, prefs).length === 0;
}

/** Every reason a recipe can't be planned in this slot right now (empty = allowed). */
export function exclusions(recipe: Recipe, ctx: FilterContext): Exclusion[] {
  const out: Exclusion[] = [];
  if (!recipe.slots.includes(ctx.slot)) out.push({ kind: "slot" });
  for (const c of conflictsFor(recipe, ctx.prefs)) out.push({ kind: "conflict", conflict: c });
  const b = ctx.learned?.blocked[recipe.key];
  if (b) out.push({ kind: "blocked", reason: b.reason, until: b.until });
  if (ctx.exclude?.has(recipe.key)) out.push({ kind: "excluded" });
  const relax = ctx.relax ?? 0;
  if (relax < 1) {
    const fav = ctx.favourites?.get(recipe.key);
    for (const u of ctx.weekUses ?? []) {
      if (u.recipe_key !== recipe.key) continue;
      const gap = Math.abs(daysBetween(u.local_date, ctx.date));
      if (fav?.repeat_ok && gap >= FAVOURITE_REPEAT_GAP_DAYS) continue;
      out.push({ kind: "used_this_week", date: u.local_date });
      break;
    }
  }
  if (relax < 2 && ctx.prefs.maxMinutes != null && recipe.minutes > ctx.prefs.maxMinutes) {
    out.push({ kind: "too_long", minutes: recipe.minutes, max: ctx.prefs.maxMinutes });
  }
  return out;
}

export function isAllowed(recipe: Recipe, ctx: FilterContext): boolean {
  return exclusions(recipe, ctx).length === 0;
}

/**
 * Recipes that pass the hard filters for a slot. When fewer than `min` pass, repeats within
 * the week and then the time cap are relaxed (never allergies, diets, dislikes, equipment,
 * blocks or explicit exclusions). `relaxed` says how far it had to go.
 */
export function candidatesFor(pool: readonly Recipe[], ctx: Omit<FilterContext, "relax">, min = 3): { recipes: Recipe[]; relaxed: 0 | 1 | 2 } {
  // each tier allows a superset of the one before, so the last tier is the widest
  let recipes: Recipe[] = [];
  for (const relax of [0, 1, 2] as const) {
    recipes = pool.filter((r) => isAllowed(r, { ...ctx, relax }));
    if (recipes.length >= min) return { recipes, relaxed: relax };
  }
  return { recipes, relaxed: 2 };
}
