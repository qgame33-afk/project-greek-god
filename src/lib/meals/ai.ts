// Meal planner AI (docs/MEALS.md §5, optional): prompts, the JSON Schemas Gemini answers in,
// request validation, and the acceptance pipeline every AI recipe goes through before it is
// stored. The model may only use ingredient keys from the catalog it is given (the schema
// enumerates them); the server then validates with validateRecipe, recomputes nutrition from
// the ingredient database, enforces the user's hard constraints and the difficulty rules, and
// attaches vetted food-safety notes. Nothing the model says about nutrition or safety is
// trusted. Pure module (no I/O): the routes in src/app/api/meals/ai/* do the network and storage.

import { z } from "zod";
import { LIBRARY, libraryForSlot } from "./library";
import { SAFE } from "./library/define";
import { getIngredient, INGREDIENTS, type IngredientEntry } from "./ingredients";
import { EQUIPMENT, ingredientCount, meetsSuperEasy, recipeConflicts, recipeMacros, UNITS, validateRecipe, type ConstraintPrefs } from "./recipe";
import { DIFFICULTY_LIMITS } from "./engine/score";
import type { LearnedSummary } from "./engine/prefs";
import { easierName, nutritionChange } from "./engine/simplify";
import { SLOTS, type Difficulty, type MealPrefs, type Recipe, type Slot } from "./types";

/* ------------------------------------------------------------------ requests */

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD");
const label = z.string().trim().min(1).max(60);

/** POST /api/meals/ai/recipes */
export const AIRecipesRequest = z.object({
  slot: z.enum(SLOTS),
  count: z.number().int().min(1).max(4).default(3),
  localDate: ISO_DATE,
  /** Per-serving target for the slot (from slotTarget). */
  targets: z.object({ kcal: z.number().min(100).max(3000), protein: z.number().min(0).max(300) }).optional(),
  /** Recipe names or keys already in the user's pool or shown, so the AI doesn't repeat them. */
  exclude: z.array(z.string().trim().min(1).max(80)).max(300).default([]),
  /** The learned-taste summary (labels only), as soft guidance. */
  summary: z.object({ liked: z.array(label).max(8).default([]), disliked: z.array(label).max(8).default([]), simpler: z.boolean().optional() }).optional(),
});
export type AIRecipesRequest = z.infer<typeof AIRecipesRequest>;

/** POST /api/meals/ai/simplify */
export const AISimplifyRequest = z.object({
  recipe: z.unknown(),
  localDate: ISO_DATE,
});
export type AISimplifyRequest = z.infer<typeof AISimplifyRequest>;

/* ------------------------------------------------------------------ responses (what the app receives) */

export interface AIRecipesResponse {
  /** Accepted, stored recipes ("usr:<id>" keys), nutrition recomputed. Labelled AI in the UI. */
  recipes: Recipe[];
  keys: string[];
  /** How many of the model's recipes failed the checks (and were not stored). */
  rejected: number;
  model: string;
  mock?: true;
}

export type AISimplifyResponse =
  | { ok: true; recipe: Recipe; key: string; changes: string[]; model: string; mock?: true }
  | { ok: false; unchanged: true; reason: string; model: string; mock?: true };

/* ------------------------------------------------------------------ catalog */

export interface CatalogEntry {
  key: string;
  name: string;
  units: string[];
  per100: { kcal: number; protein: number };
  staple: boolean;
}

function unitsOf(e: IngredientEntry): string[] {
  const out = ["g"];
  for (const [u, g] of Object.entries(e.unitGrams ?? {})) if (g) out.push(`${u} (${g} g)`);
  if (e.density != null) out.push("ml", "tsp", "tbsp", "cup");
  return [...new Set(out)];
}

/** The ingredients this user may have: anything conflicting with allergies, diets or dislikes is left out (water too). */
export function aiCatalog(prefs: ConstraintPrefs): CatalogEntry[] {
  return INGREDIENTS.filter((e) => e.key !== "water" && recipeConflicts({ ingredients: [{ key: e.key, qty: 1, unit: "g" }], equipment: [] }, prefs).length === 0).map((e) => ({
    key: e.key,
    name: e.name,
    units: unitsOf(e),
    per100: { kcal: e.per100.kcal, protein: e.per100.protein },
    staple: !!e.staple,
  }));
}

function catalogText(entries: CatalogEntry[]): string {
  return entries.map((e) => `${e.key} | ${e.name}${e.staple ? " (staple)" : ""} | units: ${e.units.join(", ")} | per 100 g: ${e.per100.kcal} kcal, ${e.per100.protein} g protein`).join("\n");
}

/* ------------------------------------------------------------------ JSON schemas (Gemini responseJsonSchema) */

const TAG_PATTERN = "^(cuisine|protein|base|style|dish):[a-z0-9][a-z0-9-]{0,39}$";

