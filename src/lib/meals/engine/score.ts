// Scoring a candidate recipe for one meal slot (docs/MEALS.md §4). Every term is recorded in
// `parts` so "Why this meal?" can show only reasons that really contributed. Pure; the only
// randomness is seeded (rng.ts), so the same inputs always give the same scores and picks.
//
//   total = fit + taste + variety + macro + explore
//
// Selection is a softmax (temperature 0.6) over the top 8, with an occasional "new for you"
// pick among unseen recipes in that top 8.

import { daysBetween, type ISODate } from "@/lib/dates";
import { dislikeCovers } from "../ingredients";
import { coreIngredients, ingredientCount, recipeCostCad, recipeFeatures, recipeMacros } from "../recipe";
import type { Difficulty, Macros, MealPrefs, Recipe, Slot } from "../types";
import type { Favourite } from "./constraints";
import type { LearnedModel } from "./prefs";
import { unitFor, type Rng } from "./rng";

/* ------------------------------------------------------------------ targets */

export interface Goals {
  /** Daily calorie goal (profile.calorie_goal). */
  kcal: number;
  /** Daily protein goal in grams (profile.protein_goal). */
  protein: number;
}

export interface SlotTarget {
  kcal: number;
  protein: number;
}

/** Share of the day's calories per slot. Snacks share 15% across snacksPerDay. */
export const SLOT_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };

/** The target for ONE occurrence of a slot (one snack, not all of them). */
export function slotTarget(slot: Slot, goals: Goals, snacksPerDay: number): SlotTarget {
  const share = slot === "snack" ? SLOT_SHARE.snack / Math.max(1, Math.round(snacksPerDay) || 1) : SLOT_SHARE[slot];
  return { kcal: goals.kcal * share, protein: goals.protein * share };
}

