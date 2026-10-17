// Planner operations (docs/MEALS.md §5): generate a week, regenerate one meal, move, repeat,
// lock and set servings. Pure functions over plain data: they return new meals / patches and
// the learning events to record, and the data hooks (src/lib/data/meals.ts) persist them.
// Deterministic for a given seed.

import { addDays, daysBetween, weekStart as mondayOf, type ISODate } from "@/lib/dates";
import { LIBRARY, getLibraryRecipe } from "../library";
import { recipeMacros, recipeFeatures, validateRecipe } from "../recipe";
import type { FeedbackEvent, FeedbackReason, FeedbackRow, Macros, MealPrefs, PlannedMeal, Recipe, Slot, WhyReason } from "../types";
import { candidatesFor, type Favourite } from "./constraints";
import { explainPick, repeatReason } from "./explain";
import { learnPrefs, type LearnedModel, type NameOf } from "./prefs";
import { rngFor } from "./rng";
import { SERVING_STEPS, scoreRecipe, selectCandidate, slotTarget, VARIETY, type Goals, type NearbyMeal, type ScoredCandidate, type SlotTarget } from "./score";

/* ------------------------------------------------------------------ types */

/** A planned meal as the engine reads and writes it. Structurally a `NewPlannedMeal` for useSavePlan. */
export interface EngineMeal {
  id?: string;
  local_date: ISODate;
  slot: Slot;
  position: number;
  recipe_key: string;
  servings: number;
  locked: boolean;
  reason: WhyReason[] | null;
  history: PlannedMeal["history"];
}

export type MealPatch = Partial<Pick<EngineMeal, "recipe_key" | "servings" | "locked" | "reason" | "history" | "local_date" | "slot" | "position">>;

/** A learning event for the caller to record with useAddFeedback (features = the recipe's snapshot). */
export interface FeedbackDraft {
  recipe_key: string;
  event: FeedbackEvent;
  reason: FeedbackReason | null;
  ingredient: string | null;
  features: string[];
}

export interface PlanContext {
  /** Monday of the plan week. */
  weekStart: ISODate;
  /** Daily goals from the profile. */
  goals: Goals;
  prefs: MealPrefs;
  /** Every recipe that may be planned: buildPool(userRecipes) = library + the user's own recipes. */
  pool: readonly Recipe[];
  /** The learned model, or the raw feedback rows to learn it from. */
  learned?: LearnedModel;
  feedback?: readonly FeedbackRow[];
  /** "Now" for feedback decay (default: the current time). */
  now?: Date | string | number;
  favourites?: readonly Favourite[];
  /** Meals planned (or eaten) outside this week, e.g. the 14 days before it, for cooldowns and variety. */
  history?: readonly { recipe_key: string; local_date: ISODate; slot?: Slot }[];
  /** The week's current meals. Locked ones (and `fixedIds`, e.g. already logged) are kept. */
  meals?: readonly EngineMeal[];
  fixedIds?: readonly string[];
  /** Seed for every random choice (default: the week start). Same seed → same plan. */
  seed?: string;
}

export interface DaySummary {
  date: ISODate;
  /** Planned (not eaten) totals for the day, from the ingredient database. */
  planned: Macros;
  kcalGoal: number;
  proteinGoal: number;
  /** Within ±12% of the calorie goal. */
  kcalOk: boolean;
  /** At least 90% of the protein goal. */
  proteinOk: boolean;
  meals: number;
}

export interface WeekResult {
  /** New picks for every open place (servings set, reasons attached, no ids). */
  meals: EngineMeal[];
  /** Meals that stay as they were (locked or fixed). */
  kept: EngineMeal[];
  days: DaySummary[];
  /** Honest notes: a place nothing fits, a day that can't reach protein with the allowed recipes. */
  warnings: string[];
}

/* ------------------------------------------------------------------ pool */

export const DAY_KCAL_TOLERANCE = 0.12;
export const DAY_PROTEIN_MIN = 0.9;
export const MIN_SERVINGS = 0.25;
export const MAX_SERVINGS = 6;

const poolCache = new WeakMap<readonly Recipe[], Recipe[]>();

/**
 * Everything the planner may pick from: the library plus the user's own recipes that still
 * validate (their nutrition recomputed from the ingredient database). Invalid user recipes are
 * skipped, never "fixed up".
 */
