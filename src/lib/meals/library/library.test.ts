import { describe, expect, it } from "vitest";
import { getIngredient } from "../ingredients";
import { ingredientCount, meetsSuperEasy, recipeAllowed, recipeMacros, scaleIngredients, superEasyIssues, validateRecipe } from "../recipe";
import { DEFAULT_PREFS, type Diet, type Recipe, type Slot } from "../types";
import { LIBRARY, LIBRARY_SOURCE, getLibraryRecipe, libraryForSlot } from "./index";

const isMeal = (r: Recipe) => r.slots.some((s) => s !== "snack");
/** Fruit snacks are the one exception to the protein floor: quick carbs and vitamins, eaten next to protein. */
const isFruitSnack = (r: Recipe) => r.slots.every((s) => s === "snack") && r.tags.includes("style:fruit");
const RANK = { super_easy: 0, everyday: 1, i_like_cooking: 2 } as const;

describe("library size and shape", () => {
  it("has at least 100 recipes and the per-slot minimums", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(100);
    const min: Record<Slot, number> = { breakfast: 22, lunch: 28, dinner: 32, snack: 18 };
    for (const slot of Object.keys(min) as Slot[]) expect(libraryForSlot(slot).length, slot).toBeGreaterThanOrEqual(min[slot]);
  });

  it("keys and names are unique, keys are lib: slugs", () => {
    const keys = LIBRARY.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^lib:[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = LIBRARY.map((r) => r.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const r of LIBRARY) expect(r.origin).toBe("library");
  });

  it("looks recipes up by key", () => {
    expect(getLibraryRecipe("lib:spaghetti-bolognese")?.name).toBe("Easy Spaghetti Bolognese");
    expect(getLibraryRecipe("lib:nope")).toBeUndefined();
    expect(libraryForSlot("snack").every((r) => r.slots.includes("snack"))).toBe(true);
  });

  it("every recipe validates against the strict schema, and validation agrees with the library", () => {
    for (const src of LIBRARY_SOURCE) {
      const v = validateRecipe(src);
      expect(v.ok ? [] : v.errors, src.key).toEqual([]);
      if (!v.ok) continue;
      const lib = getLibraryRecipe(src.key)!;
      expect(v.recipe.nutrition, src.key).toEqual(lib.nutrition);
      expect(v.recipe.allergens, src.key).toEqual(lib.allergens);
      expect(v.recipe.cost, src.key).toBe(lib.cost);
    }
  });
});

describe("nutrition is plausible for a bulking teen", () => {
  it("per-serving kcal is 150–1,400", () => {
    for (const r of LIBRARY) {
      const { kcal } = recipeMacros(r);
      expect(kcal, r.key).toBeGreaterThanOrEqual(150);
      expect(kcal, r.key).toBeLessThanOrEqual(1400);
    }
  });

  it("meals have at least 20 g protein; snacks at least 8 g (fruit snacks excepted)", () => {
    for (const r of LIBRARY) {
      const { protein } = recipeMacros(r);
      if (isMeal(r)) expect(protein, r.key).toBeGreaterThanOrEqual(20);
      else if (!isFruitSnack(r)) expect(protein, r.key).toBeGreaterThanOrEqual(8);
    }
    expect(LIBRARY.filter(isFruitSnack).length).toBeLessThanOrEqual(2);
  });

  it("dinners average 700–1,000 kcal and 40–60 g protein", () => {
    const dinners = libraryForSlot("dinner").map((r) => recipeMacros(r));
    const avg = (f: (m: (typeof dinners)[number]) => number) => dinners.reduce((a, m) => a + f(m), 0) / dinners.length;
    expect(avg((m) => m.kcal)).toBeGreaterThan(700);
    expect(avg((m) => m.kcal)).toBeLessThan(1000);
    expect(avg((m) => m.protein)).toBeGreaterThan(40);
    expect(avg((m) => m.protein)).toBeLessThan(60);
  });

  it("macros add up (4/4/9) within ~15 % for every recipe", () => {
    for (const r of LIBRARY) {
      const m = recipeMacros(r);
      const derived = m.protein * 4 + m.carbs * 4 + m.fat * 9;
      expect(Math.abs(derived - m.kcal) / m.kcal, r.key).toBeLessThan(0.15);
    }
  });
});

