import { describe, expect, it } from "vitest";
import { planFromProfile, planRatePerWeek, programmeWeek } from "./plan";

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

  it("reports the programme week", () => {
    expect(programmeWeek(plan, "2026-10-01")).toEqual({ week: 1, total: 44 });
    expect(programmeWeek(plan, "2026-10-16").week).toBe(3);
    expect(programmeWeek(plan, "2028-01-01").week).toBe(44);
  });
});
