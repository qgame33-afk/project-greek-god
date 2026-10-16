import { describe, expect, it } from "vitest";
import { clampDay } from "./format";
import { distinctRecent } from "./group";
import { parseFoodNumber } from "./number";
import { directEdit, type FoodRow } from "./portion";
import { emptyForm, previewMacros, validateFoodForm } from "./validate";

describe("parseFoodNumber", () => {
  it("reads thousands separators as grouping, never as a decimal point", () => {
    expect(parseFoodNumber("1,200")).toBe(1200);
    expect(parseFoodNumber("12,000")).toBe(12000);
    expect(parseFoodNumber("1,234,567.5")).toBe(1234567.5);
    expect(parseFoodNumber(" 1,000 ")).toBe(1000);
  });

  it("reads a lone decimal comma as a decimal", () => {
    expect(parseFoodNumber("12,5")).toBe(12.5);
    expect(parseFoodNumber("0,5")).toBe(0.5);
    expect(parseFoodNumber("1,25")).toBe(1.25);
  });

  it("parses plain numbers", () => {
    expect(parseFoodNumber("540")).toBe(540);
    expect(parseFoodNumber("12.5")).toBe(12.5);
    expect(parseFoodNumber(".5")).toBe(0.5);
    expect(parseFoodNumber("5.")).toBe(5);
    expect(parseFoodNumber(7)).toBe(7);
    expect(parseFoodNumber("-5")).toBe(-5);
  });

  it("rejects anything ambiguous or malformed", () => {
    for (const bad of ["", "  ", "abc", "1.234,5", "1,2,3", "12,34,5", "1e3", "0,500,000", "1..2", "Infinity", "--1"]) {
      expect(parseFoodNumber(bad), bad).toBeNull();
    }
    expect(parseFoodNumber(Number.NaN)).toBeNull();
    expect(parseFoodNumber(null)).toBeNull();
  });
});

describe("manual validation with separators", () => {
  it("stores '1,200' kcal as 1200, not 1", () => {
    const r = validateFoodForm({ ...emptyForm(), name: "Burrito", calories: "1,200", amount: "1,000", unit: "g" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.macros.calories).toBe(1200);
      expect(r.value.amount).toBe(1000);
    }
  });

  it("explains a number it can't read instead of guessing", () => {
    const r = validateFoodForm({ ...emptyForm(), name: "x", calories: "1.234,5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.calories).toMatch(/number/);
  });

  it("previews grouped numbers correctly", () => {
    expect(previewMacros({ calories: "1,200", protein: "40", carbs: "", fat: "" }).macros.calories).toBe(1200);
  });
});

describe("clampDay", () => {
  it("rejects impossible dates instead of rolling them into another day", () => {
    expect(clampDay("2026-02-31", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("2026-13-01", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("0000-01-01", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("2026-10-15", "2026-10-16")).toBe("2026-10-15");
    expect(clampDay("2027-01-01", "2026-10-16")).toBe("2026-10-16");
  });
});

describe("distinctRecent", () => {
  it("keeps the newest row per food and respects the limit", () => {
    const rows = [
      { id: "a", name: "Oats", unit: "g", base_amount: 100 },
      { id: "b", name: "oats ", unit: "g", base_amount: 100 },
      { id: "c", name: "Oats", unit: "cup", base_amount: 1 },
      { id: "d", name: "Rice", unit: "g", base_amount: 100 },
    ];
    expect(distinctRecent(rows, 40).map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(distinctRecent(rows, 2).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("directEdit keeps a pure rescale as a rescale", () => {
  const usda: FoodRow = {
    id: "e1",
    user_id: "u",
    local_date: "2026-10-16",
    eaten_at: "2026-10-16T12:30:00.000Z",
    meal: "lunch",
    name: "Chicken breast",
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
    source: "usda",
    confidence: "database",
    source_name: "USDA FoodData Central",
    source_url: "https://fdc.nal.usda.gov/x",
    meal_group_id: null,
    saved_food_id: null,
    photo_path: null,
    created_at: "",
    updated_at: "",
  };

  it("an amount carried over from 'Adjust amount' keeps the base and USDA provenance", () => {
    const u = directEdit(usda, { amount: 300, unit: "g", macros: { calories: 495, protein: 93, carbs: 0, fat: 10.8 } });
    expect(u).toMatchObject({ amount: 300, calories: 495, base_amount: 100, base_calories: 165 });
    expect(u.source).toBeUndefined();
    expect(u.source_url).toBeUndefined();
  });

  it("new numbers still become the user's own", () => {
    const u = directEdit(usda, { amount: 300, unit: "g", macros: { calories: 520, protein: 93, carbs: 0, fat: 10.8 } });
    expect(u).toMatchObject({ base_amount: 300, base_calories: 520, source: "manual", source_url: null });
  });
});
