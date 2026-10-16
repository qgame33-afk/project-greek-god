// Pure rules behind the meal Preferences screen (docs/MEALS.md §6): the choices it offers
// (cuisines from the library, ingredients from the database), search, and plain-English
// wording for what the planner has learned. No React: unit-tested in model.test.ts.

import { INGREDIENTS, ingredientName } from "@/lib/meals/ingredients";
import { LIBRARY } from "@/lib/meals/library";
import { dietLabel } from "@/lib/meals/recipe";
import { GROCERY_CATEGORY_LABEL, type Allergen, type Diet, type Equipment, type FeedbackEvent, type FeedbackReason, type GroceryCategory, type MealPrefs } from "@/lib/meals/types";

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  dairy: "Dairy",
  egg: "Eggs",
  gluten: "Gluten",
  peanut: "Peanuts",
  tree_nut: "Tree nuts",
  soy: "Soy",
  fish: "Fish",
  shellfish: "Shellfish",
  sesame: "Sesame",
};

export const ALLERGEN_ORDER: Allergen[] = ["peanut", "tree_nut", "dairy", "egg", "gluten", "soy", "fish", "shellfish", "sesame"];
export const DIET_ORDER: Diet[] = ["vegetarian", "pescatarian", "halal", "no_pork", "no_beef", "dairy_free", "lactose_free", "gluten_free"];
export const dietName = (d: Diet) => dietLabel(d);

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  stovetop: "Stovetop",
  oven: "Oven",
  microwave: "Microwave",
  air_fryer: "Air fryer",
  toaster: "Toaster",
  blender: "Blender",
  grill: "Grill / BBQ",
  kettle: "Kettle",
};
export const EQUIPMENT_ORDER: Equipment[] = ["stovetop", "oven", "microwave", "air_fryer", "toaster", "blender", "kettle", "grill"];

/** Time limits offered on top of the cooking level (null = the level's own range). */
export const TIME_LIMITS: (number | null)[] = [null, 15, 20, 30, 45];

/* --------------------------------------------------------------- cuisines */

const CUISINE_NAME: Record<string, string> = { breakfast: "Breakfast classics" };
const titleCase = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const cuisineName = (key: string) => CUISINE_NAME[key] ?? titleCase(key);

/** Cuisines the library actually cooks, most recipes first, with how many recipes each has. */
export const CUISINES: { key: string; label: string; recipes: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const r of LIBRARY) for (const t of r.tags) if (t.startsWith("cuisine:")) counts.set(t.slice(8), (counts.get(t.slice(8)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, recipes]) => ({ key, label: cuisineName(key), recipes }));
})();

export type CuisineMood = "more" | "less" | null;

export function cuisineMood(prefs: Pick<MealPrefs, "likedCuisines" | "dislikedCuisines">, key: string): CuisineMood {
  return prefs.likedCuisines.includes(key) ? "more" : prefs.dislikedCuisines.includes(key) ? "less" : null;
}

/** Put a cuisine in "more of" or "less of" (never both), or clear it. Returns only the two lists. */
export function setCuisineMood(prefs: Pick<MealPrefs, "likedCuisines" | "dislikedCuisines">, key: string, mood: CuisineMood): Pick<MealPrefs, "likedCuisines" | "dislikedCuisines"> {
  const liked = prefs.likedCuisines.filter((c) => c !== key);
  const disliked = prefs.dislikedCuisines.filter((c) => c !== key);
  if (mood === "more") liked.push(key);
  if (mood === "less") disliked.push(key);
  return { likedCuisines: liked, dislikedCuisines: disliked };
}

/* ------------------------------------------------------------ ingredients */

export interface IngredientChoice {
  key: string;
  name: string;
  category: GroceryCategory;
}

const CATEGORY_ORDER: GroceryCategory[] = ["meat", "dairy_eggs", "bread_grains", "vegetables", "fruit", "frozen", "pantry", "other"];

/** Everything a person might like, avoid or already have: the database minus staples (salt, oil, spices, water). */
export const INGREDIENT_CHOICES: IngredientChoice[] = INGREDIENTS.filter((i) => !i.staple)
  .map((i) => ({ key: i.key, name: i.name, category: i.category }))
  .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Ingredients matching a search: every word must appear (in the name or key); names that start
 * with the query come first, then a word starting with it, then anything containing it.
 */
