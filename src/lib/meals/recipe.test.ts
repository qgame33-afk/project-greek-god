import { describe, expect, it } from "vitest";
import { getLibraryRecipe, LIBRARY } from "./library";
import {
  applyShortcut,
  costBucket,
  effortBucket,
  formatQty,
  friendlyQty,
  ingredientCount,
  normalizeRecipe,
  recipeAllowed,
  recipeConflicts,
  recipeCostCad,
  recipeFeatures,
  recipeMacros,
  recipeMacrosExact,
  scaleIngredients,
  superEasyIssues,
  timeBucket,
  validateRecipe,
} from "./recipe";
import { DEFAULT_PREFS, type MealPrefs, type Recipe } from "./types";

const lib = (key: string) => {
  const r = getLibraryRecipe(key);
  if (!r) throw new Error(`missing ${key}`);
  return r;
};

/** A minimal valid recipe for validation tests. */
function draft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "usr:0b6f1c1e-1111-4a4a-9a9a-123456789abc",
    name: "Test Chicken Rice Bowl",
    slots: ["lunch"],
    minutes: 10,
    difficulty: "super_easy",
    ingredients: [
      { key: "chicken-breast-cooked", qty: 150, unit: "g" },
      { key: "rice-cooked-microwave", qty: 1, unit: "pouch" },
    ],
    steps: [{ text: "Microwave the rice." }, { text: "Top with the chicken.", timerSec: 60 }],
    equipment: ["microwave"],
    tags: ["cuisine:american", "protein:chicken"],
    blurb: "A test bowl.",
    origin: "ai",
    ...over,
  };
}

const prefs = (over: Partial<MealPrefs> = {}): MealPrefs => ({ ...DEFAULT_PREFS, ...over });

