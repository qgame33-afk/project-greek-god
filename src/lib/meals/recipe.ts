// Recipe helpers (docs/MEALS.md §2 and §4): nutrition from the ingredient database, scaling,
// friendly quantities, learning features, validation and hard constraints. Pure, no I/O.

import { z } from "zod";
import {
  dislikeCovers,
  getIngredient,
  gramsFor,
  ingredientCostCad,
  ingredientInline,
  ingredientName,
  shortcutFor,
} from "./ingredients";
import type { Allergen, Diet, Equipment, IngredientKind, Macros, MakeAhead, MealPrefs, Recipe, RecipeIngredient, Unit } from "./types";

/* ------------------------------------------------------------------ constants */

export const UNITS = ["g", "ml", "piece", "slice", "tbsp", "tsp", "cup", "scoop", "can", "pouch"] as const satisfies readonly Unit[];
export const ALLERGENS = ["dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"] as const satisfies readonly Allergen[];
export const DIETS = ["vegetarian", "pescatarian", "no_pork", "no_beef", "halal", "lactose_free", "gluten_free", "dairy_free"] as const satisfies readonly Diet[];
export const EQUIPMENT = ["stovetop", "oven", "microwave", "air_fryer", "toaster", "blender", "grill", "kettle"] as const satisfies readonly Equipment[];
export const KINDS = ["meat", "poultry", "beef", "pork", "fish", "shellfish", "dairy", "egg", "plant", "grain", "alcohol"] as const satisfies readonly IngredientKind[];

/** "Super Easy" means all three: ≤ 15 min, ≤ 6 non-staple ingredients, ≤ 5 steps. */
export const SUPER_EASY = { maxMinutes: 15, maxIngredients: 6, maxSteps: 5 } as const;

/** Per-serving cost buckets (CAD, prorated from pack prices): $ under 3.50, $$ under 6.50, $$$ above. */
export const COST_BUCKETS = { cheap: 3.5, normal: 6.5 } as const;

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/* ------------------------------------------------------------------ ingredients */

/** Grams for one ingredient line (ONE serving), from the database. Null when it can't be converted. */
export function lineGrams(line: Pick<RecipeIngredient, "key" | "qty" | "unit">): number | null {
  return gramsFor(line.key, line.qty, line.unit);
}

/** Ingredients that count toward effort: not staples (salt, oil, spices, butter) and not optional. */
export function coreIngredients(recipe: Pick<Recipe, "ingredients">): RecipeIngredient[] {
  return recipe.ingredients.filter((l) => !l.optional && !getIngredient(l.key)?.staple);
}

/** Distinct non-staple, non-optional ingredients: the number shown as "5 ingredients". */
export function ingredientCount(recipe: Pick<Recipe, "ingredients">): number {
  return new Set(coreIngredients(recipe).map((l) => l.key)).size;
}

/** Why a recipe is not Super Easy (empty when it is). */
export function superEasyIssues(recipe: Pick<Recipe, "minutes" | "ingredients" | "steps">): string[] {
  const out: string[] = [];
  if (recipe.minutes > SUPER_EASY.maxMinutes) out.push(`${recipe.minutes} min (max ${SUPER_EASY.maxMinutes})`);
  const n = ingredientCount(recipe);
  if (n > SUPER_EASY.maxIngredients) out.push(`${n} ingredients (max ${SUPER_EASY.maxIngredients})`);
  if (recipe.steps.length > SUPER_EASY.maxSteps) out.push(`${recipe.steps.length} steps (max ${SUPER_EASY.maxSteps})`);
  return out;
}

export function meetsSuperEasy(recipe: Pick<Recipe, "minutes" | "ingredients" | "steps">): boolean {
  return superEasyIssues(recipe).length === 0;
}

/* ------------------------------------------------------------------ nutrition */

function tidy(m: Macros): Macros {
  return { kcal: round(m.kcal), protein: round(m.protein, 1), carbs: round(m.carbs, 1), fat: round(m.fat, 1) };
}

