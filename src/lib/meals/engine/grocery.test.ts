import { describe, expect, it } from "vitest";
import { getIngredient } from "../ingredients";
import { getLibraryRecipe } from "../library";
import { lineGrams } from "../recipe";
import type { Recipe } from "../types";
import { buildGroceryList, groceryLineText, groceryTotals, mergeGroceryState, packLabel, toGroceryInput, type GroceryStateItem } from "./grocery";

const R = (k: string) => getLibraryRecipe(k)!;
const lookup = (k: string) => getLibraryRecipe(k);
const grams = (r: Recipe, key: string) => r.ingredients.filter((l) => l.key === key && !l.optional).reduce((s, l) => s + (lineGrams(l) ?? 0), 0);

describe("buildGroceryList", () => {
  it("sums ground beef across meals (× servings) into one line, in whole 454 g packs", () => {
    const meals = [
      { recipe_key: "lib:spaghetti-bolognese", servings: 2 },
      { recipe_key: "lib:beef-tacos", servings: 1.5 },
      { recipe_key: "lib:one-pot-cheesy-beef-pasta", servings: 1 },
    ];
    const list = buildGroceryList(meals, lookup);
    const beef = list.items.filter((i) => i.key === "ground-beef-lean");
    expect(beef).toHaveLength(1);
    const expected = grams(R("lib:spaghetti-bolognese"), "ground-beef-lean") * 2 + grams(R("lib:beef-tacos"), "ground-beef-lean") * 1.5 + grams(R("lib:one-pot-cheesy-beef-pasta"), "ground-beef-lean");
    expect(beef[0].qty).toBe(Math.round(expected));
    expect(beef[0].unit).toBe("g");
    const packs = Math.ceil(expected / 454 - 0.04);
    expect(beef[0].packs).toBe(packs);
    expect(beef[0].label).toBe(packs === 1 ? "1 × 454 g pack" : `${packs} × 454 g packs`);
    expect(beef[0].est_cost_cad).toBeCloseTo(packs * 7.49, 2);
    expect(beef[0].category).toBe("meat");
    expect(beef[0].uses.map((u) => u.recipe_key).sort()).toEqual(["lib:beef-tacos", "lib:one-pot-cheesy-beef-pasta", "lib:spaghetti-bolognese"]);
    // pasta from two recipes is one line too
    expect(list.items.filter((i) => i.key === "pasta-dry")).toHaveLength(1);
  });

  it("converts units: eggs by the dozen, milk measured in cups shown in mL", () => {
    const meals = [
      { recipe_key: "lib:scrambled-eggs-toast", servings: 2 },
      { recipe_key: "lib:ham-cheese-omelette", servings: 2 },
      { recipe_key: "lib:cereal-milk-greek-yogurt", servings: 1 },
      { recipe_key: "lib:protein-shake", servings: 2 },
    ];
    const list = buildGroceryList(meals, lookup);
    const eggs = list.items.find((i) => i.key === "eggs")!;
    const eggCount = (grams(R("lib:scrambled-eggs-toast"), "eggs") * 2 + grams(R("lib:ham-cheese-omelette"), "eggs") * 2) / 50;
    expect(eggs.unit).toBe("piece");
    expect(eggs.qty).toBe(Math.ceil(eggCount - 0.05));
    expect(eggs.amount).toBe(`${eggs.qty} eggs`);
    expect(eggs.label).toBe(`${Math.ceil(eggCount / 12 - 0.04)} dozen`);
    const milk = list.items.find((i) => i.key === "milk-2");
    if (milk) {
      expect(milk.unit).toBe("ml");
      expect(milk.amount).toMatch(/mL|L$/);
    }
  });

  it("puts staples under Pantry as 'check you have' at no cost, and leaves out water and optional garnish", () => {
    const list = buildGroceryList([{ recipe_key: "lib:spaghetti-bolognese", servings: 1 }, { recipe_key: "lib:teriyaki-chicken-rice-bowl", servings: 1 }, { recipe_key: "lib:one-pot-cheesy-beef-pasta", servings: 1 }], lookup);
    for (const key of ["salt", "olive-oil", "garlic-powder"]) {
      const l = list.items.find((i) => i.key === key)!;
      expect(l.staple).toBe(true);
      expect(l.category).toBe("pantry");
      expect(l.label).toBe("Check you have");
      expect(l.est_cost_cad).toBe(0);
    }
    expect(list.items.find((i) => i.key === "water")).toBeUndefined();
    expect(list.items.find((i) => i.key === "sesame-seeds")).toBeUndefined(); // optional
    // grouped in aisle order, positions follow it
    expect(list.groups.map((g) => g.category)).toEqual(["meat", "dairy_eggs", "bread_grains", "frozen", "pantry"]);
    expect(list.items.map((i) => i.position)).toEqual(list.items.map((_, i) => i));
  });

  it("marks pantry items as 'have' and keeps them out of the checkout estimate", () => {
    const meals = [{ recipe_key: "lib:spaghetti-bolognese", servings: 1 }];
    const without = buildGroceryList(meals, lookup, { pantry: [], weeklyBudgetCad: null });
    const withPantry = buildGroceryList(meals, lookup, { pantry: ["pasta-dry"], weeklyBudgetCad: null });
    expect(withPantry.items.find((i) => i.key === "pasta-dry")!.have).toBe(true);
    expect(withPantry.totals.checkoutCad).toBeCloseTo(without.totals.checkoutCad - 2.49, 2);
  });

  it("compares the weekly budget with what the user pays at the checkout (and with the food used)", () => {
    const meals = [{ recipe_key: "lib:spaghetti-bolognese", servings: 7 }];
    const list = buildGroceryList(meals, lookup, { pantry: [], weeklyBudgetCad: 20 });
    expect(list.totals.budgetCad).toBe(20);
    expect(list.totals.weekCad).toBeGreaterThan(0);
    expect(list.totals.weekCad).toBeLessThanOrEqual(list.totals.checkoutCad);
    expect(list.totals.overBudgetCad).toBeCloseTo(list.totals.checkoutCad - 20, 2);
    expect(list.totals.weekOverBudgetCad).toBeCloseTo(list.totals.weekCad - 20, 2);
    const none = buildGroceryList(meals, lookup).totals;
    expect(none.overBudgetCad).toBeNull();
    expect(none.weekOverBudgetCad).toBeNull();
  });

  it("mid-week, shops only from the given day on", () => {
    const meals = [
      { recipe_key: "lib:spaghetti-bolognese", servings: 1, local_date: "2026-10-13" },
      { recipe_key: "lib:beef-tacos", servings: 1, local_date: "2026-10-16" },
    ];
    const all = buildGroceryList(meals, lookup);
    const fromFri = buildGroceryList(meals, lookup, undefined, { from: "2026-10-16" });
    expect(all.items.some((i) => i.key === "pasta-dry")).toBe(true);
    expect(fromFri.items.some((i) => i.key === "pasta-dry")).toBe(false);
    expect(fromFri.items.find((i) => i.key === "ground-beef-lean")!.uses.map((u) => u.recipe_key)).toEqual(["lib:beef-tacos"]);
    expect(fromFri.totals.checkoutCad).toBeLessThan(all.totals.checkoutCad);
  });

  it("buys one variant for interchangeable ones: yogurt 0%/2%, bread, tortilla sizes, ready chicken, milk", () => {
    const yog = buildGroceryList([{ recipe_key: "lib:overnight-protein-oats", servings: 1 }, { recipe_key: "lib:greek-yogurt-parfait", servings: 1 }].filter((m) => lookup(m.recipe_key)), lookup);
    const yLines = yog.items.filter((i) => i.key.startsWith("greek-yogurt"));
    expect(yLines.length).toBeLessThanOrEqual(1);
    // made-up recipes that ask for each variant
    const fake = (key: string, ing: string, qty: number, unit: Recipe["ingredients"][number]["unit"]): Recipe => ({ ...R("lib:protein-shake"), key, ingredients: [{ key: ing, qty, unit }] });
    const recipes = new Map<string, Recipe>([
      ["a", fake("a", "bread-white", 2, "slice")],
      ["b", fake("b", "bread-whole-wheat", 4, "slice")],
      ["c", fake("c", "tortilla-flour", 3, "piece")],
      ["d", fake("d", "tortilla-large", 1, "piece")],
      ["e", fake("e", "greek-yogurt-0", 200, "g")],
      ["f", fake("f", "greek-yogurt-2", 100, "g")],
    ]);
    const list = buildGroceryList([...recipes.keys()].map((k) => ({ recipe_key: k, servings: 1 })), (k) => recipes.get(k), { pantry: ["greek-yogurt-2"], weeklyBudgetCad: null });
    const keys = list.items.map((i) => i.key).sort();
    expect(keys).toEqual(["bread-whole-wheat", "greek-yogurt-0", "tortilla-large"]);
    const bread = list.items.find((i) => i.key === "bread-whole-wheat")!;
    expect(bread.name).toBe("Sandwich bread (white or whole-wheat)");
    expect(bread.covers).toEqual([{ key: "bread-white", name: "White sandwich bread" }]);
    expect(bread.packs).toBe(1);
    expect(bread.uses.map((u) => u.recipe_key).sort()).toEqual(["a", "b"]);
    // tortillas swap one for one, and always as the large ones
    const tort = list.items.find((i) => i.key === "tortilla-large")!;
    expect(tort.qty).toBe(4);
    expect(tort.amount).toBe("4 large tortillas");
    // "I already have" either variant counts
    expect(list.items.find((i) => i.key === "greek-yogurt-0")!.have).toBe(true);
  });

  it("counts in shopper units: slices of bread and bacon, pouches of rice, cans", () => {
    const meals = [
      { recipe_key: "lib:bacon-eggs-toast", servings: 1 },
      { recipe_key: "lib:teriyaki-chicken-rice-bowl", servings: 3 },
      { recipe_key: "lib:tuna-melts", servings: 2 },
    ].filter((m) => lookup(m.recipe_key));
    const list = buildGroceryList(meals, lookup);
    for (const l of list.items) {
      if (l.key.startsWith("bread-") || l.key === "bacon-cooked") expect(l.amount, l.key).toMatch(/^\d+ slices?$/);
      if (l.key === "rice-cooked-microwave") {
        expect(l.amount).toMatch(/^\d+ pouch(es)?$/);
        expect(l.label).toBe(l.amount); // one pouch is one pack: said once
      }
      if (l.key === "tuna-canned") expect(l.amount).toMatch(/^\d+ cans?$/);
    }
    expect(list.items.some((l) => l.key === "rice-cooked-microwave")).toBe(true);
    expect(groceryLineText({ key: "bread-white", qty: 95, unit: "g", label: "1 × 675 g loaf (about 20 slices)", name: "Bread" })).toBe("3 slices · 1 × 675 g loaf (about 20 slices)");
    expect(groceryLineText({ key: "bacon-cooked", qty: 11, unit: "piece", label: "1 × 375 g pack (about 16 slices)", name: "Bacon" })).toBe("11 slices · 1 × 375 g pack (about 16 slices)");
    expect(groceryLineText({ key: "rice-cooked-microwave", qty: 1560, unit: "g", label: "7 pouches", name: "Rice" })).toBe("7 pouches · 7 pouches");
  });

  it("reports recipes it can't find instead of guessing", () => {
    const list = buildGroceryList([{ recipe_key: "usr:gone", servings: 1 }], lookup);
    expect(list.items).toEqual([]);
    expect(list.missing).toEqual(["usr:gone"]);
  });

  it("feeds the data layer's sync shape", () => {
    const list = buildGroceryList([{ recipe_key: "lib:beef-tacos", servings: 1 }], lookup);
    const input = toGroceryInput(list.items);
    expect(Object.keys(input[0]).sort()).toEqual(["category", "est_cost_cad", "have", "key", "label", "name", "position", "qty", "unit"]);
    for (const i of input) expect(getIngredient(i.key)).toBeTruthy();
  });
});

