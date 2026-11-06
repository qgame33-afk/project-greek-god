import { describe, expect, it } from "vitest";
import { getExercise } from "@/lib/training/library";
import { TWOSET_TEMPLATES } from "@/lib/training/program-twoset";
import { dayTemplateLabel, planAdd, planSwap, siblingKey } from "./plan-change";

const armsA = TWOSET_TEMPLATES.find((t) => t.key === "arms_a")!;

describe("Every time: the template change", () => {
  it("pairs each day with its other rotation", () => {
    expect(siblingKey("arms_a")).toBe("arms_b");
    expect(siblingKey("chest_b")).toBe("chest_a");
    expect(siblingKey("push_a")).toBe("push_b");
    expect(siblingKey("rest")).toBeNull();
    expect(siblingKey(null)).toBeNull();
    expect(siblingKey("custom_a")).toBeNull();
  });

  it("swaps the lift in place, keeping its sets and position, and leaves the rest alone", () => {
    const next = planSwap(armsA, "incline-db-curl", getExercise("preacher-curl")!)!;
    const i = armsA.exercises.findIndex((e) => e.slug === "incline-db-curl");
    expect(next.exercises[i]).toMatchObject({ slug: "preacher-curl", name: "Preacher Curl", sets: 2, repLow: 8, repHigh: 12, rir: "0" });
    expect(next.exercises.filter((_, j) => j !== i)).toEqual(armsA.exercises.filter((_, j) => j !== i));
    // the built-in template object is not mutated
    expect(armsA.exercises[i].slug).toBe("incline-db-curl");
    expect(planSwap(armsA, "back-squat", getExercise("preacher-curl")!)).toBeNull();
    expect(planSwap(armsA, "incline-db-curl", getExercise("incline-db-curl")!)).toBeNull();
  });

  it("adds a lift at the end with two sets, once", () => {
    const next = planAdd(armsA, getExercise("db-shrug")!)!;
    expect(next.exercises).toHaveLength(armsA.exercises.length + 1);
    expect(next.exercises.at(-1)).toMatchObject({ slug: "db-shrug", sets: 2 });
    expect(planAdd(next, getExercise("db-shrug")!)).toBeNull();
  });

  it("names a day by its weekdays", () => {
    expect(dayTemplateLabel("Arms & Shoulders", [1])).toBe("Monday's Arms & Shoulders");
    expect(dayTemplateLabel("Push A", [])).toBe("Push A");
  });
});