describe("nutrition (hand-checked against the ingredient database)", () => {
  it("Easy Spaghetti Bolognese, one serving", () => {
    // pasta 125 g (371 kcal/100 g) 463.75 · beef 90/10 150 g 264 · sauce 1 cup = 250 mL × 1.04 = 260 g 130
    // · parmesan 1 tbsp 5 g 21 · olive oil 1 tsp 4.5 g 39.78 · garlic powder ½ tsp 1.55 g 5.13 · salt 0
    const r = lib("lib:spaghetti-bolognese");
    expect(recipeMacros(r, 1)).toEqual({ kcal: 924, protein: 51.6, carbs: 116.3, fat: 26.7 });
    expect(r.nutrition).toEqual({ kcal: 924, protein: 51.6, carbs: 116.3, fat: 26.7 });
  });

  it("scales linearly with servings and rounds kcal to integers, grams to one decimal", () => {
    const r = lib("lib:spaghetti-bolognese");
    expect(recipeMacros(r, 2)).toEqual({ kcal: 1847, protein: 103.1, carbs: 232.5, fat: 53.4 });
    expect(recipeMacros(r, 0.5)).toEqual({ kcal: 462, protein: 25.8, carbs: 58.1, fat: 13.3 });
    expect(recipeMacros(r, 0)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(recipeMacros(r, Number.NaN).kcal).toBe(0);
  });

  it("exact macros scaled then rounded match the card for every serving step (no 1 kcal drift)", () => {
    for (const r of LIBRARY.slice(0, 40)) {
      for (const s of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
        expect(Math.round(recipeMacrosExact(r, s).kcal), `${r.key} × ${s}`).toBe(recipeMacros(r, s).kcal);
        expect(Math.round(recipeMacrosExact(r, 1).kcal * s), `${r.key} × ${s}`).toBe(recipeMacros(r, s).kcal);
      }
    }
  });

  it("Protein Shake with Milk: whey 31 g + 2% milk 1¼ cups (312.5 mL × 1.03)", () => {
    expect(recipeMacros(lib("lib:protein-shake"))).toEqual({ kcal: 281, protein: 34.6, carbs: 18.5, fat: 7.9 });
  });

  it("Scrambled Eggs and Toast: 4 eggs, milk, cheddar, 2 slices whole-wheat, butter", () => {
    // eggs 200 g 286 · milk 30.9 g 15.45 · cheddar ¼ cup 28.25 g 113.85 · bread 70 g 176.4 · butter 14 g 100.38 · pepper 0.29 g 0.72
    expect(recipeMacros(lib("lib:scrambled-eggs-toast")).kcal).toBe(693);
  });

  it("never trusts stored nutrition and leaves optional toppings out unless asked", () => {
    const r = lib("lib:greek-yogurt-granola-banana");
    const faked: Recipe = { ...r, nutrition: { kcal: 1, protein: 1, carbs: 1, fat: 1 } };
    expect(recipeMacros(faked)).toEqual(recipeMacros(r));
    const withHoney = recipeMacros(r, 1, { includeOptional: true });
    expect(withHoney.kcal - recipeMacros(r).kcal).toBe(64); // 1 tbsp honey = 21 g × 3.04
  });
});

describe("normalizeRecipe", () => {
  it("fills grams, nutrition, allergens, kinds and the cost bucket from the database", () => {
    const raw: Recipe = {
      key: "usr:test",
      name: "Eggs on Toast",
      slots: ["breakfast"],
      minutes: 8,
      difficulty: "super_easy",
      cost: 3,
      servings: 1,
      ingredients: [
        { key: "eggs", qty: 3, unit: "piece", grams: 999 },
        { key: "bread-white", qty: 2, unit: "slice" },
        { key: "butter", qty: 1, unit: "tsp" },
      ],
      steps: [{ text: "Fry the eggs." }, { text: "Toast the bread." }],
      equipment: ["stovetop", "toaster"],
      tags: [],
      blurb: "Test",
      origin: "custom",
      allergens: [],
      kinds: ["plant"],
    };
    const n = normalizeRecipe(raw);
    expect(n.ingredients.map((l) => l.grams)).toEqual([150, 64, 4.7]);
    expect(n.allergens).toEqual(["dairy", "egg", "gluten"]);
    expect(n.kinds).toEqual(["dairy", "egg", "plant", "grain"]);
    expect(n.nutrition!.kcal).toBe(Math.round(1.5 * 143 + 0.64 * 266 + 0.047 * 717));
    expect(n.cost).toBe(1); // about $1.10 of eggs and bread
    expect(raw.ingredients[0].grams).toBe(999); // input untouched
  });

  it("relabels a 'Super Easy' recipe that breaks the rules as Everyday", () => {
    const r = lib("lib:spaghetti-bolognese"); // 20 minutes
    expect(normalizeRecipe({ ...r, difficulty: "super_easy" }).difficulty).toBe("everyday");
    expect(normalizeRecipe({ ...r, difficulty: "i_like_cooking" }).difficulty).toBe("i_like_cooking");
  });

  it("prices recipes per serving into $, $$ and $$$", () => {
    expect(costBucket(2)).toBe(1);
    expect(costBucket(5)).toBe(2);
    expect(costBucket(9)).toBe(3);
    expect(lib("lib:steak-potatoes").cost).toBe(3);
    expect(lib("lib:pb-toast").cost).toBe(1);
    expect(recipeCostCad(lib("lib:pb-toast"))).toBeLessThan(1);
    expect(recipeCostCad(lib("lib:spaghetti-bolognese"), 2)).toBeCloseTo(recipeCostCad(lib("lib:spaghetti-bolognese")) * 2, 1);
  });
});

describe("friendly quantities", () => {
  it("formats the spec's examples", () => {
    expect(formatQty(200, "g")).toBe("200 g");
    expect(formatQty(1.5, "cup")).toBe("1½ cups");
    expect(formatQty(2, "piece", "eggs")).toBe("2 eggs");
    expect(formatQty(3, "slice", "bread-white")).toBe("3 slices");
  });

  it("uses fractions, plurals and ingredient nouns", () => {
    expect(formatQty(0.75, "cup")).toBe("¾ cup");
    expect(formatQty(1, "cup")).toBe("1 cup");
    expect(formatQty(0.33, "cup")).toBe("⅓ cup");
    expect(formatQty(0.5, "tsp")).toBe("½ tsp");
    expect(formatQty(0.125, "tsp")).toBe("⅛ tsp");
    expect(formatQty(1, "piece", "eggs")).toBe("1 egg");
    expect(formatQty(1, "scoop", "whey-protein")).toBe("1 scoop");
    expect(formatQty(1.5, "can", "tuna-canned")).toBe("1½ cans");
    expect(formatQty(0.5, "pouch", "taco-seasoning")).toBe("½ packet");
    expect(formatQty(2, "piece", "garlic")).toBe("2 garlic cloves");
    expect(formatQty(1, "slice")).toBe("1 slice");
    expect(formatQty(250, "ml")).toBe("250 mL");
  });

  it("rounds to measurable amounts and moves up to bigger measures", () => {
    expect(formatQty(203, "g")).toBe("205 g");
    expect(formatQty(12.4, "g")).toBe("12 g");
    expect(formatQty(1250, "g")).toBe("1.25 kg");
    expect(formatQty(1500, "ml")).toBe("1.5 L");
    expect(formatQty(4.5, "tsp")).toBe("1½ tbsp");
    expect(formatQty(2.9, "tsp")).toBe("1 tbsp");
    expect(formatQty(6, "tbsp")).toBe("⅓ cup");
    expect(formatQty(8, "tbsp")).toBe("½ cup");
    expect(formatQty(1.5, "piece", "eggs")).toBe("2 eggs"); // eggs don't split
    expect(formatQty(0.3, "piece", "eggs")).toBe("1 egg"); // never rounds to zero
    expect(formatQty(1.25, "piece", "banana")).toBe("1½ bananas");
    expect(formatQty(0.25, "piece", "bell-pepper")).toBe("¼ bell pepper");
    expect(formatQty(0.1, "piece", "lime")).toBe("¼ lime");
    expect(formatQty(0.9, "piece", "avocado")).toBe("1 avocado");
    expect(formatQty(7.4, "piece", "frozen-meatballs")).toBe("7 meatballs");
    expect(friendlyQty(0, "g")).toEqual({ qty: 0, unit: "g" });
  });

  it("scales a recipe's ingredients for 2 servings with readable lines", () => {
    const lines = scaleIngredients(lib("lib:spaghetti-bolognese"), 2);
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by["pasta-dry"].text).toBe("250 g dry pasta");
    expect(by["pasta-dry"].grams).toBe(250);
    expect(by["ground-beef-lean"].text).toBe("300 g extra-lean ground beef");
    expect(by["pasta-sauce-jarred"].amount).toBe("2 cups");
    expect(by["parmesan"].amount).toBe("2 tbsp");
    expect(by["olive-oil"]).toMatchObject({ amount: "2 tsp", staple: true });
    expect(by["salt"].note).toBe("for the pasta water");
  });

  it("scales count items with their own noun", () => {
    const lines = scaleIngredients(lib("lib:scrambled-eggs-toast"), 1.5);
    expect(lines.find((l) => l.key === "eggs")!.text).toBe("6 eggs");
    expect(lines.find((l) => l.key === "bread-whole-wheat")!.text).toBe("3 slices whole-wheat bread");
    expect(lines.find((l) => l.key === "eggs")!.grams).toBe(300);
    const shake = scaleIngredients(lib("lib:protein-shake"), 2);
    expect(shake.map((l) => l.text)).toEqual(["2 scoops whey protein powder", "2½ cups 2% milk"]);
  });
});