export function buildPool(userRecipes: readonly Recipe[] = []): Recipe[] {
  const hit = poolCache.get(userRecipes);
  if (hit) return hit;
  const own: Recipe[] = [];
  const seen = new Set(LIBRARY.map((r) => r.key));
  for (const r of userRecipes) {
    if (!r || seen.has(r.key)) continue;
    const v = validateRecipe(stripComputed(r));
    if (!v.ok) continue;
    seen.add(v.recipe.key);
    own.push(v.recipe);
  }
  const pool = [...LIBRARY, ...own];
  poolCache.set(userRecipes, pool);
  return pool;
}

/** A stored recipe without fields validation recomputes (so stale computed values never fail it). */
function stripComputed(r: Recipe): unknown {
  const { nutrition: _n, allergens: _a, kinds: _k, ...rest } = r;
  return { ...rest, ingredients: rest.ingredients.map(({ grams: _g, ...l }) => l) };
}

/* ------------------------------------------------------------------ helpers */

interface Prepared {
  ctx: PlanContext;
  learned: LearnedModel;
  favourites: Map<string, Favourite>;
  byKey: Map<string, Recipe>;
  nameOf: NameOf;
  hasHistory: boolean;
  seed: string;
  places: { slot: Slot; position: number }[];
}

function prepare(input: PlanContext): Prepared {
  // history is for meals outside this week; this week's meals come from `meals`
  const monday = mondayOf(input.weekStart);
  const sunday = addDays(monday, 6);
  const ctx: PlanContext = { ...input, history: (input.history ?? []).filter((h) => h.local_date < monday || h.local_date > sunday) };
  const learned = ctx.learned ?? learnPrefs(ctx.feedback ?? [], ctx.now ?? new Date());
  const byKey = new Map(ctx.pool.map((r) => [r.key, r]));
  const snacks = Math.min(3, Math.max(1, Math.round(ctx.prefs.snacksPerDay) || 2));
  const places: { slot: Slot; position: number }[] = [
    { slot: "breakfast", position: 0 },
    { slot: "lunch", position: 0 },
    { slot: "dinner", position: 0 },
    ...Array.from({ length: snacks }, (_, i) => ({ slot: "snack" as const, position: i })),
  ];
  return {
    ctx,
    learned,
    favourites: new Map((ctx.favourites ?? []).map((f) => [f.recipe_key, f])),
    byKey,
    nameOf: (k) => byKey.get(k)?.name ?? getLibraryRecipe(k)?.name,
    hasHistory: learned.events >= 5 || (ctx.history?.length ?? 0) >= 7,
    seed: ctx.seed ?? ctx.weekStart,
    places,
  };
}

interface Placed {
  meal: EngineMeal;
  recipe: Recipe | undefined;
  fixed: boolean;
  candidate?: ScoredCandidate;
}

const samePlace = (a: Pick<EngineMeal, "local_date" | "slot" | "position">, b: Pick<EngineMeal, "local_date" | "slot" | "position">) =>
  a.local_date === b.local_date && a.slot === b.slot && a.position === b.position;

