// Pure rules behind the meal planner data hooks (src/lib/data/meals.ts): row <-> app type
// mapping, validation, the optimistic mirrors of the database's replace/sync functions, and
// building the single food-log row for "Add to today's food log". No React, no Supabase, so
// everything here is unit-tested (meals-model.test.ts). See docs/MEALS.md §3.

import { z } from "zod";
import { addDays, weekStart, type ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import type { DaySchedule } from "@/lib/prefs";
import {
  DEFAULT_PREFS,
  SLOTS,
  type Allergen,
  type Budget,
  type Diet,
  type Difficulty,
  type Equipment,
  type FeedbackEvent,
  type FeedbackReason,
  type FeedbackRow,
  type GroceryCategory,
  type Macros,
  type MealPrefs,
  type PlannedMeal,
  type Recipe,
  type RecipeOrigin,
  type Slot,
  type WhyReason,
} from "@/lib/meals/types";
import type { Database, Json } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type MealPrefsRow = Tables["meal_prefs"]["Row"];
export type MealPlanRow = Tables["meal_plans"]["Row"];
export type PlannedMealRow = Tables["planned_meals"]["Row"];
export type MealFeedbackRow = Tables["meal_feedback"]["Row"];
export type FavouriteRow = Tables["favourite_recipes"]["Row"];
export type UserRecipeRow = Tables["recipes"]["Row"];
export type GroceryItem = Tables["grocery_items"]["Row"];
export type PlannedFoodEntry = Tables["food_entries"]["Insert"] & { id: string };

/* ------------------------------------------------------------------ weeks */

export { weekStart };

/** The seven dates (Mon → Sun) of the plan week starting `ws`. */
export function weekDays(ws: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}

/** Monday `n` weeks after (or before, when negative) the week containing `d`. */
export function shiftWeek(d: ISODate, n: number): ISODate {
  return addDays(weekStart(d), n * 7);
}

export function inWeek(date: ISODate, ws: ISODate): boolean {
  return date >= ws && date <= addDays(ws, 6);
}

/* ------------------------------------------------------------ enumerations */

const DIFFICULTIES: Difficulty[] = ["super_easy", "everyday", "i_like_cooking"];
const BUDGETS: Budget[] = ["tight", "normal", "flexible"];
const ALLERGENS: Allergen[] = ["dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"];
const DIETS: Diet[] = ["vegetarian", "pescatarian", "no_pork", "no_beef", "halal", "lactose_free", "gluten_free", "dairy_free"];
const EQUIPMENT: Equipment[] = ["stovetop", "oven", "microwave", "air_fryer", "toaster", "blender", "grill", "kettle"];
export const FEEDBACK_EVENTS: FeedbackEvent[] = ["thumbs_up", "thumbs_down", "saved", "unsaved", "regenerated", "kept", "logged", "cooked", "repeated", "made_easier", "viewed"];
export const FEEDBACK_REASONS: FeedbackReason[] = ["dont_like", "too_complicated", "too_long", "too_expensive", "ate_recently", "dislike_ingredient"];
export const GROCERY_CATEGORIES: GroceryCategory[] = ["meat", "dairy_eggs", "bread_grains", "fruit", "vegetables", "frozen", "pantry", "other"];
const WHY_KINDS: WhyReason["kind"][] = ["liked_similar", "liked_ingredient", "liked_cuisine", "favourite", "difficulty_fit", "macro_fit", "budget_fit", "new_for_you", "pantry", "repeat"];

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ prefs */

const key = z.string().trim().min(1).max(80);
export const mealPrefsSchema = z.object({
  difficulty: z.enum(DIFFICULTIES),
  budget: z.enum(BUDGETS),
  weeklyBudgetCad: z.number().min(0).max(5000).nullable(),
  maxMinutes: z.number().int().min(5).max(240).nullable(),
  allergies: z.array(z.enum(ALLERGENS)),
  diets: z.array(z.enum(DIETS)),
  dislikedIngredients: z.array(key).max(300),
  likedIngredients: z.array(key).max(300),
  likedCuisines: z.array(key).max(50),
  dislikedCuisines: z.array(key).max(50),
  equipment: z.array(z.enum(EQUIPMENT)),
  pantry: z.array(key).max(300),
  snacksPerDay: z.number().int().min(1).max(3),
}) satisfies z.ZodType<MealPrefs>;

const PREF_COLUMN = {
  difficulty: "difficulty",
  budget: "budget",
  weeklyBudgetCad: "weekly_budget_cad",
  maxMinutes: "max_minutes",
  allergies: "allergies",
  diets: "diets",
  dislikedIngredients: "disliked_ingredients",
  likedIngredients: "liked_ingredients",
  likedCuisines: "liked_cuisines",
  dislikedCuisines: "disliked_cuisines",
  equipment: "equipment",
  pantry: "pantry",
  snacksPerDay: "snacks_per_day",
} as const satisfies Record<keyof MealPrefs, keyof MealPrefsRow>;

/** The stored preferences, or DEFAULT_PREFS for someone who never saved any. Unknown values are dropped. */
export function prefsFromRow(row: Partial<MealPrefsRow> | null | undefined): MealPrefs {
  if (!row) return { ...DEFAULT_PREFS, equipment: [...DEFAULT_PREFS.equipment] };
  const strs = (v: unknown) => (Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === "string" && x.length > 0)) : []);
  const snacks = num(row.snacks_per_day);
  return {
    difficulty: oneOf(DIFFICULTIES, row.difficulty) ? row.difficulty : DEFAULT_PREFS.difficulty,
    budget: oneOf(BUDGETS, row.budget) ? row.budget : DEFAULT_PREFS.budget,
    weeklyBudgetCad: num(row.weekly_budget_cad),
    maxMinutes: num(row.max_minutes),
    allergies: strs(row.allergies).filter((a): a is Allergen => oneOf(ALLERGENS, a)),
    diets: strs(row.diets).filter((d): d is Diet => oneOf(DIETS, d)),
    dislikedIngredients: strs(row.disliked_ingredients),
    likedIngredients: strs(row.liked_ingredients),
    likedCuisines: strs(row.liked_cuisines),
    dislikedCuisines: strs(row.disliked_cuisines),
    equipment: row.equipment === undefined ? [...DEFAULT_PREFS.equipment] : strs(row.equipment).filter((e): e is Equipment => oneOf(EQUIPMENT, e)),
    pantry: strs(row.pantry),
    snacksPerDay: snacks != null && snacks >= 1 && snacks <= 3 ? Math.round(snacks) : DEFAULT_PREFS.snacksPerDay,
  };
}