describe("learning features", () => {
  it("includes tags, core ingredients and time/effort/cost buckets", () => {
    const r = lib("lib:spaghetti-bolognese");
    const f = recipeFeatures(r);
    for (const t of r.tags) expect(f).toContain(t);
    expect(f).toEqual(expect.arrayContaining(["ing:pasta-dry", "ing:ground-beef-lean", "ing:pasta-sauce-jarred", "ing:parmesan"]));
    expect(f).not.toContain("ing:salt");
    expect(f).not.toContain("ing:olive-oil");
    expect(f).toEqual(expect.arrayContaining(["time:medium", "effort:few", `cost:${r.cost}`]));
    expect(new Set(f).size).toBe(f.length);
  });

  it("skips optional toppings and buckets time and effort", () => {
    const f = recipeFeatures(lib("lib:beef-tacos"));
    expect(f).not.toContain("ing:sour-cream");
    expect(f).toContain("time:quick");
    expect(f).toContain("effort:some"); // 6 core ingredients
    expect(timeBucket(15)).toBe("quick");
    expect(timeBucket(16)).toBe("medium");
    expect(timeBucket(30)).toBe("medium");
    expect(timeBucket(31)).toBe("long");
    expect(effortBucket(5)).toBe("few");
    expect(effortBucket(8)).toBe("some");
    expect(effortBucket(9)).toBe("many");
  });

  it("counts effort without staples or optional lines", () => {
    expect(ingredientCount(lib("lib:spaghetti-bolognese"))).toBe(4);
    expect(superEasyIssues(lib("lib:spaghetti-bolognese"))).toEqual(["20 min (max 15)"]);
    expect(superEasyIssues(lib("lib:beef-tacos"))).toEqual([]);
  });
});

