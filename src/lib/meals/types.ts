// Shared contract for the meal planner ("MEALS — YOUR WEEK, FUELLED"). See docs/MEALS.md.
// Everything here is plain data: recipes, ingredients, preferences, plan rows and learning
// events. The library, engine, data hooks, API routes and UI all build on these types.

/** A meal slot in the plan. Food-log category: snack → "snacks". */
export type Slot = "breakfast" | "lunch" | "dinner" | "snack";
export const SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Cooking difficulty the user picks. Default "super_easy". */
export type Difficulty = "super_easy" | "everyday" | "i_like_cooking";

export type Budget = "tight" | "normal" | "flexible";

export type Equipment = "stovetop" | "oven" | "microwave" | "air_fryer" | "toaster" | "blender" | "grill" | "kettle";

/** Hard constraints. A recipe containing any of these can never be suggested. */
export type Allergen = "dairy" | "egg" | "gluten" | "peanut" | "tree_nut" | "soy" | "fish" | "shellfish" | "sesame";

/** Dietary restrictions (hard constraints). */
export type Diet = "vegetarian" | "pescatarian" | "no_pork" | "no_beef" | "halal" | "lactose_free" | "gluten_free" | "dairy_free";

export type GroceryCategory = "meat" | "dairy_eggs" | "bread_grains" | "fruit" | "vegetables" | "frozen" | "pantry" | "other";
export const GROCERY_CATEGORY_LABEL: Record<GroceryCategory, string> = {
  meat: "Meat and poultry",
  dairy_eggs: "Dairy and eggs",
  bread_grains: "Bread and grains",
  fruit: "Fruits",
  vegetables: "Vegetables",
  frozen: "Frozen foods",
  pantry: "Pantry items",
  other: "Other",
};

/** Per 100 g (or per 100 ml for liquids — `density` converts). */
export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One entry in the ingredient database (src/lib/meals/ingredients.ts). */
export interface IngredientInfo {
  key: string; // kebab-case, stable: "ground-beef-lean", "pasta-dry", "pasta-sauce-jarred"
  name: string; // shopper-facing: "Lean ground beef"
  per100: Per100; // USDA FoodData Central (SR Legacy / Foundation) values for this form
  category: GroceryCategory;
  allergens: Allergen[];
  /** What the ingredient is, for diet rules: e.g. ["meat","beef"], ["dairy"], ["fish"], ["plant"]. */
  kinds: IngredientKind[];
  /** Grams for one natural unit when sold/used by count: egg 50, bagel 95, tortilla 45, slice bread 32. */
  unitGrams?: Partial<Record<Unit, number>>;
  /** g per ml for liquids measured by volume (milk 1.03, oil 0.92). Default 1. */
  density?: number;
  /** How it is bought, for the grocery list: "454 g pack", "dozen", "1 L carton", "loaf (20 slices)". */
  pack?: { size: number; unit: "g" | "ml" | "piece"; label: string; priceCad: number };
  /** Salt, pepper, oil, spices, water: listed under Pantry as "check you have", not as a buy. */
  staple?: boolean;
  /** A simpler/convenience swap used by "Make this easier": raw chicken → precooked chicken. */
  shortcut?: string; // ingredient key
}

export type IngredientKind = "meat" | "poultry" | "beef" | "pork" | "fish" | "shellfish" | "dairy" | "egg" | "plant" | "grain" | "alcohol";

export type Unit = "g" | "ml" | "piece" | "slice" | "tbsp" | "tsp" | "cup" | "scoop" | "can" | "pouch";

/** An ingredient line in a recipe, for ONE serving. */
export interface RecipeIngredient {
  key: string; // IngredientInfo.key
  qty: number; // in `unit`, for one serving
  unit: Unit;
  /** Weight used for nutrition, derived from qty/unit via the ingredient DB (filled by `normalizeRecipe`). */
  grams?: number;
  optional?: boolean; // optional seasonings / toppings: not in nutrition unless included
  note?: string; // "cooked", "about 1 cup", "or any shredded cheese"
}

export interface RecipeStep {
  text: string; // short, plain words, no chef jargon
  timerSec?: number; // offered as a timer in cooking mode
  /** Food-safety note shown with the step: "Cook chicken to 74°C (165°F) inside." */
  safety?: string;
}

export type RecipeOrigin = "library" | "ai" | "simplified" | "custom";