/** Raw (unrounded) macros of a list of lines. Optional lines count only when `includeOptional`. */
function sumLines(lines: RecipeIngredient[], includeOptional: boolean): Macros {
  const t = { ...ZERO };
  for (const l of lines) {
    if (l.optional && !includeOptional) continue;
    const e = getIngredient(l.key);
    const g = lineGrams(l);
    if (!e || g == null) continue;
    const f = g / 100;
    t.kcal += e.per100.kcal * f;
    t.protein += e.per100.protein * f;
    t.carbs += e.per100.carbs * f;
    t.fat += e.per100.fat * f;
  }
  return t;
}

// Keyed on the ingredients array: recipes are treated as immutable (replace, don't mutate).
const perServingCache = new WeakMap<RecipeIngredient[], Macros>();

/**
 * Nutrition for `servings` of a recipe (an estimate), always computed from the ingredient
 * database: stored `nutrition` is never trusted. kcal is an integer, grams one decimal.
 */
export function recipeMacros(recipe: Recipe, servings = 1, opts: { includeOptional?: boolean } = {}): Macros {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 0;
  if (!Array.isArray(recipe?.ingredients)) return { ...ZERO };
  let base: Macros;
  if (opts.includeOptional) base = sumLines(recipe.ingredients, true);
  else {
    const hit = perServingCache.get(recipe.ingredients);
    base = hit ?? sumLines(recipe.ingredients, false);
    if (!hit) perServingCache.set(recipe.ingredients, base);
  }
  return tidy({ kcal: base.kcal * s, protein: base.protein * s, carbs: base.carbs * s, fat: base.fat * s });
}

/**
 * Unrounded nutrition for `servings` — for code that scales macros itself. Scale this, then
 * round: `recipeMacros(recipe, 1)` is already rounded, and multiplying a rounded per-serving
 * value drifts from what cards show (`recipeMacros(recipe, servings)`) by about 1 kcal.
 */
export function recipeMacrosExact(recipe: Recipe, servings = 1): Macros {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 0;
  if (!Array.isArray(recipe?.ingredients)) return { ...ZERO };
  const base = sumLines(recipe.ingredients, false);
  return { kcal: base.kcal * s, protein: base.protein * s, carbs: base.carbs * s, fat: base.fat * s };
}

const ALLERGEN_ORDER = new Map<string, number>(ALLERGENS.map((a, i) => [a, i]));
const KIND_ORDER = new Map<string, number>(KINDS.map((k, i) => [k, i]));

/** Allergens of every line, optional ones included (a hard constraint must be conservative). */
export function recipeAllergens(recipe: Pick<Recipe, "ingredients">): Allergen[] {
  const s = new Set<Allergen>();
  for (const l of recipe.ingredients) getIngredient(l.key)?.allergens.forEach((a) => s.add(a));
  return [...s].sort((a, b) => ALLERGEN_ORDER.get(a)! - ALLERGEN_ORDER.get(b)!);
}

/** Ingredient kinds of every line, optional ones included. */
export function recipeKinds(recipe: Pick<Recipe, "ingredients">): IngredientKind[] {
  const s = new Set<IngredientKind>();
  for (const l of recipe.ingredients) getIngredient(l.key)?.kinds.forEach((k) => s.add(k));
  return [...s].sort((a, b) => KIND_ORDER.get(a)! - KIND_ORDER.get(b)!);
}

/** Estimated grocery cost in CAD for `servings`, prorated from pack prices (staples and optional lines excluded). */
export function recipeCostCad(recipe: Pick<Recipe, "ingredients">, servings = 1): number {
  let t = 0;
  for (const l of recipe.ingredients) {
    if (l.optional) continue;
    const g = lineGrams(l);
    if (g != null) t += ingredientCostCad(l.key, g);
  }
  return round(t * servings, 2);
}

export function costBucket(cadPerServing: number): 1 | 2 | 3 {
  if (cadPerServing < COST_BUCKETS.cheap) return 1;
  if (cadPerServing < COST_BUCKETS.normal) return 2;
  return 3;
}

/**
 * Fills the computed fields from the ingredient database: per-line grams, per-serving
 * nutrition, allergens, kinds and the cost bucket. A recipe labelled Super Easy that breaks
 * the Super Easy rules is relabelled Everyday, so the label never lies. Returns a new object.
 */
