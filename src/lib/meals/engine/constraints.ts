// Hard filters for the planner (docs/MEALS.md §4, step 1). A recipe that fails any of the
// "never" checks — allergies, diets, disliked ingredients, missing equipment, unknown
// ingredients, a block, the same recipe twice in one day, a make-ahead recipe on today — is
// never suggested anywhere. The softer hard filters (above your cooking level, already used
// this week, the time cap) may be relaxed, in that order, only when too few recipes fit; even
// then a recipe repeats at most WEEK_REPEAT_CAP times a week and never on back-to-back days.

import { daysBetween, type ISODate } from "@/lib/dates";
import { makeAheadOf, recipeConflicts, type Conflict, type ConstraintPrefs } from "../recipe";
import type { Difficulty, MealPrefs, Recipe, Slot } from "../types";
import type { LearnedModel } from "./prefs";

/** Favourites (with repeat_ok) may repeat within a week when at least this many days apart. */
export const FAVOURITE_REPEAT_GAP_DAYS = 3;
/** The most times one recipe is planned in a week, in any tier (favourites included). */
export const WEEK_REPEAT_CAP = 3;
/** When repeats have to be allowed, they are at least this many days apart. */
export const RELAXED_REPEAT_GAP_DAYS = 2;

export type Exclusion =
  | { kind: "slot" }
  | { kind: "conflict"; conflict: Conflict }
  | { kind: "blocked"; reason: "thumbs_down" | "dont_like" | "ate_recently"; until: string }
  | { kind: "same_day" }
  | { kind: "make_ahead"; label: string }
  | { kind: "repeat_cap"; uses: number }
  | { kind: "above_level"; difficulty: Difficulty }
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
  prefs: ConstraintPrefs & Pick<MealPrefs, "maxMinutes"> & Partial<Pick<MealPrefs, "difficulty">>;
  learned?: Pick<LearnedModel, "blocked"> & Partial<Pick<LearnedModel, "liked">>;
  /** Other meals of the same plan week (not the one being chosen). */
  weekUses?: readonly { recipe_key: string; local_date: ISODate }[];
  favourites?: ReadonlyMap<string, Favourite>;
  /** Keys that must not be picked (current recipe and those already shown when regenerating). */
  exclude?: ReadonlySet<string>;
  /** The user's local date: a make-ahead recipe (overnight oats) can't be planned for it. */
  today?: ISODate;
  /** 0 = strict; 1 = recipes above the cooking level allowed; 2 = also capped repeats within the week; 3 = also past the time cap. */
  relax?: 0 | 1 | 2 | 3;
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

const LEVEL: Record<Difficulty, number> = { super_easy: 0, everyday: 1, i_like_cooking: 2 };

/**
 * A recipe harder than the user's cooking level, that they haven't shown they like (a
 * favourite, a thumbs up, cooked or logged it). Taste learning alone can never bring one in:
 * it is only offered when too few recipes at their level fit.
 */
export function aboveLevel(recipe: Recipe, ctx: Pick<FilterContext, "prefs" | "learned" | "favourites">): boolean {
  const level = ctx.prefs.difficulty;
  if (!level || LEVEL[recipe.difficulty] <= LEVEL[level]) return false;
  return !ctx.favourites?.has(recipe.key) && !((ctx.learned?.liked?.[recipe.key] ?? 0) > 0);
}

/** Every reason a recipe can't be planned in this slot right now (empty = allowed). */
export function exclusions(recipe: Recipe, ctx: FilterContext): Exclusion[] {
  const out: Exclusion[] = [];
  if (!recipe.slots.includes(ctx.slot)) out.push({ kind: "slot" });
  for (const c of conflictsFor(recipe, ctx.prefs)) out.push({ kind: "conflict", conflict: c });
  const b = ctx.learned?.blocked[recipe.key];
  if (b) out.push({ kind: "blocked", reason: b.reason, until: b.until });
  if (ctx.exclude?.has(recipe.key)) out.push({ kind: "excluded" });
  const ahead = ctx.today && ctx.date === ctx.today ? makeAheadOf(recipe) : null;
  if (ahead) out.push({ kind: "make_ahead", label: ahead.label });

  const uses = (ctx.weekUses ?? []).filter((u) => u.recipe_key === recipe.key);
  if (uses.some((u) => u.local_date === ctx.date)) out.push({ kind: "same_day" });
  else if (uses.length >= WEEK_REPEAT_CAP) out.push({ kind: "repeat_cap", uses: uses.length });

  const relax = ctx.relax ?? 0;
  if (relax < 1 && aboveLevel(recipe, ctx)) out.push({ kind: "above_level", difficulty: recipe.difficulty });
  if (uses.length && !out.some((e) => e.kind === "same_day" || e.kind === "repeat_cap")) {
    const fav = ctx.favourites?.get(recipe.key);
    const gap = Math.min(...uses.map((u) => Math.abs(daysBetween(u.local_date, ctx.date))));
    const ok = (fav?.repeat_ok && gap >= FAVOURITE_REPEAT_GAP_DAYS) || (relax >= 2 && gap >= RELAXED_REPEAT_GAP_DAYS);
    if (!ok) out.push({ kind: "used_this_week", date: uses[0].local_date });
  }
  if (relax < 3 && ctx.prefs.maxMinutes != null && recipe.minutes > ctx.prefs.maxMinutes) {
    out.push({ kind: "too_long", minutes: recipe.minutes, max: ctx.prefs.maxMinutes });
  }
  return out;
}

export function isAllowed(recipe: Recipe, ctx: FilterContext): boolean {
  return exclusions(recipe, ctx).length === 0;
}

/**
 * Recipes that pass the hard filters for a slot. When fewer than `min` pass, recipes above the
 * cooking level, then (capped, spaced) repeats within the week, then the time cap are relaxed
 * — never allergies, diets, dislikes, equipment, blocks, explicit exclusions, a second use on
 * the same day or a make-ahead recipe on today. `relaxed` says how far it had to go.
 */
export function candidatesFor(pool: readonly Recipe[], ctx: Omit<FilterContext, "relax">, min = 3): { recipes: Recipe[]; relaxed: 0 | 1 | 2 | 3 } {
  // each tier allows a superset of the one before, so the last tier is the widest
  let recipes: Recipe[] = [];
  for (const relax of [0, 1, 2, 3] as const) {
    recipes = pool.filter((r) => isAllowed(r, { ...ctx, relax }));
    if (recipes.length >= min) return { recipes, relaxed: relax };
  }
  return { recipes, relaxed: 3 };
}
