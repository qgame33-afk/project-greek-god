// Pure display helpers shared by every meal-planner screen (week view, recipe screen, grocery
// list, entry card). No React: unit-tested in format.test.ts.

import { fractionText } from "@/lib/meals/recipe";
import type { Difficulty, Macros, Recipe, RecipeOrigin, Slot } from "@/lib/meals/types";

export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { super_easy: "Super Easy", everyday: "Everyday", i_like_cooking: "I Like Cooking" };

/** Pips filled for each level (1 = Super Easy). */
export const DIFFICULTY_LEVEL: Record<Difficulty, 1 | 2 | 3> = { super_easy: 1, everyday: 2, i_like_cooking: 3 };

/** One line under each level in pickers. */
export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  super_easy: "15 min or less · 6 ingredients · 5 steps",
  everyday: "Up to 30 min · a little more prep",
  i_like_cooking: "Longer recipes welcome",
};

/** "Snack 2" when a day has more than one snack, else the plain slot name. */
export function slotTitle(slot: Slot, position = 0, snacksThatDay = 1): string {
  if (slot === "snack" && snacksThatDay > 1) return `Snack ${position + 1}`;
  return SLOT_LABEL[slot];
}

/** "1 serving", "1½ servings", "2 servings". */
export function servingsLabel(servings: number): string {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return s === 1 ? "1 serving" : `${fractionText(s)} servings`;
}

/** "×1½" for anything other than one serving, else "" (shown next to a recipe name). */
export function servingsMultiplier(servings: number): string {
  if (!Number.isFinite(servings) || servings <= 0 || servings === 1) return "";
  return `×${fractionText(servings)}`;
}

export const costLabel = (cost: 1 | 2 | 3) => "$".repeat(cost);

export const COST_WORDS: Record<1 | 2 | 3, string> = { 1: "Budget", 2: "Mid-price", 3: "Pricier" };

