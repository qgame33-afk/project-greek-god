// Planner operations (docs/MEALS.md §5): generate a week, regenerate one meal, move, repeat,
// lock and set servings. Pure functions over plain data: they return new meals / patches and
// the learning events to record, and the data hooks (src/lib/data/meals.ts) persist them.
// Deterministic for a given seed.

import { addDays, weekStart as mondayOf, type ISODate } from "@/lib/dates";
import { LIBRARY, getLibraryRecipe } from "../library";
import { shopKey } from "../ingredients";
import { coreIngredients, recipeMacros, recipeFeatures, validateRecipe } from "../recipe";
import type { FeedbackEvent, FeedbackReason, FeedbackRow, Macros, MealPrefs, PlannedMeal, Recipe, Slot, WhyReason } from "../types";
import { candidatesFor, dayGap, type Favourite } from "./constraints";
import { explainPick, repeatReason } from "./explain";
import { learnPrefs, type LearnedModel, type NameOf } from "./prefs";
import { rngFor } from "./rng";
import { fullGoals, SERVING_STEPS, scoreRecipe, selectCandidate, slotShare, slotTarget, VARIETY, type Goals, type NearbyMeal, type ScoredCandidate, type SlotTarget } from "./score";

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
  /**
   * The user's local date (useToday()). When it falls inside the plan week, generateWeek plans
   * only today and the days after it: meals on earlier days stay exactly as they are (see
   * `wholeWeek`). Make-ahead recipes (overnight oats) are never planned for today.
   */
  today?: ISODate;
  /** Plan every day of the week, even days already past when `today` is mid-week. Default false. */
  wholeWeek?: boolean;
}

export interface DaySummary {
  date: ISODate;
  /** Planned (not eaten) totals for the day, from the ingredient database. */
  planned: Macros;
  kcalGoal: number;
  proteinGoal: number;
  /** The profile's fat goal (or 25% of kcal when it has none). */
  fatGoal: number;
  /** Within ±12% of the calorie goal. */
  kcalOk: boolean;
  /** At least 90% of the protein goal. */
  proteinOk: boolean;
  /** No more than 10% over the fat goal. */
  fatOk: boolean;
  meals: number;
}

export interface WeekResult {
  /** New picks for every open place on the planned days (servings set, reasons attached, no ids). */
  meals: EngineMeal[];
  /** Meals that stay as they were: locked, fixed (already logged), or on a day before `from`. */
  kept: EngineMeal[];
  /**
   * What to hand to useSavePlan: the new picks plus every kept meal. replace_meal_plan keeps
   * locked and logged meals itself, but would delete the untouched meals of past days, so they
   * are written back unchanged (same id, servings, reason and history).
   */
  save: EngineMeal[];
  /** First day planned (today when generating the current week mid-week) and the days planned. */
  from: ISODate;
  dates: ISODate[];
  /** Summaries of the planned days. */
  days: DaySummary[];
  /** Places on the planned days nothing could fill (also explained in `warnings`). */
  unfilled: number;
  /** Honest notes: a place nothing fits, a day that can't reach protein with the allowed recipes. */
  warnings: string[];
}

/* ------------------------------------------------------------------ pool */

/** What the UI calls a day that fits (and what generateWeek warns below). */
export const DAY_KCAL_TOLERANCE = 0.12;
export const DAY_PROTEIN_MIN = 0.9;
export const DAY_FAT_MAX = 1.1;

/**
 * What day balancing aims for, tighter than the "fits" check above: kcal within ±3%, protein
 * at goal to 8% over (185–200 g on a 185 g goal), fat 80–100% of goal; carbs are what is left.
 */
export const DAY_AIM = { kcal: 0.03, proteinMin: 1.0, proteinMax: 1.08, fatMin: 0.8, fatMax: 1.0 } as const;
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
  /** The day's goals, carbs and fat filled in. */
  goals: Macros;
  learned: LearnedModel;
  favourites: Map<string, Favourite>;
  byKey: Map<string, Recipe>;
  nameOf: NameOf;
  hasHistory: boolean;
  seed: string;
  places: { slot: Slot; position: number }[];
  /** First day planned (and shopped for): meals before it don't count toward the week's list. */
  from: ISODate;
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
    goals: fullGoals(ctx.goals),
    learned,
    favourites: new Map((ctx.favourites ?? []).map((f) => [f.recipe_key, f])),
    byKey,
    nameOf: (k) => byKey.get(k)?.name ?? getLibraryRecipe(k)?.name,
    hasHistory: learned.events >= 5 || (ctx.history?.length ?? 0) >= 7,
    seed: ctx.seed ?? ctx.weekStart,
    places,
    from: planFrom(ctx.weekStart, ctx.today, ctx.wholeWeek),
  };
}