describe("Make this easier swaps", () => {
  it("raw chicken → cooked strips at the cooked weight", () => {
    expect(applyShortcut({ key: "chicken-breast-raw", qty: 225, unit: "g" })).toEqual({
      key: "chicken-breast-cooked",
      qty: 170,
      unit: "g",
      note: "instead of boneless skinless chicken breast",
    });
  });

  it("dry rice → a microwave pouch, onion → onion powder, garlic → garlic powder", () => {
    expect(applyShortcut({ key: "rice-dry", qty: 85, unit: "g" })).toMatchObject({ key: "rice-cooked-microwave", qty: 1, unit: "pouch" });
    expect(applyShortcut({ key: "onion", qty: 1, unit: "piece" })).toMatchObject({ key: "onion-powder", qty: 1, unit: "tbsp" });
    expect(applyShortcut({ key: "garlic", qty: 2, unit: "piece" })).toMatchObject({ key: "garlic-powder", qty: 0.25, unit: "tsp" });
    expect(applyShortcut({ key: "potatoes", qty: 1, unit: "piece", optional: true })).toMatchObject({ key: "fries-frozen", optional: true });
    expect(applyShortcut({ key: "eggs", qty: 2, unit: "piece" })).toBeNull();
    expect(applyShortcut({ key: "broccoli", qty: 1.5, unit: "cup" })).toMatchObject({ key: "frozen-broccoli", qty: 1.5, unit: "cup" });
    expect(applyShortcut({ key: "cream", qty: 0.25, unit: "cup" })).toMatchObject({ key: "alfredo-sauce-jarred", qty: 0.333, unit: "cup" });
    expect(applyShortcut({ key: "bell-pepper", qty: 1, unit: "piece" })).toMatchObject({ key: "frozen-peppers-onions", qty: 1, unit: "cup" });
    expect(applyShortcut({ key: "chicken-thigh-raw", qty: 2, unit: "piece" })).toMatchObject({ key: "rotisserie-chicken", qty: 160, unit: "g" });
  });
});

