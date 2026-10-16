import { describe, expect, it } from "vitest";
import { canStep, clampServings, SERVING_STEPS, servingsNumber, stepServings } from "./servings";
import { checkScope, parseChecks, toggleIn } from "./checks";

describe("servings ladder", () => {
  it("walks quarter steps near one serving and doubles up for cooking for more", () => {
    expect(stepServings(1, 1)).toBe(1.25);
    expect(stepServings(1.25, 1)).toBe(1.5);
    expect(stepServings(2, 1)).toBe(2.5);
    expect(stepServings(4, 1)).toBe(5);
    expect(stepServings(1, -1)).toBe(0.75);
    // 1 → 2 → 4 is reachable and every value on the way is a ladder value
    let s = 1;
    const seen: number[] = [s];
    while (s < 4) seen.push((s = stepServings(s, 1)));
    expect(seen).toEqual([1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4]);
  });

  it("clamps at the planned-meal limits (0.25–6)", () => {
    expect(stepServings(6, 1)).toBe(6);
    expect(stepServings(0.25, -1)).toBe(0.25);
    expect(canStep(6, 1)).toBe(false);
    expect(canStep(0.25, -1)).toBe(false);
    expect(canStep(1, 1)).toBe(true);
    expect(clampServings(9)).toBe(6);
    expect(clampServings(0.1)).toBe(0.25);
    expect(clampServings(Number.NaN)).toBe(1);
    expect(clampServings(-2)).toBe(1);
  });

  it("steps off-ladder values to the next ladder value in that direction", () => {
    expect(stepServings(1.1, 1)).toBe(1.25);
    expect(stepServings(1.1, -1)).toBe(1);
    expect(stepServings(4.4, -1)).toBe(4);
    expect(stepServings(4.4, 1)).toBe(5);
  });

  it("has a strictly increasing ladder inside the stored range", () => {
    for (let i = 1; i < SERVING_STEPS.length; i++) expect(SERVING_STEPS[i]).toBeGreaterThan(SERVING_STEPS[i - 1]);
    expect(SERVING_STEPS[0]).toBe(0.25);
    expect(SERVING_STEPS[SERVING_STEPS.length - 1]).toBe(6);
  });

  it("reads as kitchen fractions", () => {
    expect(servingsNumber(1.25)).toBe("1¼");
    expect(servingsNumber(0.5)).toBe("½");
    expect(servingsNumber(2)).toBe("2");
    expect(servingsNumber(1.1)).toBe("1.1");
  });
});

describe("ingredient and step checklist storage", () => {
  it("scopes a checklist to the planned meal, or the recipe outside a plan", () => {
    expect(checkScope("lib:beef-tacos", "abc")).toBe("meal:abc:lib:beef-tacos");
    expect(checkScope("lib:beef-tacos")).toBe("recipe:lib:beef-tacos");
    expect(checkScope("lib:beef-tacos", null)).toBe("recipe:lib:beef-tacos");
  });

  it("reads stored state defensively", () => {
    expect(parseChecks(null)).toEqual({ ingredients: [], steps: [], current: 0, at: 0 });
    expect(parseChecks("not json")).toEqual({ ingredients: [], steps: [], current: 0, at: 0 });
    expect(parseChecks(JSON.stringify({ ingredients: ["egg", "egg", 3, "bread"], steps: [2, 0, "x", -1, 2.5, 1], current: 2, at: 5 }))).toEqual({
      ingredients: ["egg", "bread"],
      steps: [0, 1, 2],
      current: 2,
      at: 5,
    });
    expect(parseChecks(JSON.stringify({ current: -1 })).current).toBe(0);
    expect(parseChecks(JSON.stringify({ current: 1.5 })).current).toBe(0);
  });

  it("toggles items in and out", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleIn(["a"], "a", true)).toEqual(["a"]);
    expect(toggleIn(["a"], "b", false)).toEqual(["a"]);
  });
});