describe("difficulty", () => {
  it("Super Easy recipes really are: ≤ 15 min, ≤ 6 non-staple ingredients, ≤ 5 steps", () => {
    for (const src of LIBRARY_SOURCE) {
      if (src.difficulty === "super_easy") expect(superEasyIssues(src), src.key).toEqual([]);
    }
  });

  it("normalising never changes a library recipe's difficulty", () => {
    for (const src of LIBRARY_SOURCE) expect(getLibraryRecipe(src.key)!.difficulty, src.key).toBe(src.difficulty);
  });

  it("most recipes are Super Easy, some Everyday (15–30 min), a few I Like Cooking", () => {
    const count = (d: Recipe["difficulty"]) => LIBRARY.filter((r) => r.difficulty === d).length;
    expect(count("super_easy")).toBeGreaterThan(LIBRARY.length / 2);
    expect(count("everyday")).toBeGreaterThanOrEqual(15);
    expect(count("i_like_cooking")).toBeGreaterThanOrEqual(3);
    expect(count("i_like_cooking")).toBeLessThanOrEqual(10);
    for (const r of LIBRARY.filter((x) => x.difficulty === "everyday")) {
      expect(r.minutes, r.key).toBeGreaterThan(15);
      expect(r.minutes, r.key).toBeLessThanOrEqual(30);
    }
    // Every slot has plenty of Super Easy choices for a new cook.
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as Slot[]) {
      expect(libraryForSlot(slot).filter(meetsSuperEasy).length, slot).toBeGreaterThanOrEqual(12);
    }
  });

  it("easier versions exist, share a slot and really are easier", () => {
    const withEasier = LIBRARY.filter((r) => r.easierKey);
    expect(withEasier.length).toBeGreaterThanOrEqual(6);
    for (const r of withEasier) {
      const e = getLibraryRecipe(r.easierKey!);
      expect(e, r.key).toBeTruthy();
      expect(r.difficulty, r.key).not.toBe("super_easy");
      expect(e!.slots.some((s) => r.slots.includes(s)), r.key).toBe(true);
      const easier = RANK[e!.difficulty] < RANK[r.difficulty] || (RANK[e!.difficulty] === RANK[r.difficulty] && e!.minutes < r.minutes);
      expect(easier, `${r.key} → ${e!.key}`).toBe(true);
    }
    // Every I Like Cooking recipe with a familiar simpler cousin points at it.
    for (const k of ["lib:homemade-bolognese", "lib:homemade-chicken-alfredo", "lib:chicken-parmesan"]) expect(getLibraryRecipe(k)!.easierKey, k).toBeTruthy();
  });
});