/** Ingredients the week's other meals already put on the grocery list (from `P.from` on). */
function weekIngredients(P: Prepared, others: readonly Placed[]): Set<string> {
  const out = new Set<string>();
  for (const p of others) if (p.recipe && p.meal.local_date >= P.from) for (const l of coreIngredients(p.recipe)) out.add(shopKey(l.key));
  return out;
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
    if (Math.abs(dayGap(p.meal.local_date, date)) <= VARIETY.cooldownDays) out.push({ recipe: p.recipe, local_date: p.meal.local_date, slot: p.meal.slot });
  }
  for (const h of P.ctx.history ?? []) {
    const r = P.byKey.get(h.recipe_key);
    if (r && Math.abs(dayGap(h.local_date, date)) <= VARIETY.cooldownDays) out.push({ recipe: r, local_date: h.local_date, slot: h.slot });
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
  /** Recipes failing this are not scored at all (a cheap test before the scoring). */
  prefilter?: (r: Recipe) => boolean;
  tag?: string;
}

/** Every candidate that may fill the place (hard filters, then `prefilter`), scored. */
function scoreChoices(P: Prepared, a: ChooseArgs): { scored: ScoredCandidate[]; relaxed: number } {
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
    today: ctx.today,
  });
  const pool = a.prefilter ? recipes.filter(a.prefilter) : recipes;
  if (!pool.length) return { scored: [], relaxed };
  const dayMeals = others.filter((p) => p.meal.local_date === a.date && p.recipe).map((p) => ({ recipe: p.recipe!, servings: p.meal.servings }));
  const nearby = nearbyFor(P, others, a.date);
  const onList = weekIngredients(P, others);
  const scored = pool.map((r) =>
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
      weekIngredients: onList,
    }),
  );
  return { scored, relaxed };
}

function choose(P: Prepared, a: ChooseArgs): { candidate: ScoredCandidate; relaxed: number } | null {
  const { scored, relaxed } = scoreChoices(P, a);
  const sel = selectCandidate(scored, rngFor(P.seed, a.tag ?? "pick", a.date, a.slot, a.position, a.attempt));
  return sel ? { candidate: sel.pick, relaxed } : null;
}

/**
 * What the meal in this place should bring: what the day still needs after the meals already
 * on it, shared out over the places still open by slot share. A fatty breakfast leaves a leaner
 * lunch and dinner to find; a light one, bigger ones. Each macro stays within 0.25–1.6× of the
 * slot's plain share (kcal 0.6–1.6×), so one odd meal never asks for an absurd plate.
 */
export function dayTarget(
  goals: Goals,
  snacksPerDay: number,
  slot: Slot,
  have: Macros,
  /** Slots still open on the day, this one included. */
  open: readonly Slot[],
): Required<SlotTarget> {
  const g = fullGoals(goals);
  const base = slotTarget(slot, goals, snacksPerDay);
  const shares = open.reduce((s, o) => s + slotShare(o, snacksPerDay), 0) || slotShare(slot, snacksPerDay);
  const f = slotShare(slot, snacksPerDay) / shares;
  const pick = (k: keyof Macros, lo: number, hi = 1.6) => Math.min(hi * base[k], Math.max(lo * base[k], (g[k] - have[k]) * f));
  return { kcal: pick("kcal", 0.6), protein: pick("protein", 0.25), carbs: pick("carbs", 0.25, 2), fat: pick("fat", 0.25) };
}

/** dayTarget for a place, from what's already placed on its day. */
function placeTarget(P: Prepared, placed: readonly Placed[], date: ISODate, slot: Slot, position: number): Required<SlotTarget> {
  const place = { local_date: date, slot, position };
  const day = placed.filter((p) => p.meal.local_date === date && !samePlace(p.meal, place));
  const have = sumMacros(day.map((p) => macrosOf(p.recipe, p.meal.servings)));
  const open = P.places.filter((q) => samePlace({ local_date: date, ...q }, place) || !day.some((p) => samePlace(p.meal, { local_date: date, ...q }))).map((q) => q.slot);
  return dayTarget(P.ctx.goals, P.ctx.prefs.snacksPerDay, slot, have, open);
}

/* ------------------------------------------------------------------ day balancing */

function stepIndex(s: number): number {
  let best = 0;
  for (let i = 0; i < SERVING_STEPS.length; i++) if (Math.abs(SERVING_STEPS[i] - s) < Math.abs(SERVING_STEPS[best] - s)) best = i;
  return best;
}