function macrosOf(recipe: Recipe | undefined, servings: number): Macros {
  return recipe ? recipeMacros(recipe, servings) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

function sumMacros(list: Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { kcal: Math.round(t.kcal), protein: Math.round(t.protein * 10) / 10, carbs: Math.round(t.carbs * 10) / 10, fat: Math.round(t.fat * 10) / 10 };
}

/** Planned totals per day for any set of meals (unknown recipes count as 0). */
export function dayTotals(meals: readonly Pick<EngineMeal, "local_date" | "recipe_key" | "servings">[], lookup: (key: string) => Recipe | undefined): Record<ISODate, Macros> {
  const by: Record<string, Macros[]> = {};
  for (const m of meals) (by[m.local_date] ??= []).push(macrosOf(lookup(m.recipe_key), m.servings));
  return Object.fromEntries(Object.entries(by).map(([d, l]) => [d, sumMacros(l)]));
}

function nearbyFor(P: Prepared, placed: readonly Placed[], date: ISODate, except?: Pick<EngineMeal, "local_date" | "slot" | "position">): NearbyMeal[] {
  const out: NearbyMeal[] = [];
  for (const p of placed) {
    if (!p.recipe || (except && samePlace(p.meal, except))) continue;
    if (Math.abs(daysBetween(p.meal.local_date, date)) <= VARIETY.cooldownDays) out.push({ recipe: p.recipe, local_date: p.meal.local_date, slot: p.meal.slot });
  }
  for (const h of P.ctx.history ?? []) {
    const r = P.byKey.get(h.recipe_key);
    if (r && Math.abs(daysBetween(h.local_date, date)) <= VARIETY.cooldownDays) out.push({ recipe: r, local_date: h.local_date, slot: h.slot });
  }
  return out;
}

interface ChooseArgs {
  date: ISODate;
  slot: Slot;
  position: number;
  placed: readonly Placed[];
  target: SlotTarget;
  attempt: number;
  exclude?: ReadonlySet<string>;
  /** Only candidates passing this (e.g. higher protein) are considered. */
  only?: (c: ScoredCandidate) => boolean;
  tag?: string;
}

function choose(P: Prepared, a: ChooseArgs): { candidate: ScoredCandidate; relaxed: number } | null {
  const { ctx } = P;
  const place = { local_date: a.date, slot: a.slot, position: a.position };
  const others = a.placed.filter((p) => !samePlace(p.meal, place));
  const { recipes, relaxed } = candidatesFor(ctx.pool, {
    slot: a.slot,
    date: a.date,
    prefs: ctx.prefs,
    learned: P.learned,
    weekUses: others.map((p) => ({ recipe_key: p.meal.recipe_key, local_date: p.meal.local_date })),
    favourites: P.favourites,
    exclude: a.exclude,
  });
  if (!recipes.length) return null;
  const dayMeals = others.filter((p) => p.meal.local_date === a.date && p.recipe).map((p) => ({ recipe: p.recipe!, servings: p.meal.servings }));
  const nearby = nearbyFor(P, others, a.date);
  let scored = recipes.map((r) =>
    scoreRecipe(r, {
      slot: a.slot,
      date: a.date,
      position: a.position,
      prefs: ctx.prefs,
      learned: P.learned,
      goals: ctx.goals,
      target: a.target,
      dayMeals,
      nearby,
      favourites: P.favourites,
      seed: P.seed,
      attempt: a.attempt,
      hasHistory: P.hasHistory,
    }),
  );
  if (a.only) scored = scored.filter(a.only);
  const sel = selectCandidate(scored, rngFor(P.seed, a.tag ?? "pick", a.date, a.slot, a.position, a.attempt));
  return sel ? { candidate: sel.pick, relaxed } : null;
}

/* ------------------------------------------------------------------ day balancing */

function stepIndex(s: number): number {
  let best = 0;
  for (let i = 0; i < SERVING_STEPS.length; i++) if (Math.abs(SERVING_STEPS[i] - s) < Math.abs(SERVING_STEPS[best] - s)) best = i;
  return best;
}

/**
 * Bring a day within ±12% of the calorie goal and to ≥ 90% of the protein goal where possible:
 * first by stepping servings of the day's new picks along the serving ladder, then (if protein
 * is still short) by swapping a snack for a higher-protein one, then servings again.
 */
function balanceDay(P: Prepared, placed: Placed[], date: ISODate): void {
  const { goals } = P.ctx;
  const day = () => placed.filter((p) => p.meal.local_date === date);
  const totals = () => sumMacros(day().map((p) => macrosOf(p.recipe, p.meal.servings)));
  const cost = (k: number, pr: number, servings: number[]) => {
    const e = (k - goals.kcal) / goals.kcal;
    const short = Math.max(0, DAY_PROTEIN_MIN * goals.protein - pr) / goals.protein;
    const odd = servings.reduce((s, x) => s + 0.08 * (x - 1) * (x - 1) + (x >= 2 ? 0.1 : 0), 0);
    return 100 * e * e + 300 * short * short + odd;
  };
  const ok = () => {
    const t = totals();
    return Math.abs(t.kcal - goals.kcal) / goals.kcal <= 0.05 && t.protein >= DAY_PROTEIN_MIN * goals.protein;
  };

  const servingsPass = () => {
    for (let iter = 0; iter < 24 && !ok(); iter++) {
      const adjustable = day().filter((p) => !p.fixed && p.recipe);
      const t = totals();
      const now = cost(t.kcal, t.protein, adjustable.map((p) => p.meal.servings));
      let best: { p: Placed; s: number; c: number } | null = null;
      for (const p of adjustable) {
        const i = stepIndex(p.meal.servings);
        const cur = macrosOf(p.recipe, p.meal.servings);
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= SERVING_STEPS.length) continue;
          const s = SERVING_STEPS[j];
          const next = macrosOf(p.recipe, s);
          const k = t.kcal - cur.kcal + next.kcal;
          const pr = t.protein - cur.protein + next.protein;
          const c = cost(k, pr, adjustable.map((q) => (q === p ? s : q.meal.servings)));
          if (c < now - 1e-6 && (!best || c < best.c)) best = { p, s, c };
        }
      }
      if (!best) break;
      best.p.meal = { ...best.p.meal, servings: best.s };
    }
  };

  servingsPass();
  // protein still short: swap snacks for higher-protein ones (keeps variety: softmax among them)
  for (let attempt = 0; attempt < 3 && totals().protein < DAY_PROTEIN_MIN * goals.protein; attempt++) {
    const snacks = day()
      .filter((p) => !p.fixed && p.recipe && p.meal.slot === "snack")
      .sort((x, y) => macrosOf(x.recipe, x.meal.servings).protein - macrosOf(y.recipe, y.meal.servings).protein);
    const weakest = snacks[0];
    if (!weakest) break;
    const current = macrosOf(weakest.recipe, weakest.meal.servings).protein;
    const target = slotTarget("snack", goals, P.ctx.prefs.snacksPerDay);
    const swap = choose(P, {
      date,
      slot: "snack",
      position: weakest.meal.position,
      placed,
      target,
      attempt,
      exclude: new Set(snacks.map((s) => s.meal.recipe_key)),
      only: (c) => c.macros.protein >= current + 8,
      tag: "protein-swap",
    });
    if (!swap) break;
    weakest.recipe = swap.candidate.recipe;
    weakest.candidate = swap.candidate;
    weakest.meal = { ...weakest.meal, recipe_key: swap.candidate.recipe.key, servings: swap.candidate.servings };
    servingsPass();
  }
}