export interface Recipe {
  /** "lib:<slug>" for library recipes, "usr:<uuid>" for user-owned (AI / simplified / custom). */
  key: string;
  name: string; // "Easy Spaghetti Bolognese" (≤ 60 chars)
  slots: Slot[];
  minutes: number; // total prep + cook
  difficulty: Difficulty;
  cost: 1 | 2 | 3; // $ / $$ / $$$ per serving at a normal Canadian grocery store
  servings: 1; // all quantities are per ONE serving; scaling multiplies
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  equipment: Equipment[];
  /** Taste/learning features: "cuisine:italian", "protein:beef", "base:pasta", "style:pasta", "dish:bolognese". */
  tags: string[];
  /** One-line description shown on cards: "Jarred sauce, lean beef, 20 minutes." */
  blurb: string;
  origin: RecipeOrigin;
  /** For "simplified"/"ai" recipes derived from another recipe. */
  baseKey?: string;
  /** Library recipes may declare their own hand-written easier version (a lib: key). */
  easierKey?: string;
  /**
   * Part of it is done ahead: overnight oats sit in the fridge overnight, eggs are boiled in a
   * batch. `minutes` is the time on the day; `label` is the card badge ("Make the night before");
   * `hours` is the lead time. The planner never puts it on today. Read it with `makeAheadOf()`.
   */
  makeAhead?: MakeAhead;
  /** Per ONE serving, computed by normalizeRecipe from the ingredient DB — never trusted from AI output. */
  nutrition?: Macros;
  allergens?: Allergen[]; // computed
  kinds?: IngredientKind[]; // computed
}

export interface MakeAhead {
  /** Badge text, short: "Make the night before", "Boil the eggs ahead". */
  label: string;
  /** Lead time in hours (overnight oats 8, boiled eggs 0.5). */
  hours: number;
}

/** Nutrition for a recipe at a given number of servings (estimates, labelled as such in the UI). */
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPrefs {
  difficulty: Difficulty; // default "super_easy"
  budget: Budget; // default "normal"
  weeklyBudgetCad: number | null; // optional grocery budget
  maxMinutes: number | null; // null = use the difficulty's range
  allergies: Allergen[]; // HARD
  diets: Diet[]; // HARD
  dislikedIngredients: string[]; // ingredient keys — HARD exclude
  likedIngredients: string[]; // ingredient keys — soft boost
  likedCuisines: string[]; // "italian", "mexican", … — soft boost
  dislikedCuisines: string[]; // soft penalty
  equipment: Equipment[]; // what the user has; recipes needing other equipment are excluded
  pantry: string[]; // ingredient keys the user already has ("use what I have")
  snacksPerDay: number; // 1–3, default 2
}

export const DEFAULT_PREFS: MealPrefs = {
  difficulty: "super_easy",
  budget: "normal",
  weeklyBudgetCad: null,
  maxMinutes: null,
  allergies: [],
  diets: [],
  dislikedIngredients: [],
  likedIngredients: [],
  likedCuisines: [],
  dislikedCuisines: [],
  equipment: ["stovetop", "oven", "microwave", "air_fryer", "toaster", "blender", "kettle"],
  pantry: [],
  snacksPerDay: 2,
};

/** Learning signals. Explicit feedback outweighs implicit behaviour (see docs/MEALS.md §4). */
export type FeedbackEvent =
  | "thumbs_up"
  | "thumbs_down"
  | "saved"
  | "unsaved"
  | "regenerated" // replaced by the user (mild implicit negative)
  | "kept" // a regenerated suggestion the user kept (mild positive)
  | "logged" // logged to the food diary = actually eaten
  | "cooked" // finished cooking mode
  | "repeated" // user chose "repeat this meal"
  | "made_easier"
  | "viewed";

export type FeedbackReason = "dont_like" | "too_complicated" | "too_long" | "too_expensive" | "ate_recently" | "dislike_ingredient";

export interface FeedbackRow {
  recipe_key: string;
  event: FeedbackEvent;
  reason: FeedbackReason | null;
  ingredient: string | null; // ingredient key for dislike_ingredient
  /** Snapshot of the recipe's features at the time, so learning works even if the recipe changes. */
  features: string[];
  created_at: string;
}

/** A planned meal as stored (planned_meals table). */
export interface PlannedMeal {
  id: string;
  plan_id: string;
  local_date: string; // YYYY-MM-DD
  slot: Slot;
  position: number; // order within the slot (snacks 0..n)
  recipe_key: string;
  servings: number;
  locked: boolean;
  /** Snapshot of "Why this meal?" reasons at selection time. */
  reason: WhyReason[] | null;
  /** Undo stack of previous picks for this slot: newest last. */
  history: { recipe_key: string; servings: number; reason: WhyReason[] | null }[];
}

/** One human-readable, data-backed reason a recipe was chosen. */
export interface WhyReason {
  kind: "liked_similar" | "liked_ingredient" | "liked_cuisine" | "favourite" | "difficulty_fit" | "macro_fit" | "budget_fit" | "new_for_you" | "pantry" | "repeat";
  text: string; // "You liked Cheeseburgers and Beef Tacos (beef)"
  weight: number; // contribution to the score, for ordering
}
