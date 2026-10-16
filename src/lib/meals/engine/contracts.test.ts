// The engine's outputs feed the data layer (src/lib/data/meals-model.ts) unchanged: these
// types must stay assignable and the data layer's own validators must accept the values.

import { describe, expect, it } from "vitest";
import {
  cleanGroceryInput,
  feedbackToRow,
  mergeGroceryItems,
  plannedMealPatchToRow,
  validateNewMeals,
  type GroceryItemInput,
  type NewFeedback,
  type NewPlannedMeal,
  type PlannedMealPatch,
  type PlanMeal,
} from "@/lib/data/meals-model";
import { DEFAULT_PREFS } from "../types";
import { buildGroceryList, toGroceryInput } from "./grocery";
import { buildPool, generateWeek, moveMeal, regenerateMeal, repeatMeal, setServings, type EngineMeal, type FeedbackDraft, type MealPatch } from "./plan";

const WEEK = "2026-10-12";
const POOL = buildPool([]);
const lookup = (k: string) => POOL.find((r) => r.key === k);
const ctx = { weekStart: WEEK, goals: { kcal: 3300, protein: 185 }, prefs: DEFAULT_PREFS, pool: POOL, now: "2026-10-16T12:00:00Z", seed: "contract" };

describe("engine ↔ data layer contracts", () => {
  const week = generateWeek(ctx);
  const saved: PlanMeal[] = week.meals.map((m, i) => ({ ...m, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, plan_id: "p", created_at: "", updated_at: "" }));

  it("generateWeek output is a valid useSavePlan input", () => {
    const meals: NewPlannedMeal[] = week.meals; // compile-time: assignable
    expect(() => validateNewMeals(meals, WEEK)).not.toThrow();
  });

  it("stored meals are valid engine input, and patches are valid useUpdatePlannedMeal patches", () => {
    const asEngine: EngineMeal[] = saved; // compile-time: PlanMeal → EngineMeal
    const res = regenerateMeal({ ...ctx, meals: asEngine }, asEngine[2], [], { reason: "too_complicated" });
    if (!res.ok) throw new Error(res.message);
    const patch: PlannedMealPatch = res.patch; // compile-time
    expect(() => plannedMealPatchToRow(patch)).not.toThrow();
    const fb: NewFeedback = res.feedback!; // compile-time
    expect(feedbackToRow(fb, "id")).toMatchObject({ event: "regenerated", reason: "too_complicated", recipe_key: asEngine[2].recipe_key });
    const move = moveMeal(asEngine, asEngine[2].id!, { local_date: "2026-10-13" }, lookup);
    if (!move.ok) throw new Error(move.message);
    for (const p of move.patches) expect(() => plannedMealPatchToRow(p.patch satisfies MealPatch)).not.toThrow();
    const rep = repeatMeal(asEngine, asEngine[3].id!, { local_date: "2026-10-14" }, lookup);
    if (!rep.ok) throw new Error(rep.message);
    if (rep.kind === "add") expect(() => validateNewMeals([rep.meal], WEEK)).not.toThrow();
    else expect(() => plannedMealPatchToRow(rep.patch)).not.toThrow();
    const draft: FeedbackDraft = rep.feedback;
    expect(feedbackToRow(draft, "id").event).toBe("repeated");
    expect(() => plannedMealPatchToRow(setServings(2.6))).not.toThrow();
  });

  it("the grocery list is a valid sync_grocery_items input", () => {
    const list = buildGroceryList(week.meals, lookup, { pantry: ["eggs"], weeklyBudgetCad: 120 });
    const input: GroceryItemInput[] = toGroceryInput(list.items); // compile-time
    expect(cleanGroceryInput(input)).toHaveLength(input.length);
    const merged = mergeGroceryItems([], input, { planId: "p", userId: "u", now: "", newId: () => "x" });
    expect(merged.find((i) => i.key === "eggs")?.have).toBe(true);
  });
});