/**
 * How far a day's totals sit from DAY_AIM, as one number (0 = on aim). Calories off, protein
 * short (worst), protein over, fat over and fat well under each cost, squared, in shares of the
 * goal. Carbs are what the calories leave.
 */
export function dayMiss(t: Macros, goals: Goals): number {
  const g = fullGoals(goals);
  const k = Math.max(0, Math.abs(t.kcal - g.kcal) / g.kcal - DAY_AIM.kcal / 2);
  const pShort = Math.max(0, DAY_AIM.proteinMin * g.protein - t.protein) / g.protein;
  const pOver = Math.max(0, t.protein - DAY_AIM.proteinMax * g.protein) / g.protein;
  const fOver = Math.max(0, t.fat - DAY_AIM.fatMax * g.fat) / g.fat;
  const fUnder = Math.max(0, DAY_AIM.fatMin * g.fat - t.fat) / g.fat;
  return 900 * k * k + 900 * pShort * pShort + 1200 * pOver * pOver + 500 * fOver * fOver + 100 * fUnder * fUnder;
}

/** True when a day's totals are within DAY_AIM. */
export function dayOnAim(t: Macros, goals: Goals): boolean {
  const g = fullGoals(goals);
  return (
    Math.abs(t.kcal - g.kcal) / g.kcal <= DAY_AIM.kcal &&
    t.protein >= DAY_AIM.proteinMin * g.protein &&
    t.protein <= DAY_AIM.proteinMax * g.protein &&
    t.fat <= DAY_AIM.fatMax * g.fat &&
    t.fat >= DAY_AIM.fatMin * g.fat
  );
}

/** Serving steps away from 1 (and 2 or more) cost a little, so plates stay normal. */
const servingsCost = (servings: number[]) => servings.reduce((s, x) => s + 0.08 * (x - 1) * (x - 1) + (x >= 2 ? 0.1 : 0), 0);

/**
 * Day balancing swaps (balanceDay). A swap is chosen by what it does to the score of that place
 * (taste, variety, fit: the new pick's score minus the current one's) plus how much it brings the
 * day toward aim (`gain`, the drop in dayMiss, counted up to `gainCap`), so among swaps that fix
 * the day the user's taste still decides, and a liked meal is only swapped out for a real gain.
 */
export const BALANCE = { swaps: 8, minGain: 0.05, gainWeight: 1, gainCap: 3 } as const;

/** Where a meal sits, as a map key. */
const placeId = (m: Pick<EngineMeal, "local_date" | "slot" | "position">) => `${m.local_date}|${m.slot}|${m.position}`;

/**
 * Bring a day onto DAY_AIM (kcal ±3%, protein 100–108%, fat 80–100% of goal) where the allowed
 * recipes can: first by stepping servings of the day's new picks along the serving ladder; then,
 * while the day is still off, by swapping one new pick at a time for a candidate that helps
 * (BALANCE: drawn by softmax over score change + gain, so taste and variety still choose), then
 * servings again. Swaps come only from the strict tier of the hard filters (never a harder
 * recipe or a repeat the planner had to allow because too few fit). Locked and logged meals
 * never change; `avoid` keeps a place's previous recipe out when the week is regenerated.
 */
