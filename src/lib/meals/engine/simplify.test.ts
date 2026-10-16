import { describe, expect, it } from "vitest";
import { getLibraryRecipe, LIBRARY } from "../library";
import { SAFE } from "../library/define";
import { ingredientCount, recipeAllowed, recipeMacros, validateRecipe } from "../recipe";
import { DEFAULT_PREFS, type Recipe } from "../types";
import { mergeSteps, simplifyRecipe } from "./simplify";

const R = (k: string) => getLibraryRecipe(k)!;
const keys = (r: Recipe) => r.ingredients.map((l) => l.key);

function simplified(r: Recipe, prefs = DEFAULT_PREFS) {
  const res = simplifyRecipe(r, { prefs });
  if (!res.ok) throw new Error(`${r.key}: ${res.reason}`);
  return res;
}

/** The invariants every simplified recipe must keep. */
function expectSound(before: Recipe, after: Recipe) {
  const v = validateRecipe({ ...after, nutrition: undefined, allergens: undefined, kinds: undefined, cost: undefined });
  expect(v.ok ? [] : v.errors, before.key).toEqual([]);
  expect(after.origin).toBe("simplified");
  expect(after.baseKey).toBe(before.key);
  expect(after.key).toMatch(/^usr:/);
  expect(after.minutes).toBeLessThanOrEqual(before.minutes);
  expect(ingredientCount(after)).toBeLessThanOrEqual(ingredientCount(before));
  expect(after.steps.length).toBeLessThanOrEqual(before.steps.length);
  // nutrition is recomputed from the database, never carried over
  expect(after.nutrition).toEqual(recipeMacros(after, 1));
  for (const s of after.steps) {
    expect(s.text).toMatch(/^[A-Z].*[.!?]$/);
    expect(s.text).not.toMatch(/\s{2}|\s[,.]/);
  }
}

describe("easier version first", () => {
  it("uses the recipe's own hand-written easier version", () => {
    const res = simplified(R("lib:homemade-bolognese"));
    expect(res.kind).toBe("easier_version");
    expect(res.recipe.key).toBe("lib:spaghetti-bolognese");
    expect(res.changes[0]).toBe("Swapped for Easy Spaghetti Bolognese, the Everyday version");
    expect(res.changes).toContain("About 20 min instead of 45");
  });

  it("skips an easier version that breaks the user's constraints and simplifies the recipe itself", () => {
    const prefs = { ...DEFAULT_PREFS, dislikedIngredients: ["pasta-sauce-jarred"] };
    const before = R("lib:homemade-bolognese");
    const res = simplified(before, prefs);
    expect(res.kind).toBe("simplified");
    expect(keys(res.recipe)).not.toContain("pasta-sauce-jarred");
    expect(keys(res.recipe)).toEqual(expect.arrayContaining(["onion-powder", "garlic-powder"]));
    expect(keys(res.recipe)).not.toContain("onion");
    expect(recipeAllowed(res.recipe, prefs)).toBe(true);
    expectSound(before, res.recipe);
  });
});

