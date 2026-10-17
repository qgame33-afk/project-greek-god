import { describe, expect, it } from "vitest";
import { towerTier } from "./SetTower";

const cell = (load: string | null, work: string | null) => ({ load, work });

describe("towerTier", () => {
  it("keeps the large pair when every value fits", () => {
    expect(towerTier([cell("185", "8"), cell("190", "5"), cell("190", "8")], 90)).toBe(0);
  });

  it("drops one step for a long load", () => {
    expect(towerTier([cell("+17.5", "9"), cell("+17.5", "7")], 90)).toBe(1);
  });

  it("drops to the small pair for a long load with two-digit reps, for the whole tower", () => {
    expect(towerTier([cell("+17.5", "10"), cell("+17.5", "9"), cell("+17.5", "7")], 90)).toBe(2);
    expect(towerTier([cell("1,000", "10"), cell("185", "8")], 84)).toBe(2);
  });

  it("sizes a reps-only cell as the load", () => {
    expect(towerTier([cell(null, "12")], 84)).toBe(0);
    expect(towerTier([cell(null, "0:45")], 60)).toBe(1);
  });

  it("falls back to the smallest pair when nothing fits", () => {
    expect(towerTier([cell("12,345.5", "100")], 40)).toBe(2);
  });

  it("ignores cells with no values", () => {
    expect(towerTier([cell(null, null), cell("185", "8")], 90)).toBe(0);
  });
});