describe("variety", () => {
  const tagged = (prefix: string) => new Set(LIBRARY.flatMap((r) => r.tags.filter((t) => t.startsWith(prefix))));

  it("covers many proteins and cuisines, not chicken and rice everywhere", () => {
    const proteins = tagged("protein:");
    for (const p of ["beef", "chicken", "pork", "turkey", "egg", "tuna", "salmon", "fish", "shrimp", "beans", "dairy", "whey", "tofu"]) {
      expect(proteins.has(`protein:${p}`), p).toBe(true);
    }
    const cuisines = tagged("cuisine:");
    for (const c of ["italian", "mexican", "american", "asian", "breakfast", "mediterranean", "canadian"]) expect(cuisines.has(`cuisine:${c}`), c).toBe(true);
    const dinners = libraryForSlot("dinner");
    const chickenRice = dinners.filter((r) => r.tags.includes("protein:chicken") && r.tags.includes("base:rice"));
    expect(chickenRice.length / dinners.length).toBeLessThan(0.15);
    expect(tagged("dish:").size).toBeGreaterThanOrEqual(70);
    expect(tagged("base:").size).toBeGreaterThanOrEqual(10);
  });

  it("every recipe is tagged for learning: protein, style and dish (cuisine and base for meals)", () => {
    for (const r of LIBRARY) {
      for (const t of r.tags) expect(t, r.key).toMatch(/^(cuisine|protein|base|style|dish):[a-z0-9-]+$/);
      for (const p of ["style:", "dish:"]) expect(r.tags.filter((t) => t.startsWith(p)).length, `${r.key} ${p}`).toBe(1);
      // A carb base (bread, rice, pasta…) when there is one: shakes and roll-ups have none.
      expect(r.tags.filter((t) => t.startsWith("base:")).length, `${r.key} base:`).toBeLessThanOrEqual(1);
      if (isMeal(r)) expect(r.tags.some((t) => t.startsWith("base:")), r.key).toBe(true);
      if (!isFruitSnack(r)) expect(r.tags.some((t) => t.startsWith("protein:")), r.key).toBe(true);
      if (isMeal(r)) expect(r.tags.filter((t) => t.startsWith("cuisine:")).length, r.key).toBe(1);
    }
  });

  it("includes every example the owner listed", () => {
    const examples = [
      // breakfast
      "lib:scrambled-eggs-toast", "lib:eggs-bagel-cream-cheese", "lib:greek-yogurt-granola-banana", "lib:pb-banana-oatmeal",
      "lib:sausage-egg-muffins", "lib:ham-egg-cheese-bagel", "lib:cereal-milk-greek-yogurt", "lib:berry-protein-smoothie",
      // lunch
      "lib:chicken-caesar-wraps", "lib:ham-cheese-sandwiches", "lib:turkey-bacon-club", "lib:chicken-rice-broccoli",
      "lib:double-cheeseburger", "lib:chicken-quesadillas", "lib:tuna-melts", "lib:meat-sauce-pasta-lunch", "lib:easy-chicken-sandwich",
      // dinner
      "lib:spaghetti-bolognese", "lib:chicken-potatoes-sheet-pan", "lib:chicken-alfredo", "lib:cheeseburger-oven-fries",
      "lib:beef-tacos", "lib:teriyaki-chicken-rice-bowl", "lib:tortilla-pizzas", "lib:steak-potatoes",
      "lib:one-pot-cheesy-beef-pasta", "lib:air-fryer-chicken-fries",
      // snacks
      "lib:greek-yogurt-berries-honey", "lib:protein-shake", "lib:pb-toast", "lib:cheese-crackers", "lib:banana-peanut-butter",
      "lib:cottage-cheese-fruit", "lib:turkey-cheese-sandwich",
    ];
    for (const k of examples) expect(getLibraryRecipe(k), k).toBeTruthy();
    expect(getLibraryRecipe("lib:chicken-alfredo")!.ingredients.some((l) => l.key === "alfredo-sauce-jarred")).toBe(true);
    expect(getLibraryRecipe("lib:spaghetti-bolognese")!.ingredients.some((l) => l.key === "pasta-sauce-jarred")).toBe(true);
    expect(getLibraryRecipe("lib:cheeseburger-oven-fries")!.ingredients.some((l) => l.key === "fries-frozen")).toBe(true);
  });

  it("every common diet can still fill a week in every slot", () => {
    const needs: [Diet, Slot, number][] = [
      ["vegetarian", "breakfast", 7], ["vegetarian", "lunch", 7], ["vegetarian", "dinner", 7], ["vegetarian", "snack", 7],
      ["halal", "breakfast", 7], ["halal", "lunch", 7], ["halal", "dinner", 7],
      ["dairy_free", "breakfast", 7], ["dairy_free", "lunch", 7], ["dairy_free", "dinner", 7], ["dairy_free", "snack", 7],
      ["gluten_free", "breakfast", 6], ["gluten_free", "lunch", 7], ["gluten_free", "dinner", 7], ["gluten_free", "snack", 7],
      ["pescatarian", "lunch", 7], ["pescatarian", "dinner", 7],
    ];
    for (const [diet, slot, n] of needs) {
      const ok = libraryForSlot(slot).filter((r) => recipeAllowed(r, { ...DEFAULT_PREFS, diets: [diet] }));
      expect(ok.length, `${diet} ${slot}`).toBeGreaterThanOrEqual(n);
    }
  });
});

