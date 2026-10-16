import { describe, expect, it } from "vitest";
import { DURATION, navDirection } from "./motion";

describe("navDirection", () => {
  it("pushes deeper into a section and pops back out", () => {
    expect(navDirection("/training", "/training/exercise/barbell-bench-press")).toBe("push");
    expect(navDirection("/training/exercise/barbell-bench-press", "/training")).toBe("pop");
    expect(navDirection("/nutrition", "/nutrition/meals")).toBe("push");
    expect(navDirection("/nutrition/meals/recipe/lib:eggs", "/nutrition/meals")).toBe("pop");
    expect(navDirection("/reviews", "/reviews/2026-09")).toBe("push");
  });

  it("moves laterally across sections in tab order", () => {
    expect(navDirection("/", "/training")).toBe("forward");
    expect(navDirection("/progress", "/nutrition")).toBe("back");
    expect(navDirection("/coach", "/settings")).toBe("forward");
    expect(navDirection("/settings", "/")).toBe("back");
    // leaving a detail page for another tab is still lateral
    expect(navDirection("/training/exercise/x", "/progress")).toBe("forward");
  });

  it("treats a detail page in another section as a push", () => {
    expect(navDirection("/progress", "/reviews/2026-09")).toBe("push");
  });

  it("slides the live workout in and out as a layer", () => {
    expect(navDirection("/", "/workout/abc")).toBe("push");
    expect(navDirection("/workout/abc", "/training")).toBe("pop");
    expect(navDirection("/workout/start", "/workout/abc")).toBe("fade");
  });

  it("crossfades same-depth swaps, onboarding and unknown routes", () => {
    expect(navDirection("/reviews/2026-09", "/reviews/2026-08")).toBe("fade");
    expect(navDirection("/onboarding", "/")).toBe("fade");
    expect(navDirection("/somewhere", "/")).toBe("fade");
  });

  it("ignores query strings, trailing slashes and the first load", () => {
    expect(navDirection("/progress?tab=weight", "/progress?tab=body")).toBe("none");
    expect(navDirection("/training/", "/training")).toBe("none");
    expect(navDirection(null, "/")).toBe("none");
  });
});

describe("motion tokens", () => {
  it("keep UI feedback inside 150–250 ms", () => {
    expect(DURATION.fast).toBeGreaterThanOrEqual(150);
    expect(DURATION.base).toBeLessThanOrEqual(250);
    expect(DURATION.press).toBeLessThan(DURATION.fast);
  });
});
