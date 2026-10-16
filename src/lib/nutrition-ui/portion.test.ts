import { describe, expect, it } from "vitest";
import {
  buildEntry,
  cloneEntry,
  manualEntry,
  directEdit,
  entryBase,
  fromEntry,
  fromSavedFood,
  fromSearchResult,
  normalizeUnit,
  portion,
  rescaleEntry,
  savedFoodFromEntry,
  savedFoodFromPortion,
  stepFor,
  type FoodRow,
  type SavedFoodRow,
} from "./portion";
import type { SearchResult } from "./search";

const row = (over: Partial<FoodRow> = {}): FoodRow => ({
  id: "e1",
  user_id: "u",
  local_date: "2026-10-16",
  eaten_at: "2026-10-16T12:30:00.000Z",
  meal: "lunch",
  name: "Chicken breast, grilled",
  brand: null,
  amount: 200,
  unit: "g",
  grams: 200,
  calories: 330,
  protein_g: 62,
  carbs_g: 0,
  fat_g: 7.2,
  base_amount: 100,
  base_calories: 165,
  base_protein_g: 31,
  base_carbs_g: 0,
  base_fat_g: 3.6,
  source: "manual",
  confidence: "logged",
  source_name: null,
  source_url: null,
  meal_group_id: null,
  saved_food_id: null,
  photo_path: null,
  planned_meal_id: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("rescaleEntry", () => {
  it("recalculates 200 g → 300 g from the base macros", () => {
    const u = rescaleEntry(row(), 300);
    expect(u).toMatchObject({ amount: 300, calories: 495, protein_g: 93, carbs_g: 0, fat_g: 10.8, grams: 300, base_amount: 100, base_calories: 165 });
  });

  it("scales grams for non-gram units", () => {
    const e = row({ unit: "cup", amount: 1, grams: 158, base_amount: 1, base_calories: 205, base_protein_g: 4.3, base_carbs_g: 45, base_fat_g: 0.4, calories: 205 });
    const u = rescaleEntry(e, 1.5);
    expect(u.calories).toBe(308);
    expect(u.carbs_g).toBe(67.5);
    expect(u.grams).toBe(237);
  });

  it("falls back to current macros when no base was stored", () => {
    const e = row({ base_amount: 1, base_calories: 0, base_protein_g: 0, base_carbs_g: 0, base_fat_g: 0, amount: 2, unit: "piece", grams: null, calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 });
    expect(entryBase(e)).toEqual({ baseAmount: 2, base: { calories: 140, protein: 12, carbs: 1, fat: 10 } });
    const u = rescaleEntry(e, 3);
    expect(u).toMatchObject({ calories: 210, protein_g: 18, fat_g: 15, base_amount: 2, base_calories: 140 });
  });
});

describe("directEdit", () => {
  it("makes typed numbers the new base and clears database provenance when they change", () => {
    const e = row({ source: "usda", confidence: "database", source_name: "USDA", source_url: "https://fdc.nal.usda.gov/x" });
    const u = directEdit(e, { amount: 150, unit: "g", macros: { calories: 260, protein: 50, carbs: 0, fat: 6 } });
    expect(u).toMatchObject({ amount: 150, base_amount: 150, base_calories: 260, calories: 260, grams: 150, source: "manual", confidence: "logged", source_url: null });
    // later amount edits rescale from the new base
    const after = rescaleEntry({ ...e, ...u } as FoodRow, 300);
    expect(after.calories).toBe(520);
  });

  it("keeps provenance when only the amount/unit label is resaved with identical macros", () => {
    const e = row({ source: "usda", confidence: "database" });
    const u = directEdit(e, { amount: 200, unit: "g", macros: { calories: 330, protein: 62, carbs: 0, fat: 7.2 } });
    expect(u.source).toBeUndefined();
    expect(u.confidence).toBeUndefined();
  });
});

const search = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: "171477",
  name: "Chicken breast, roasted",
  brand: null,
  source: "usda",
  sourceName: "USDA FoodData Central",
  sourceUrl: "https://fdc.nal.usda.gov/food-details/171477/nutrients",
  servingAmount: 1,
  servingUnit: "cup",
  servingGrams: 140,
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  perServing: { calories: 231, protein: 43.4, carbs: 0, fat: 5 },
  ...over,
});

