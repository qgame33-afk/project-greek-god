import { describe, expect, it } from "vitest";
import { saveFailure } from "./errors";
import { formatAmount } from "./format";
import { fromSearchResult, portion, rescaleEntry, type FoodRow } from "./portion";
import { consistencyNote, limitError, LIMITS } from "./validate";
import { litersLeft, waterToGo } from "./water";

const row = (over: Partial<FoodRow>): FoodRow =>
  ({
    id: "e1",
    user_id: "u",
    local_date: "2026-10-16",
    eaten_at: "2026-10-16T12:00:00Z",
    meal: "lunch",
    name: "Large pizza",
    brand: null,
    amount: 1,
    unit: "serving",
    grams: null,
    calories: 3000,
    protein_g: 120,
    carbs_g: 300,
    fat_g: 140,
    base_amount: 1,
    base_calories: 3000,
    base_protein_g: 120,
    base_carbs_g: 300,
    base_fat_g: 140,
    source: "manual",
    confidence: "logged",
    source_name: null,
    source_url: null,
    saved_food_id: null,
    meal_group_id: null,
    photo_path: null,
    created_at: "",
    updated_at: "",
    ...over,
  }) as FoodRow;

const macrosOf = (u: ReturnType<typeof rescaleEntry>) => ({ calories: Number(u.calories), protein: Number(u.protein_g), carbs: Number(u.carbs_g), fat: Number(u.fat_g) });

describe("limitError (database limits before Save / Add)", () => {
  it("blocks a rescaled entry above 20,000 kcal with the number and the limit", () => {
    expect(limitError(macrosOf(rescaleEntry(row({}), 10)))).toBe("That's 30,000 kcal, above 20,000. Lower the amount.");
    expect(limitError(macrosOf(rescaleEntry(row({}), 6)))).toBeNull(); // 18,000 kcal fits
  });

  it("blocks grams above the macro limits", () => {
    const whey = row({ name: "Whey", amount: 30, unit: "g", calories: 110, protein_g: 27, carbs_g: 2, fat_g: 1, base_amount: 30, base_calories: 110, base_protein_g: 27, base_carbs_g: 2, base_fat_g: 1 });
    const m = macrosOf(rescaleEntry(whey, 2500));
    expect(m.protein).toBe(2250);
    expect(limitError(m)).toBe("That's 2,250 g protein, above 2,000 g. Lower the amount.");
  });

  it("checks a searched portion the same way (olive oil, 5,000 g)", () => {
    const per100 = { calories: 824, protein: 0, carbs: 0, fat: 91.6 };
    const c = fromSearchResult({
      id: "1",
      source: "off",
      name: "Olive oil",
      brand: null,
      servingAmount: 100,
      servingUnit: "g",
      servingGrams: 100,
      perServing: per100,
      per100g: per100,
      sourceName: null,
      sourceUrl: null,
    } as Parameters<typeof fromSearchResult>[0]);
    const p = portion(c.units[0], 5000);
    expect(p.macros.calories).toBe(41200);
    expect(limitError(p.macros)).toMatch(/^That's 41,200 kcal, above 20,000/);
  });

  it("allows exactly the limit", () => {
    expect(limitError({ calories: LIMITS.calories, protein: LIMITS.protein, carbs: LIMITS.carbs, fat: LIMITS.fat })).toBeNull();
  });
});

describe("consistencyNote", () => {
  it("flags 0 kcal when the macros say otherwise", () => {
    expect(consistencyNote({ calories: 0, protein: 50, carbs: 0, fat: 0 })).toBe("Macros add to 200 kcal; you entered 0.");
  });
  it("keeps 0 kcal fine for a food with no macros", () => {
    expect(consistencyNote({ calories: 0, protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
});

describe("number and copy consistency", () => {
  it("groups large amounts like kcal", () => {
    expect(formatAmount(6000, "g")).toBe("6,000 g");
    expect(formatAmount(100000, "serving")).toBe("100,000 servings");
    expect(formatAmount(1.25, "cup")).toBe("1.25 cups");
  });

  it("water drunk and to go add up to the goal as shown", () => {
    expect(litersLeft(3000, 250)).toBe("2.7"); // shown as 0.3 / 3.0 L
    expect(waterToGo(3000, 250)).toBe("2.7 L");
    expect(waterToGo(3000, 2960)).toBe("40 mL");
    expect(waterToGo(3000, 3000)).toBeNull();
    expect(waterToGo(0, 100)).toBeNull();
  });
});

describe("saveFailure", () => {
  it("explains offline and still offers Retry", () => {
    expect(saveFailure({ kind: "offline", message: "" })).toEqual({ text: "You're offline, so this wasn't saved. Your entry is kept. Retry once you're back online.", retry: true });
    expect(saveFailure({ kind: "offline", message: "" }, "meal").text).toBe("You're offline, so nothing was added. Retry once you're back online.");
  });
  it("never offers Retry for a value the database rejects", () => {
    const r = saveFailure({ kind: "invalid", message: "One of those values is out of range." });
    expect(r.retry).toBe(false);
    expect(r.text).not.toMatch(/Retry/);
  });
});