export function normalizeRecipe(recipe: Recipe): Recipe {
  const ingredients = recipe.ingredients.map((l) => {
    const g = lineGrams(l);
    const { grams: _old, ...rest } = l;
    return g == null ? rest : { ...rest, grams: round(g, 1) };
  });
  const base: Recipe = { ...recipe, servings: 1, ingredients };
  const difficulty = base.difficulty === "super_easy" && !meetsSuperEasy(base) ? "everyday" : base.difficulty;
  return {
    ...base,
    difficulty,
    cost: costBucket(recipeCostCad(base)),
    nutrition: tidy(sumLines(ingredients, false)),
    allergens: recipeAllergens(base),
    kinds: recipeKinds(base),
  };
}

/* ------------------------------------------------------------------ quantities */

const GLYPH: Record<string, string> = { "0.125": "⅛", "0.25": "¼", "0.333": "⅓", "0.5": "½", "0.667": "⅔", "0.75": "¾" };

/** Allowed fractional parts per unit (friendly kitchen measures). */
const STEPS: Partial<Record<Unit, number[]>> = {
  cup: [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1],
  tbsp: [0, 0.5, 1],
  tsp: [0, 0.125, 0.25, 0.5, 0.75, 1],
};

function snapFraction(q: number, steps: number[]): number {
  const whole = Math.floor(q);
  const frac = q - whole;
  let best = steps[0];
  for (const s of steps) if (Math.abs(frac - s) < Math.abs(frac - best)) best = s;
  return whole + best;
}

/** Mixed number with a fraction glyph: 1.5 → "1½", 0.75 → "¾", 2 → "2". */
export function fractionText(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const frac = round(q - whole, 3);
  if (frac === 0) return String(whole);
  const g = GLYPH[String(frac)];
  if (!g) return String(round(q, 2));
  return whole > 0 ? `${whole}${g}` : g;
}

const COUNT_UNITS: Unit[] = ["piece", "slice", "scoop", "can", "pouch"];

/**
 * Rounds a quantity to something a person can measure: grams/mL to 1/5/10, cups to ¼ and ⅓,
 * tbsp to ½, tsp to ⅛, counts to ¼ below one and ½ above (whole for eggs, and above 4). Large tbsp/tsp amounts move up
 * to cups/tbsp. Never rounds a positive amount down to zero.
 */
export function friendlyQty(qty: number, unit: Unit, key?: string): { qty: number; unit: Unit } {
  if (!(qty > 0) || !Number.isFinite(qty)) return { qty: 0, unit };
  if (unit === "tsp" && qty >= 3) return friendlyQty(qty / 3, "tbsp", key);
  if (unit === "tbsp" && qty >= 4) return friendlyQty(qty / 16, "cup", key);
  if (unit === "g" || unit === "ml") {
    const stepSize = qty < 20 ? 1 : qty < 500 ? 5 : 10;
    return { qty: Math.max(1, Math.round(qty / stepSize) * stepSize), unit };
  }
  const steps = STEPS[unit];
  if (steps) {
    const q = Math.max(steps[1], round(snapFraction(qty, steps), 3));
    // Snapping can land on a bigger measure: 2.9 tsp → 3 tsp → 1 tbsp.
    if (unit === "tsp" && q >= 3) return friendlyQty(q / 3, "tbsp", key);
    if (unit === "tbsp" && q >= 4) return friendlyQty(q / 16, "cup", key);
    return { qty: q, unit };
  }
  if (COUNT_UNITS.includes(unit)) {
    const whole = key ? getIngredient(key)?.whole : false;
    if (whole || qty > 4) return { qty: Math.max(1, Math.round(qty)), unit };
    if (qty < 0.875) return { qty: Math.max(0.25, Math.round(qty * 4) / 4), unit };
    return { qty: Math.round(qty * 2) / 2, unit };
  }
  return { qty: round(qty, 2), unit };
}

const UNIT_WORDS: Partial<Record<Unit, [string, string]>> = {
  piece: ["piece", "pieces"],
  slice: ["slice", "slices"],
  scoop: ["scoop", "scoops"],
  can: ["can", "cans"],
  pouch: ["pouch", "pouches"],
  cup: ["cup", "cups"],
};