describe("steps, safety and equipment", () => {
  it("copy is short and plain: no exclamation marks, emoji or chef jargon", () => {
    const jargon = /\b(julienne|chiffonade|deglaze|brunoise|emulsify|blanch|mise en place|roux|sous vide)\b/i;
    for (const r of LIBRARY) {
      expect(r.name.length, r.key).toBeLessThanOrEqual(60);
      expect(r.blurb.length, r.key).toBeLessThanOrEqual(140);
      expect(r.steps.length, r.key).toBeGreaterThanOrEqual(1);
      for (const t of [r.name, r.blurb, ...r.steps.map((s) => s.text), ...r.steps.map((s) => s.safety ?? "")]) {
        expect(t, r.key).not.toMatch(/!/);
        expect(t, r.key).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(t, r.key).not.toMatch(jargon);
      }
      for (const s of r.steps) expect(s.text.length, r.key).toBeLessThanOrEqual(240);
    }
  });

  it("timers are whole seconds and fit inside the recipe's time", () => {
    for (const r of LIBRARY) {
      for (const s of r.steps) {
        if (s.timerSec == null) continue;
        expect(Number.isInteger(s.timerSec), r.key).toBe(true);
        expect(s.timerSec, r.key).toBeGreaterThan(0);
        expect(s.timerSec, `${r.key}: "${s.text}"`).toBeLessThanOrEqual(r.minutes * 60);
      }
    }
  });

  it("recipes that cook raw meat, poultry or fish carry a food-safety note with a real temperature", () => {
    const raw = new Set([
      "chicken-breast-raw", "chicken-thigh-raw", "chicken-tenders-frozen", "ground-beef-lean", "burger-patties-frozen",
      "steak-sirloin-raw", "pork-chop-raw", "pork-tenderloin-raw", "ground-turkey", "breakfast-sausage", "peameal-bacon",
      "salmon-raw", "cod-raw",
    ]);
    for (const r of LIBRARY) {
      if (!r.ingredients.some((l) => raw.has(l.key))) continue;
      const notes = r.steps.map((s) => s.safety ?? "").join(" ");
      expect(notes, r.key).toMatch(/\d+°C \(\d+°F\)/);
    }
    // Poultry is always 74°C, ground beef 71°C.
    expect(getLibraryRecipe("lib:chicken-alfredo")!.steps.some((s) => s.safety?.includes("74°C"))).toBe(true);
    expect(getLibraryRecipe("lib:beef-tacos")!.steps.some((s) => s.safety?.includes("71°C"))).toBe(true);
  });

  it("equipment matches what the steps use", () => {
    const uses: [RegExp, Recipe["equipment"][number]][] = [
      [/\bair fry/i, "air_fryer"],
      [/\b(oven|broil)/i, "oven"],
      [/\bmicrowave/i, "microwave"],
      [/\bblend/i, "blender"],
      [/\b(boil|over (low|medium|high)|medium-(low|high))/i, "stovetop"],
    ];
    for (const r of LIBRARY) {
      const text = r.steps.map((s) => s.text).join(" ");
      for (const [re, eq] of uses) {
        if (re.test(text)) expect.soft(r.equipment, `${r.key} needs ${eq}`).toContain(eq);
      }
      for (const eq of r.equipment) {
        const re = uses.find(([, e]) => e === eq)?.[0];
        if (re) expect.soft(text, `${r.key} lists ${eq} but never uses it`).toMatch(re);
      }
    }
  });

  it("every ingredient line reads naturally (no bare 'pieces')", () => {
    for (const r of LIBRARY) {
      for (const l of scaleIngredients(r, 1)) {
        expect(l.text, r.key).not.toMatch(/\bpieces?\b/);
        expect(l.text, r.key).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it("non-staple ingredients per recipe stay reasonable", () => {
    for (const r of LIBRARY) {
      expect(ingredientCount(r), r.key).toBeGreaterThanOrEqual(1);
      expect(ingredientCount(r), r.key).toBeLessThanOrEqual(8);
      for (const l of r.ingredients) expect(getIngredient(l.key), `${r.key} ${l.key}`).toBeTruthy();
    }
  });
});