describe("validateRecipe", () => {
  it("accepts a good recipe and returns it normalised (nutrition recomputed)", () => {
    const v = validateRecipe(draft({ nutrition: { kcal: 5, protein: 999, carbs: 0, fat: 0 } }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.recipe.nutrition!.kcal).toBe(Math.round(150 * 1.65 + 250 * 1.55));
    expect(v.recipe.nutrition!.protein).toBeLessThan(60);
    expect(v.recipe.servings).toBe(1);
    expect(v.recipe.cost).toBeGreaterThanOrEqual(1);
    expect(v.recipe.ingredients[1].grams).toBe(250);
  });

  it("validates every library recipe", () => {
    const v = validateRecipe(lib("lib:chicken-alfredo"));
    expect(v.ok).toBe(true);
  });

  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["unknown ingredient key", { ingredients: [{ key: "chiken-breast", qty: 150, unit: "g" }] }, /Unknown ingredient "chiken-breast"/],
    ["unknown property", { secret: true }, /unrecognized|Unrecognized/],
    ["unknown property on a line", { ingredients: [{ key: "eggs", qty: 2, unit: "piece", kcal: 5 }] }, /ingredients\.0/],
    ["missing steps", { steps: [] }, /steps/],
    ["steps omitted", { steps: undefined }, /steps/],
    ["zero quantity", { ingredients: [{ key: "eggs", qty: 0, unit: "piece" }] }, /ingredients\.0\.qty/],
    ["negative quantity", { ingredients: [{ key: "eggs", qty: -2, unit: "piece" }] }, /ingredients\.0\.qty/],
    ["string quantity", { ingredients: [{ key: "eggs", qty: "2", unit: "piece" }] }, /ingredients\.0\.qty/],
    ["NaN quantity", { ingredients: [{ key: "eggs", qty: Number.NaN, unit: "piece" }] }, /ingredients\.0\.qty/],
    ["unit that can't be converted", { ingredients: [{ key: "chicken-breast-raw", qty: 2, unit: "cup" }] }, /Can't measure/],
    ["absurd weight", { ingredients: [{ key: "chicken-breast-raw", qty: 3000, unit: "g" }] }, /not realistic/],
    ["absurd count", { ingredients: [{ key: "eggs", qty: 30, unit: "piece" }] }, /not realistic/],
    ["too many calories", { ingredients: [{ key: "peanut-butter", qty: 30, unit: "tbsp" }] }, /kcal per serving/],
    ["duplicate line", { ingredients: [{ key: "eggs", qty: 2, unit: "piece" }, { key: "eggs", qty: 1, unit: "piece" }] }, /listed twice/],
    ["bad key", { key: "chicken bowl" }, /key/],
    ["bad tag", { tags: ["Spicy!"] }, /tags/],
    ["unknown unit", { ingredients: [{ key: "eggs", qty: 2, unit: "dozen" }] }, /unit/],
    ["empty step", { steps: [{ text: "" }] }, /steps\.0\.text/],
    ["bad slot", { slots: ["brunch"] }, /slots/],
    ["no ingredients", { ingredients: [] }, /ingredients/],
    ["bad timer", { steps: [{ text: "Wait.", timerSec: -5 }] }, /timerSec/],
    ["AI recipe posing as the library", { key: "lib:spaghetti-bolognese" }, /can't use the key/],
    ["library origin on a user key", { origin: "library" }, /can't use the key/],
  ];
  for (const [label, over, msg] of bad) {
    it(`rejects: ${label}`, () => {
      const v = validateRecipe(draft(over));
      expect(v.ok).toBe(false);
      if (v.ok) return;
      expect(v.errors.join("\n")).toMatch(msg);
    });
  }

  it("rejects non-objects", () => {
    expect(validateRecipe(null).ok).toBe(false);
    expect(validateRecipe("recipe").ok).toBe(false);
    expect(validateRecipe([]).ok).toBe(false);
  });
});

describe("hard constraints", () => {
  it("allergies exclude any recipe with the allergen, optional toppings included", () => {
    expect(recipeAllowed(lib("lib:pb-banana-oatmeal"), prefs({ allergies: ["peanut"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:pb-banana-oatmeal"), prefs({ allergies: ["fish"] }))).toBe(true);
    expect(recipeAllowed(lib("lib:scrambled-eggs-toast"), prefs({ allergies: ["egg"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:greek-yogurt-granola-banana"), prefs({ allergies: ["tree_nut"] }))).toBe(false); // granola
    expect(recipeAllowed(lib("lib:chicken-caesar-wraps"), prefs({ allergies: ["fish"] }))).toBe(false); // anchovy in Caesar
    expect(recipeAllowed(lib("lib:garlic-butter-shrimp-rice"), prefs({ allergies: ["shellfish"] }))).toBe(false);
    // Sesame seeds are only an optional garnish here, but an allergy is never a gamble.
    expect(recipeAllowed(lib("lib:teriyaki-chicken-rice-bowl"), prefs({ allergies: ["sesame"] }))).toBe(false);
    expect(recipeConflicts(lib("lib:teriyaki-chicken-rice-bowl"), prefs({ allergies: ["sesame"] }))).toEqual([
      { kind: "allergy", value: "sesame", ingredient: "sesame-seeds" },
    ]);
  });

  it("vegetarian, pescatarian, no pork, no beef and halal", () => {
    const bolognese = lib("lib:spaghetti-bolognese");
    const beans = lib("lib:bean-cheese-quesadillas");
    const tuna = lib("lib:tuna-melts");
    const ham = lib("lib:ham-cheese-sandwiches");
    expect(recipeAllowed(bolognese, prefs({ diets: ["vegetarian"] }))).toBe(false);
    expect(recipeAllowed(beans, prefs({ diets: ["vegetarian"] }))).toBe(true);
    expect(recipeAllowed(tuna, prefs({ diets: ["vegetarian"] }))).toBe(false);
    expect(recipeAllowed(tuna, prefs({ diets: ["pescatarian"] }))).toBe(true);
    expect(recipeAllowed(lib("lib:chicken-caesar-wraps"), prefs({ diets: ["pescatarian"] }))).toBe(false);
    expect(recipeAllowed(ham, prefs({ diets: ["no_pork"] }))).toBe(false);
    expect(recipeAllowed(ham, prefs({ diets: ["halal"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:tortilla-pizzas"), prefs({ diets: ["halal"] }))).toBe(false); // pepperoni
    expect(recipeAllowed(lib("lib:beef-tacos"), prefs({ diets: ["halal"] }))).toBe(true);
    expect(recipeAllowed(lib("lib:beef-tacos"), prefs({ diets: ["no_beef"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:meatball-sub"), prefs({ diets: ["no_pork"] }))).toBe(false); // beef-and-pork meatballs
  });

  it("dairy-free, lactose-free and gluten-free", () => {
    expect(recipeAllowed(lib("lib:scrambled-eggs-toast"), prefs({ diets: ["dairy_free"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:avocado-egg-toast"), prefs({ diets: ["dairy_free"] }))).toBe(true);
    expect(recipeAllowed(lib("lib:avocado-egg-toast"), prefs({ diets: ["gluten_free"] }))).toBe(false);
    expect(recipeAllowed(lib("lib:steak-eggs-hash-browns"), prefs({ diets: ["gluten_free", "dairy_free"] }))).toBe(true);
    const lf: Recipe = {
      ...lib("lib:protein-shake"),
      ingredients: [{ key: "milk-lactose-free", qty: 1, unit: "cup" }],
    };
    expect(recipeAllowed(lf, prefs({ diets: ["lactose_free"] }))).toBe(true);
    expect(recipeAllowed(lf, prefs({ diets: ["dairy_free"] }))).toBe(false); // still milk
    expect(recipeAllowed(lib("lib:protein-shake"), prefs({ diets: ["lactose_free"] }))).toBe(false);
  });

  it("disliked ingredients are hard, and cover other forms of the same food", () => {
    expect(recipeAllowed(lib("lib:chicken-alfredo"), prefs({ dislikedIngredients: ["broccoli"] }))).toBe(false); // frozen broccoli
    expect(recipeAllowed(lib("lib:upgraded-ramen"), prefs({ dislikedIngredients: ["broccoli"] }))).toBe(false); // stir-fry mix
    expect(recipeAllowed(lib("lib:spaghetti-bolognese"), prefs({ dislikedIngredients: ["broccoli"] }))).toBe(true);
    expect(recipeAllowed(lib("lib:easy-chicken-fajitas"), prefs({ dislikedIngredients: ["onion"] }))).toBe(false);
    expect(recipeConflicts(lib("lib:beef-tacos"), prefs({ dislikedIngredients: ["sour-cream"] }))).toEqual([
      { kind: "disliked", value: "sour-cream", ingredient: "sour-cream" },
    ]);
  });

  it("missing equipment excludes a recipe", () => {
    const noAirFryer = prefs({ equipment: ["stovetop", "oven", "microwave", "toaster", "blender", "kettle"] });
    expect(recipeAllowed(lib("lib:air-fryer-chicken-fries"), noAirFryer)).toBe(false);
    expect(recipeAllowed(lib("lib:spaghetti-bolognese"), noAirFryer)).toBe(true);
    expect(recipeConflicts(lib("lib:berry-protein-smoothie"), prefs({ equipment: [] }))).toEqual([{ kind: "equipment", value: "blender" }]);
    expect(recipeAllowed(lib("lib:greek-yogurt-granola-banana"), prefs({ equipment: [] }))).toBe(true); // no equipment needed
  });

  it("tolerates prefs rows with missing lists", () => {
    const partial = { allergies: undefined, diets: undefined, dislikedIngredients: undefined, equipment: undefined } as unknown as MealPrefs;
    expect(recipeConflicts(lib("lib:pb-toast"), partial)).toEqual([{ kind: "equipment", value: "toaster" }]);
    expect(recipeMacros({ ...lib("lib:pb-toast"), ingredients: null } as unknown as Recipe)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("an unknown ingredient can't be checked, so it is never allowed", () => {
    const r: Recipe = { ...lib("lib:pb-toast"), ingredients: [{ key: "mystery-sauce", qty: 1, unit: "tbsp" }] };
    expect(recipeAllowed(r, prefs())).toBe(false);
  });

  it("combines constraints", () => {
    const p = prefs({ allergies: ["peanut"], diets: ["halal"], dislikedIngredients: ["mushrooms"] });
    expect(recipeConflicts(lib("lib:pb-toast"), p).map((c) => c.kind)).toEqual(["allergy"]);
    expect(recipeAllowed(lib("lib:beef-tacos"), p)).toBe(true);
  });
});
