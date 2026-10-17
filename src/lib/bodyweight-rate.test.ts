import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { calorieSuggestion, calorieTargetRate } from "./bodyweight";
import { rateAt } from "./progress/pace";

const TODAY = "2026-10-17";
/** Daily weigh-ins on a straight line of `perWeek`, ending today. */
const line = (perWeek: number, days = 28, every = 1, end = TODAY, base = 168) =>
  Array.from({ length: days }, (_, i) => ({ local_date: addDays(end, -(days - 1) + i), weight_lb: base + (perWeek / 7) * i })).filter((_, i) => i % every === 0);

describe("calorieSuggestion: the least-squares rate (pace.rateAt) over the right window", () => {
  it("with no recent calorie change, judges the same 28 days (and number) the pace line shows", () => {
    const w = line(0.4);
    const s = calorieSuggestion(w, TODAY, 0.46, null);
    expect(s).toMatchObject({ kind: "on_track", ratePerWeek: 0.4, targetRate: 0.46, since: null, from: addDays(TODAY, -27), weighIns: 28 });
    if (s.kind === "on_track") expect(s.ratePerWeek).toBe(rateAt(w, TODAY).lbPerWeek);
  });

  it("a change older than the 28-day window does not narrow it", () => {
    const s = calorieSuggestion(line(0.4), TODAY, 0.46, "2026-08-01");
    expect(s).toMatchObject({ kind: "on_track", since: null, weighIns: 28 });
  });

  it("suggests more food when the gain is under half the target", () => {
    const s = calorieSuggestion(line(0.1), TODAY, 0.46, null);
    expect(s.kind).toBe("increase");
    if (s.kind === "increase") {
      expect(s.ratePerWeek).toBe(0.1);
      expect(s.delta).toBeGreaterThanOrEqual(100);
      expect(s.delta).toBeLessThanOrEqual(250);
    }
  });

  it("suggests easing off when the gain is far above the target", () => {
    const s = calorieSuggestion(line(1.4), TODAY, 0.46, null);
    expect(s.kind).toBe("reassess");
    if (s.kind === "reassess") expect(s.delta).toBeLessThan(0);
  });

  it("needs ≥ 8 weigh-ins spanning ≥ 13 days, more than the pace line needs", () => {
    const four = line(0.4, 28, 7); // 4 weigh-ins over 21 days: pace ok, rule not
    expect(rateAt(four, TODAY).status).toBe("ok");
    expect(calorieSuggestion(four, TODAY, 0.46, null)).toEqual({ kind: "insufficient", daysOfData: 22, weighIns: 4, since: null });
    expect(calorieSuggestion(line(0.4, 12), TODAY, 0.46, null)).toMatchObject({ kind: "insufficient", weighIns: 12, daysOfData: 12 });
    expect(calorieSuggestion([], TODAY, 0.46, null)).toEqual({ kind: "insufficient", daysOfData: 0, weighIns: 0, since: null });
  });

  it("waits 14 days after a calorie change", () => {
    expect(calorieSuggestion(line(0.1), TODAY, 0.46, "2026-10-10")).toEqual({ kind: "cooldown", lastChange: "2026-10-10", nextCheck: "2026-10-24" });
    expect(calorieSuggestion(line(0.1), TODAY, 0.46, "2026-10-04").kind).toBe("cooldown"); // 13 days
  });

  it("after the cooldown, judges ONLY the weigh-ins since the change", () => {
    // Fourteen days at +0.1 lb/wk before the change, then fourteen days at +0.45 after it.
    const change = addDays(TODAY, -14); // 2026-10-03
    const before = line(0.1, 14, 1, change, 168);
    const startAfter = before.at(-1)!.weight_lb;
    const after = line(0.45, 14, 1, TODAY, startAfter + 0.45 / 7);
    const all = [...before, ...after];
    // The 28-day display rate mixes both regimes…
    const mixed = rateAt(all, TODAY).lbPerWeek!;
    expect(mixed).toBeLessThan(0.45);
    // …but the rule only sees the 14 weigh-ins after the change: on track at +0.45.
    const s = calorieSuggestion(all, TODAY, 0.46, change);
    expect(s).toMatchObject({ kind: "on_track", since: change, from: addDays(change, 1), weighIns: 14 });
    if (s.kind === "on_track") expect(s.ratePerWeek).toBeCloseTo(0.45, 2);
    // the same data judged without the change in mind would ask for more food
    expect(calorieSuggestion(before, change, 0.46, null).kind).toBe("increase");
  });

  it("ignores the change-day weigh-in and asks for more weigh-ins when there are too few since", () => {
    const change = addDays(TODAY, -15);
    const w = [...line(0.4, 28, 1)].filter((x) => x.local_date <= change || x.local_date >= addDays(TODAY, -6)); // a gap after the change
    const s = calorieSuggestion(w, TODAY, 0.46, change);
    expect(s).toEqual({ kind: "insufficient", daysOfData: 7, weighIns: 7, since: change });
  });

  it("flags early water only when the judged window overlaps the programme's first 14 days", () => {
    expect(calorieSuggestion(line(1.4), TODAY, 0.46, null, "2026-10-01")).toMatchObject({ kind: "reassess", earlyWater: true });
    // a change after programme day 14 moves the window out of the early-water days
    const s = calorieSuggestion(line(1.4), TODAY, 0.46, "2026-10-01", "2026-09-15");
    expect(s.kind).toBe("reassess");
    if (s.kind === "reassess") expect(s.earlyWater).toBeUndefined();
  });
});

describe("calorieTargetRate", () => {
  it("is the rate from today's trend to the goal by the target date", () => {
    expect(calorieTargetRate(168.4, 163, 183, "2026-09-07", "2027-08-01", TODAY)).toBeCloseTo(0.35, 2);
  });
  it("falls back to the programme's planned rate before any trend", () => {
    expect(calorieTargetRate(null, 163, 183, "2026-09-07", "2027-08-01", TODAY)).toBe(0.43); // 20 lb over 328 days
  });
});