function summarize(P: Prepared, placed: readonly Placed[], date: ISODate): DaySummary {
  const day = placed.filter((p) => p.meal.local_date === date);
  const planned = sumMacros(day.map((p) => macrosOf(p.recipe, p.meal.servings)));
  const { kcal, protein } = P.ctx.goals;
  return {
    date,
    planned,
    kcalGoal: kcal,
    proteinGoal: protein,
    kcalOk: Math.abs(planned.kcal - kcal) / kcal <= DAY_KCAL_TOLERANCE,
    proteinOk: planned.protein >= DAY_PROTEIN_MIN * protein,
    meals: day.length,
  };
}

function checkGoals(goals: Goals) {
  if (!(goals?.kcal > 0) || !(goals?.protein > 0)) throw new Error("Set your calorie and protein goals first.");
}

/* ------------------------------------------------------------------ generate week */

/**
 * Plan the whole week: 7 days × breakfast, lunch, dinner and `snacksPerDay` snacks. Locked
 * meals (and `fixedIds`) stay where they are and count toward variety and day totals. Each
 * pick's servings land near its slot target; each day is then balanced to ±12% kcal and ≥ 90%
 * protein where possible. Same context + seed → same plan.
 */
export function generateWeek(ctx: PlanContext): WeekResult {
  checkGoals(ctx.goals);
  const P = prepare(ctx);
  const monday = mondayOf(ctx.weekStart);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const fixedIds = new Set(ctx.fixedIds ?? []);
  const kept = (ctx.meals ?? []).filter((m) => m.locked || (m.id && fixedIds.has(m.id)));
  // regenerating a week: the meal being replaced in each place isn't picked there again (unless nothing else fits)
  const replaced = (ctx.meals ?? []).filter((m) => !kept.includes(m));
  const placed: Placed[] = kept.map((m) => ({ meal: m, recipe: P.byKey.get(m.recipe_key), fixed: true }));
  const warnings: string[] = [];

  for (const date of dates) {
    for (const { slot, position } of P.places) {
      if (placed.some((p) => samePlace(p.meal, { local_date: date, slot, position }))) continue;
      const target = slotTarget(slot, ctx.goals, ctx.prefs.snacksPerDay);
      const before = replaced.find((m) => samePlace(m, { local_date: date, slot, position }));
      const res = (before && choose(P, { date, slot, position, placed, target, attempt: 0, exclude: new Set([before.recipe_key]) })) || choose(P, { date, slot, position, placed, target, attempt: 0 });
      if (!res) {
        warnings.push(`Nothing in your recipes fits ${slot === "snack" ? "a snack" : slot} on ${date} with your current settings.`);
        continue;
      }
      const c = res.candidate;
      placed.push({
        meal: { local_date: date, slot, position, recipe_key: c.recipe.key, servings: c.servings, locked: false, reason: null, history: [] },
        recipe: c.recipe,
        fixed: false,
        candidate: c,
      });
    }
    balanceDay(P, placed, date);
  }

  const days = dates.map((d) => summarize(P, placed, d));
  for (const d of days) if (d.meals && !d.proteinOk) warnings.push(`${d.date}: ${Math.round(d.planned.protein)} g protein planned, under 90% of your ${d.proteinGoal} g goal with the recipes your settings allow.`);
  const meals = placed
    .filter((p) => !p.fixed)
    .map((p) => ({ ...p.meal, reason: p.candidate ? explainPick(p.candidate, { slot: p.meal.slot, learned: P.learned, nameOf: P.nameOf }, { servings: p.meal.servings, macros: macrosOf(p.recipe, p.meal.servings) }) : null }));
  return { meals: sortMeals(meals), kept: sortMeals(kept), days, warnings };
}