function recipeItemSchema(keys: string[]) {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Plain dish name, at most 60 characters, no emojis." },
      blurb: { type: "string", description: "One short line for the card, at most 120 characters: 'Jarred sauce, lean beef, 20 minutes.'" },
      slots: { type: "array", items: { type: "string", enum: [...SLOTS] }, minItems: 1, maxItems: 2 },
      minutes: { type: "integer", description: "Total minutes including prep, preheating and cooking." },
      difficulty: { type: "string", enum: ["super_easy", "everyday", "i_like_cooking"] },
      ingredients: {
        type: "array",
        minItems: 1,
        maxItems: 14,
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: keys, description: "Exactly one key from the catalog." },
            qty: { type: "number", description: "Amount for ONE serving, in `unit`." },
            unit: { type: "string", enum: [...UNITS] },
            optional: { type: "boolean", description: "True only for garnishes or toppings." },
            note: { type: "string", description: "Short note like 'shredded' or 'drained'. Empty string if none." },
          },
          required: ["key", "qty", "unit"],
        },
      },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "One short step in plain words, with real times and temperatures." },
            timer_seconds: { type: "integer", description: "Seconds for a timer when the step waits on something, else 0." },
          },
          required: ["text"],
        },
      },
      equipment: { type: "array", items: { type: "string", enum: [...EQUIPMENT] } },
      tags: { type: "array", items: { type: "string", pattern: TAG_PATTERN }, maxItems: 8, description: "cuisine:, protein:, base:, style:, dish: tags." },
    },
    required: ["name", "blurb", "slots", "minutes", "difficulty", "ingredients", "steps", "equipment", "tags"],
  };
}

/** Response schema for new recipes. `keys` = the user's catalog keys (allergens and dislikes already removed). */
export function recipesResponseSchema(keys: string[]) {
  return { type: "object", properties: { recipes: { type: "array", minItems: 0, maxItems: 4, items: recipeItemSchema(keys) } }, required: ["recipes"] };
}

/** Response schema for "make this easier". */
export function simplifyResponseSchema(keys: string[]) {
  return {
    type: "object",
    properties: {
      unchanged: { type: "boolean", description: "True when it can't be made easier without becoming a different meal." },
      reason: { type: "string", description: "When unchanged: one plain sentence why." },
      recipe: recipeItemSchema(keys),
      changes: { type: "array", items: { type: "string" }, maxItems: 6, description: "What changed, in short plain sentences." },
    },
    required: ["unchanged"],
  };
}

/* ------------------------------------------------------------------ prompts */

const RULES = `Rules:
- Use ONLY ingredient keys from the CATALOG, exactly as written. Anything else is rejected.
- Quantities are for ONE serving, in one of that ingredient's listed units.
- Familiar, cheap food from a normal Canadian grocery store. Shortcuts are welcome: jarred sauce, microwave rice pouches, frozen vegetables, rotisserie or ready-cooked chicken, air fryer.
- Steps: short, numbered, plain words, no chef jargon. Real times and oven temperatures in °C with °F. Do not write food-safety notes; the app adds checked ones.
- Never use raw meat, poultry or fish without a step that cooks it.
- Difficulty: "super_easy" = at most 15 minutes, at most 6 ingredients that are not staples, at most 5 steps. "everyday" = 16 to 30 minutes. "i_like_cooking" = longer.
- Count preheating in the minutes.
- Do not give nutrition numbers; the app calculates them from the catalog.
- Names: plain and appetising, at most 60 characters, no emojis, no exclamation marks, no brand names.
- Tags describe the dish: cuisine:, protein:, base:, style:, dish: (lowercase, hyphens).`;

export const RECIPES_SYSTEM = `You write recipes for the meal planner inside a private fitness app. The cook is a 17-year-old lifter who is NOT an experienced cook and eats about 3,300 kcal and 185 g protein a day to gain muscle. Meals must be easy, filling and high in protein.

${RULES}`;

export const SIMPLIFY_SYSTEM = `You make recipes easier to cook for the meal planner inside a private fitness app. The cook is a 17-year-old lifter who is NOT an experienced cook.

Make the given recipe genuinely easier while keeping it the same meal with similar calories and protein: fewer ingredients, fewer steps or less time. Good moves: ready-cooked or rotisserie chicken instead of raw, microwave rice instead of cooking rice, frozen chopped vegetables, jarred sauces, onion or garlic powder, dropping garnishes, combining steps. Never make it longer, add steps or add ingredients. If it can't honestly be made easier, set unchanged to true and say why in one sentence.

${RULES}`;