describe("shopper text", () => {
  it("pluralises packs", () => {
    expect(packLabel("454 g pack", 3)).toBe("3 × 454 g packs");
    expect(packLabel("454 g pack", 1)).toBe("1 × 454 g pack");
    expect(packLabel("dozen", 2)).toBe("2 dozen");
    expect(packLabel("dozen", 1)).toBe("1 dozen");
    expect(packLabel("675 g loaf (about 20 slices)", 2)).toBe("2 × 675 g loaves (about 20 slices)");
    expect(packLabel("1 bunch", 2)).toBe("2 bunches");
    expect(packLabel("1 whole chicken (about 600 g meat)", 1)).toBe("1 whole chicken (about 600 g meat)");
    expect(packLabel("1 whole chicken (about 600 g meat)", 2)).toBe("2 whole chickens (about 600 g meat)");
    expect(packLabel("bunch of about 6", 1)).toBe("1 bunch of about 6");
    expect(packLabel("6 bagels", 2)).toBe("2 × 6 bagels");
  });

  it("formats stored rows", () => {
    expect(groceryLineText({ key: "ground-beef-lean", qty: 1200, unit: "g", label: "3 × 454 g packs", name: "Beef" })).toBe("1.2 kg · 3 × 454 g packs");
    expect(groceryLineText({ key: "eggs", qty: 18, unit: "piece", label: "2 dozen", name: "Eggs" })).toBe("18 eggs · 2 dozen");
    expect(groceryLineText({ key: "custom:1", qty: null, unit: null, label: null, name: "Paper towels" })).toBe("Paper towels");
  });
});