function balanceDay(P: Prepared, placed: Placed[], date: ISODate, avoid?: ReadonlyMap<string, string>): void {
  const { goals } = P.ctx;
  const day = () => placed.filter((p) => p.meal.local_date === date);
  const totals = () => sumMacros(day().map((p) => macrosOf(p.recipe, p.meal.servings)));
  const cost = (t: Macros, servings: number[]) => dayMiss(t, goals) + servingsCost(servings);
  const ok = () => dayOnAim(totals(), goals);

  const servingsPass = () => {
    for (let iter = 0; iter < 24 && !ok(); iter++) {
      const adjustable = day().filter((p) => !p.fixed && p.recipe);
      const t = totals();
      const now = cost(t, adjustable.map((p) => p.meal.servings));
      let best: { p: Placed; s: number; c: number } | null = null;
      for (const p of adjustable) {
        const i = stepIndex(p.meal.servings);
        const cur = macrosOf(p.recipe, p.meal.servings);
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= SERVING_STEPS.length) continue;
          const s = SERVING_STEPS[j];
          const next = macrosOf(p.recipe, s);
          const c = cost(add(t, next, cur), adjustable.map((q) => (q === p ? s : q.meal.servings)));
          if (c < now - 1e-6 && (!best || c < best.c)) best = { p, s, c };
        }
      }
      if (!best) break;
      best.p.meal = { ...best.p.meal, servings: best.s };
    }
  };

  /** The serving step that suits the rest of the day best for a recipe, and how much the day gains. */
  const bestFit = (recipe: Recipe, without: Macros, now: number): { s: number; gain: number } => {
    const one = macrosOf(recipe, 1);
    let best = { s: 1, miss: Infinity, cost: Infinity };
    for (const s of SERVING_STEPS) {
      const miss = dayMiss(add(without, scale(one, s)), goals);
      const c = miss + servingsCost([s]);
      if (c < best.cost - 1e-9) best = { s, miss, cost: c };
    }
    return { s: best.s, gain: now - best.miss };
  };

  servingsPass();
  for (let attempt = 0; attempt < BALANCE.swaps && !ok(); attempt++) {
    const t = totals();
    const now = dayMiss(t, goals);
    const options: { p: Placed; c: ScoredCandidate; gain: number; value: number }[] = [];
    for (const p of day()) {
      if (p.fixed || !p.recipe) continue;
      const without = add(t, ZERO, macrosOf(p.recipe, p.meal.servings));
      const fits = new Map<string, { s: number; gain: number }>();
      const prefilter = (r: Recipe) => {
        const f = bestFit(r, without, now);
        if (f.gain <= BALANCE.minGain) return false;
        fits.set(r.key, f);
        return true;
      };
      const target = dayTarget(goals, P.ctx.prefs.snacksPerDay, p.meal.slot, without, [p.meal.slot]);
      const exclude = new Set([p.meal.recipe_key, ...(avoid?.has(placeId(p.meal)) ? [avoid.get(placeId(p.meal))!] : [])]);
      const { scored, relaxed } = scoreChoices(P, { date, slot: p.meal.slot, position: p.meal.position, placed, target, attempt, exclude, prefilter });
      // balancing never loosens a rule (a harder recipe, a spaced repeat, past the time cap)
      if (relaxed) continue;
      const current = p.candidate?.total ?? 0;
      for (const c of scored) {
        const f = fits.get(c.recipe.key)!;
        const sized = f.s === c.servings ? c : { ...c, servings: f.s, macros: macrosOf(c.recipe, f.s) };
        const value = c.total - current + BALANCE.gainWeight * Math.min(BALANCE.gainCap, f.gain);
        if (value > 0) options.push({ p, c: sized, gain: f.gain, value });
      }
    }
    if (!options.length) break;
    // the usual softmax over the top swaps by value (score change + capped gain)
    const asCandidates = options.map((o) => ({ ...o.c, total: o.value }));
    const sel = selectCandidate(asCandidates, rngFor(P.seed, "balance", date, attempt));
    if (!sel) break;
    const o = options[asCandidates.indexOf(sel.pick)];
    o.p.recipe = o.c.recipe;
    o.p.candidate = o.c;
    o.p.meal = { ...o.p.meal, recipe_key: o.c.recipe.key, servings: o.c.servings };
    servingsPass();
  }
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const scale = (m: Macros, s: number): Macros => ({ kcal: m.kcal * s, protein: m.protein * s, carbs: m.carbs * s, fat: m.fat * s });
/** t + plus − minus, per macro. */
function add(t: Macros, plus: Macros, minus: Macros = ZERO): Macros {
  return { kcal: t.kcal + plus.kcal - minus.kcal, protein: t.protein + plus.protein - minus.protein, carbs: t.carbs + plus.carbs - minus.carbs, fat: t.fat + plus.fat - minus.fat };
}

function summarize(P: Prepared, placed: readonly Placed[], date: ISODate): DaySummary {
  const day = placed.filter((p) => p.meal.local_date === date);
  const planned = sumMacros(day.map((p) => macrosOf(p.recipe, p.meal.servings)));
  const { kcal, protein, fat } = P.goals;
  return {
    date,
    planned,
    kcalGoal: kcal,
    proteinGoal: protein,
    fatGoal: Math.round(fat),
    kcalOk: Math.abs(planned.kcal - kcal) / kcal <= DAY_KCAL_TOLERANCE,
    proteinOk: planned.protein >= DAY_PROTEIN_MIN * protein,
    fatOk: planned.fat <= DAY_FAT_MAX * fat,
    meals: day.length,
  };
}

function checkGoals(goals: Goals) {
  if (!(goals?.kcal > 0) || !(goals?.protein > 0)) throw new Error("Set your calorie and protein goals first.");
}

/**
 * The first day a plan (and its grocery list) covers: the Monday, or `today` when it falls
 * mid-week and `wholeWeek` is off. The day after Sunday when the whole week is already past.
 */
