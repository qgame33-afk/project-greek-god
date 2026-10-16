import { describe, expect, it } from "vitest";
import { getLibraryRecipe } from "./library";
import { SAFE } from "./library/define";
import {
  acceptAIRecipe,
  acceptAISimplified,
  aiCatalog,
  AIRecipesRequest,
  AISimplifyRequest,
  MOCK_RECIPES,
  mockSimplify,
  RECIPES_SYSTEM,
  recipesResponseSchema,
  recipesUserText,
  simplifyChanges,
  simplifyResponseSchema,
  takenNames,
} from "./ai";
import { ingredientCount, recipeConflicts, recipeMacros } from "./recipe";
import { DEFAULT_PREFS, SLOTS, type MealPrefs } from "./types";

const ID = "4f8a2c1e-9b7d-4e3f-a1c2-0d9e8f7a6b5c";
const everyday: MealPrefs = { ...DEFAULT_PREFS, difficulty: "everyday" };

const good = () => ({
  name: "Beef and Bean Burrito Skillet",
  blurb: "Lean beef, beans, salsa and rice in one pan, 20 minutes.",
  slots: ["dinner"],
  minutes: 20,
  difficulty: "everyday",
  ingredients: [
    { key: "ground-beef-lean", qty: 170, unit: "g" },
    { key: "black-beans", qty: 0.5, unit: "can" },
    { key: "salsa", qty: 0.5, unit: "cup" },
    { key: "rice-cooked-microwave", qty: 1, unit: "pouch" },
    { key: "cheddar", qty: 0.33, unit: "cup" },
  ],
  steps: [
    { text: "Brown the beef in a large pan over medium-high 6–8 minutes, breaking it up.", timer_seconds: 420 },
    { text: "Stir in the beans and salsa and simmer 3 minutes.", timer_seconds: 180 },
    { text: "Microwave the rice 90 seconds, stir it in and top with cheddar.", timer_seconds: 90 },
  ],
  equipment: ["stovetop", "microwave"],
  tags: ["cuisine:mexican", "protein:beef", "base:rice", "style:skillet", "dish:burrito-skillet"],
});

describe("request validation", () => {
  it("accepts a well-formed request and fills defaults", () => {
    const r = AIRecipesRequest.parse({ slot: "dinner", localDate: "2026-10-16" });
    expect(r).toMatchObject({ slot: "dinner", count: 3, exclude: [] });
    expect(AIRecipesRequest.safeParse({ slot: "brunch", localDate: "2026-10-16" }).success).toBe(false);
    expect(AIRecipesRequest.safeParse({ slot: "dinner", localDate: "2026-10-16", count: 9 }).success).toBe(false);
    expect(AISimplifyRequest.safeParse({ recipe: {}, localDate: "nope" }).success).toBe(false);
  });
});

describe("catalog, schema and prompt", () => {
  it("leaves out ingredients the user can't have, and the schema enumerates only catalog keys", () => {
    const prefs: MealPrefs = { ...DEFAULT_PREFS, allergies: ["peanut", "shellfish"], dislikedIngredients: ["onion"] };
    const keys = aiCatalog(prefs).map((c) => c.key);
    expect(keys).not.toContain("peanut-butter");
    expect(keys).not.toContain("shrimp-cooked");
    expect(keys).not.toContain("onion");
    expect(keys).not.toContain("frozen-peppers-onions"); // contains onion
    expect(keys).not.toContain("water");
    expect(keys).toContain("chicken-breast-raw");
    const schema = recipesResponseSchema(keys) as { properties: { recipes: { items: { properties: { ingredients: { items: { properties: { key: { enum: string[] } } } } } } } } };
    expect(schema.properties.recipes.items.properties.ingredients.items.properties.key.enum).toEqual(keys);
    expect(JSON.stringify(simplifyResponseSchema(keys))).toContain('"unchanged"');
  });

  it("states the rules and the user's hard constraints in the prompt", () => {
    const prefs: MealPrefs = { ...DEFAULT_PREFS, allergies: ["dairy"], diets: ["halal"], dislikedIngredients: ["tuna-canned"] };
    const text = recipesUserText({ slot: "lunch", count: 2, targets: { kcal: 990, protein: 55 }, summary: { liked: ["Burgers"], disliked: ["Fish"], simpler: true } }, prefs, aiCatalog(prefs), ["Tuna Melts"]);
    expect(text).toContain("Write 2 different lunch recipes");
    expect(text).toContain("about 990 kcal and 55 g protein");
    expect(text).toContain("ALLERGIES (never include): dairy");
    expect(text).toContain("DIETS (must follow): halal");
    expect(text).toContain("Never use: Flaked light tuna in water");
    expect(text).toContain("Has enjoyed: Burgers");
    expect(text).toContain("simpler meals");
    expect(text).toContain("Do not repeat these existing recipes: Tuna Melts");
    expect(text).toMatch(/chicken-breast-raw \| Boneless skinless chicken breasts \| units: g, piece \(225 g\)/);
    expect(RECIPES_SYSTEM).toContain("Use ONLY ingredient keys from the CATALOG");
    expect(RECIPES_SYSTEM).toContain("Do not give nutrition numbers");
  });
});