/**
 * A friendly, rounded amount: "200 g", "1.2 kg", "250 mL", "1½ cups", "2 tbsp", "2 eggs",
 * "3 slices", "1 scoop". With `key`, count units use the ingredient's own noun ("2 eggs").
 */
export function formatQty(qty: number, unit: Unit, key?: string): string {
  const r = friendlyQty(qty, unit, key);
  const q = r.qty;
  if (r.unit === "g") return q >= 1000 ? `${round(q / 1000, 2)} kg` : `${q} g`;
  if (r.unit === "ml") return q >= 1000 ? `${round(q / 1000, 2)} L` : `${q} mL`;
  if (r.unit === "tbsp" || r.unit === "tsp") return `${fractionText(q)} ${r.unit}`;
  const noun = (key ? getIngredient(key)?.nouns?.[r.unit] : undefined) ?? UNIT_WORDS[r.unit];
  if (!noun) return `${fractionText(q)} ${r.unit}`;
  return `${fractionText(q)} ${q > 1 ? noun[1] : noun[0]}`;
}

export interface ScaledIngredient {
  key: string;
  /** Shopper-facing name: "Extra-lean ground beef (90/10)". */
  name: string;
  /** Friendly-rounded quantity in `unit` (may differ from the recipe's unit, e.g. 6 tbsp → ⅓ cup). */
  qty: number;
  unit: Unit;
  /** Exact scaled grams (null when not convertible). Nutrition uses these, not the rounded qty. */
  grams: number | null;
  /** "200 g", "1½ cups", "2 eggs". */
  amount: string;
  /** Full line for a checklist: "200 g extra-lean ground beef", "2 eggs", "3 slices whole-wheat bread". */
  text: string;
  optional: boolean;
  staple: boolean;
  note?: string;
}

/** Ingredient lines for `servings`, rounded to friendly kitchen amounts. */
export function scaleIngredients(recipe: Pick<Recipe, "ingredients">, servings: number): ScaledIngredient[] {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return recipe.ingredients.map((l) => {
    const e = getIngredient(l.key);
    const raw = l.qty * s;
    const r = friendlyQty(raw, l.unit, l.key);
    const amount = formatQty(raw, l.unit, l.key);
    const g = lineGrams(l);
    const selfNamed = r.unit === "piece" && !!e?.nouns?.piece;
    return {
      key: l.key,
      name: ingredientName(l.key),
      qty: r.qty,
      unit: r.unit,
      grams: g == null ? null : round(g * s, 1),
      amount,
      text: selfNamed ? amount : `${amount} ${ingredientInline(l.key)}`,
      optional: !!l.optional,
      staple: !!e?.staple,
      ...(l.note ? { note: l.note } : {}),
    };
  });
}

/* ------------------------------------------------------------------ make ahead */

const OVERNIGHT = /\b(overnight|the night before)\b|\bat least (?:[6-9]|1\d|2[0-4]) hours\b/i;
export const NIGHT_BEFORE: MakeAhead = { label: "Make the night before", hours: 8 };

/**
 * What has to be done ahead, if anything: the recipe's own `makeAhead`, or "Make the night
 * before" when a step sits overnight or for 6+ hours (AI and simplified recipes written that
 * way). Null for an ordinary recipe. Make-ahead recipes are never planned for today.
 */
export function makeAheadOf(recipe: Pick<Recipe, "steps"> & { makeAhead?: MakeAhead }): MakeAhead | null {
  if (recipe.makeAhead) return recipe.makeAhead;
  return recipe.steps?.some((s) => OVERNIGHT.test(s.text)) ? NIGHT_BEFORE : null;
}

/* ------------------------------------------------------------------ learning features */

export function timeBucket(minutes: number): "quick" | "medium" | "long" {
  return minutes <= 15 ? "quick" : minutes <= 30 ? "medium" : "long";
}

export function effortBucket(ingredients: number): "few" | "some" | "many" {
  return ingredients <= 5 ? "few" : ingredients <= 8 ? "some" : "many";
}

