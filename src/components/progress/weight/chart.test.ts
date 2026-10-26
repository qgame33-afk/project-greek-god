import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { LB_PER_KG } from "@/lib/units";
import { chartGeometry, chartSentence, defaultRange, rangeDomain, yScale } from "./chart";

const today = "2026-10-22";
const weighIns = Array.from({ length: 20 }, (_, i) => ({ date: addDays(today, -38 + i * 2), lb: 163 + i * 0.12 }));
const series = weighIns.map((w) => ({ date: w.date, lb: w.lb - 0.1 }));
const base = { width: 320, height: 170, range: "3m" as const, today, start: "2026-09-13", weighIns, series, unit: "lb" as const };

describe("Progress › Weight chart", () => {
  it("draws the dashed line only with a pace", () => {
    expect(chartGeometry({ ...base, lbPerWeek: 0.4 }).projection).not.toBeNull();
    expect(chartGeometry({ ...base, lbPerWeek: null }).projection).toBeNull();
  });

  it("starts the dashed line at the last 7-day average and carries the rate forward", () => {
    const g = chartGeometry({ ...base, lbPerWeek: 0.7 });
    expect(g.projection!.a).toEqual(g.now);
    expect(g.projection!.b.y).toBeLessThan(g.projection!.a.y);
  });

  it("puts one dot per weigh-in in range", () => {
    expect(chartGeometry({ ...base, lbPerWeek: 0.4 }).dots).toHaveLength(weighIns.length);
  });

  it("never opens a range on empty weeks before the first weigh-in", () => {
    expect(rangeDomain("3m", today, "2026-09-13", weighIns[0].date, false)[0]).toBe(weighIns[0].date);
    expect(rangeDomain("1m", today, null, null, false)[0]).toBe(addDays(today, -30));
  });

  it("labels three round values that hold every point", () => {
    const { lo, step } = yScale([73.9, 75.6]);
    expect(lo).toBeLessThanOrEqual(73.9);
    expect(lo + 2 * step).toBeGreaterThanOrEqual(75.6);
  });

  it("shows kilograms when the profile does (stored pounds converted once)", () => {
    const g = chartGeometry({ ...base, unit: "kg", lbPerWeek: 0.4 });
    for (const t of g.yTicks) expect(t.value).toBeLessThan(80);
    expect(chartSentence(g, "3m", 0.4, "kg")).toContain(`${Math.round((g.last!.lb / LB_PER_KG) * 10) / 10} kilograms`);
  });

  it("uses 3M for a young programme, then All", () => {
    expect(defaultRange("2026-09-13", today)).toBe("3m");
    expect(defaultRange("2026-01-01", today)).toBe("all");
  });
});
