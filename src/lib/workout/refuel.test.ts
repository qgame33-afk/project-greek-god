import { describe, expect, it } from "vitest";
import type { PlanMeal } from "@/lib/data/meals-model";
import type { Recipe } from "@/lib/meals/types";
import { pickRefuel, type RefuelMeal } from "./refuel";

const DATE = "2026-10-19";
// Planned times (minutes since midnight) and protein per meal, as resolve() would compute them.
const TIMES: Record<string, { at: number; protein: number }> = {
  breakfast: { at: 7 * 60, protein: 40 },
  smoothie: { at: 15 * 60 + 30, protein: 24 },
  dinner: { at: 18 * 60 + 30, protein: 54 },
  tomorrow: { at: 18 * 60 + 30, protein: 50 },
};
const meal = (id: string, local_date = DATE) => ({ id, local_date, recipe_key: id, servings: 1, slot: "dinner", position: 0 }) as unknown as PlanMeal;
const MEALS = [meal("breakfast"), meal("smoothie"), meal("dinner"), meal("tomorrow", "2026-10-20")];
const resolve = (m: PlanMeal): RefuelMeal | null =>
  TIMES[m.id] ? { planned: m, recipe: { key: m.id, name: m.id } as unknown as Recipe, at: TIMES[m.id].at, protein: TIMES[m.id].protein, kcal: 500, carbs: 50, fat: 15 } : null;
const base = { date: DATE, goal: 185, proteinEaten: 40, meals: MEALS, resolve, endMin: 15 * 60 + 12 };

describe("pickRefuel", () => {
  it("offers the first uneaten planned meal of the day at or after the session's end (less 30 min)", () => {
    const r = pickRefuel({ ...base, isLogged: (id) => id === "breakfast" });
    expect(r.kind).toBe("meal");
    expect(r.meal?.planned.id).toBe("smoothie");
    expect(r.gap).toBe(145);
  });

  it("a meal planned up to 30 minutes before the end still counts; earlier ones don't", () => {
    expect(pickRefuel({ ...base, endMin: 16 * 60, isLogged: () => false }).meal?.planned.id).toBe("smoothie");
    expect(pickRefuel({ ...base, endMin: 16 * 60 + 1, isLogged: () => false }).meal?.planned.id).toBe("dinner");
  });

  it("keeps confirming the meal just marked eaten — never the next one beside 'Eaten'", () => {
    // the smoothie was tapped Eaten and the food log holds it: the card stays on the smoothie
    const r = pickRefuel({ ...base, keepId: "smoothie", isLogged: (id) => id === "breakfast" || id === "smoothie" });
    expect(r.kind).toBe("eaten");
    expect(r.meal?.planned.id).toBe("smoothie");
  });

  it("without the note, a logged meal is passed over for the next one", () => {
    const r = pickRefuel({ ...base, isLogged: (id) => id === "breakfast" || id === "smoothie" });
    expect(r.kind).toBe("meal");
    expect(r.meal?.planned.id).toBe("dinner");
  });

  it("an eaten note whose meal is no longer logged (undone, or the log failed) offers that meal again", () => {
    const r = pickRefuel({ ...base, keepId: "smoothie", isLogged: (id) => id === "breakfast" });
    expect(r.kind).toBe("meal");
    expect(r.meal?.planned.id).toBe("smoothie");
  });

  it("the eaten confirmation wins over 'goal reached' (that meal is what closed it)", () => {
    const r = pickRefuel({ ...base, proteinEaten: 190, keepId: "smoothie", isLogged: (id) => id === "smoothie" });
    expect(r.kind).toBe("eaten");
    expect(pickRefuel({ ...base, proteinEaten: 190, isLogged: () => false }).kind).toBe("met");
  });

  it("only today's meals count, and a meal with an unknown recipe is skipped", () => {
    const r = pickRefuel({ ...base, endMin: 19 * 60 + 1, isLogged: () => false });
    expect(r.kind).toBe("none");
    const unknown = pickRefuel({ ...base, meals: [meal("mystery"), meal("dinner")], isLogged: () => false });
    expect(unknown.meal?.planned.id).toBe("dinner");
    expect(pickRefuel({ ...base, keepId: "tomorrow", isLogged: () => true }).kind).not.toBe("eaten");
  });

  it("never reports a negative gap, and an unknown goal never reads as met", () => {
    expect(pickRefuel({ ...base, proteinEaten: 250, isLogged: () => true }).gap).toBe(0);
    const noGoal = pickRefuel({ ...base, goal: 0, proteinEaten: 0, isLogged: () => false });
    expect(noGoal.kind).toBe("meal");
    expect(noGoal.gap).toBe(0);
  });
});
