import { describe, expect, it } from "vitest";
import { fieldLabel, planApply } from "./apply";
import type { CoachSuggestion } from "./types";

const profile = { calorie_goal: 3300, protein_goal: 185, carb_goal: 449, fat_goal: 85, water_goal_ml: 3000, training_mode: "standard" };
const sug = (over: Partial<CoachSuggestion>): CoachSuggestion => ({
  id: "x",
  kind: "calorie_goal",
  title: "t",
  rationale: "r",
  field: "calorie_goal",
  current: 3300,
  proposed: 3500,
  currentLabel: null,
  proposedLabel: null,
  status: "open",
  ...over,
});

describe("planApply", () => {
  it("moves carbs with a calorie change so macros still add up", () => {
    const p = planApply(sug({}), profile)!;
    expect(p.values).toEqual({ calorie_goal: 3500, carb_goal: 499 });
    expect(p.previous).toEqual({ calorie_goal: 3300, carb_goal: 449 });
    expect(p.effects[0]).toMatch(/449 g to 499 g/);
  });

  it("keeps calories fixed when protein changes", () => {
    const p = planApply(sug({ kind: "protein_goal", field: "protein_goal", current: 185, proposed: 170 }), profile)!;
    expect(p.values).toEqual({ protein_goal: 170, carb_goal: 464 });
    expect(p.effects[0]).toMatch(/stays at 3,300 kcal/);
  });

  it("never pushes carbs below a floor", () => {
    const p = planApply(sug({ proposed: 1500 }), { ...profile, protein_goal: 200, fat_goal: 100 })!;
    expect(p.values).toEqual({ calorie_goal: 1500 });
  });

  it("handles water, modes, deloads and notes", () => {
    expect(planApply(sug({ kind: "water_goal_ml", field: "water_goal_ml", proposed: 3500 }), profile)!.values).toEqual({ water_goal_ml: 3500 });
    const d = planApply(sug({ kind: "deload_week", field: "training_mode", current: "standard", proposed: "deload" }), profile)!;
    expect(d.values).toEqual({ training_mode: "deload" });
    expect(d.previous).toEqual({ training_mode: "standard" });
    expect(d.effects.join(" ")).toMatch(/Switch back to Standard/);
    expect(planApply(sug({ kind: "note", field: null, proposed: null }), profile)).toBeNull();
  });

  it("labels fields", () => {
    expect(fieldLabel(sug({}))).toBe("Calorie target");
    expect(fieldLabel(sug({ kind: "deload_week", field: "training_mode" }))).toBe("Deload week");
  });
});