describe("acceptAIRecipe", () => {
  it("accepts a good recipe, recomputes nutrition and attaches the vetted safety note", () => {
    const raw = { ...good(), nutrition: { kcal: 1, protein: 999, carbs: 0, fat: 0 } };
    const res = acceptAIRecipe(raw, { prefs: everyday, slot: "dinner", id: ID, origin: "ai" });
    if (!res.ok) throw new Error(res.errors.join("; "));
    expect(res.recipe.key).toBe(`usr:${ID}`);
    expect(res.recipe.origin).toBe("ai");
    expect(res.recipe.nutrition).toEqual(recipeMacros(res.recipe, 1));
    expect(res.recipe.nutrition!.protein).toBeLessThan(100);
    expect(res.recipe.steps[0].safety).toBe(SAFE.groundBeef);
    expect(res.recipe.steps[0].timerSec).toBe(420);
    expect(res.recipe.difficulty).toBe("everyday");
  });

  it("rejects unknown ingredient keys (the model must use the catalog)", () => {
    const raw = good();
    raw.ingredients.push({ key: "unicorn-meat", qty: 100, unit: "g" });
    const res = acceptAIRecipe(raw, { prefs: everyday, id: ID, origin: "ai" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/Unknown ingredient "unicorn-meat"/);
  });

  it("enforces allergies, diets and dislikes", () => {
    for (const prefs of [
      { ...everyday, allergies: ["dairy" as const] },
      { ...everyday, diets: ["no_beef" as const] },
      { ...everyday, dislikedIngredients: ["salsa"] },
      { ...everyday, equipment: ["microwave" as const] },
    ]) {
      const res = acceptAIRecipe(good(), { prefs, id: ID, origin: "ai" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toMatch(/breaks your/);
    }
  });

  it("enforces the user's cooking level and time cap", () => {
    const res = acceptAIRecipe(good(), { prefs: DEFAULT_PREFS, id: ID, origin: "ai" }); // Super Easy: 15 min max
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/20 min is longer than your 15-minute limit/);
    const capped = acceptAIRecipe(good(), { prefs: { ...everyday, maxMinutes: 10 }, id: ID, origin: "ai" });
    expect(capped.ok).toBe(false);
  });

  it("labels difficulty from the facts, not the model", () => {
    const raw = { ...good(), minutes: 12, difficulty: "i_like_cooking" };
    const res = acceptAIRecipe(raw, { prefs: everyday, id: ID, origin: "ai" });
    if (!res.ok) throw new Error(res.errors.join("; "));
    expect(res.recipe.difficulty).toBe("super_easy");
  });

  it("rejects raw meat that no step cooks, unsafe temperatures, links and duplicates", () => {
    const uncooked = { ...good(), steps: [{ text: "Mix everything in a bowl and serve.", timer_seconds: 0 }] };
    const a = acceptAIRecipe(uncooked, { prefs: everyday, id: ID, origin: "ai" });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors.join(" ")).toMatch(/No step cooks the extra-lean ground beef/);

    const unsafe = good();
    unsafe.steps[0].text = "Brown the beef until it reaches 60°C inside, about 4 minutes.";
    const b = acceptAIRecipe(unsafe, { prefs: everyday, id: ID, origin: "ai" });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors.join(" ")).toMatch(/unsafe temperature \(60°C\)/);

    const link = { ...good(), blurb: "See https://example.com" };
    expect(acceptAIRecipe(link, { prefs: everyday, id: ID, origin: "ai" }).ok).toBe(false);

    const dup = { ...good(), name: "Easy Spaghetti Bolognese" };
    const c = acceptAIRecipe(dup, { prefs: everyday, id: ID, origin: "ai", takenNames: takenNames([]) });
    expect(c.ok).toBe(false);
  });

  it("rejects implausible nutrition for the slot (computed, not claimed)", () => {
    const tiny = { ...good(), ingredients: [{ key: "salsa", qty: 2, unit: "tbsp" }], steps: [{ text: "Eat the salsa.", timer_seconds: 0 }] };
    const res = acceptAIRecipe(tiny, { prefs: everyday, id: ID, origin: "ai" });
    expect(res.ok).toBe(false);
  });

  it("cleans names and text (no emojis or exclamation marks)", () => {
    const raw = { ...good(), name: "Burrito Skillet!!! 🔥", blurb: "So good!" };
    const res = acceptAIRecipe(raw, { prefs: everyday, id: ID, origin: "ai" });
    if (!res.ok) throw new Error(res.errors.join("; "));
    expect(res.recipe.name).toBe("Burrito Skillet");
    expect(res.recipe.blurb).toBe("So good.");
  });
});

