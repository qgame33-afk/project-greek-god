import { describe, expect, it } from "vitest";
import { estimateTitle, findReplaced, inferMeal, mealAtMinute, replacedPhrase, type PlannedLite } from "./replaces";

const day: PlannedLite[] = [
  { id: "b", slot: "breakfast", name: "Peanut-butter banana toast", eaten: true, at: 460 },
  { id: "s1", slot: "snack", name: "Rice cakes, honey & whey", eaten: false, at: 930 },
  { id: "d", slot: "dinner", name: "Honey-garlic salmon, rice & broccoli", eaten: false, at: 1110 },
  { id: "s2", slot: "snack", name: "Greek yogurt and berries", eaten: false, at: 1290 },
];

describe("replacedPhrase", () => {
  it("reads the words after instead of / in place of / rather than", () => {
    expect(replacedPhrase("3 slices of pepperoni pizza instead of the salmon")).toBe("the salmon");
    expect(replacedPhrase("Had a burrito in place of lunch, it was huge")).toBe("lunch");
    expect(replacedPhrase("two eggs rather than the yogurt.")).toBe("the yogurt");
  });
  it("is null when no swap is named", () => {
    expect(replacedPhrase("3 slices of pepperoni pizza")).toBeNull();
    expect(replacedPhrase("instead of")).toBeNull();
  });
});

describe("findReplaced", () => {
  it("matches the planned meal by name", () => {
    expect(findReplaced("3 slices of pepperoni pizza instead of the salmon", day)?.id).toBe("d");
    expect(findReplaced("a shake instead of the rice cakes", day)?.id).toBe("s1");
  });
  it("matches by slot word", () => {
    expect(findReplaced("pizza instead of dinner", day)?.id).toBe("d");
    expect(findReplaced("a bar instead of my snack", day)?.id).toBe("s1");
  });
  it("never picks an eaten meal and returns null without a match", () => {
    expect(findReplaced("pizza instead of the toast", day)).toBeNull();
    expect(findReplaced("pizza instead of sushi", day)).toBeNull();
    expect(findReplaced("pizza", day)).toBeNull();
  });
});

describe("inferMeal", () => {
  it("prefers the chosen slot, then the replaced meal, then the AI hint, then the clock", () => {
    const d = day[2];
    expect(inferMeal({ chosen: "lunch", replaced: d, hint: "breakfast", nowMin: 600 })).toBe("lunch");
    expect(inferMeal({ replaced: d, hint: "breakfast", nowMin: 600 })).toBe("dinner");
    expect(inferMeal({ replaced: day[1], hint: null, nowMin: 600 })).toBe("snacks");
    expect(inferMeal({ replaced: null, hint: "breakfast", nowMin: 1200 })).toBe("breakfast");
    expect(inferMeal({ replaced: null, hint: "unknown", nowMin: 1200 })).toBe("dinner");
  });
  it("uses the diary's time windows", () => {
    expect(mealAtMinute(7 * 60)).toBe("breakfast");
    expect(mealAtMinute(10 * 60 + 30)).toBe("lunch");
    expect(mealAtMinute(15 * 60)).toBe("dinner");
    expect(mealAtMinute(20 * 60 + 30)).toBe("snacks");
  });
});

describe("estimateTitle", () => {
  it("names one, two or many items", () => {
    expect(estimateTitle(["Pepperoni pizza"])).toBe("Pepperoni pizza");
    expect(estimateTitle(["Hard-boiled eggs", "Plain bagels"])).toBe("Hard-boiled eggs and plain bagels");
    expect(estimateTitle(["Hard-boiled eggs", "Plain bagels", "Protein shake"])).toBe("Hard-boiled eggs, plain bagels and 1 more");
    expect(estimateTitle([])).toBe("Your meal");
  });
});