describe("shortcut swaps", () => {
  it("raw chicken thighs → rotisserie chicken: no raw meat, fewer minutes and steps", () => {
    const before = R("lib:teriyaki-chicken-rice-bowl");
    const { recipe, changes, kind } = simplified(before);
    expect(kind).toBe("simplified");
    expect(keys(recipe)).toContain("rotisserie-chicken");
    expect(keys(recipe)).not.toContain("chicken-thigh-raw");
    expect(recipe.minutes).toBeLessThan(before.minutes);
    expect(recipe.steps.length).toBeLessThan(before.steps.length);
    expect(recipe.difficulty).toBe("super_easy");
    const text = recipe.steps.map((s) => s.text).join(" ");
    expect(text).not.toMatch(/Cut the chicken|Cook the chicken 6–8 minutes/);
    expect(text).toContain("rotisserie chicken");
    for (const s of recipe.steps) expect(s.safety).not.toBe(SAFE.chicken);
    expect(recipe.steps.some((s) => s.safety === SAFE.reheat)).toBe(true);
    // the optional garnish is gone from the list and the steps
    expect(keys(recipe)).not.toContain("sesame-seeds");
    expect(text).not.toMatch(/sesame|green onion/);
    expect(changes[0]).toMatch(/^Rotisserie chicken instead of raw thighs/);
    expect(changes.at(-1)).toMatch(/^Nutrition (recalculated|about the same).*\(estimate\)$/);
    expectSound(before, recipe);
  });

  it("chopped onion → onion powder joins the spices", () => {
    const before = R("lib:turkey-chili");
    const { recipe } = simplified(before);
    expect(keys(recipe)).toContain("onion-powder");
    expect(keys(recipe)).not.toContain("onion");
    const text = recipe.steps.map((s) => s.text).join(" ");
    expect(text).not.toMatch(/Chop the onion|cook the onion/i);
    expect(text).toContain("onion powder");
    expect(ingredientCount(recipe)).toBe(ingredientCount(before) - 1);
    expectSound(before, recipe);
  });

  it("peppers and onion become one bag of frozen peppers and onions", () => {
    const before = R("lib:philly-cheesesteak");
    const { recipe } = simplified(before);
    expect(keys(recipe).filter((k) => k === "frozen-peppers-onions")).toHaveLength(1);
    expect(keys(recipe)).not.toContain("bell-pepper");
    expect(keys(recipe)).not.toContain("onion");
    expect(recipe.ingredients.find((l) => l.key === "frozen-peppers-onions")!.note).toBe("instead of fresh peppers and onion");
    expect(recipe.steps.map((s) => s.text).join(" ")).toContain("Cook the frozen peppers and onions");
    expectSound(before, recipe);
  });

  it("simplifies a messy AI-style recipe: dry rice, raw chicken, onion, garlic, garnish", () => {
    const v = validateRecipe({
      key: "usr:test-stir-fry",
      name: "Chicken Stir-Fry with Rice",
      slots: ["dinner"],
      minutes: 40,
      difficulty: "everyday",
      ingredients: [
        { key: "rice-dry", qty: 0.5, unit: "cup" },
        { key: "chicken-breast-raw", qty: 175, unit: "g" },
        { key: "onion", qty: 0.5, unit: "piece" },
        { key: "garlic", qty: 2, unit: "piece" },
        { key: "frozen-stirfry-veg", qty: 1.5, unit: "cup" },
        { key: "soy-sauce", qty: 2, unit: "tbsp" },
        { key: "canola-oil", qty: 1, unit: "tbsp" },
        { key: "green-onion", qty: 1, unit: "piece", optional: true },
      ],
      steps: [
        { text: "Rinse the rice, then simmer it in 1 cup of water, covered, 18 minutes.", timerSec: 1080 },
        { text: "Chop the onion and mince the garlic. Cut the chicken into bite-size pieces." },
        { text: "Heat the oil in a large pan over medium-high. Cook the chicken 6–8 minutes until browned.", timerSec: 420, safety: SAFE.chicken },
        { text: "Add the onion, garlic and frozen vegetables and cook 4 minutes.", timerSec: 240 },
        { text: "Stir in the soy sauce and serve over the rice with green onion." },
      ],
      equipment: ["stovetop"],
      tags: ["cuisine:asian", "protein:chicken", "base:rice", "style:stir-fry"],
      blurb: "A stir-fry from scratch.",
      origin: "ai",
    });
    if (!v.ok) throw new Error(v.errors.join("; "));
    const before = v.recipe;
    const { recipe, changes } = simplified(before);
    expect(keys(recipe).sort()).toEqual(["canola-oil", "chicken-breast-cooked", "frozen-stirfry-veg", "garlic-powder", "onion-powder", "rice-cooked-microwave", "soy-sauce"].sort());
    const text = recipe.steps.map((s) => s.text).join(" ");
    expect(text).toContain("Microwave the rice pouch 90 seconds");
    expect(text).toContain("onion powder");
    expect(text).toContain("garlic powder");
    expect(text).not.toMatch(/Rinse|simmer|Chop|mince|Cut the chicken|green onion/i);
    expect(recipe.equipment).toContain("microwave");
    expect(recipe.minutes).toBeLessThanOrEqual(20);
    expect(ingredientCount(recipe)).toBeLessThan(ingredientCount(before));
    expect(recipe.steps.find((s) => /cooked chicken/.test(s.text))?.safety).toBe(SAFE.reheat);
    expect(changes).toEqual(expect.arrayContaining(["A microwave rice pouch instead of cooking rice", "Onion powder instead of chopping an onion", "Garlic powder instead of mincing garlic", "Left out the optional green onions"]));
    expect(recipeMacros(recipe).kcal).not.toBe(recipeMacros(before).kcal); // recomputed, not copied
    expect(recipe.equipment).toEqual(expect.arrayContaining(["stovetop", "microwave"]));
    expectSound(before, recipe);
  });

  it("never uses a shortcut the user can't have", () => {
    const noOnion = { ...DEFAULT_PREFS, dislikedIngredients: ["onion"] };
    const res = simplifyRecipe(R("lib:philly-cheesesteak"), { prefs: noOnion });
    if (res.ok) expect(keys(res.recipe)).not.toContain("frozen-peppers-onions");
    const noFryer = { ...DEFAULT_PREFS, equipment: ["stovetop" as const, "microwave" as const] };
    const chicken = simplifyRecipe(R("lib:chicken-breast-potatoes"), { prefs: noFryer });
    if (!chicken.ok) throw new Error(chicken.reason);
    expect(keys(chicken.recipe)).not.toContain("fries-frozen");
    expect(keys(chicken.recipe)).toContain("chicken-breast-cooked");
    expect(recipeAllowed(chicken.recipe, noFryer)).toBe(true);
  });

  it("leaves dishes alone where a swap would change the meal (mashed potatoes stay potatoes)", () => {
    const res = simplifyRecipe(R("lib:shepherds-pie"), { prefs: DEFAULT_PREFS });
    if (res.ok) {
      expect(keys(res.recipe)).toContain("potatoes");
      expect(keys(res.recipe)).not.toContain("fries-frozen");
    }
  });
});