describe("acceptAISimplified", () => {
  const original = getLibraryRecipe("lib:chicken-alfredo")!;

  it("accepts a genuinely easier version of the same meal, named as easier", () => {
    const raw = {
      name: original.name,
      blurb: "Jarred alfredo with ready-cooked chicken.",
      slots: ["dinner"],
      minutes: 14,
      difficulty: "super_easy",
      ingredients: [
        { key: "pasta-dry", qty: 120, unit: "g" },
        { key: "chicken-breast-cooked", qty: 130, unit: "g" },
        { key: "alfredo-sauce-jarred", qty: 0.5, unit: "cup" },
        { key: "frozen-broccoli", qty: 1, unit: "cup" },
        { key: "salt", qty: 0.5, unit: "tsp" },
      ],
      steps: [
        { text: "Cook the pasta in salted boiling water 9–11 minutes, adding the broccoli for the last 3 minutes, then drain.", timer_seconds: 600 },
        { text: "Stir in the alfredo sauce and chicken and warm 2 minutes until steaming hot.", timer_seconds: 120 },
      ],
      equipment: ["stovetop"],
      tags: original.tags,
    };
    const res = acceptAISimplified(raw, original, { prefs: everyday, id: ID });
    if (!res.ok) throw new Error(res.errors.join("; "));
    expect(res.recipe.name).toBe("Easier Chicken Alfredo with Jarred Sauce");
    expect(res.recipe.origin).toBe("simplified");
    expect(res.recipe.baseKey).toBe(original.key);
    expect(ingredientCount(res.recipe)).toBeLessThan(ingredientCount(original));
    expect(recipeConflicts(res.recipe, everyday)).toEqual([]);
    const changes = simplifyChanges(["Ready-cooked chicken!!", "https://x.y"], original, res.recipe);
    expect(changes[0]).toBe("Ready-cooked chicken.");
    expect(changes.join(" ")).not.toContain("http");
    expect(changes.at(-1)).toMatch(/^Nutrition (recalculated|about the same): .* \(estimate\)$/);
  });

  it("rejects a 'simpler' version that is longer, a different meal, or unchanged", () => {
    const longer = { ...good(), minutes: 25 };
    expect(acceptAISimplified(longer, original, { prefs: everyday, id: ID }).ok).toBe(false);
    const same = {
      name: original.name,
      blurb: original.blurb,
      slots: original.slots,
      minutes: original.minutes,
      difficulty: original.difficulty,
      ingredients: original.ingredients.map(({ grams: _g, ...l }) => l),
      steps: original.steps.map((s) => ({ text: s.text, timer_seconds: s.timerSec ?? 0 })),
      equipment: original.equipment,
      tags: original.tags,
    };
    const res = acceptAISimplified(same, original, { prefs: everyday, id: ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContain("Nothing got easier.");
  });
});

describe("dev fixtures (AI_MOCK=1)", () => {
  it("every mock recipe passes the real acceptance checks", () => {
    for (const slot of SLOTS) {
      expect(MOCK_RECIPES[slot].length).toBeGreaterThanOrEqual(3);
      for (const raw of MOCK_RECIPES[slot]) {
        const res = acceptAIRecipe(raw, { prefs: everyday, slot, id: ID, origin: "ai", takenNames: takenNames([]) });
        expect(res.ok ? [] : res.errors, `${slot}: ${raw.name}`).toEqual([]);
      }
    }
  });

  it("mock simplify yields an acceptable easier version or an honest 'unchanged'", () => {
    const shake = mockSimplify(getLibraryRecipe("lib:protein-shake")!);
    expect(shake.unchanged).toBe(true);
    const original = getLibraryRecipe("lib:homemade-chicken-alfredo")!;
    const m = mockSimplify(original);
    expect(m.unchanged).toBe(false);
    // an easier version only has to beat the original, not the user's Super Easy level
    const res = acceptAISimplified(m.recipe, original, { prefs: DEFAULT_PREFS, id: ID });
    if (!res.ok) throw new Error(res.errors.join("; "));
    expect(res.recipe.steps.length).toBeLessThan(original.steps.length);
  });
});