/**
 * Validate a partial preferences change and turn it into column values. Lists are
 * de-duplicated. Throws an Error with a readable message when a value is out of range.
 */
export function prefsPatchToRow(patch: Partial<MealPrefs>): Tables["meal_prefs"]["Update"] {
  const parsed = mealPrefsSchema.partial().safeParse(patch);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`That preference isn't valid (${issue?.path.join(".") || "value"}).`);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data) as [keyof MealPrefs, unknown][]) {
    if (v === undefined) continue;
    out[PREF_COLUMN[k]] = Array.isArray(v) ? uniq(v) : v;
  }
  return out as Tables["meal_prefs"]["Update"];
}

/* ---------------------------------------------------------- planned meals */

/** A planned meal as the hooks return it: the shared PlannedMeal plus its timestamps. */
export interface PlanMeal extends PlannedMeal {
  created_at: string;
  updated_at: string;
}

/** What a week view needs: the plan row (null until the week is generated) and its meals. */
export interface WeekPlan {
  plan: MealPlanRow | null;
  meals: PlanMeal[];
}

export const HISTORY_CAP = 30;

function whyList(v: unknown): WhyReason[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .filter((r) => oneOf(WHY_KINDS, r.kind) && typeof r.text === "string")
    .map((r) => ({ kind: r.kind as WhyReason["kind"], text: String(r.text), weight: num(r.weight) ?? 0 }));
}

function historyList(v: unknown): PlannedMeal["history"] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && typeof (h as { recipe_key?: unknown }).recipe_key === "string")
    .map((h) => ({ recipe_key: String(h.recipe_key), servings: num(h.servings) ?? 1, reason: whyList(h.reason) }));
}