/**
 * Proteins that belong to a broader group people like or dislike as a whole: disliking tuna,
 * shrimp and salmon should reach fish tacos too. Only seafood: liking chicken says nothing
 * about turkey, and disliking pork says nothing about beef.
 */
export const PROTEIN_GROUPS: Readonly<Record<string, string>> = { tuna: "seafood", salmon: "seafood", fish: "seafood", cod: "seafood", shrimp: "seafood" };

/** `group:<name>` features implied by a list of features or tags (protein:tuna → group:seafood). */
export function groupFeatures(features: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const f of features) {
    const g = f.startsWith("protein:") ? PROTEIN_GROUPS[f.slice(8)] : undefined;
    if (g) out.add(`group:${g}`);
  }
  return [...out];
}

/**
 * Learning features (docs/MEALS.md §4): the recipe's tags, `group:` features its proteins imply
 * (seafood), `ing:<key>` for each non-staple, non-optional ingredient, and `time:`, `effort:`
 * and `cost:` buckets.
 */
export function recipeFeatures(recipe: Pick<Recipe, "tags" | "ingredients" | "minutes" | "cost">): string[] {
  const out = new Set<string>(recipe.tags);
  for (const g of groupFeatures(recipe.tags)) out.add(g);
  for (const l of coreIngredients(recipe)) out.add(`ing:${l.key}`);
  out.add(`time:${timeBucket(recipe.minutes)}`);
  out.add(`effort:${effortBucket(ingredientCount(recipe))}`);
  out.add(`cost:${recipe.cost}`);
  return [...out];
}

/* ------------------------------------------------------------------ shortcuts */

/**
 * The "Make this easier" swap for one line (raw chicken → cooked strips, dry rice → microwave
 * pouch, chopped onion → onion powder), with the quantity converted, or null when there is none.
 */
export function applyShortcut(line: RecipeIngredient): RecipeIngredient | null {
  const sc = shortcutFor(line.key);
  const g = lineGrams(line);
  if (!sc || g == null) return null;
  const grams = g * sc.factor;
  const extra = { ...(line.optional ? { optional: true } : {}), note: `instead of ${ingredientInline(line.key)}` };
  // Prefer how the swap is sold (1 pouch, 1 can), then the line's own unit, then spoons, cups, grams.
  const order: Unit[] = ["pouch", "can", line.unit, "tsp", "cup", "g"];
  for (const u of order) {
    const each = gramsFor(sc.key, 1, u);
    if (!each) continue;
    const r = friendlyQty(grams / each, u, sc.key);
    return { key: sc.key, qty: r.qty, unit: r.unit, ...extra };
  }
  return null;
}

/* ------------------------------------------------------------------ hard constraints */

const DIET_RULES: Record<Diet, { kinds?: IngredientKind[]; allergens?: Allergen[]; label: string }> = {
  vegetarian: { kinds: ["meat", "poultry", "beef", "pork", "fish", "shellfish"], label: "Vegetarian" },
  pescatarian: { kinds: ["meat", "poultry", "beef", "pork"], label: "Pescatarian" },
  no_pork: { kinds: ["pork"], label: "No pork" },
  no_beef: { kinds: ["beef"], label: "No beef" },
  halal: { kinds: ["pork", "alcohol"], label: "Halal" },
  lactose_free: { allergens: ["dairy"], label: "Lactose-free" },
  gluten_free: { allergens: ["gluten"], label: "Gluten-free" },
  dairy_free: { allergens: ["dairy"], label: "Dairy-free" },
};

/** Dairy products that are fine on a lactose-free diet. */
const LACTOSE_FREE_OK = new Set(["milk-lactose-free"]);

export interface Conflict {
  kind: "allergy" | "diet" | "disliked" | "equipment" | "unknown_ingredient";
  /** The allergen, diet, ingredient key or equipment that conflicts. */
  value: string;
  /** Ingredient key that causes it, when there is one. */
  ingredient?: string;
}

export type ConstraintPrefs = Pick<MealPrefs, "allergies" | "diets" | "dislikedIngredients" | "equipment">;

/**
 * Every hard-constraint conflict between a recipe and the user's preferences: allergies, diets
 * (halal = no pork or alcohol), disliked ingredients (and their other forms) and missing
 * equipment. Optional lines count too. Unknown ingredients count as conflicts (can't be checked).
 */