describe("honest when nothing changes", () => {
  it("says a Super Easy recipe is already as simple as it gets", () => {
    const res = simplifyRecipe(R("lib:protein-shake"));
    expect(res).toEqual({ ok: false, unchanged: true, reason: "This is already as simple as it gets: 2 min, 2 ingredients, 2 steps." });
  });

  it("says when there's no shortcut", () => {
    const res = simplifyRecipe(R("lib:egg-salad-sandwiches"));
    expect(res).toMatchObject({ ok: false, unchanged: true });
    if (!res.ok) expect(res.reason).toMatch(/no shortcut/);
  });
});

describe("every library recipe", () => {
  it("simplifies soundly or says why not", () => {
    let simplifiedCount = 0;
    for (const r of LIBRARY) {
      const res = simplifyRecipe(r, { prefs: DEFAULT_PREFS });
      if (!res.ok) {
        expect(res.reason.length, r.key).toBeGreaterThan(10);
        continue;
      }
      expect(recipeAllowed(res.recipe, DEFAULT_PREFS), r.key).toBe(true);
      if (res.kind === "easier_version") {
        expect(res.recipe.key).toBe(r.easierKey);
        continue;
      }
      simplifiedCount++;
      expectSound(r, res.recipe);
      expect(res.changes.length).toBeGreaterThanOrEqual(2);
    }
    expect(simplifiedCount).toBeGreaterThanOrEqual(8);
  });
});

describe("mergeSteps", () => {
  it("merges short neighbours down to the limit, never two timers in one step", () => {
    const steps = [{ text: "A." }, { text: "B.", timerSec: 60 }, { text: "C." }, { text: "D.", timerSec: 30 }, { text: "E." }, { text: "F." }];
    const merged = mergeSteps(steps, 4);
    expect(merged).toHaveLength(4);
    for (const s of merged) expect((s.text.match(/[A-F]\./g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(merged.filter((s) => s.timerSec).length).toBe(2);
    expect(mergeSteps([{ text: "A.", timerSec: 1 }, { text: "B.", timerSec: 2 }], 1)).toHaveLength(2);
  });
});

describe("robustness (seeded fuzz)", () => {
  it("never throws, and every result is valid or an honest 'unchanged'", async () => {
    const { rngFor } = await import("./rng");
    const swapLines = [
      { key: "chicken-breast-raw", qty: 175, unit: "g" as const, words: "the chicken" },
      { key: "onion", qty: 0.5, unit: "piece" as const, words: "the onion" },
      { key: "garlic", qty: 2, unit: "piece" as const, words: "the garlic" },
      { key: "rice-dry", qty: 0.5, unit: "cup" as const, words: "the rice" },
      { key: "bell-pepper", qty: 0.5, unit: "piece" as const, words: "the pepper" },
      { key: "broccoli", qty: 1, unit: "cup" as const, words: "the broccoli" },
    ];
    const verbs = ["Chop", "Slice", "Cook", "Add", "Stir in", "Microwave", "Brown", "Serve"];
    let n = 0;
    for (const base of LIBRARY.filter((r) => r.slots.some((s) => s !== "snack")).slice(0, 60)) {
      for (let k = 0; k < 4; k++) {
        const rng = rngFor("fuzz", base.key, k);
        const extra = swapLines.filter(() => rng() < 0.4).filter((l) => !base.ingredients.some((b) => b.key === l.key));
        const steps = base.steps.map((s) => ({ ...s }));
        for (const l of extra) {
          const i = Math.floor(rng() * steps.length);
          const v = verbs[Math.floor(rng() * verbs.length)];
          steps[i] = { ...steps[i], text: `${v} ${l.words}${rng() < 0.5 ? " 4–5 minutes" : ""}. ${steps[i].text}`.slice(0, 240) };
        }
        const recipe: Recipe = { ...base, key: `usr:fuzz-${n}`, origin: "custom", easierKey: undefined, ingredients: [...base.ingredients, ...extra.map(({ words: _w, ...l }) => l)], steps };
        n++;
        const v = validateRecipe({ ...recipe, nutrition: undefined, allergens: undefined, kinds: undefined });
        if (!v.ok) continue;
        let res: ReturnType<typeof simplifyRecipe> | undefined;
        expect(() => (res = simplifyRecipe(v.recipe, { prefs: DEFAULT_PREFS })), recipe.key).not.toThrow();
        if (res!.ok) {
          expectSound(v.recipe, res!.recipe);
          expect(recipeAllowed(res!.recipe, DEFAULT_PREFS)).toBe(true);
        } else expect(res!.reason.length).toBeGreaterThan(10);
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});
