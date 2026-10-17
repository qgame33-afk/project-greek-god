import { describe, expect, it } from "vitest";
import { changeTone, planFromProfile, planRatePerWeek, programmeWeek, rateTone } from "./plan";
import { climbFraction, scaleGeometry } from "./scale";

describe("plan", () => {
  const plan = planFromProfile({ start_date: "2026-10-01", target_date: "2027-08-01", start_weight_lb: 163, goal_weight_lb: 183 }, "2026-10-16");

  it("reads the profile with defaults", () => {
    expect(plan).toEqual({ startDate: "2026-10-01", targetDate: "2027-08-01", startLb: 163, goalLb: 183 });
    expect(planFromProfile(null, "2026-10-16")).toEqual({ startDate: "2026-10-16", targetDate: "2027-08-01", startLb: 163, goalLb: 183 });
    expect(planFromProfile({ start_weight_lb: "170.5" as unknown as number }, "2026-10-16").startLb).toBe(170.5);
  });

  it("computes the planned weekly rate (~0.46 lb/wk for 163→183 over 10 months)", () => {
    const r = planRatePerWeek(plan)!;
    expect(r).toBeGreaterThan(0.45);
    expect(r).toBeLessThan(0.48);
    expect(planRatePerWeek({ ...plan, targetDate: "2026-09-01" })).toBeNull();
  });

  it("colours deltas by the plan, not the sign", () => {
    const r = 0.46;
    expect(rateTone(0.46, r)).toBe("success");
    expect(rateTone(0.25, r)).toBe("success"); // ≥ 0.5r
    expect(rateTone(0.2, r)).toBe("neutral");
    expect(rateTone(0.8, r)).toBe("neutral"); // between 1.6r and 2r
    expect(rateTone(1.0, r)).toBe("warning"); // > 2r — faster than plan
    expect(rateTone(-0.3, r)).toBe("neutral"); // losing on a gaining plan is quiet, never red
    expect(rateTone(null, r)).toBe("neutral");
    expect(rateTone(0.4, 0)).toBe("neutral");
    // a losing plan mirrors
    expect(rateTone(-0.5, -0.5)).toBe("success");
    // 30-day change scaled to weekly
    expect(changeTone(2.0, 30, r)).toBe("success");
    expect(changeTone(6.0, 30, r)).toBe("warning");
  });

  it("reports the programme week", () => {
    expect(programmeWeek(plan, "2026-10-01")).toEqual({ week: 1, total: 44 });
    expect(programmeWeek(plan, "2026-10-16").week).toBe(3);
    expect(programmeWeek(plan, "2028-01-01").week).toBe(44);
  });
});

describe("ascent scale geometry", () => {
  it("runs from start to goal with a tick every lb and labels every 5", () => {
    const g = scaleGeometry({ width: 348, start: 163, goal: 183, avg: 166.4, plan: 164.5, pad: 14 });
    expect(g.lo).toBe(163);
    expect(g.hi).toBe(183);
    expect(g.step).toBe(1);
    expect(g.labelEvery).toBe(5);
    expect(g.ticks).toHaveLength(21);
    expect(g.ticks.filter((t) => t.major).map((t) => t.label)).toEqual(["165", "170", "175", "180"]);
    expect(g.startX).toBe(14);
    expect(g.goalX).toBe(334);
    // needle at the 7-day average, PLAN needle at the planned weight
    expect(g.avgX).toBeCloseTo(14 + (3.4 / 20) * 320, 1);
    expect(g.planX).toBeCloseTo(14 + (1.5 / 20) * 320, 1);
    expect(g.avgOutside).toBe(false);
  });

  it("extends the domain when the average falls outside start→goal", () => {
    const g = scaleGeometry({ width: 300, start: 163, goal: 183, avg: 161.2, plan: null });
    expect(g.lo).toBe(161);
    expect(g.avgOutside).toBe(true);
    expect(g.avgX).toBeLessThan(g.startX);
    expect(g.planX).toBeNull();
  });

  it("thins ticks on narrow rulers so they never crowd", () => {
    const g = scaleGeometry({ width: 120, start: 60, goal: 120, avg: null, plan: null, pad: 10 });
    const gap = g.ticks[1].x - g.ticks[0].x;
    expect(gap).toBeGreaterThanOrEqual(6);
    const majors = g.ticks.filter((t) => t.major);
    expect(majors[1].x - majors[0].x).toBeGreaterThanOrEqual(30);
  });

  it("keeps the start on the left for a losing plan", () => {
    const g = scaleGeometry({ width: 200, start: 90, goal: 80, avg: 88, plan: null, pad: 0 });
    expect(g.reversed).toBe(true);
    expect(g.startX).toBe(0);
    expect(g.goalX).toBe(200);
    expect(g.avgX).toBe(40);
  });

  it("climb fraction clamps", () => {
    expect(climbFraction(173, 163, 183)).toBe(0.5);
    expect(climbFraction(150, 163, 183)).toBe(0);
    expect(climbFraction(190, 163, 183)).toBe(1);
    expect(climbFraction(null, 163, 183)).toBe(0);
  });
});