export function recipeConflicts(recipe: Pick<Recipe, "ingredients" | "equipment">, prefs: ConstraintPrefs): Conflict[] {
  const out: Conflict[] = [];
  const allergies = new Set(prefs.allergies ?? []);
  const diets = prefs.diets ?? [];
  const disliked = new Set<string>();
  for (const d of prefs.dislikedIngredients ?? []) dislikeCovers(d).forEach((k) => disliked.add(k));
  for (const l of recipe.ingredients) {
    const e = getIngredient(l.key);
    if (!e) {
      out.push({ kind: "unknown_ingredient", value: l.key, ingredient: l.key });
      continue;
    }
    for (const a of e.allergens) if (allergies.has(a)) out.push({ kind: "allergy", value: a, ingredient: l.key });
    for (const d of diets) {
      const rule = DIET_RULES[d];
      if (!rule) continue;
      const kindHit = rule.kinds?.some((k) => e.kinds.includes(k));
      const allergenHit = rule.allergens?.some((a) => e.allergens.includes(a)) && !(d === "lactose_free" && LACTOSE_FREE_OK.has(l.key));
      if (kindHit || allergenHit) out.push({ kind: "diet", value: d, ingredient: l.key });
    }
    if (disliked.has(l.key)) out.push({ kind: "disliked", value: l.key, ingredient: l.key });
  }
  const have = new Set(prefs.equipment ?? []);
  for (const eq of recipe.equipment) if (!have.has(eq)) out.push({ kind: "equipment", value: eq });
  return out;
}

/** True when the recipe breaks none of the user's hard constraints. */
export function recipeAllowed(recipe: Pick<Recipe, "ingredients" | "equipment">, prefs: ConstraintPrefs): boolean {
  return recipeConflicts(recipe, prefs).length === 0;
}

export function dietLabel(d: Diet): string {
  return DIET_RULES[d]?.label ?? d;
}

/* ------------------------------------------------------------------ validation */

const KEY_RE = /^(lib|usr):[a-z0-9][a-z0-9-]{0,99}$/;
const TAG_RE = /^(cuisine|protein|base|style|dish):[a-z0-9][a-z0-9-]{0,39}$/;

/** Upper bounds that catch nonsense ("5 kg of chicken per serving"). */
export const RECIPE_LIMITS = {
  lineGrams: 1200,
  countUnits: 24,
  servingGrams: 3000,
  minKcal: 30,
  maxKcal: 2500,
} as const;

const MacrosSchema = z.strictObject({
  kcal: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
});

export const RecipeIngredientSchema = z.strictObject({
  key: z.string().min(1).max(60),
  qty: z.number().positive().max(5000),
  unit: z.enum(UNITS),
  grams: z.number().min(0).max(10000).optional(),
  optional: z.boolean().optional(),
  note: z.string().trim().min(1).max(80).optional(),
});

export const RecipeStepSchema = z.strictObject({
  text: z.string().trim().min(3).max(240),
  timerSec: z.number().int().min(5).max(4 * 3600).optional(),
  safety: z.string().trim().min(3).max(160).optional(),
});

const uniq = <T>(a: T[]) => new Set(a).size === a.length;

/**
 * Zod schema for a recipe (library, AI, simplified or custom). Rejects unknown keys anywhere.
 * `cost`, `servings`, `nutrition`, `allergens` and `kinds` are computed, so they may be omitted.
 */
