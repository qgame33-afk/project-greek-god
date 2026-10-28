// Pure rules behind the week planner UI (docs/MEALS.md §6): labels, the regenerate feedback
// reasons, when a reason should trigger a second pick, conflicts between planned meals and
// the user's hard constraints, and the engine context built from the hooks' data. No React,
// no Supabase: unit-tested in model.test.ts.

import { addDays, parseISODate, type ISODate } from "@/lib/dates";
import { DAY_KCAL_TOLERANCE, DAY_PROTEIN_MIN, type Goals, type PlanContext } from "@/lib/meals/engine";
import { ingredientInline, ingredientName, isStaple } from "@/lib/meals/ingredients";
import { dietLabel, ingredientCount, recipeConflicts, recipeCostCad, type Conflict } from "@/lib/meals/recipe";
import type { Allergen, Diet, Equipment, FeedbackEvent, FeedbackReason, FeedbackRow, Macros, MealPrefs, PlannedMeal, Recipe, Slot } from "@/lib/meals/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 13 – 19", "Oct 27 – Nov 2", "Dec 29 – Jan 4". */
export function weekRangeLabel(ws: ISODate): string {
  const a = parseISODate(ws);
  const b = parseISODate(addDays(ws, 6));
  // "12–18 Oct", "26 Oct – 1 Nov" (Train's weekRangeLabel spelling)
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/* ------------------------------------------------------------ regenerate */

export interface ReasonOption {
  reason: FeedbackReason;
  /** Chip label (the spec's wording). */
  label: string;
  /** What the strip says once it's recorded. */
  noted: string;
}

/** The six reasons offered after a regenerate, in the spec's order. */
export const REGEN_REASONS: ReasonOption[] = [
  { reason: "dont_like", label: "I don't like this", noted: "Noted. It won't be planned for 90 days." },
  { reason: "too_complicated", label: "Too complicated", noted: "Noted. Simpler meals from now on." },
  { reason: "too_long", label: "Takes too long", noted: "Noted. Quicker meals from now on." },
  { reason: "too_expensive", label: "Too expensive", noted: "Noted. Cheaper meals from now on." },
  { reason: "ate_recently", label: "Already ate this recently", noted: "Noted. It'll rest for 2 weeks." },
  { reason: "dislike_ingredient", label: "Don't like an ingredient", noted: "Added to your dislikes. It won't be planned again." },
];

export const reasonOption = (r: FeedbackReason) => REGEN_REASONS.find((o) => o.reason === r)!;

/** What the strip says once a reason is recorded; names the second pick when there was one. */
export function notedText(reason: FeedbackReason, repickedName?: string | null): string {
  if (!repickedName) return reasonOption(reason).noted;
  switch (reason) {
    case "too_complicated":
      return `Noted. Swapped in something simpler: ${repickedName}.`;
    case "too_long":
      return `Noted. Swapped in something quicker: ${repickedName}.`;
    case "too_expensive":
      return `Noted. Swapped in something cheaper: ${repickedName}.`;
    case "dislike_ingredient":
      return `Added to your dislikes. Swapped in ${repickedName}.`;
    default:
      return reasonOption(reason).noted;
  }
}

/**
 * Honest notes after planning a week: places nothing fit, days the allowed recipes can't bring
 * to 90% of the protein goal, and days they can't keep within 10% of the fat goal. Null when
 * the week came out whole.
 */
export function weekNotes(
  res: { meals: readonly unknown[]; kept: readonly unknown[]; days: readonly { meals: number; proteinOk: boolean; fatOk?: boolean }[]; unfilled?: number },
  placesPerDay: number,
): string | null {
  // the engine counts the places it couldn't fill on the days it planned (mid-week, from today)
  const unfilled = res.unfilled ?? Math.max(0, 7 * placesPerDay - res.meals.length - res.kept.length);
  const lowProtein = res.days.filter((d) => d.meals > 0 && !d.proteinOk).length;
  const highFat = res.days.filter((d) => d.meals > 0 && d.fatOk === false).length;
  const parts: string[] = [];
  if (unfilled) parts.push(`${unfilled} ${unfilled === 1 ? "meal has" : "meals have"} nothing that fits your settings`);
  if (lowProtein) parts.push(`${lowProtein} ${lowProtein === 1 ? "day is" : "days are"} under 90% of your protein goal`);
  if (highFat) parts.push(`${highFat} ${highFat === 1 ? "day is" : "days are"} over your fat goal`);
  if (!parts.length) return null;
  const text = parts.join(", and ");
  return `${text[0].toUpperCase()}${text.slice(1)}. Loosening a preference gives the planner more to pick from.`;
}

/** Fewer ingredients and fewer steps read as simpler; ties count as "not simpler". */
const complexity = (r: Recipe) => ingredientCount(r) + r.steps.length;

/**
 * After the user says why they swapped a meal, is the replacement they got no better on that
 * axis? Then a second pick that takes the reason into account is shown instead. Taste reasons
 * ("I don't like this", "ate recently") never need one: the replacement is a different recipe.
 */
export function reasonWantsRepick(reason: FeedbackReason, replaced: Recipe | undefined, replacement: Recipe | undefined, ingredient?: string | null): boolean {
  if (!replaced || !replacement) return false;
  switch (reason) {
    case "too_complicated":
      return complexity(replacement) >= complexity(replaced);
    case "too_long":
      return replacement.minutes >= replaced.minutes;
    case "too_expensive":
      return recipeCostCad(replacement) >= recipeCostCad(replaced);
    case "dislike_ingredient":
      return !!ingredient && replacement.ingredients.some((l) => l.key === ingredient);
    default:
      return false;
  }
}

/** Ingredients a user could say they dislike in a recipe: every non-staple line (optional ones too), once. */
export function ingredientChoices(recipe: Pick<Recipe, "ingredients"> | undefined): { key: string; name: string }[] {
  if (!recipe) return [];
  const seen = new Set<string>();
  const out: { key: string; name: string }[] = [];
  for (const l of recipe.ingredients) {
    if (seen.has(l.key) || isStaple(l.key)) continue;
    seen.add(l.key);
    out.push({ key: l.key, name: ingredientName(l.key) });
  }
  return out;
}

/* ------------------------------------------------------------- conflicts */

const ALLERGEN_WORD: Record<Allergen, string> = {
  dairy: "dairy",
  egg: "egg",
  gluten: "gluten",
  peanut: "peanuts",
  tree_nut: "tree nuts",
  soy: "soy",
  fish: "fish",
  shellfish: "shellfish",
  sesame: "sesame",
};

const EQUIPMENT_WORD: Record<Equipment, string> = {
  stovetop: "a stovetop",
  oven: "an oven",
  microwave: "a microwave",
  air_fryer: "an air fryer",
  toaster: "a toaster",
  blender: "a blender",
  grill: "a grill",
  kettle: "a kettle",
};

const DIET_BREAK: Record<Diet, string> = {
  vegetarian: "Not vegetarian",
  pescatarian: "Not pescatarian",
  no_pork: "Has pork",
  no_beef: "Has beef",
  halal: "Not halal",
  lactose_free: "Has lactose",
  gluten_free: "Has gluten",
  dairy_free: "Has dairy",
};

/** One short line for the first (most serious) conflict: allergy, then diet, then dislike, then equipment. */
export function conflictText(conflicts: readonly Conflict[]): string | null {
  const order: Conflict["kind"][] = ["allergy", "unknown_ingredient", "diet", "disliked", "equipment"];
  const c = [...conflicts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  if (!c) return null;
  switch (c.kind) {
    case "allergy":
      return `Contains ${ALLERGEN_WORD[c.value as Allergen] ?? c.value} (${c.ingredient ? ingredientInline(c.ingredient) : "allergy"})`;
    case "diet":
      return `${DIET_BREAK[c.value as Diet] ?? `Not ${dietLabel(c.value as Diet).toLowerCase()}`}${c.ingredient ? ` (${ingredientInline(c.ingredient)})` : ""}`;
    case "disliked":
      return `Has ${ingredientInline(c.value)}, on your dislikes`;
    case "equipment":
      return `Needs ${EQUIPMENT_WORD[c.value as Equipment] ?? c.value}`;
    default:
      return "Has an ingredient the app can't check";
  }
}

const CONFLICT_ORDER: Conflict["kind"][] = ["allergy", "unknown_ingredient", "diet", "disliked", "equipment"];

/** Every conflict as one short line, most serious first, without repeats. */
export function conflictLines(conflicts: readonly Conflict[]): string[] {
  const out: string[] = [];
  for (const c of [...conflicts].sort((a, b) => CONFLICT_ORDER.indexOf(a.kind) - CONFLICT_ORDER.indexOf(b.kind))) {
    const t = conflictText([c]);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** A heading for a recipe's conflicts, from the most serious one. */
export function conflictTitle(conflicts: readonly Conflict[]): string | null {
  const kind = [...conflicts].sort((a, b) => CONFLICT_ORDER.indexOf(a.kind) - CONFLICT_ORDER.indexOf(b.kind))[0]?.kind;
  switch (kind) {
    case "allergy":
      return "On your allergy list";
    case "unknown_ingredient":
      return "The app can't check every ingredient";
    case "diet":
      return "Doesn't fit your diet";
    case "disliked":
      return "Has something you don't like";
    case "equipment":
      return "Needs equipment you don't have";
    default:
      return null;
  }
}

export interface MealConflict<M> {
  meal: M;
  recipe: Recipe;
  conflicts: Conflict[];
  text: string;
}

/**
 * Planned meals that break the user's hard constraints as they are NOW (allergies, diets,
 * dislikes, equipment changed after the week was planned). Unknown recipes are skipped: they
 * show as "Recipe unavailable" instead.
 */
export function conflictsInWeek<M extends Pick<PlannedMeal, "recipe_key">>(
  meals: readonly M[],
  lookup: (key: string) => Recipe | undefined,
  prefs: Pick<MealPrefs, "allergies" | "diets" | "dislikedIngredients" | "equipment">,
): MealConflict<M>[] {
  const out: MealConflict<M>[] = [];
  for (const meal of meals) {
    const recipe = lookup(meal.recipe_key);
    if (!recipe) continue;
    const conflicts = recipeConflicts(recipe, prefs);
    if (conflicts.length) out.push({ meal, recipe, conflicts, text: conflictText(conflicts)! });
  }
  return out;
}

/* ------------------------------------------------------------------ days */

export const MAIN_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

/** Breakfast / lunch / dinner with nothing planned on a day (snacks are optional extras). */
export function missingMainSlots(dayMeals: readonly Pick<PlannedMeal, "slot">[]): Slot[] {
  return MAIN_SLOTS.filter((s) => !dayMeals.some((m) => m.slot === s));
}

export type DayFit = "empty" | "fits" | "off";

/** How a day's PLAN sits against the goals: within ±12% kcal and ≥ 90% protein = "fits". */
export function dayFit(planned: Macros | undefined, goals: Goals | null, meals: number): DayFit {
  if (!meals || !planned) return "empty";
  if (!goals || !(goals.kcal > 0) || !(goals.protein > 0)) return "off";
  const kcalOk = Math.abs(planned.kcal - goals.kcal) / goals.kcal <= DAY_KCAL_TOLERANCE;
  const proteinOk = planned.protein >= DAY_PROTEIN_MIN * goals.protein;
  return kcalOk && proteinOk ? "fits" : "off";
}

/* ---------------------------------------------------------------- thumbs */

export type Thumb = "up" | "down" | null;

/** Every stored thumbs row for a recipe (replaced together when the thumbs change). */
export function thumbRows<F extends Pick<FeedbackRow, "recipe_key" | "event">>(feedback: readonly F[], recipeKey: string): F[] {
  return feedback.filter((f) => f.recipe_key === recipeKey && (f.event === "thumbs_up" || f.event === "thumbs_down"));
}

/** The user's current thumbs on a recipe: their newest thumbs event, if any. */
export function currentThumb(feedback: readonly (Pick<FeedbackRow, "recipe_key" | "event" | "created_at"> & { id: string })[], recipeKey: string): { thumb: Thumb; id: string | null } {
  let best: { at: string; event: FeedbackEvent; id: string } | null = null;
  for (const f of feedback) {
    if (f.recipe_key !== recipeKey || (f.event !== "thumbs_up" && f.event !== "thumbs_down")) continue;
    if (!best || f.created_at > best.at) best = { at: f.created_at, event: f.event, id: f.id };
  }
  if (!best) return { thumb: null, id: null };
  return { thumb: best.event === "thumbs_up" ? "up" : "down", id: best.id };
}

/* --------------------------------------------------------------- context */

export interface PlannerInputs {
  weekStart: ISODate;
  goals: Goals | null;
  prefs: MealPrefs;
  pool: readonly Recipe[];
  feedback: readonly FeedbackRow[];
  favourites: readonly { recipe_key: string; repeat_ok: boolean }[];
  /** Meals planned in the 14 days before the week (cooldowns). */
  history: readonly { recipe_key: string; local_date: ISODate; slot?: Slot }[];
  meals: PlanContext["meals"];
  /** Planned meals already added to the food log (kept by "regenerate week"). */
  loggedIds: readonly string[];
  seed?: string;
  /** The user's local date: mid-week, the current week is planned from today on (no make-ahead today). */
  today?: ISODate;
  /** Plan every day of the week, the days already past included. */
  wholeWeek?: boolean;
}

/** The engine's PlanContext from the hooks' data, or null while goals are missing. */
export function plannerContext(i: PlannerInputs): PlanContext | null {
  if (!i.goals || !(i.goals.kcal > 0) || !(i.goals.protein > 0)) return null;
  return {
    weekStart: i.weekStart,
    // all four goals: the planner sizes meals to the profile's carbs and fat as well
    goals: {
      kcal: i.goals.kcal,
      protein: i.goals.protein,
      ...(i.goals.carbs != null && i.goals.carbs > 0 ? { carbs: i.goals.carbs } : {}),
      ...(i.goals.fat != null && i.goals.fat > 0 ? { fat: i.goals.fat } : {}),
    },
    prefs: i.prefs,
    pool: i.pool,
    feedback: i.feedback,
    favourites: i.favourites,
    history: i.history,
    meals: i.meals,
    fixedIds: i.loggedIds,
    ...(i.seed ? { seed: i.seed } : {}),
    ...(i.today ? { today: i.today } : {}),
    ...(i.wholeWeek ? { wholeWeek: true } : {}),
  };
}

/**
 * After planning the current week mid-week: which days were planned and which were left as
 * they were ("Planned from Friday. Monday to Thursday stay as they were."), or null when the
 * whole week was planned.
 */
export function midWeekNote(weekStart: ISODate, from: ISODate, earlierPlanned = true): { text: string; earlier: string } | null {
  if (from <= weekStart || from > addDays(weekStart, 6)) return null;
  const first = dayLong(weekStart);
  const last = dayLong(addDays(from, -1));
  const one = first === last;
  const earlier = one ? first : `${first} to ${last}`;
  const rest = earlierPlanned ? `${one ? "stays" : "stay"} as ${one ? "it was" : "they were"}` : `${one ? "isn't" : "aren't"} planned`;
  return { text: `Planned from ${dayLong(from)}. ${earlier} ${rest}.`, earlier };
}

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayLong = (d: ISODate) => DAY_LONG[parseISODate(d).getDay()];

/* ------------------------------------------------------------------ planned vs logged */

export interface PlanSplit {
  /** The day card's heading: "Planned — not eaten" only while none of the day's meals is logged. */
  label: string;
  /** "Logged 2,612 · still planned 1,450 kcal", or null when nothing is logged yet. */
  detail: string | null;
  /** kcal of the day's meals already in the food log (as planned). */
  loggedKcal: number;
}

/**
 * What of a day's plan is already in the food log. Planned totals are never counted as eaten,
 * so a day with logged meals can't be labelled "not eaten": it splits into logged and still
 * planned. `ahead` is the total of the meals not logged yet.
 */
export function planSplit(total: Macros | undefined, ahead: Macros | undefined, meals: number, logged: number): PlanSplit {
  if (!logged || !meals) return { label: "Planned — not eaten", detail: null, loggedKcal: 0 };
  const all = total?.kcal ?? 0;
  const left = logged >= meals ? 0 : (ahead?.kcal ?? 0);
  const loggedKcal = Math.max(0, all - left);
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  return {
    label: "Planned",
    detail: logged >= meals ? "All in your food log" : `Logged ${fmt(loggedKcal)} · still planned ${fmt(left)} kcal`,
    loggedKcal,
  };
}