export function searchIngredients(query: string, choices: readonly IngredientChoice[] = INGREDIENT_CHOICES): IngredientChoice[] {
  const q = norm(query);
  if (!q) return [...choices];
  const words = q.split(" ");
  const scored: { c: IngredientChoice; rank: number }[] = [];
  for (const c of choices) {
    const name = norm(c.name);
    const hay = `${name} ${norm(c.key.replace(/-/g, " "))}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const rank = name.startsWith(q) ? 0 : name.split(" ").some((w) => w.startsWith(words[0])) ? 1 : 2;
    scored.push({ c, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name)).map((s) => s.c);
}

/** Group ingredient choices by grocery aisle, in store order (empty aisles dropped). */
export function groupByAisle(choices: readonly IngredientChoice[]): { category: GroceryCategory; label: string; items: IngredientChoice[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, label: GROCERY_CATEGORY_LABEL[category], items: choices.filter((c) => c.category === category) })).filter((g) => g.items.length);
}

/** Display names for stored keys, keeping unknown keys visible rather than dropping them. */
export function namesOf(keys: readonly string[]): { key: string; name: string }[] {
  return keys.map((key) => ({ key, name: ingredientName(key) }));
}

/** Add or remove one value; returns a new list. */
export function toggled<T>(list: readonly T[], value: T, on?: boolean): T[] {
  const has = list.includes(value);
  const want = on ?? !has;
  if (want === has) return [...list];
  return want ? [...list, value] : list.filter((v) => v !== value);
}

/* --------------------------------------------------------------- learning */

const EVENT_WORD: Record<FeedbackEvent, string> = {
  thumbs_up: "liked",
  thumbs_down: "not for you",
  saved: "favourited",
  unsaved: "unfavourited",
  regenerated: "swapped out",
  kept: "kept",
  logged: "logged",
  cooked: "cooked",
  repeated: "repeated",
  made_easier: "made easier",
  viewed: "opened",
};

const REASON_WORD: Record<FeedbackReason, string> = {
  dont_like: "didn't like it",
  too_complicated: "too complicated",
  too_long: "took too long",
  too_expensive: "too expensive",
  ate_recently: "ate it recently",
  dislike_ingredient: "an ingredient",
};

/** "liked, kept twice" / "swapped out: too complicated": what a person did with one recipe. */
export function evidenceText(events: readonly { event: FeedbackEvent; reason: FeedbackReason | null }[]): string {
  const counts = new Map<string, number>();
  for (const e of events) {
    const w = e.reason ? `${EVENT_WORD[e.event]}: ${REASON_WORD[e.reason]}` : EVENT_WORD[e.event];
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].map(([w, n]) => (n === 1 ? w : n === 2 ? `${w} twice` : `${w} ${n} times`)).join(", ");
}

/** A feature weight (±3) as 1–5 filled pips for the learned panel. */
export function strengthPips(weight: number): number {
  return Math.max(1, Math.min(5, Math.round((Math.abs(weight) / 3) * 5)));
}

export interface EvidenceGroup<R> {
  key: string;
  labels: string[];
  /** Strongest weight in the group (sign kept). */
  weight: number;
  recipes: R[];
}

/**
 * Learned features backed by exactly the same meals, merged into one line: one liked breakfast
 * teaches "potatoes", "bacon" and "eggs" at once, and repeating its name under each would be
 * noise. Order follows the strongest feature of each group.
 */
export function groupByEvidence<R extends { recipe_key: string }>(features: readonly { feature: string; label: string; weight: number; recipes: R[] }[]): EvidenceGroup<R>[] {
  const out: EvidenceGroup<R>[] = [];
  const byKey = new Map<string, EvidenceGroup<R>>();
  for (const f of features) {
    const key = f.recipes
      .map((r) => r.recipe_key)
      .sort()
      .join("|");
    const g = byKey.get(key);
    if (g) {
      g.labels.push(f.label);
      if (Math.abs(f.weight) > Math.abs(g.weight)) g.weight = f.weight;
    } else {
      const ng = { key: key || f.feature, labels: [f.label], weight: f.weight, recipes: f.recipes };
      byKey.set(key, ng);
      out.push(ng);
    }
  }
  return out;
}