export function plannedMealFromRow(row: PlannedMealRow): PlanMeal {
  return {
    id: row.id,
    plan_id: row.plan_id,
    local_date: row.local_date,
    slot: oneOf(SLOTS, row.slot) ? row.slot : "snack",
    position: Number(row.position) || 0,
    recipe_key: row.recipe_key,
    servings: num(row.servings) ?? 1,
    locked: !!row.locked,
    reason: whyList(row.reason),
    history: historyList(row.history),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SLOT_ORDER: Record<Slot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

/** Day, then breakfast → lunch → dinner → snacks, then position. */
export function sortPlanMeals<T extends Pick<PlannedMeal, "local_date" | "slot" | "position">>(meals: T[]): T[] {
  return [...meals].sort((a, b) => a.local_date.localeCompare(b.local_date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.position - b.position);
}

/** Fields a planned meal can change after it's planned. */
export type PlannedMealPatch = Partial<Pick<PlannedMeal, "recipe_key" | "servings" | "locked" | "reason" | "history" | "local_date" | "slot" | "position">>;

export const MIN_SERVINGS = 0.25;
export const MAX_SERVINGS = 6;

function checkServings(s: number) {
  if (!Number.isFinite(s) || s < MIN_SERVINGS || s > MAX_SERVINGS) throw new Error(`Servings must be between ${MIN_SERVINGS} and ${MAX_SERVINGS}.`);
  return r2(s);
}

/** Validate a patch and turn it into column values (servings to 2 dp, Undo history capped, newest kept). */
export function plannedMealPatchToRow(patch: PlannedMealPatch): Tables["planned_meals"]["Update"] {
  const out: Tables["planned_meals"]["Update"] = {};
  if (patch.recipe_key !== undefined) {
    if (!patch.recipe_key || patch.recipe_key.length > 80) throw new Error("That recipe can't be planned.");
    out.recipe_key = patch.recipe_key;
  }
  if (patch.servings !== undefined) out.servings = checkServings(patch.servings);
  if (patch.locked !== undefined) out.locked = patch.locked;
  if (patch.reason !== undefined) out.reason = (patch.reason ?? null) as Json | null;
  if (patch.history !== undefined) out.history = patch.history.slice(-HISTORY_CAP) as unknown as NonNullable<Json>;
  if (patch.local_date !== undefined) out.local_date = patch.local_date;
  if (patch.slot !== undefined) {
    if (!oneOf(SLOTS, patch.slot)) throw new Error("Unknown meal slot.");
    out.slot = patch.slot;
  }
  if (patch.position !== undefined) out.position = Math.max(0, Math.min(20, Math.round(patch.position)));
  return out;
}

/** The week with one meal changed (optimistic cache update). */
export function applyMealPatch(week: WeekPlan, id: string, patch: PlannedMealPatch, now = new Date().toISOString()): WeekPlan {
  const meals = week.meals.map((m) =>
    m.id === id ? { ...m, ...patch, history: patch.history ? patch.history.slice(-HISTORY_CAP) : m.history, updated_at: now } : m,
  );
  return { ...week, meals: sortPlanMeals(meals) };
}

/** One meal in a week being created or replaced (id optional: the database makes one). */
export interface NewPlannedMeal {
  id?: string;
  local_date: ISODate;
  slot: Slot;
  position?: number;
  recipe_key: string;
  servings: number;
  locked?: boolean;
  reason?: WhyReason[] | null;
  history?: PlannedMeal["history"];
}

/** Check a week's meals before they're written. Throws a readable Error. */
export function validateNewMeals(meals: NewPlannedMeal[], ws: ISODate): NewPlannedMeal[] {
  if (weekStart(ws) !== ws) throw new Error("A plan week starts on a Monday.");
  return meals.map((m) => {
    if (!inWeek(m.local_date, ws)) throw new Error(`${m.local_date} isn't in the week of ${ws}.`);
    if (!oneOf(SLOTS, m.slot)) throw new Error("Unknown meal slot.");
    if (!m.recipe_key || m.recipe_key.length > 80) throw new Error("That recipe can't be planned.");
    return { ...m, position: Math.max(0, Math.min(20, Math.round(m.position ?? 0))), servings: checkServings(m.servings), history: (m.history ?? []).slice(-HISTORY_CAP) };
  });
}

const placeOf = (m: { local_date: string; slot: string; position?: number }) => `${m.local_date}|${m.slot}|${m.position ?? 0}`;

/**
 * What replace_meal_plan will do, computed locally for the optimistic update and Undo:
 * locked meals (and meals already in the food log) stay; everything else goes; incoming meals
 * that would take a kept meal's id or place are dropped.
 */
export function planReplacement(
  existing: PlanMeal[],
  incoming: NewPlannedMeal[],
  opts: { keepLocked?: boolean; keepLogged?: boolean; loggedIds?: ReadonlySet<string> } = {},
): { kept: PlanMeal[]; removed: PlanMeal[]; added: NewPlannedMeal[] } {
  const keepLocked = opts.keepLocked ?? true;
  const keepLogged = opts.keepLogged ?? true;
  const logged = opts.loggedIds ?? new Set<string>();
  const kept: PlanMeal[] = [];
  const removed: PlanMeal[] = [];
  for (const m of existing) ((keepLocked && m.locked) || (keepLogged && logged.has(m.id)) ? kept : removed).push(m);
  const takenIds = new Set(kept.map((m) => m.id));
  const takenPlaces = new Set(kept.map(placeOf));
  const added: NewPlannedMeal[] = [];
  for (const m of incoming) {
    if ((m.id && takenIds.has(m.id)) || takenPlaces.has(placeOf(m))) continue;
    added.push(m);
    if (m.id) takenIds.add(m.id);
    takenPlaces.add(placeOf(m));
  }
  return { kept, removed, added };
}

/** A not-yet-saved meal shaped like a stored one (for the optimistic cache). */
export function optimisticPlanMeal(m: NewPlannedMeal, planId: string, id: string, now: string): PlanMeal {
  return {
    id: m.id ?? id,
    plan_id: planId,
    local_date: m.local_date,
    slot: m.slot,
    position: m.position ?? 0,
    recipe_key: m.recipe_key,
    servings: m.servings,
    locked: m.locked ?? false,
    reason: m.reason ?? null,
    history: m.history ?? [],
    created_at: now,
    updated_at: now,
  };
}

/** A stored meal as input for replace_meal_plan (used to put a week back on Undo). */
export function toNewPlannedMeal(m: PlannedMeal): NewPlannedMeal {
  return { id: m.id, local_date: m.local_date, slot: m.slot, position: m.position, recipe_key: m.recipe_key, servings: m.servings, locked: m.locked, reason: m.reason, history: m.history };
}

/** planned meal id → the dates it was logged on, from food_entries rows. */
export function loggedByPlannedMeal(rows: { planned_meal_id: string | null; local_date: string }[]): Record<string, ISODate[]> {
  const out: Record<string, ISODate[]> = {};
  for (const r of rows) {
    if (!r.planned_meal_id) continue;
    const list = (out[r.planned_meal_id] ??= []);
    if (!list.includes(r.local_date)) list.push(r.local_date);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

/* --------------------------------------------------------------- feedback */

/** A stored learning signal (FeedbackRow plus its id, for Undo). */
export interface MealFeedback extends FeedbackRow {
  id: string;
}

/** Explicit signals the user chose: a failed save is worth telling them about. */
export function isExplicitFeedback(e: { event: FeedbackEvent; reason?: FeedbackReason | null }) {
  return e.event === "thumbs_up" || e.event === "thumbs_down" || e.event === "saved" || e.event === "unsaved" || !!e.reason;
}

export function feedbackFromRow(row: MealFeedbackRow): MealFeedback | null {
  if (!oneOf(FEEDBACK_EVENTS, row.event)) return null;
  return {
    id: row.id,
    recipe_key: row.recipe_key,
    event: row.event,
    reason: oneOf(FEEDBACK_REASONS, row.reason) ? row.reason : null,
    ingredient: row.ingredient ?? null,
    features: Array.isArray(row.features) ? row.features : [],
    created_at: row.created_at,
  };
}

export interface NewFeedback {
  id?: string;
  recipe_key: string;
  event: FeedbackEvent;
  reason?: FeedbackReason | null;
  ingredient?: string | null;
  /** recipeFeatures(recipe) at the time — learning keeps working if the recipe changes later. */
  features: string[];
}

export function feedbackToRow(f: NewFeedback, id: string): Tables["meal_feedback"]["Insert"] & { id: string } {
  if (!oneOf(FEEDBACK_EVENTS, f.event)) throw new Error("Unknown feedback.");
  if (f.reason != null && !oneOf(FEEDBACK_REASONS, f.reason)) throw new Error("Unknown feedback reason.");
  if (!f.recipe_key || f.recipe_key.length > 80) throw new Error("Unknown recipe.");
  return {
    id: f.id ?? id,
    recipe_key: f.recipe_key,
    event: f.event,
    reason: f.reason ?? null,
    ingredient: f.ingredient ? f.ingredient.slice(0, 80) : null,
    features: uniq(f.features.filter((x) => typeof x === "string" && x.length > 0)).slice(0, 200),
  };
}

/* ---------------------------------------------------------- user recipes */

export const USER_RECIPE_PREFIX = "usr:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function userRecipeKey(id: string) {
  return `${USER_RECIPE_PREFIX}${id}`;
}

/** The recipes row id behind a "usr:<uuid>" key, or null for library / malformed keys. */
export function userRecipeId(key: string): string | null {
  if (!key.startsWith(USER_RECIPE_PREFIX)) return null;
  const id = key.slice(USER_RECIPE_PREFIX.length);
  return UUID.test(id) ? id : null;
}

const USER_ORIGINS: Exclude<RecipeOrigin, "library">[] = ["ai", "simplified", "custom"];

/** A stored user recipe as a Recipe (key "usr:<id>"), or null if the stored JSON is unusable. */
export function recipeFromRow(row: UserRecipeRow): Recipe | null {
  const d = row.data as Partial<Recipe> | null;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  if (!Array.isArray(d.ingredients) || !Array.isArray(d.steps) || !Array.isArray(d.slots)) return null;
  return {
    ...(d as Recipe),
    key: userRecipeKey(row.id),
    name: row.name,
    origin: oneOf(USER_ORIGINS, row.origin) ? row.origin : "custom",
    baseKey: row.base_key ?? d.baseKey,
    tags: Array.isArray(d.tags) ? d.tags : [],
    equipment: Array.isArray(d.equipment) ? d.equipment : [],
  };
}

/** Row for a user recipe. The recipe should already be normalised + validated (recipe.ts). */
export function recipeToRow(recipe: Recipe, id: string): Tables["recipes"]["Insert"] & { id: string } {
  if (!oneOf(USER_ORIGINS, recipe.origin)) throw new Error("Only AI, simplified or custom recipes are saved to your account.");
  const name = recipe.name?.trim() ?? "";
  if (!name || name.length > 80) throw new Error("A recipe needs a name of up to 80 characters.");
  const data: Recipe = { ...recipe, key: userRecipeKey(id), name };
  return { id, origin: recipe.origin, base_key: recipe.baseKey ?? null, name, data: data as unknown as NonNullable<Json> };
}

/* ---------------------------------------------------------------- grocery */

/** A generated grocery line (from the engine's buildGroceryList), in column names. */
export interface GroceryItemInput {
  key: string; // ingredient key
  name: string;
  category: GroceryCategory;
  qty?: number | null;
  unit?: string | null;
  label?: string | null; // "2 × 454 g packs"
  est_cost_cad?: number | null;
  position?: number;
  /** Initial "already have" for a NEW line (pantry prefs). Existing lines keep theirs. */
  have?: boolean;
}

export const CUSTOM_GROCERY_PREFIX = "custom:";
export const customGroceryKey = (id: string) => `${CUSTOM_GROCERY_PREFIX}${id}`;
export const isCustomGroceryKey = (k: string) => k.startsWith(CUSTOM_GROCERY_PREFIX);

/** Generated lines with unique, non-custom keys (first one wins), as sent to sync_grocery_items. */
export function cleanGroceryInput(items: GroceryItemInput[]): GroceryItemInput[] {
  const seen = new Set<string>();
  const out: GroceryItemInput[] = [];
  for (const i of items) {
    if (!i.key || isCustomGroceryKey(i.key) || seen.has(i.key)) continue;
    seen.add(i.key);
    out.push({
      key: i.key.slice(0, 120),
      name: (i.name || i.key).slice(0, 120),
      category: oneOf(GROCERY_CATEGORIES, i.category) ? i.category : "other",
      qty: num(i.qty) != null ? Math.max(0, r2(num(i.qty)!)) : null,
      unit: i.unit ? i.unit.slice(0, 24) : null,
      label: i.label ? i.label.slice(0, 160) : null,
      est_cost_cad: num(i.est_cost_cad) != null ? Math.max(0, r2(num(i.est_cost_cad)!)) : null,
      position: Math.round(num(i.position) ?? out.length),
      have: !!i.have,
    });
  }
  return out;
}

/**
 * What sync_grocery_items will store, computed locally (optimistic update): generated lines are
 * upserted keeping each existing line's checked / have / removed; generated lines no longer
 * needed go; custom lines always stay.
 */
export function mergeGroceryItems(
  existing: GroceryItem[],
  generated: GroceryItemInput[],
  ctx: { planId: string; userId: string; now: string; newId: () => string },
): GroceryItem[] {
  const byKey = new Map(existing.map((i) => [i.key, i]));
  const gen = cleanGroceryInput(generated);
  const out: GroceryItem[] = existing.filter((i) => i.custom);
  for (const g of gen) {
    const prev = byKey.get(g.key);
    if (prev?.custom) continue;
    out.push({
      id: prev?.id ?? ctx.newId(),
      user_id: prev?.user_id ?? ctx.userId,
      plan_id: ctx.planId,
      key: g.key,
      name: g.name,
      category: g.category,
      qty: g.qty ?? null,
      unit: g.unit ?? null,
      label: g.label ?? null,
      est_cost_cad: g.est_cost_cad ?? null,
      position: g.position ?? 0,
      checked: prev?.checked ?? false,
      have: prev ? prev.have : !!g.have,
      removed: prev?.removed ?? false,
      custom: false,
      created_at: prev?.created_at ?? ctx.now,
      updated_at: ctx.now,
    });
  }
  return sortGroceryItems(out);
}

/** True when the stored list no longer matches what the current plan needs (the "plan changed" banner). */
export function groceryOutOfDate(stored: Pick<GroceryItem, "key" | "qty" | "unit" | "custom">[], generated: GroceryItemInput[]): boolean {
  const want = new Map(cleanGroceryInput(generated).map((g) => [g.key, g]));
  const have = stored.filter((s) => !s.custom);
  if (have.length !== want.size) return true;
  for (const s of have) {
    const g = want.get(s.key);
    if (!g) return true;
    if ((g.unit ?? null) !== (s.unit ?? null)) return true;
    const a = num(s.qty);
    const b = g.qty ?? null;
    if ((a == null) !== (b == null)) return true;
    if (a != null && b != null && Math.abs(a - b) > 0.005 * Math.max(1, Math.abs(b))) return true;
  }
  return false;
}

const CATEGORY_ORDER = Object.fromEntries(GROCERY_CATEGORIES.map((c, i) => [c, i])) as Record<string, number>;

/** Store-aisle order: category, then the generator's position, then name. */
export function sortGroceryItems<T extends Pick<GroceryItem, "category" | "position" | "name">>(items: T[]): T[] {
  return [...items].sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) || a.position - b.position || a.name.localeCompare(b.name));
}

/* --------------------------------------------------------------- food log */

const SLOT_MEAL: Record<Slot, Meal> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snacks" };
export const slotToMeal = (s: Slot): Meal => SLOT_MEAL[s];
export const mealToSlot = (m: Meal): Slot => (m === "snacks" ? "snack" : m);

/** When a meal logged for another day is stamped (same hours as the Food Coach and scanner). */
const MEAL_TIME: Record<Meal, [number, number]> = { breakfast: [8, 0], lunch: [12, 30], dinner: [18, 30], snacks: [15, 30] };

/** The meal's time in his day schedule (profiles.prefs.day): mains as set, snacks at the middle snack. */
function scheduleTime(schedule: Pick<DaySchedule, "meals">, meal: Meal): [number, number] | null {
  const hhmm = meal === "snacks" ? schedule.meals.snacks[1] : schedule.meals[meal];
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Now for today; the meal's usual time on another day (in the device's timezone). With his
 * day schedule (DESIGN-V2 §4.4) another day's meal is stamped at HIS time for that meal.
 */
export function defaultEatenAt(date: ISODate, todayDate: ISODate, meal: Meal, now: Date = new Date(), schedule?: Pick<DaySchedule, "meals"> | null): string {
  if (date === todayDate) return now.toISOString();
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (schedule && scheduleTime(schedule, meal)) ?? MEAL_TIME[meal];
  return new Date(y, mo - 1, d, h, mi).toISOString();
}

export interface LogPlannedMealInput {
  /** Client-generated id, fixed for the confirm sheet: a second confirm can never add a second row. */
  id: string;
  plannedMealId?: string | null;
  recipe: Pick<Recipe, "name"> & Partial<Pick<Recipe, "key" | "ingredients">>;
  servings: number;
  date: ISODate;
  meal: Meal;
  /** TOTAL for `servings` as shown (and possibly edited) in the confirm sheet. */
  macros: Macros;
  eatenAt?: string;
  /** recipeFeatures(recipe): when given, a "logged" learning signal is recorded with the entry. */
  features?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The single food_entries row for a planned meal: name = recipe name, amount = servings of unit
 * "serving", base_* = one serving, source "meal_plan", confidence "estimate". Throws a readable
 * Error for impossible values.
 */
export function plannedMealFoodEntry(input: LogPlannedMealInput, opts: { todayDate: ISODate; now?: Date; schedule?: Pick<DaySchedule, "meals"> | null }): PlannedFoodEntry {
  const s = input.servings;
  if (!Number.isFinite(s) || s <= 0 || s > 20) throw new Error("Servings must be more than 0 and at most 20.");
  if (!ISO_DATE.test(input.date)) throw new Error("Pick a date.");
  if (!UUID.test(input.id)) throw new Error("Missing entry id.");
  const m = input.macros;
  for (const [label, v, max] of [
    ["Calories", m.kcal, 20000],
    ["Protein", m.protein, 2000],
    ["Carbs", m.carbs, 3000],
    ["Fat", m.fat, 2000],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`${label} must be between 0 and ${max.toLocaleString("en-US")}.`);
  }
  const amount = r2(s);
  const per = (v: number) => r1(v / amount);
  const ings = input.recipe.ingredients?.filter((i) => !i.optional) ?? [];
  const perServingGrams = ings.length && ings.every((i) => Number.isFinite(i.grams)) ? ings.reduce((a, i) => a + (i.grams ?? 0), 0) : null;
  const grams = perServingGrams != null && perServingGrams > 0 ? r1(perServingGrams * amount) : null;
  return {
    id: input.id,
    local_date: input.date,
    eaten_at: input.eatenAt ?? defaultEatenAt(input.date, opts.todayDate, input.meal, opts.now, opts.schedule),
    meal: input.meal,
    name: (input.recipe.name?.trim() || "Planned meal").slice(0, 120),
    brand: null,
    amount,
    unit: "serving",
    grams: grams != null && grams <= 20000 ? grams : null,
    calories: r1(m.kcal),
    protein_g: r1(m.protein),
    carbs_g: r1(m.carbs),
    fat_g: r1(m.fat),
    base_amount: 1,
    base_calories: per(m.kcal),
    base_protein_g: per(m.protein),
    base_carbs_g: per(m.carbs),
    base_fat_g: per(m.fat),
    source: "meal_plan",
    confidence: "estimate",
    source_name: "Meal planner",
    source_url: null,
    meal_group_id: null,
    saved_food_id: null,
    photo_path: null,
    planned_meal_id: input.plannedMealId ?? null,
  };
}
