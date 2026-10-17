import { describe, expect, it } from "vitest";
import { laurelGeometry } from "./Laurel";
import { gildDuration } from "./Statue";

describe("statue gild timing", () => {
  it("scales the Gild by distance inside 600–1400 ms", () => {
    expect(gildDuration(0.2, 0.2)).toBe(600);
    expect(gildDuration(0.2, 0.25)).toBeGreaterThan(600);
    expect(gildDuration(0, 1)).toBe(1400);
    expect(gildDuration(1, 0)).toBe(1400); // the gold tracks the trend down too
  });
});

describe("laurel geometry", () => {
  it("draws two stems and the asked number of leaves per branch, clamped to 6–12", () => {
    expect(laurelGeometry(9).stems).toHaveLength(2);
    expect(laurelGeometry(9).leaves).toHaveLength(18);
    expect(laurelGeometry(2).leaves).toHaveLength(12);
    expect(laurelGeometry(40).leaves).toHaveLength(24);
  });
  it("keeps every leaf inside the 100-unit box and leaves the top open", () => {
    const { leaves } = laurelGeometry(11);
    for (const l of leaves) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(100);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(100);
    }
    expect(Math.min(...leaves.map((l) => l.y))).toBeGreaterThan(14);
  });
});