describe("fromSearchResult", () => {
  it("offers the serving unit first and grams when per-100 g data exists", () => {
    const c = fromSearchResult(search());
    expect(c.units.map((u) => u.unit)).toEqual(["cup", "g"]);
    expect(c.defaultAmount).toBe(1);
    expect(portion(c.units[1], 250).macros).toEqual({ calories: 413, protein: 77.5, carbs: 0, fat: 9 });
    expect(portion(c.units[0], 2).grams).toBe(280);
    expect(c.confidence).toBe("database");
    expect(c.sourceUrl).toMatch(/^https:/);
  });

  it("uses grams directly when the serving is gram-based", () => {
    const c = fromSearchResult(search({ servingAmount: 30, servingUnit: "g", servingGrams: 30, perServing: { calories: 117, protein: 4, carbs: 20, fat: 2 }, per100g: { calories: 389, protein: 13.5, carbs: 66, fat: 6.9 } }));
    expect(c.units[0].unit).toBe("g");
    expect(c.defaultAmount).toBe(30);
    expect(c.units[1]).toMatchObject({ unit: "serving", hint: "1 serving = 30 g" });
  });

  it("describes an unknown serving unit", () => {
    const c = fromSearchResult(search({ source: "off", servingAmount: 2, servingUnit: "cookies", servingGrams: 28, per100g: null }));
    expect(c.units).toHaveLength(1);
    expect(c.units[0]).toMatchObject({ unit: "serving", baseAmount: 1, hint: "1 serving = 2 cookies · 28 g" });
  });

  it("builds a complete entry with base macros and provenance", () => {
    const c = fromSearchResult(search());
    const e = buildEntry(c, { id: "x", unitIndex: 1, amount: 250, meal: "lunch", date: "2026-10-16", eatenAt: "2026-10-16T12:00:00.000Z" });
    expect(e).toMatchObject({
      unit: "g",
      amount: 250,
      grams: 250,
      calories: 413,
      base_amount: 100,
      base_calories: 165,
      base_protein_g: 31,
      source: "usda",
      confidence: "database",
      source_url: "https://fdc.nal.usda.gov/food-details/171477/nutrients",
      meal_group_id: null,
    });
  });
});

describe("saved foods", () => {
  const saved: SavedFoodRow = {
    id: "s1",
    user_id: "u",
    name: "Overnight oats",
    brand: null,
    serving_amount: 1,
    serving_unit: "bowl",
    grams: 350,
    calories: 520,
    protein_g: 38,
    carbs_g: 70,
    fat_g: 10,
    is_favorite: true,
    use_count: 3,
    last_used_at: null,
    source: "manual",
    source_name: null,
    source_url: null,
    created_at: "",
  };

  it("logs a saved food by serving or by grams", () => {
    const c = fromSavedFood(saved);
    expect(c.units.map((u) => u.unit)).toEqual(["bowl", "g"]);
    expect(portion(c.units[1], 175).macros.calories).toBe(260);
    const e = buildEntry(c, { id: "a", unitIndex: 0, amount: 1, meal: "breakfast", date: "2026-10-16", eatenAt: "x" });
    expect(e).toMatchObject({ source: "saved_food", confidence: "logged", saved_food_id: "s1", grams: 350 });
  });

  it("keeps database provenance for a saved USDA food", () => {
    const c = fromSavedFood({ ...saved, source: "usda", source_url: "https://fdc.nal.usda.gov/1" });
    expect(c.confidence).toBe("database");
    expect(c.sourceName).toBe("USDA FoodData Central");
  });

  it("saves the chosen portion as the serving", () => {
    const c = fromSearchResult(search());
    expect(savedFoodFromPortion(c, 1, 200, true)).toMatchObject({ serving_amount: 200, serving_unit: "g", calories: 330, grams: 200, is_favorite: true, source: "usda" });
    expect(savedFoodFromEntry(row({ source: "saved_meal" }))).toMatchObject({ serving_amount: 200, serving_unit: "g", calories: 330, source: "manual" });
  });
});

describe("re-logging an entry", () => {
  it("keeps the unit, amount and provenance", () => {
    const c = fromEntry(row({ source: "photo_ai", confidence: "estimate", unit: "plate", amount: 1, grams: 450, base_amount: 1, base_calories: 820 }));
    expect(c.units.map((u) => u.unit)).toEqual(["plate", "g"]);
    expect(c.defaultAmount).toBe(1);
    expect(c.confidence).toBe("estimate");
    expect(portion(c.units[1], 225).macros.calories).toBe(410);
  });
});

describe("units", () => {
  it("normalizes common spellings and picks sensible steps", () => {
    expect(normalizeUnit("Grams")).toBe("g");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeUnit("container (170g)")).toBeNull();
    expect(stepFor("g")).toBe(5);
    expect(stepFor("serving")).toBe(0.25);
  });
});

describe("manual + clone", () => {
  it("stores typed macros as the base so a later 200 g → 300 g edit recalculates", () => {
    const m = manualEntry(
      { name: "Chicken thigh", brand: null, amount: 200, unit: "g", macros: { calories: 418, protein: 52, carbs: 0, fat: 22 } },
      { id: "m1", meal: "dinner", date: "2026-10-16", eatenAt: "t" },
    );
    expect(m).toMatchObject({ amount: 200, grams: 200, base_amount: 200, base_calories: 418, source: "manual", confidence: "logged" });
    const u = rescaleEntry({ ...row(), ...m } as FoodRow, 300);
    expect(u).toMatchObject({ calories: 627, protein_g: 78, fat_g: 33, grams: 300 });
  });

  it("copies an entry to another day with fresh ids", () => {
    const c = cloneEntry(row({ meal_group_id: "old", source: "photo_ai", confidence: "estimate" }), { id: "n", date: "2026-10-17", eatenAt: "x", groupId: "new" });
    expect(c).toMatchObject({ id: "n", local_date: "2026-10-17", meal_group_id: "new", source: "photo_ai", confidence: "estimate", base_calories: 165, amount: 200 });
    expect("user_id" in c).toBe(false);
  });
});