export const RecipeSchema = z
  .strictObject({
    key: z.string().regex(KEY_RE, "Key must look like lib:slug or usr:id"),
    name: z.string().trim().min(3).max(60),
    slots: z
      .array(z.enum(["breakfast", "lunch", "dinner", "snack"]))
      .min(1)
      .max(4)
      .refine(uniq, "Duplicate slot"),
    minutes: z.number().int().min(1).max(240),
    difficulty: z.enum(["super_easy", "everyday", "i_like_cooking"]),
    cost: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    servings: z.literal(1).optional(),
    ingredients: z.array(RecipeIngredientSchema).min(1).max(25),
    steps: z.array(RecipeStepSchema).min(1).max(15),
    equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).refine(uniq, "Duplicate equipment"),
    tags: z.array(z.string().regex(TAG_RE, "Tags look like cuisine:italian")).max(16).refine(uniq, "Duplicate tag"),
    blurb: z.string().trim().min(3).max(140),
    origin: z.enum(["library", "ai", "simplified", "custom"]),
    baseKey: z.string().regex(KEY_RE).optional(),
    easierKey: z.string().regex(/^lib:[a-z0-9][a-z0-9-]{0,99}$/).optional(),
    makeAhead: z.strictObject({ label: z.string().trim().min(3).max(40), hours: z.number().min(0.25).max(48) }).optional(),
    nutrition: MacrosSchema.optional(),
    allergens: z.array(z.enum(ALLERGENS)).optional(),
    kinds: z.array(z.enum(KINDS)).optional(),
  })
  .superRefine((r, ctx) => {
    let total = 0;
    const seen = new Set<string>();
    r.ingredients.forEach((l, i) => {
      const path = ["ingredients", i];
      const e = getIngredient(l.key);
      if (!e) {
        ctx.addIssue({ code: "custom", path: [...path, "key"], message: `Unknown ingredient "${l.key}"` });
        return;
      }
      const dupKey = `${l.key}|${l.optional ? 1 : 0}`;
      if (seen.has(dupKey)) ctx.addIssue({ code: "custom", path: [...path, "key"], message: `"${l.key}" is listed twice` });
      seen.add(dupKey);
      const g = gramsFor(l.key, l.qty, l.unit);
      if (g == null) {
        ctx.addIssue({ code: "custom", path: [...path, "unit"], message: `Can't measure ${e.name} in "${l.unit}"` });
        return;
      }
      if (COUNT_UNITS.includes(l.unit) && l.qty > RECIPE_LIMITS.countUnits) {
        ctx.addIssue({ code: "custom", path: [...path, "qty"], message: `${l.qty} ${l.unit} of ${e.name} per serving is not realistic` });
      }
      if (g > RECIPE_LIMITS.lineGrams) {
        ctx.addIssue({ code: "custom", path: [...path, "qty"], message: `${Math.round(g)} g of ${e.name} per serving is not realistic` });
      }
      if (!e.staple && !l.optional) total += g;
    });
    if (total > RECIPE_LIMITS.servingGrams) {
      ctx.addIssue({ code: "custom", path: ["ingredients"], message: `${Math.round(total)} g per serving is not realistic` });
    }
    const kcal = sumLines(r.ingredients as RecipeIngredient[], false).kcal;
    if (r.ingredients.every((l) => getIngredient(l.key)) && (kcal < RECIPE_LIMITS.minKcal || kcal > RECIPE_LIMITS.maxKcal)) {
      ctx.addIssue({ code: "custom", path: ["ingredients"], message: `${Math.round(kcal)} kcal per serving is outside ${RECIPE_LIMITS.minKcal}–${RECIPE_LIMITS.maxKcal}` });
    }
    if (r.easierKey && r.easierKey === r.key) ctx.addIssue({ code: "custom", path: ["easierKey"], message: "A recipe can't be its own easier version" });
    // Only the built-in library uses lib: keys; AI, simplified and custom recipes are usr: rows.
    if (r.key.startsWith("lib:") !== (r.origin === "library")) {
      ctx.addIssue({ code: "custom", path: ["origin"], message: `A ${r.origin} recipe can't use the key ${r.key}` });
    }
  });

export type RecipeValidation = { ok: true; recipe: Recipe } | { ok: false; errors: string[] };

/**
 * Validates untrusted recipe data (AI output, a stored jsonb row, a custom recipe) and returns
 * it normalised (nutrition, allergens, kinds and cost recomputed from the database), or a list
 * of readable errors ("ingredients.2.key: Unknown ingredient "chiken"").
 */
export function validateRecipe(input: unknown): RecipeValidation {
  const parsed = RecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
    };
  }
  const data = parsed.data;
  const recipe = normalizeRecipe({ ...data, cost: data.cost ?? 1, servings: 1 } as Recipe);
  return { ok: true, recipe };
}