/** 3300 → "3,300". Rounds to an integer. */
export function kcalText(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

/** Grams to the integer (DESIGN.md: kcal and grams as integers). */
export function gramsText(n: number): string {
  return String(Math.round(Number.isFinite(n) ? n : 0));
}

/** "920 kcal · 58 g protein" — the one-line summary on cards and in toasts. */
export function macroSummary(m: Pick<Macros, "kcal" | "protein">): string {
  return `${kcalText(m.kcal)} kcal · ${gramsText(m.protein)} g protein`;
}

/** Spoken form for aria-labels: "920 kilocalories, 58 grams protein, 80 grams carbs, 30 grams fat (estimate)". */
export function macroAria(m: Macros): string {
  return `${kcalText(m.kcal)} kilocalories, ${gramsText(m.protein)} grams protein, ${gramsText(m.carbs)} grams carbs, ${gramsText(m.fat)} grams fat, estimate`;
}

/** Where a recipe came from, for its badge. Library recipes get none. */
export function originLabel(origin: RecipeOrigin): string | null {
  switch (origin) {
    case "ai":
      return "AI recipe";
    case "simplified":
      return "Made easier";
    case "custom":
      return "Your recipe";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ glyphs */

/** The small picture on a recipe card, chosen from its tags (no photos in the app). */
export type GlyphKind =
  | "burger"
  | "pizza"
  | "shake"
  | "sandwich"
  | "salad"
  | "fruit"
  | "beef"
  | "poultry"
  | "pork"
  | "fish"
  | "shrimp"
  | "egg"
  | "dairy"
  | "plant"
  | "nut"
  | "grain"
  | "bowl";

const STYLE_GLYPH: Record<string, GlyphKind> = {
  burger: "burger",
  pizza: "pizza",
  shake: "shake",
  sandwich: "sandwich",
  wrap: "sandwich",
  quesadilla: "sandwich",
  salad: "salad",
  fruit: "fruit",
};

const PROTEIN_GLYPH: Record<string, GlyphKind> = {
  beef: "beef",
  chicken: "poultry",
  turkey: "poultry",
  pork: "pork",
  tuna: "fish",
  salmon: "fish",
  fish: "fish",
  shrimp: "shrimp",
  egg: "egg",
  whey: "shake",
  dairy: "dairy",
  beans: "plant",
  tofu: "plant",
  peanut: "nut",
};

const BASE_GLYPH: Record<string, GlyphKind> = { fruit: "fruit", nuts: "nut", yogurt: "dairy", oats: "grain", cereal: "grain", bread: "grain", crackers: "grain" };

/**
 * A distinctive dish style first (a burger reads as a burger), then the first protein, then the
 * base; a bowl when nothing matches.
 */
export function glyphFor(recipe: Pick<Recipe, "tags">): GlyphKind {
  const tags = recipe.tags ?? [];
  const val = (prefix: string) => tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
  for (const s of val("style:")) if (STYLE_GLYPH[s]) return STYLE_GLYPH[s];
  for (const p of val("protein:")) if (PROTEIN_GLYPH[p]) return PROTEIN_GLYPH[p];
  for (const b of val("base:")) if (BASE_GLYPH[b]) return BASE_GLYPH[b];
  return "bowl";
}

// Name words → glyph, for logged foods with no recipe (a coin in Fuel's timeline). Decorative only:
// the row's name says what it is. First match wins, so dishes come before their ingredients.
const NAME_GLYPH: [RegExp, GlyphKind][] = [
  [/\bburgers?\b/, "burger"],
  [/\bpizza/, "pizza"],
  [/\b(shake|smoothie|whey|protein (drink|powder))/, "shake"],
  [/\b(sandwich|wrap|sub|quesadilla|burrito|taco|bun)\b/, "sandwich"],
  [/\bsalad/, "salad"],
  [/\b(salmon|tuna|fish|cod|tilapia|sardine)/, "fish"],
  [/\b(shrimp|prawn)/, "shrimp"],
  [/\b(chicken|turkey)/, "poultry"],
  [/\b(beef|steak|bolognese|chili|meatball)/, "beef"],
  [/\b(pork|ham|bacon|peameal|sausage)/, "pork"],
  [/\beggs?\b|omelet/, "egg"],
  [/\b(yogurt|yoghurt|milk|cheese|skyr|cottage|kefir)/, "dairy"],
  [/\b(peanut|almond|cashew|walnut|nuts?)\b/, "nut"],
  [/\b(beans?|tofu|lentils?|chickpeas?|edamame)\b/, "plant"],
  [/\b(apple|banana|berr(y|ies)|orange|grapes?|fruit|mango|pear)/, "fruit"],
  [/\b(rice|bagel|bread|toast|oats?|oatmeal|pasta|cereal|granola|crackers?|noodles?|tortilla|muffin|pancakes?)\b/, "grain"],
];

/** A glyph for a logged food from its name ("Greek yogurt 0%" → dairy); a bowl when nothing matches. */
export function glyphForName(name: string | null | undefined): GlyphKind {
  const n = (name ?? "").toLowerCase();
  for (const [re, kind] of NAME_GLYPH) if (re.test(n)) return kind;
  return "bowl";
}

/** Glyph tint per family: meats terracotta, seafood lapis, plants verdigris, dairy/eggs marble, shakes porphyry. */
export type GlyphTone = "terracotta" | "lapis" | "verdigris" | "marble" | "porphyry";

export const GLYPH_TONE: Record<GlyphKind, GlyphTone> = {
  burger: "terracotta",
  pizza: "terracotta",
  beef: "terracotta",
  pork: "terracotta",
  poultry: "marble",
  sandwich: "marble",
  egg: "marble",
  dairy: "marble",
  grain: "marble",
  bowl: "marble",
  fish: "lapis",
  shrimp: "lapis",
  salad: "verdigris",
  fruit: "verdigris",
  plant: "verdigris",
  nut: "verdigris",
  shake: "porphyry",
};