/** Servings the planner chooses from (docs/MEALS.md §4). */
export const SERVING_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** The serving step that lands closest to `targetKcal` (ties go to the one nearer 1). */
export function bestServings(recipe: Recipe, targetKcal: number): number {
  const base = recipeMacros(recipe, 1).kcal;
  if (!(base > 0) || !(targetKcal > 0)) return 1;
  let best = 1;
  let err = Infinity;
  for (const s of SERVING_STEPS) {
    const e = Math.abs(base * s - targetKcal) + Math.abs(s - 1) * base * 0.02;
    if (e < err) {
      err = e;
      best = s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ fit rules */

/** What each difficulty setting allows before the fit penalty starts. Super Easy = the library rules. */
export const DIFFICULTY_LIMITS: Record<Difficulty, { minutes: number; ingredients: number; steps: number }> = {
  super_easy: { minutes: 15, ingredients: 6, steps: 5 },
  everyday: { minutes: 30, ingredients: 9, steps: 7 },
  i_like_cooking: { minutes: 75, ingredients: 14, steps: 12 },
};
const RANK: Record<Difficulty, number> = { super_easy: 0, everyday: 1, i_like_cooking: 2 };

const BUDGET_COST: Record<MealPrefs["budget"], Record<1 | 2 | 3, number>> = {
  tight: { 1: 0.25, 2: -0.3, 3: -1.0 },
  normal: { 1: 0, 2: 0, 3: -0.3 },
  flexible: { 1: 0, 2: 0, 3: 0 },
};

/** Variety penalties (docs/MEALS.md §4.4). */
export const VARIETY = {
  sameProteinDay: -0.8,
  sameBaseDay: -0.5,
  sameDishDays: 5,
  sameDish: -1.0,
  /** The same protein in the same slot on the day before/after (−0.5) or two days away (−0.25). */
  proteinStreak: [-0.5, -0.25],
  cooldownDays: 14,
  favouriteCooldownDays: 4,
  cooldown: -1.2,
} as const;

/* ------------------------------------------------------------------ scoring */

export type Term = "fit" | "taste" | "variety" | "macro" | "explore";

/** One contribution to a score. `key` names the rule: "difficulty", "learned:base:pasta", "same_protein:beef"… */
export interface ScorePart {
  term: Term;
  key: string;
  value: number;
  /** The facts behind it, for explanations. */
  data?: Record<string, string | number | boolean | string[]>;
}

export interface ScoredCandidate {
  recipe: Recipe;
  servings: number;
  macros: Macros;
  total: number;
  terms: Record<Term, number>;
  parts: ScorePart[];
  /** Never seen before by this user (and they have history, so the label means something). */
  newForYou: boolean;
}

/** A meal near the one being chosen, for variety: same day and ±14 days (this week + history). */
export interface NearbyMeal {
  recipe: Recipe;
  local_date: ISODate;
  slot?: Slot;
}

export interface ScoreContext {
  slot: Slot;
  date: ISODate;
  /** Position within the slot (snacks 0..n). */
  position: number;
  prefs: MealPrefs;
  learned: LearnedModel;
  goals: Goals;
  /** kcal/protein to aim this meal at (usually slotTarget; regenerate passes what the day still needs). */
  target: SlotTarget;
  /** Other meals already on this day. */
  dayMeals: readonly { recipe: Recipe; servings: number }[];
  /** Meals within ±14 days (this week and history), excluding this one. */
  nearby: readonly NearbyMeal[];
  favourites?: ReadonlyMap<string, Favourite>;
  /** Seed for the exploration noise: plan/slot/attempt. */
  seed: string;
  attempt?: number;
  /** "New for you" only means something once the user has some history. */
  hasHistory?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const featureCache = new WeakMap<Recipe, string[]>();
/** recipeFeatures, memoised per recipe object (recipes are treated as immutable). */
export function featuresOf(recipe: Recipe): string[] {
  let f = featureCache.get(recipe);
  if (!f) {
    f = recipeFeatures(recipe);
    featureCache.set(recipe, f);
  }
  return f;
}

const tagValues = (recipe: Recipe, prefix: string) => recipe.tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));

/** Score one candidate. Assumes it already passed the hard filters (constraints.ts). */
export function scoreRecipe(recipe: Recipe, ctx: ScoreContext): ScoredCandidate {
  const parts: ScorePart[] = [];
  const push = (term: Term, key: string, value: number, data?: ScorePart["data"]) => {
    if (value !== 0 && Number.isFinite(value)) parts.push({ term, key, value: r3(value), ...(data ? { data } : {}) });
  };
  const { prefs, learned } = ctx;
  const minutes = recipe.minutes;
  const ingredients = ingredientCount(recipe);
  const steps = recipe.steps.length;

  /* ---- 2. fit: difficulty, simpler bias, time cap, budget */
  const L = DIFFICULTY_LIMITS[prefs.difficulty] ?? DIFFICULTY_LIMITS.super_easy;
  const overMin = Math.max(0, minutes - L.minutes) / L.minutes;
  const overIng = Math.max(0, ingredients - L.ingredients);
  const overSteps = Math.max(0, steps - L.steps);
  const overRank = Math.max(0, RANK[recipe.difficulty] - RANK[prefs.difficulty]);
  const facts = { minutes, ingredients, steps, difficulty: recipe.difficulty };
  if (!overMin && !overIng && !overSteps && !overRank) push("fit", "difficulty", 0.3, facts);
  else push("fit", "difficulty", -(1.5 * overMin + 0.3 * overIng + 0.3 * overSteps + 0.5 * overRank), facts);

  const b = learned.simplerBias;
  if (b > 0) {
    const v = -b * (0.1 * Math.max(0, ingredients - 3) + 0.08 * Math.max(0, steps - 3) + 0.01 * Math.max(0, minutes - 10));
    push("fit", "simpler", v, { bias: r3(b), ingredients, steps, minutes });
  }
  if (prefs.maxMinutes != null && minutes > prefs.maxMinutes) {
    push("fit", "time_cap", -0.5 - (1.5 * (minutes - prefs.maxMinutes)) / prefs.maxMinutes, { minutes, max: prefs.maxMinutes });
  }

  const servings = bestServings(recipe, ctx.target.kcal);
  const budgetV = BUDGET_COST[prefs.budget]?.[recipe.cost] ?? 0;
  if (budgetV) push("fit", "budget", budgetV, { cost: recipe.cost, budget: prefs.budget, cad: recipeCostCad(recipe) });
  if (prefs.weeklyBudgetCad != null && prefs.weeklyBudgetCad > 0) {
    const share = ctx.slot === "snack" ? SLOT_SHARE.snack / Math.max(1, prefs.snacksPerDay) : SLOT_SHARE[ctx.slot];
    const allowance = (prefs.weeklyBudgetCad / 7) * share;
    const cad = recipeCostCad(recipe, servings);
    if (cad > allowance * 1.25) push("fit", "weekly_budget", -0.5 * Math.min(2, cad / allowance - 1), { cad, allowance: Math.round(allowance * 100) / 100 });
    else if (cad <= allowance) push("fit", "weekly_budget", 0.15, { cad, allowance: Math.round(allowance * 100) / 100 });
  }

  /* ---- 3. taste: learned weights + explicit likes */
  const feats = featuresOf(recipe);
  const norm = feats.length ? 1 / Math.sqrt(feats.length) : 0;
  for (const f of feats) {
    const w = learned.weights[f];
    if (w) push("taste", `learned:${f}`, w * norm, { feature: f, weight: r3(w) });
  }
  const core = new Set(coreIngredients(recipe).map((l) => l.key));
  // a liked ingredient counts in its other forms too (liking chicken breast covers cooked strips)
  const likedForms = new Set(prefs.likedIngredients.flatMap((k) => [...dislikeCovers(k)]));
  const likedIng = [...core].filter((k) => likedForms.has(k));
  if (likedIng.length) push("taste", "liked_ingredient", Math.min(1, 0.4 * likedIng.length), { keys: likedIng });
  const cuisines = tagValues(recipe, "cuisine:");
  const likedC = cuisines.filter((c) => prefs.likedCuisines.includes(c));
  if (likedC.length) push("taste", "liked_cuisine", 0.6, { cuisines: likedC });
  const dislikedC = cuisines.filter((c) => prefs.dislikedCuisines.includes(c));
  if (dislikedC.length) push("taste", "disliked_cuisine", -1.0, { cuisines: dislikedC });
  const pantry = prefs.pantry.filter((k) => core.has(k));
  if (pantry.length) push("taste", "pantry", Math.min(0.3, 0.1 * pantry.length), { keys: pantry });
  const fav = ctx.favourites?.get(recipe.key);
  if (fav) push("taste", "favourite", 0.6);

  /* ---- 4. variety */
  const proteins = tagValues(recipe, "protein:");
  const bases = tagValues(recipe, "base:");
  const dishes = tagValues(recipe, "dish:");
  for (const p of proteins) {
    if (ctx.dayMeals.some((m) => m.recipe.tags.includes(`protein:${p}`))) push("variety", `same_protein:${p}`, VARIETY.sameProteinDay, { protein: p });
  }
  for (const base of bases) {
    if (ctx.dayMeals.some((m) => m.recipe.tags.includes(`base:${base}`))) push("variety", `same_base:${base}`, VARIETY.sameBaseDay, { base });
  }
  for (const p of proteins) {
    let worst = 0;
    for (const m of ctx.nearby) {
      if (m.slot !== ctx.slot || !m.recipe.tags.includes(`protein:${p}`)) continue;
      const gap = Math.abs(daysBetween(m.local_date, ctx.date));
      if (gap >= 1 && gap <= VARIETY.proteinStreak.length) worst = Math.min(worst, VARIETY.proteinStreak[gap - 1]);
    }
    if (worst) push("variety", `protein_streak:${p}`, worst, { protein: p });
  }
  let dishHit: NearbyMeal | undefined;
  let cooldownHit: { gap: number; window: number } | undefined;
  const window = fav ? VARIETY.favouriteCooldownDays : VARIETY.cooldownDays;
  for (const m of ctx.nearby) {
    const gap = Math.abs(daysBetween(m.local_date, ctx.date));
    if (!dishHit && gap <= VARIETY.sameDishDays && m.recipe.key !== recipe.key && dishes.some((d) => m.recipe.tags.includes(`dish:${d}`))) dishHit = m;
    if (m.recipe.key === recipe.key && gap <= window && (!cooldownHit || gap < cooldownHit.gap)) cooldownHit = { gap, window };
  }
  if (dishHit) push("variety", "same_dish", VARIETY.sameDish, { dish: dishes.find((d) => dishHit!.recipe.tags.includes(`dish:${d}`)) ?? "", date: dishHit.local_date });
  if (cooldownHit) push("variety", "cooldown", cooldownHit.gap <= cooldownHit.window / 2 ? VARIETY.cooldown : VARIETY.cooldown / 2, { days: cooldownHit.gap });

  /* ---- 5. macro fit */
  const macros = recipeMacros(recipe, servings);
  const target = ctx.target;
  const closeness = clamp(1 - Math.abs(macros.kcal - target.kcal) / (0.3 * Math.max(1, target.kcal)), -1, 1);
  push("macro", "kcal", 0.5 * closeness, { kcal: macros.kcal, target: Math.round(target.kcal), servings });
  const goalRatio = (ctx.goals.protein * 4) / Math.max(1, ctx.goals.kcal);
  const ratio = (macros.protein * 4) / Math.max(1, macros.kcal);
  // protein density: short of the goal's ratio costs up to 0.6; above it earns a little (max 0.25),
  // so days reach the protein goal without crowding out the carbs a bulk needs
  push("macro", "protein", 0.6 * clamp((ratio - goalRatio) / 0.08, -1, 5 / 12), { protein: macros.protein, kcal: macros.kcal });
  if (servings >= 2) push("macro", "servings", -0.3 * (servings - 1.5), { servings });
  else if (servings <= 0.5) push("macro", "servings", -0.15, { servings });

  /* ---- 6. exploration: seeded noise + new for you */
  const noise = (unitFor(ctx.seed, ctx.date, ctx.slot, ctx.position, ctx.attempt ?? 0, recipe.key) - 0.5) * 0.5;
  push("explore", "noise", noise);
  const newForYou = !!ctx.hasHistory && !learned.seen.has(recipe.key) && !ctx.nearby.some((m) => m.recipe.key === recipe.key);
  if (newForYou) push("explore", "new_for_you", 0.1);

  const terms: Record<Term, number> = { fit: 0, taste: 0, variety: 0, macro: 0, explore: 0 };
  for (const p of parts) terms[p.term] += p.value;
  for (const k of Object.keys(terms) as Term[]) terms[k] = r3(terms[k]);
  const total = r3(terms.fit + terms.taste + terms.variety + terms.macro + terms.explore);
  return { recipe, servings, macros, total, terms, parts, newForYou };
}

/* ------------------------------------------------------------------ selection */

export const SELECTION = { topN: 8, temperature: 0.6, newForYouRate: 0.1 } as const;

export interface Selection {
  pick: ScoredCandidate;
  /** The top candidates the pick was drawn from, best first, with their probabilities. */
  top: { candidate: ScoredCandidate; p: number }[];
  /** True when the "new for you" exploration branch chose the pool. */
  explored: boolean;
}

export function rankCandidates(scored: readonly ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => b.total - a.total || a.recipe.key.localeCompare(b.recipe.key));
}

/**
 * Softmax over the top 8 (temperature 0.6). About 10% of the time, when the top 8 holds recipes
 * the user has never seen, the draw is among those ("new for you"). Null when nothing scored.
 */
export function selectCandidate(scored: readonly ScoredCandidate[], rng: Rng, opts: Partial<typeof SELECTION> = {}): Selection | null {
  const { topN, temperature, newForYouRate } = { ...SELECTION, ...opts };
  const ranked = rankCandidates(scored).slice(0, topN);
  if (!ranked.length) return null;
  const roll = rng();
  const fresh = ranked.filter((c) => c.newForYou);
  const explored = roll < newForYouRate && fresh.length > 0 && fresh.length < ranked.length;
  const pool = explored ? fresh : ranked;
  const max = pool[0].total;
  const ws = pool.map((c) => Math.exp((c.total - max) / temperature));
  const sum = ws.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  let pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    r -= ws[i];
    if (r <= 0) {
      pick = pool[i];
      break;
    }
  }
  return { pick, top: pool.map((candidate, i) => ({ candidate, p: Math.round((ws[i] / sum) * 1000) / 1000 })), explored };
}