function prefsLines(prefs: MealPrefs, summary?: AIRecipesRequest["summary"]): string[] {
  const lines: string[] = [];
  const lim = DIFFICULTY_LIMITS[prefs.difficulty];
  lines.push(`Cooking level: ${prefs.difficulty.replace(/_/g, " ")} (at most ${prefs.maxMinutes ?? lim.minutes} minutes, ${lim.ingredients} non-staple ingredients, ${lim.steps} steps).`);
  lines.push(`Budget: ${prefs.budget}.`);
  lines.push(`Equipment available: ${prefs.equipment.join(", ") || "none listed"}. Use nothing else.`);
  if (prefs.allergies.length) lines.push(`ALLERGIES (never include): ${prefs.allergies.join(", ")}.`);
  if (prefs.diets.length) lines.push(`DIETS (must follow): ${prefs.diets.join(", ")}.`);
  if (prefs.dislikedIngredients.length) lines.push(`Never use: ${prefs.dislikedIngredients.map((k) => getIngredient(k)?.name ?? k).join(", ")}.`);
  if (prefs.likedIngredients.length) lines.push(`Likes: ${prefs.likedIngredients.map((k) => getIngredient(k)?.name ?? k).join(", ")}.`);
  if (prefs.likedCuisines.length) lines.push(`Favourite cuisines: ${prefs.likedCuisines.join(", ")}.`);
  if (prefs.dislikedCuisines.length) lines.push(`Avoid cuisines: ${prefs.dislikedCuisines.join(", ")}.`);
  if (summary?.liked.length) lines.push(`Has enjoyed: ${summary.liked.join(", ")}.`);
  if (summary?.disliked.length) lines.push(`Tends to skip: ${summary.disliked.join(", ")}.`);
  if (summary?.simpler) lines.push("Has asked for simpler meals: keep ingredients and steps to a minimum.");
  return lines;
}

/** Soft guidance from the learned model (labels only), for the prompt. */
export function summaryForPrompt(s: LearnedSummary): NonNullable<AIRecipesRequest["summary"]> {
  return { liked: s.liked.map((f) => f.label).slice(0, 8), disliked: s.disliked.map((f) => f.label).slice(0, 8), simpler: s.simpler.active };
}

const SLOT_WORD: Record<Slot, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack" };

export function recipesUserText(req: Pick<AIRecipesRequest, "slot" | "count" | "targets" | "summary">, prefs: MealPrefs, catalog: CatalogEntry[], avoidNames: string[]): string {
  const lines = [`Write ${req.count} different ${SLOT_WORD[req.slot]} recipe${req.count > 1 ? "s" : ""} for ONE serving each.`];
  if (req.targets) lines.push(`Aim for about ${Math.round(req.targets.kcal)} kcal and ${Math.round(req.targets.protein)} g protein per serving (the app scales servings, so close is fine).`);
  lines.push(...prefsLines(prefs, req.summary));
  if (avoidNames.length) lines.push(`Do not repeat these existing recipes: ${avoidNames.slice(0, 200).join("; ")}.`);
  lines.push("", "CATALOG (key | name | units | per 100 g):", catalogText(catalog));
  return lines.join("\n");
}

