import { describe, expect, it } from "vitest";
import { writtenRowIds, type GoalChangeRow } from "./written";

// newest first, as the query returns them
const rows: GoalChangeRow[] = [
  { id: "c2", field: "calorie_goal", old_value: 3300, new_value: 3400 },
  { id: "k2", field: "carb_goal", old_value: 449, new_value: 474 },
  { id: "c1", field: "calorie_goal", old_value: 3200, new_value: 3300 },
  { id: "w1", field: "water_goal_ml", old_value: 3000, new_value: 3500 },
];

describe("writtenRowIds", () => {
  it("finds the rows the save wrote for each changed field", () => {
    expect(writtenRowIds(rows, { calorie_goal: 3400, carb_goal: 474, protein_goal: 185 }, { calorie_goal: 3300, carb_goal: 449, protein_goal: 185 })).toEqual(["c2", "k2"]);
  });
  it("never takes an older change of the same field", () => {
    // the newest calorie row is 3300 → 3400, not this save's 3200 → 3300
    expect(writtenRowIds(rows, { calorie_goal: 3300 }, { calorie_goal: 3200 })).toEqual([]);
  });
  it("ignores fields with no history (names, units) and rows that don't match the values", () => {
    expect(writtenRowIds(rows, { display_name: "Q", water_goal_ml: 4000 }, { display_name: "Quinton", water_goal_ml: 3500 })).toEqual([]);
  });
  it("matches a first-ever value (no previous)", () => {
    expect(writtenRowIds([{ id: "g", field: "goal_weight_lb", old_value: null, new_value: 183 }], { goal_weight_lb: 183 }, { goal_weight_lb: null })).toEqual(["g"]);
  });
});