const SLOT_ORDER: Record<Slot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
function sortMeals<T extends Pick<EngineMeal, "local_date" | "slot" | "position">>(meals: T[]): T[] {
  return [...meals].sort((a, b) => a.local_date.localeCompare(b.local_date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.position - b.position);
}

/* ------------------------------------------------------------------ regenerate one meal */

export type RegenerateResult =
  | {
      ok: true;
      /** The meal with its new recipe; the old pick is the last `history` entry (for Undo). */
      meal: EngineMeal;
      patch: MealPatch;
      recipe: Recipe;
      reasons: WhyReason[];
      candidate: ScoredCandidate;
      /** Record this: "regenerated" (+ reason) for the recipe that was replaced. */
      feedback: FeedbackDraft;
      /** Pass back as `shown` on the next regenerate of the same meal. */
      shown: string[];
    }
  | { ok: false; reason: "no_alternative" | "not_found"; message: string };

function placeKey(m: Pick<EngineMeal, "id" | "local_date" | "slot" | "position">) {
  return m.id ?? `${m.local_date}|${m.slot}|${m.position}`;
}

export interface RegenerateOptions {
  /** Why the current pick is being replaced, when the user said so up front. It is recorded with the "regenerated" event and already shapes this pick. */
  reason?: FeedbackReason | null;
  /** The ingredient for reason "dislike_ingredient". */
  ingredient?: string | null;
}

/**
 * A different recipe for ONE meal: never the current one or any already shown in this
 * regenerate session. Everything else in the week stays exactly as it is. The servings aim at
 * what the day still needs, so the day stays balanced.
 */
export function regenerateMeal(ctx: PlanContext, meal: EngineMeal, shown: readonly string[] = [], opts: RegenerateOptions = {}): RegenerateResult {
  checkGoals(ctx.goals);
  const reason = opts.reason ?? null;
  const oldRecipe = ctx.pool.find((r) => r.key === meal.recipe_key);
  const feedback = feedbackFor(oldRecipe, meal.recipe_key, "regenerated", reason, opts.ingredient ?? null);
  // a reason given now (e.g. "too complicated") already counts for this pick
  const learnedCtx: PlanContext = reason && !ctx.learned ? { ...ctx, feedback: [...(ctx.feedback ?? []), { ...feedback, created_at: new Date(ctx.now ?? Date.now()).toISOString() }] } : ctx;
  const P = prepare(learnedCtx);
  const key = placeKey(meal);
  const others = (ctx.meals ?? []).filter((m) => placeKey(m) !== key && !(m.id && m.id === meal.id));
  const placed: Placed[] = others.map((m) => ({ meal: m, recipe: P.byKey.get(m.recipe_key), fixed: true }));
  const base = slotTarget(meal.slot, ctx.goals, ctx.prefs.snacksPerDay);
  // aim at what the day still needs: make up the difference between the other meals' targets
  // and what they actually provide (within 0.6–1.6× of this slot's own target)
  const day = placed.filter((p) => p.meal.local_date === meal.local_date && p.recipe);
  const otherKcal = day.reduce((s, p) => s + macrosOf(p.recipe, p.meal.servings).kcal, 0);
  const expectedOthers = day.reduce((s, p) => s + slotTarget(p.meal.slot, ctx.goals, ctx.prefs.snacksPerDay).kcal, 0);
  const kcal = Math.min(1.6 * base.kcal, Math.max(0.6 * base.kcal, base.kcal + (expectedOthers - otherKcal)));
  const exclude = new Set([meal.recipe_key, ...shown]);
  const res = choose(P, { date: meal.local_date, slot: meal.slot, position: meal.position, placed, target: { kcal, protein: base.protein }, attempt: shown.length + 1, exclude, tag: `regen:${key}` });
  if (!res) return { ok: false, reason: "no_alternative", message: "Nothing else fits this meal with your current settings." };
  const c = res.candidate;
  const reasons = explainPick(c, { slot: meal.slot, learned: P.learned, nameOf: P.nameOf });
  const patch: MealPatch = {
    recipe_key: c.recipe.key,
    servings: c.servings,
    reason: reasons,
    history: [...(meal.history ?? []), { recipe_key: meal.recipe_key, servings: meal.servings, reason: meal.reason ?? null }],
  };
  return {
    ok: true,
    meal: { ...meal, ...patch } as EngineMeal,
    patch,
    recipe: c.recipe,
    reasons,
    candidate: c,
    feedback,
    shown: [...new Set([...shown, meal.recipe_key, c.recipe.key])],
  };
}

/** Undo the last regenerate of a meal: the previous pick comes back off `history`. Null when there is nothing to undo. */
export function undoRegenerate(meal: Pick<EngineMeal, "history">): MealPatch | null {
  const prev = meal.history?.[meal.history.length - 1];
  if (!prev) return null;
  return { recipe_key: prev.recipe_key, servings: prev.servings, reason: prev.reason ?? null, history: meal.history.slice(0, -1) };
}

/* ------------------------------------------------------------------ feedback drafts */

/** A learning event for a recipe, with its feature snapshot. */
export function feedbackFor(recipe: Recipe | undefined, recipeKey: string, event: FeedbackEvent, reason: FeedbackReason | null = null, ingredient: string | null = null): FeedbackDraft {
  return { recipe_key: recipe?.key ?? recipeKey, event, reason, ingredient: reason === "dislike_ingredient" ? ingredient : null, features: recipe ? recipeFeatures(recipe) : [] };
}

/**
 * The reason chosen in the strip after a regenerate ("Too complicated"…). It REPLACES the plain
 * "regenerated" row recorded at regenerate time (delete that one, add this one), so the replaced
 * recipe is not penalised twice.
 */
export function regenerateReasonFeedback(recipe: Recipe | undefined, recipeKey: string, reason: FeedbackReason, ingredient?: string | null): FeedbackDraft {
  return feedbackFor(recipe, recipeKey, "regenerated", reason, ingredient ?? null);
}

/* ------------------------------------------------------------------ move / repeat / lock / servings */

export type MoveResult = { ok: true; patches: { id: string; patch: MealPatch }[] } | { ok: false; reason: "not_found" | "other_week" | "wrong_slot" | "locked" | "same_place"; message: string };

const nextPosition = (meals: readonly EngineMeal[], date: ISODate, slot: Slot, exceptId?: string) =>
  meals.filter((m) => m.local_date === date && m.slot === slot && m.id !== exceptId).reduce((mx, m) => Math.max(mx, m.position + 1), 0);

/**
 * Move a meal to another day (and optionally another slot its recipe fits). Snacks join the
 * end of that day's snacks; a breakfast/lunch/dinner swaps places with the meal already there
 * (a locked one is never displaced).
 */
export function moveMeal(meals: readonly EngineMeal[], id: string, to: { local_date: ISODate; slot?: Slot }, lookup: (key: string) => Recipe | undefined): MoveResult {
  const m = meals.find((x) => x.id === id);
  if (!m) return { ok: false, reason: "not_found", message: "That meal is no longer in the plan." };
  const slot = to.slot ?? m.slot;
  if (mondayOf(to.local_date) !== mondayOf(m.local_date)) return { ok: false, reason: "other_week", message: "Meals can move within the same week." };
  if (to.local_date === m.local_date && slot === m.slot) return { ok: false, reason: "same_place", message: "It's already there." };
  const recipe = lookup(m.recipe_key);
  if (recipe && !recipe.slots.includes(slot)) return { ok: false, reason: "wrong_slot", message: `${recipe.name} isn't a ${slot} recipe.` };
  if (slot === "snack") return { ok: true, patches: [{ id, patch: { local_date: to.local_date, slot, position: nextPosition(meals, to.local_date, slot, id) } }] };
  const occupant = meals.find((x) => x.id !== id && x.local_date === to.local_date && x.slot === slot && x.position === 0);
  if (!occupant) return { ok: true, patches: [{ id, patch: { local_date: to.local_date, slot, position: 0 } }] };
  if (occupant.locked) return { ok: false, reason: "locked", message: "The meal there is locked. Unlock it first." };
  const occRecipe = lookup(occupant.recipe_key);
  if (occRecipe && !occRecipe.slots.includes(m.slot)) return { ok: false, reason: "wrong_slot", message: `${occRecipe.name} can't take its place.` };
  return {
    ok: true,
    patches: [
      { id, patch: { local_date: to.local_date, slot, position: 0 } },
      { id: occupant.id!, patch: { local_date: m.local_date, slot: m.slot, position: m.position } },
    ],
  };
}

export type RepeatResult =
  | { ok: true; kind: "add"; meal: EngineMeal; feedback: FeedbackDraft }
  | { ok: true; kind: "replace"; id: string; patch: MealPatch; feedback: FeedbackDraft }
  | { ok: false; reason: "not_found" | "other_week" | "wrong_slot" | "locked" | "same_place"; message: string };

/**
 * Copy a meal to another day/slot ("repeat this meal"). A free breakfast/lunch/dinner place
 * gets a new meal; an occupied one is replaced (its pick goes on `history` for Undo); snacks
 * are added after that day's snacks. Records "repeated" for learning.
 */
export function repeatMeal(meals: readonly EngineMeal[], id: string, to: { local_date: ISODate; slot?: Slot }, lookup: (key: string) => Recipe | undefined): RepeatResult {
  const m = meals.find((x) => x.id === id);
  if (!m) return { ok: false, reason: "not_found", message: "That meal is no longer in the plan." };
  const slot = to.slot ?? m.slot;
  if (mondayOf(to.local_date) !== mondayOf(m.local_date)) return { ok: false, reason: "other_week", message: "Meals can repeat within the same week." };
  if (to.local_date === m.local_date && slot === m.slot && slot !== "snack") return { ok: false, reason: "same_place", message: "Pick another day." };
  const recipe = lookup(m.recipe_key);
  if (recipe && !recipe.slots.includes(slot)) return { ok: false, reason: "wrong_slot", message: `${recipe.name} isn't a ${slot} recipe.` };
  const reason = [repeatReason(recipe ?? { name: "this meal" })];
  const feedback = feedbackFor(recipe, m.recipe_key, "repeated");
  if (slot !== "snack") {
    const occupant = meals.find((x) => x.local_date === to.local_date && x.slot === slot && x.position === 0);
    if (occupant?.locked) return { ok: false, reason: "locked", message: "The meal there is locked. Unlock it first." };
    if (occupant?.id) {
      return {
        ok: true,
        kind: "replace",
        id: occupant.id,
        patch: { recipe_key: m.recipe_key, servings: m.servings, reason, history: [...occupant.history, { recipe_key: occupant.recipe_key, servings: occupant.servings, reason: occupant.reason }] },
        feedback,
      };
    }
  }
  const position = slot === "snack" ? nextPosition(meals, to.local_date, slot) : 0;
  return { ok: true, kind: "add", meal: { local_date: to.local_date, slot, position, recipe_key: m.recipe_key, servings: m.servings, locked: false, reason, history: [] }, feedback };
}

/** Lock or unlock (locked meals survive "regenerate week"). */
export function lockMeal(locked: boolean): MealPatch {
  return { locked };
}

/** Servings, clamped to 0.25–6 and rounded to the nearest ¼. */
export function setServings(servings: number): MealPatch {
  const s = Number.isFinite(servings) ? servings : 1;
  return { servings: Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(s * 4) / 4)) };
}