export function simplifyUserText(recipe: Recipe, prefs: MealPrefs, catalog: CatalogEntry[]): string {
  const m = recipeMacros(recipe, 1);
  const lines = [
    `Make this recipe easier. It is ${recipe.minutes} minutes, ${ingredientCount(recipe)} non-staple ingredients, ${recipe.steps.length} steps, about ${m.kcal} kcal and ${Math.round(m.protein)} g protein per serving.`,
    ...prefsLines(prefs),
    "",
    "RECIPE (JSON):",
    JSON.stringify({ name: recipe.name, slots: recipe.slots, minutes: recipe.minutes, difficulty: recipe.difficulty, ingredients: recipe.ingredients.map(({ grams: _g, ...l }) => l), steps: recipe.steps.map((s) => ({ text: s.text, timer_seconds: s.timerSec ?? 0 })), equipment: recipe.equipment, tags: recipe.tags }),
    "",
    "CATALOG (key | name | units | per 100 g):",
    catalogText(catalog),
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ acceptance */

/** The model's recipe as it may come back (lenient: we clean before strict validation). */
const ModelRecipe = z.object({
  name: z.string(),
  blurb: z.string().optional().default(""),
  slots: z.array(z.string()).optional().default([]),
  minutes: z.number(),
  difficulty: z.string().optional(),
  ingredients: z.array(z.object({ key: z.string(), qty: z.number(), unit: z.string(), optional: z.boolean().optional(), note: z.string().optional() })),
  steps: z.array(z.object({ text: z.string(), timer_seconds: z.number().optional(), timerSec: z.number().optional() })),
  equipment: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

const TAG_RE = new RegExp(TAG_PATTERN);
const URL_RE = /\bhttps?:\/\/|www\./i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function cleanLine(s: string, max: number): string {
  return s.replace(EMOJI_RE, "").replace(/!+/g, ".").replace(/<[^>]*>/g, "").replace(/[*_`#]+/g, "").replace(/\s+/g, " ").replace(/\.\.+/g, ".").trim().slice(0, max).trim();
}

/** Raw meat, poultry and fish that need a cooking step, and the vetted safety note for it. */
const RAW: Record<string, { note: string; words: RegExp; minC: number }> = {
  "chicken-breast-raw": { note: SAFE.chicken, words: /\bchicken\b/i, minC: 74 },
  "chicken-thigh-raw": { note: SAFE.chicken, words: /\bchicken\b/i, minC: 74 },
  "chicken-tenders-frozen": { note: SAFE.breaded, words: /\b(chicken|strips?|tenders?)\b/i, minC: 74 },
  "ground-turkey": { note: SAFE.turkey, words: /\bturkey\b/i, minC: 74 },
  "ground-beef-lean": { note: SAFE.groundBeef, words: /\bbeef\b/i, minC: 71 },
  "burger-patties-frozen": { note: SAFE.groundBeef, words: /\b(patt(y|ies)|burgers?)\b/i, minC: 71 },
  "steak-sirloin-raw": { note: SAFE.steak, words: /\bsteak\b/i, minC: 63 },
  "pork-chop-raw": { note: SAFE.pork, words: /\b(pork|chops?)\b/i, minC: 71 },
  "pork-tenderloin-raw": { note: SAFE.pork, words: /\b(pork|tenderloin)\b/i, minC: 71 },
  "breakfast-sausage": { note: SAFE.pork, words: /\bsausages?\b/i, minC: 71 },
  "salmon-raw": { note: SAFE.fish, words: /\b(salmon|fish|fillets?)\b/i, minC: 70 },
  "cod-raw": { note: SAFE.fish, words: /\b(cod|fish|fillets?)\b/i, minC: 70 },
};
const COOK_WORDS = /\b(cook|brown|fry|stir-fry|sear|grill|roast|bake|air fry|air-fry|broil|simmer|boil|microwave|poach)\b/i;

export interface AcceptContext {
  prefs: MealPrefs;
  /** The slot asked for (new recipes must fit it). */
  slot?: Slot;
  /** Names (lowercase) the recipe must not duplicate. */
  takenNames?: ReadonlySet<string>;
  /** Id for the stored row: the recipe key becomes "usr:<id>". */
  id: string;
  origin: "ai" | "simplified";
  baseKey?: string;
  /** Check the user's cooking level and time cap (new recipes). An easier version only has to beat the original. */
  enforceLevel?: boolean;
}

export type AcceptResult = { ok: true; recipe: Recipe } | { ok: false; name: string; errors: string[] };

const MEAL_KCAL = { min: 300, max: 1400 };
const SNACK_KCAL = { min: 120, max: 700 };

function honestDifficulty(r: Pick<Recipe, "minutes" | "ingredients" | "steps">): Difficulty {
  if (meetsSuperEasy(r)) return "super_easy";
  return r.minutes <= 30 ? "everyday" : "i_like_cooking";
}

/**
 * One model recipe → a validated, normalised Recipe, or the reasons it was rejected.
 * Nutrition, allergens, kinds, cost and the difficulty label are recomputed from the
 * database; model safety notes are replaced by the app's vetted ones.
 */
export function acceptAIRecipe(raw: unknown, ctx: AcceptContext): AcceptResult {
  const parsed = ModelRecipe.safeParse(raw);
  const rawName = typeof (raw as { name?: unknown })?.name === "string" ? String((raw as { name: string }).name).slice(0, 60) : "Recipe";
  if (!parsed.success) return { ok: false, name: rawName, errors: ["The recipe was incomplete."] };
  const m = parsed.data;
  const name = cleanLine(m.name, 60).replace(/[.!?,;:]+$/, "").trim();
  const errors: string[] = [];
  const allText = [m.name, m.blurb, ...m.steps.map((s) => s.text), ...m.ingredients.map((i) => i.note ?? "")].join(" ");
  if (URL_RE.test(allText)) errors.push("It contained a link.");
  if (name.length < 3) errors.push("It had no usable name.");
  if (ctx.takenNames?.has(name.toLowerCase())) errors.push(`"${name}" already exists.`);

  const slots = [...new Set(m.slots.filter((s): s is Slot => (SLOTS as string[]).includes(s)))];
  if (ctx.slot && !slots.includes(ctx.slot)) slots.unshift(ctx.slot);
  const steps = m.steps
    .map((s) => {
      const text = cleanLine(s.text, 240);
      const t = Math.round(s.timer_seconds ?? s.timerSec ?? 0);
      return { text: /[.!?]$/.test(text) ? text : `${text}.`, ...(t >= 5 && t <= 4 * 3600 ? { timerSec: t } : {}) } as Recipe["steps"][number];
    })
    .filter((s) => s.text.length >= 4);
  const draft = {
    key: `usr:${ctx.id}`,
    name,
    slots: slots.slice(0, 4),
    minutes: Math.round(m.minutes),
    difficulty: "everyday" as Difficulty,
    ingredients: m.ingredients.map((i) => ({ key: i.key, qty: i.qty, unit: i.unit, ...(i.optional ? { optional: true } : {}), ...(i.note && cleanLine(i.note, 80) ? { note: cleanLine(i.note, 80) } : {}) })),
    steps,
    equipment: [...new Set(m.equipment.filter((e) => (EQUIPMENT as readonly string[]).includes(e)))],
    tags: [...new Set(m.tags.map((t) => t.toLowerCase().trim()).filter((t) => TAG_RE.test(t)))].slice(0, 12),
    blurb: cleanLine(m.blurb, 140) || `${m.minutes} minutes.`,
    origin: ctx.origin,
    ...(ctx.baseKey ? { baseKey: ctx.baseKey } : {}),
  };
  if (draft.blurb.length < 3) draft.blurb = `${draft.minutes} minutes.`;
  const v = validateRecipe(draft);
  if (!v.ok) return { ok: false, name, errors: [...errors, ...v.errors] };
  let recipe: Recipe = { ...v.recipe, difficulty: honestDifficulty(v.recipe) };

  // the user's hard constraints
  const conflicts = recipeConflicts(recipe, ctx.prefs);
  if (conflicts.length) errors.push(`It breaks your ${[...new Set(conflicts.map((c) => (c.kind === "disliked" ? "dislikes" : c.kind === "equipment" ? "equipment" : c.kind === "allergy" ? "allergies" : c.kind === "diet" ? "diet" : "ingredient list")))].join(" and ")}.`);

  // the user's cooking level
  if (ctx.enforceLevel !== false) {
    const lim = DIFFICULTY_LIMITS[ctx.prefs.difficulty];
    const maxMin = Math.min(ctx.prefs.maxMinutes ?? Infinity, lim.minutes);
    if (recipe.minutes > maxMin) errors.push(`${recipe.minutes} min is longer than your ${maxMin}-minute limit.`);
    if (ingredientCount(recipe) > lim.ingredients) errors.push(`${ingredientCount(recipe)} ingredients is more than your level allows (${lim.ingredients}).`);
    if (recipe.steps.length > lim.steps) errors.push(`${recipe.steps.length} steps is more than your level allows (${lim.steps}).`);
  }

  // plausible for the slot (computed from the database, not the model)
  const macros = recipeMacros(recipe, 1);
  const isSnackOnly = recipe.slots.every((s) => s === "snack");
  const band = isSnackOnly ? SNACK_KCAL : MEAL_KCAL;
  if (macros.kcal < band.min || macros.kcal > band.max) errors.push(`${macros.kcal} kcal a serving is outside ${band.min}–${band.max} for a ${isSnackOnly ? "snack" : "meal"}.`);
  if (macros.protein < (isSnackOnly ? 8 : 20)) errors.push(`${Math.round(macros.protein)} g protein a serving is too low.`);

  // food safety: raw meat must be cooked in a step, which gets the app's checked note
  const stepsOut = recipe.steps.map((s) => ({ ...s }));
  for (const l of recipe.ingredients) {
    const raw = RAW[l.key];
    if (!raw) continue;
    const i = stepsOut.findIndex((s) => raw.words.test(s.text) && COOK_WORDS.test(s.text));
    if (i < 0) {
      errors.push(`No step cooks the ${getIngredient(l.key)?.name.toLowerCase() ?? l.key}.`);
      continue;
    }
    if (!stepsOut[i].safety) stepsOut[i].safety = raw.note;
    for (const s of stepsOut) {
      for (const t of s.text.matchAll(/(\d{2,3})\s*°\s*C\b[^.]{0,30}\b(inside|internal)|\b(inside|internal)[^.]{0,30}?(\d{2,3})\s*°\s*C/gi)) {
        const c = Number(t[1] ?? t[4]);
        if (raw.words.test(s.text) && c < raw.minC) errors.push(`A step gives an unsafe temperature (${c}°C).`);
      }
    }
  }
  recipe = { ...recipe, steps: stepsOut };

  if (errors.length) return { ok: false, name, errors: [...new Set(errors)] };
  return { ok: true, recipe };
}

/**
 * A model's "easier" version of `original`: accepted only when it's the same meal (same slot,
 * calories within 35%), genuinely easier (no more minutes, ingredients or steps, and fewer of
 * at least one) and passes every check new recipes pass.
 */
export function acceptAISimplified(raw: unknown, original: Recipe, ctx: Omit<AcceptContext, "origin" | "baseKey" | "slot" | "takenNames" | "enforceLevel">): AcceptResult {
  // the easier version keeps the dish's name, marked as easier
  const named = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>), name: easierName(original.name) } : raw;
  const res = acceptAIRecipe(named, { ...ctx, origin: "simplified", baseKey: original.key, slot: original.slots[0], enforceLevel: false });
  if (!res.ok) return res;
  const r = res.recipe;
  const errors: string[] = [];
  const a = { minutes: original.minutes, ing: ingredientCount(original), steps: original.steps.length };
  const b = { minutes: r.minutes, ing: ingredientCount(r), steps: r.steps.length };
  if (b.minutes > a.minutes || b.ing > a.ing || b.steps > a.steps) errors.push("It wasn't easier than the original.");
  else if (b.minutes === a.minutes && b.ing === a.ing && b.steps === a.steps) errors.push("Nothing got easier.");
  const k0 = recipeMacros(original, 1).kcal;
  const k1 = recipeMacros(r, 1).kcal;
  if (k0 > 0 && Math.abs(k1 - k0) / k0 > 0.35) errors.push(`It changed the meal too much (${k0} → ${k1} kcal).`);
  if (!r.slots.some((s) => original.slots.includes(s))) errors.push("It's no longer the same kind of meal.");
  if (errors.length) return { ok: false, name: r.name, errors };
  return { ok: true, recipe: { ...r, slots: original.slots } };
}

/** Names the AI must not reuse: the library's, plus the user's own recipes'. */
export function takenNames(userRecipeNames: readonly string[]): Set<string> {
  return new Set([...LIBRARY.map((r) => r.name), ...userRecipeNames].map((n) => n.toLowerCase()));
}

/** Library names for the slot (sent to the model as "don't repeat these"). */
export function slotLibraryNames(slot: Slot): string[] {
  return libraryForSlot(slot).map((r) => r.name);
}

/** A plain-words line for each change the AI made (from its own list, cleaned), plus the recomputed nutrition. */
export function simplifyChanges(modelChanges: unknown, original: Recipe, next: Recipe): string[] {
  const list = Array.isArray(modelChanges) ? modelChanges.filter((c): c is string => typeof c === "string").map((c) => cleanLine(c, 140)).filter((c) => c.length >= 4 && !URL_RE.test(c)) : [];
  const out = list.slice(0, 5);
  if (next.minutes < original.minutes) out.push(`About ${next.minutes} min instead of ${original.minutes}`);
  out.push(nutritionChange(original, next));
  return out;
}

/* ------------------------------------------------------------------ dev fixtures (AI_MOCK=1 only) */

type Fixture = z.input<typeof ModelRecipe>;
const ing = (key: string, qty: number, unit: string, extra: { optional?: boolean; note?: string } = {}) => ({ key, qty, unit, ...extra });
const step = (text: string, timer_seconds = 0) => ({ text, timer_seconds });

/**
 * Canned model answers for local UI testing (NODE_ENV=development and AI_MOCK=1). They go
 * through exactly the same acceptance checks as real answers, and responses are marked mock.
 */
export const MOCK_RECIPES: Record<Slot, Fixture[]> = {
  breakfast: [
    {
      name: "Maple Peanut Butter Protein Oats",
      blurb: "Microwave oats with whey and peanut butter, 6 minutes.",
      slots: ["breakfast"],
      minutes: 6,
      difficulty: "super_easy",
      ingredients: [ing("oats", 1, "cup"), ing("milk-2", 1.5, "cup"), ing("whey-protein", 1, "scoop"), ing("peanut-butter", 1.5, "tbsp"), ing("maple-syrup", 1, "tbsp"), ing("banana", 1, "piece")],
      steps: [step("Stir the oats and milk in a large microwave-safe bowl."), step("Microwave 2½ minutes, stir, then 1 minute more.", 210), step("Stir in the whey, then top with peanut butter, sliced banana and maple syrup.")],
      equipment: ["microwave"],
      tags: ["cuisine:breakfast", "protein:whey", "base:oats", "style:bowl", "dish:oatmeal"],
    },
    {
      name: "Turkey, Egg and Cheese Bagel Stack",
      blurb: "Microwave eggs, deli turkey and cheddar on a toasted bagel.",
      slots: ["breakfast"],
      minutes: 8,
      difficulty: "super_easy",
      ingredients: [ing("bagel", 1, "piece"), ing("eggs", 3, "piece"), ing("turkey-deli", 60, "g"), ing("cheddar", 0.25, "cup"), ing("butter", 1, "tsp")],
      steps: [step("Toast the bagel."), step("Beat the eggs in a greased microwave-safe mug and microwave 1½ minutes, stirring halfway, until set.", 90), step("Stack the eggs, turkey and cheddar on the buttered bagel.")],
      equipment: ["microwave", "toaster"],
      tags: ["cuisine:breakfast", "protein:egg", "protein:turkey", "base:bread", "style:sandwich", "dish:breakfast-sandwich"],
    },
    {
      name: "Berry Crunch Protein Yogurt Bowl",
      blurb: "Greek yogurt, whey, berries and granola, 4 minutes.",
      slots: ["breakfast"],
      minutes: 4,
      difficulty: "super_easy",
      ingredients: [ing("greek-yogurt-0", 1.25, "cup"), ing("whey-protein", 0.5, "scoop"), ing("frozen-berries", 1, "cup"), ing("granola", 0.5, "cup"), ing("honey", 1, "tbsp")],
      steps: [step("Microwave the berries 1 minute to thaw.", 60), step("Stir the whey into the yogurt, then top with the berries, granola and honey.")],
      equipment: ["microwave"],
      tags: ["cuisine:breakfast", "protein:dairy", "base:yogurt", "style:bowl", "dish:yogurt-bowl"],
    },
  ],
  lunch: [
    {
      name: "Ranch Chicken Rice Bowl",
      blurb: "Ready-cooked chicken, microwave rice, corn and ranch.",
      slots: ["lunch", "dinner"],
      minutes: 7,
      difficulty: "super_easy",
      ingredients: [ing("rice-cooked-microwave", 1, "pouch"), ing("chicken-breast-cooked", 170, "g"), ing("frozen-corn", 0.75, "cup"), ing("cheddar", 0.25, "cup"), ing("ranch-dressing", 2, "tbsp")],
      steps: [step("Microwave the corn 2 minutes and the rice 90 seconds.", 120), step("Warm the chicken in the microwave 1 minute until steaming hot.", 60), step("Pile everything in a bowl and top with cheddar and ranch.")],
      equipment: ["microwave"],
      tags: ["cuisine:american", "protein:chicken", "base:rice", "style:bowl", "dish:ranch-bowl"],
    },
    {
      name: "Turkey Hummus Pita Pockets",
      blurb: "Deli turkey, hummus, cucumber and feta in warm pitas.",
      slots: ["lunch"],
      minutes: 5,
      difficulty: "super_easy",
      ingredients: [ing("pita", 2, "piece"), ing("turkey-deli", 150, "g"), ing("hummus", 4, "tbsp"), ing("cucumber", 0.5, "cup"), ing("feta", 0.25, "cup")],
      steps: [step("Warm the pitas in the microwave 15 seconds and cut them in half.", 15), step("Spread hummus inside and fill with turkey, sliced cucumber and feta.")],
      equipment: ["microwave"],
      tags: ["cuisine:mediterranean", "protein:turkey", "base:bread", "style:wrap", "dish:pita"],
    },
    {
      name: "Turkey Club Wrap",
      blurb: "Deli turkey, bacon, lettuce and tomato in a big tortilla.",
      slots: ["lunch"],
      minutes: 6,
      difficulty: "super_easy",
      ingredients: [ing("tortilla-large", 2, "piece"), ing("turkey-deli", 150, "g"), ing("bacon-cooked", 3, "slice"), ing("lettuce", 2, "piece"), ing("tomato", 0.5, "piece"), ing("mayo", 1, "tbsp")],
      steps: [step("Microwave the bacon between paper towels 3 minutes until crisp.", 180), step("Spread the tortillas with mayo and fill with turkey, bacon, lettuce and sliced tomato."), step("Roll them up tightly and cut in half.")],
      equipment: ["microwave"],
      tags: ["cuisine:american", "protein:turkey", "protein:pork", "base:tortilla", "style:wrap", "dish:club-wrap"],
    },
  ],
  dinner: [
    {
      name: "Beef and Bean Burrito Skillet",
      blurb: "Lean beef, beans, salsa and rice in one pan, 15 minutes.",
      slots: ["dinner"],
      minutes: 15,
      difficulty: "super_easy",
      ingredients: [ing("ground-beef-lean", 170, "g"), ing("black-beans", 0.5, "can"), ing("salsa", 0.5, "cup"), ing("rice-cooked-microwave", 1, "pouch"), ing("cheddar", 0.33, "cup"), ing("taco-seasoning", 2, "tsp")],
      steps: [
        step("Brown the beef in a large pan over medium-high 6–8 minutes, breaking it up.", 420),
        step("Stir in the taco seasoning, drained beans and salsa and simmer 3 minutes.", 180),
        step("Microwave the rice 90 seconds and stir it into the pan.", 90),
        step("Sprinkle with cheddar, cover 1 minute to melt and serve.", 60),
      ],
      equipment: ["stovetop", "microwave"],
      tags: ["cuisine:mexican", "protein:beef", "base:rice", "style:skillet", "dish:burrito-skillet"],
    },
    {
      name: "Honey Soy Pork and Rice",
      blurb: "Pan-seared pork tenderloin with a sticky honey soy glaze.",
      slots: ["dinner"],
      minutes: 15,
      difficulty: "super_easy",
      ingredients: [ing("pork-tenderloin-raw", 200, "g"), ing("honey", 1, "tbsp"), ing("soy-sauce", 2, "tbsp"), ing("rice-cooked-microwave", 1, "pouch"), ing("frozen-broccoli", 1.5, "cup"), ing("canola-oil", 1, "tsp")],
      steps: [
        step("Slice the pork into 2 cm rounds.", 0),
        step("Cook the pork in the oil in a pan over medium-high 3–4 minutes per side.", 210),
        step("Add the honey and soy sauce and turn the pork in the glaze for 1 minute.", 60),
        step("Microwave the broccoli 4 minutes and the rice 90 seconds, then serve together.", 240),
      ],
      equipment: ["stovetop", "microwave"],
      tags: ["cuisine:asian", "protein:pork", "base:rice", "style:plate", "dish:honey-soy-pork"],
    },
    {
      name: "Teriyaki Turkey Rice Bowl",
      blurb: "Ground turkey, frozen stir-fry veg and teriyaki sauce over rice.",
      slots: ["dinner"],
      minutes: 15,
      difficulty: "super_easy",
      ingredients: [ing("ground-turkey", 170, "g"), ing("frozen-stirfry-veg", 1.5, "cup"), ing("teriyaki-sauce", 0.25, "cup"), ing("rice-cooked-microwave", 1, "pouch"), ing("canola-oil", 1, "tsp")],
      steps: [
        step("Cook the turkey in the oil in a large pan over medium-high 6–8 minutes, breaking it up.", 420),
        step("Add the frozen vegetables and cook 3–4 minutes.", 210),
        step("Stir in the teriyaki sauce, microwave the rice 90 seconds and serve the turkey on top.", 90),
      ],
      equipment: ["stovetop", "microwave"],
      tags: ["cuisine:asian", "protein:turkey", "base:rice", "style:bowl", "dish:teriyaki-bowl"],
    },
  ],
  snack: [
    {
      name: "Cottage Cheese Pineapple Cup",
      blurb: "Cottage cheese and pineapple, 2 minutes.",
      slots: ["snack"],
      minutes: 2,
      difficulty: "super_easy",
      ingredients: [ing("cottage-cheese", 0.75, "cup"), ing("pineapple-canned", 0.5, "cup")],
      steps: [step("Spoon the cottage cheese into a bowl and top with drained pineapple.")],
      equipment: [],
      tags: ["protein:dairy", "base:fruit", "style:bowl", "dish:cottage-cheese"],
    },
    {
      name: "Peanut Butter Yogurt Apple Dip",
      blurb: "Greek yogurt whipped with peanut butter, with apple slices.",
      slots: ["snack"],
      minutes: 3,
      difficulty: "super_easy",
      ingredients: [ing("greek-yogurt-2", 0.75, "cup"), ing("peanut-butter", 1, "tbsp"), ing("apple", 1, "piece")],
      steps: [step("Stir the peanut butter into the yogurt until smooth."), step("Slice the apple and dip.")],
      equipment: [],
      tags: ["protein:dairy", "protein:peanut", "base:fruit", "style:snack-plate", "dish:yogurt-dip"],
    },
    {
      name: "Chocolate Protein Milk",
      blurb: "Chocolate milk shaken with a scoop of whey.",
      slots: ["snack"],
      minutes: 2,
      difficulty: "super_easy",
      ingredients: [ing("chocolate-milk", 1, "cup"), ing("whey-protein", 0.5, "scoop")],
      steps: [step("Shake the chocolate milk and whey in a sealed bottle until smooth.")],
      equipment: [],
      tags: ["protein:whey", "style:shake", "dish:protein-milk"],
    },
  ],
};

/** Mock "make this easier": drop optional garnish, fold steps into at most 3, a few minutes less. */
export function mockSimplify(recipe: Recipe): { unchanged: boolean; reason?: string; recipe?: Fixture; changes?: string[] } {
  const opt = recipe.ingredients.filter((l) => l.optional);
  const steps = recipe.steps.map((s) => s.text);
  if (!opt.length && steps.length <= 3 && recipe.minutes <= 10) return { unchanged: true, reason: "It's already quick, with only a few steps." };
  const merged: string[] = [];
  const per = Math.ceil(steps.length / Math.min(3, steps.length));
  for (let i = 0; i < steps.length; i += per) merged.push(steps.slice(i, i + per).join(" "));
  return {
    unchanged: false,
    recipe: {
      name: recipe.name,
      blurb: recipe.blurb,
      slots: recipe.slots,
      minutes: Math.max(3, recipe.minutes - Math.min(5, Math.round(recipe.minutes / 4))),
      difficulty: recipe.difficulty,
      ingredients: recipe.ingredients.filter((l) => !l.optional).map(({ grams: _g, ...l }) => l),
      steps: merged.map((t) => ({ text: t.slice(0, 240), timer_seconds: 0 })),
      equipment: recipe.equipment,
      tags: recipe.tags,
    },
    changes: [...(opt.length ? ["Left out the optional toppings"] : []), ...(merged.length < steps.length ? [`Combined the steps into ${merged.length}`] : [])],
  };
}