describe("mergeGroceryState", () => {
  const prev: GroceryStateItem[] = [
    { key: "ground-beef-lean", name: "Beef", category: "meat", qty: 450, unit: "g", label: "1 × 454 g pack", est_cost_cad: 7.49, position: 0, checked: true, have: false, removed: false, custom: false },
    { key: "eggs", name: "Eggs", category: "dairy_eggs", qty: 12, unit: "piece", label: "1 dozen", est_cost_cad: 4.79, position: 1, checked: false, have: true, removed: false, custom: false },
    { key: "salsa", name: "Salsa", category: "pantry", qty: 200, unit: "ml", label: "1 × 650 mL jar", est_cost_cad: 4.29, position: 2, checked: false, have: false, removed: true, custom: false },
    { key: "taco-shells", name: "Taco shells", category: "bread_grains", qty: 6, unit: "piece", label: "1 × 12 shells", est_cost_cad: 3.79, position: 3, checked: true, have: false, removed: false, custom: false },
    { key: "custom:abc", name: "Paper towels", category: "other", qty: null, unit: null, label: null, est_cost_cad: null, position: 9, checked: true, have: false, removed: false, custom: true },
  ];

  it("keeps checked / have / removed on lines that still exist, keeps custom lines, drops the rest", () => {
    const next = buildGroceryList([{ recipe_key: "lib:beef-tacos", servings: 2 }, { recipe_key: "lib:scrambled-eggs-toast", servings: 1 }], lookup, { pantry: [], weeklyBudgetCad: null });
    const { items, added, dropped, changed } = mergeGroceryState(prev, toGroceryInput(next.items));
    const by = new Map(items.map((i) => [i.key, i]));
    expect(by.get("ground-beef-lean")).toMatchObject({ checked: true, removed: false });
    expect(by.get("eggs")).toMatchObject({ have: true, checked: false });
    expect(by.get("salsa")).toMatchObject({ removed: true });
    expect(by.get("taco-shells")).toMatchObject({ checked: true });
    expect(by.get("custom:abc")).toMatchObject({ name: "Paper towels", checked: true, custom: true });
    expect(dropped).toEqual([]);
    expect(changed).toContain("ground-beef-lean"); // 2 servings of tacos is more beef
    expect(added.length).toBeGreaterThan(0);
    for (const k of added) expect(by.get(k)).toMatchObject({ checked: false, removed: false });
    const afterSwap = mergeGroceryState(items, toGroceryInput(buildGroceryList([{ recipe_key: "lib:protein-shake", servings: 1 }], lookup).items));
    expect(afterSwap.dropped).toContain("ground-beef-lean");
    expect(afterSwap.items.map((i) => i.key)).toContain("custom:abc");
    expect(afterSwap.items.map((i) => i.key)).not.toContain("ground-beef-lean");
  });

  it("totals the stored state: 'have' and removed lines cost nothing", () => {
    const t = groceryTotals(prev, 50);
    expect(t.checkoutCad).toBeCloseTo(7.49 + 3.79, 2);
    expect(t.toBuy).toBe(3); // beef, taco shells, custom
    expect(t.budgetCad).toBe(50);
    expect(t.weekCad).toBeGreaterThan(0);
  });
});