export function planFrom(weekStart: ISODate, today?: ISODate | null, wholeWeek = false): ISODate {
  const monday = mondayOf(weekStart);
  if (wholeWeek || !today || today <= monday) return monday;
  return today > addDays(monday, 6) ? addDays(monday, 7) : today;
}

/** The plan week's days from `from` to Sunday. */
export function planDates(weekStart: ISODate, from: ISODate): ISODate[] {
  const monday = mondayOf(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d >= from);
}

const engineMeal = (m: EngineMeal): EngineMeal => ({
  ...(m.id ? { id: m.id } : {}),
  local_date: m.local_date,
  slot: m.slot,
  position: m.position,
  recipe_key: m.recipe_key,
  servings: m.servings,
  locked: m.locked,
  reason: m.reason ?? null,
  history: m.history ?? [],
});

/* ------------------------------------------------------------------ generate week */

/**
 * Plan the week: each day × breakfast, lunch, dinner and `snacksPerDay` snacks — from `today`
 * on when it falls mid-week (past days keep their meals; `wholeWeek` plans all 7). Locked
 * meals (and `fixedIds`) stay where they are and count toward variety and day totals. Each
 * pick aims at what its day still needs (dayTarget: kcal, protein, carbs and fat); each day is
 * then balanced onto DAY_AIM where the allowed recipes can. Same context + seed → same plan.
 * Save `save`, not `meals`.
 */
export function generateWeek(ctx: PlanContext): WeekResult {
  checkGoals(ctx.goals);
  const P = prepare(ctx);
  const from = planFrom(ctx.weekStart, ctx.today, ctx.wholeWeek);
  const dates = planDates(ctx.weekStart, from);
  const fixedIds = new Set(ctx.fixedIds ?? []);
  const kept = (ctx.meals ?? []).filter((m) => m.locked || (m.id && fixedIds.has(m.id)) || m.local_date < from);
  // regenerating a week: the meal being replaced in each place isn't picked there again (unless nothing else fits)
  const replaced = (ctx.meals ?? []).filter((m) => !kept.includes(m));
  const placed: Placed[] = kept.map((m) => ({ meal: m, recipe: P.byKey.get(m.recipe_key), fixed: true }));
  const avoid = new Map(replaced.map((m) => [placeId(m), m.recipe_key]));
  const warnings: string[] = [];
  let unfilled = 0;

  for (const date of dates) {
    for (const { slot, position } of P.places) {
      if (placed.some((p) => samePlace(p.meal, { local_date: date, slot, position }))) continue;
      const target = placeTarget(P, placed, date, slot, position);
      const before = replaced.find((m) => samePlace(m, { local_date: date, slot, position }));
      const res = (before && choose(P, { date, slot, position, placed, target, attempt: 0, exclude: new Set([before.recipe_key]) })) || choose(P, { date, slot, position, placed, target, attempt: 0 });
      if (!res) {
        unfilled++;
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
    balanceDay(P, placed, date, avoid);
  }

  const days = dates.map((d) => summarize(P, placed, d));
  for (const d of days) if (d.meals && !d.proteinOk) warnings.push(`${d.date}: ${Math.round(d.planned.protein)} g protein planned, under 90% of your ${d.proteinGoal} g goal with the recipes your settings allow.`);
  for (const d of days) if (d.meals && !d.fatOk) warnings.push(`${d.date}: ${Math.round(d.planned.fat)} g fat planned, over your ${d.fatGoal} g goal with the recipes your settings allow.`);
  const meals = sortMeals(
    placed
      .filter((p) => !p.fixed)
      .map((p) => ({ ...p.meal, reason: p.candidate ? explainPick(p.candidate, { slot: p.meal.slot, learned: P.learned, nameOf: P.nameOf }, { servings: p.meal.servings, macros: macrosOf(p.recipe, p.meal.servings) }) : null })),
  );
  const keptMeals = sortMeals(kept.map(engineMeal));
  return { meals, kept: keptMeals, save: sortMeals([...meals, ...keptMeals]), from, dates, days, unfilled, warnings };
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
 * regenerate session. Everything else in the week stays exactly as it is. The pick and its
 * servings aim at what the day still needs (kcal, protein, carbs and fat), so the day stays balanced.
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
  // aim at what the day still needs after its other meals (kcal, protein, carbs and fat), as
  // if the places with no meal yet were still to come
  const target = placeTarget(P, placed, meal.local_date, meal.slot, meal.position);
  const exclude = new Set([meal.recipe_key, ...shown]);
  const res = choose(P, { date: meal.local_date, slot: meal.slot, position: meal.position, placed, target, attempt: shown.length + 1, exclude, tag: `regen:${key}` });
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
