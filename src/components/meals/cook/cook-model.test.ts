import { describe, expect, it } from "vitest";
import { clampStep, dragOffset, kitchenText, resumeStep, stepOf, swipeIntent } from "./cook-model";

describe("cooking mode navigation", () => {
  it("keeps the step inside the recipe", () => {
    expect(clampStep(-1, 4)).toBe(0);
    expect(clampStep(9, 4)).toBe(3);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(Number.NaN, 4)).toBe(0);
    expect(clampStep(3, 0)).toBe(0);
    expect(stepOf(1, 5)).toBe("Step 2 of 5");
  });

  it("reads a sideways swipe: left for next, right for back", () => {
    const width = 390;
    expect(swipeIntent({ dx: -120, dy: 8, ms: 400, width })).toBe("next");
    expect(swipeIntent({ dx: 120, dy: -10, ms: 400, width })).toBe("prev");
    // a quick flick counts even when short
    expect(swipeIntent({ dx: -40, dy: 4, ms: 60, width })).toBe("next");
    // a slow short drag doesn't
    expect(swipeIntent({ dx: -40, dy: 4, ms: 500, width })).toBeNull();
    // mostly vertical = scrolling, never a step change
    expect(swipeIntent({ dx: -120, dy: 140, ms: 300, width })).toBeNull();
    // a tap
    expect(swipeIntent({ dx: 3, dy: 2, ms: 90, width })).toBeNull();
  });

  it("resists dragging past the first or last step", () => {
    expect(dragOffset(90, true, false)).toBe(30);
    expect(dragOffset(-90, false, true)).toBe(-30);
    expect(dragOffset(-90, true, false)).toBe(-90);
  });

  it("picks up where you left off, skipping steps already done", () => {
    expect(resumeStep([], 4, 0)).toBe(0);
    expect(resumeStep([0, 1], 4, 2)).toBe(2);
    expect(resumeStep([0, 1], 4, 0)).toBe(2);
    expect(resumeStep([0, 1, 2, 3], 4, 1)).toBe(3);
    expect(resumeStep([], 4, 7)).toBe(3);
  });
});

describe("step text", () => {
  it("keeps numbers with their units on one line", () => {
    expect(kitchenText("cut it into 2 cm cubes")).toBe("cut it into 2\u00A0cm cubes");
    expect(kitchenText("Cook to 74 °C (165 °F) inside, about 6 minutes.")).toBe("Cook to 74\u00A0°C (165\u00A0°F) inside, about 6\u00A0minutes.");
    expect(kitchenText("Add 2 eggs and 1 tbsp butter")).toBe("Add 2 eggs and 1\u00A0tbsp butter");
    // words that merely start like a unit stay as they are
    expect(kitchenText("Use 2 games")).toBe("Use 2 games");
  });
});
