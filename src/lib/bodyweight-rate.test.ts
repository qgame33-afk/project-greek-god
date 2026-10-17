import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { calorieSuggestion } from "./bodyweight";
import { rateAt } from "./progress/pace";

const TODAY = "2026-10-17";
const line = (perWeek: number, days = 28, every = 1) =>
  Array.from({ length: days }, (_, i) => ({ local_date: addDays(TODAY, -(days - 1) + i), weight_lb: 168 + (perWeek / 7) * i })).filter((_, i) => i % every === 0);

describe("calorieSuggestion with THE rate (pace.rateAt)", () => {
  it("uses the same number the pace line shows", () => {
    const rate = rateAt(line(0.4), TODAY);
    const s = calorieSuggestion(rate, TODAY, 0.46, null);
    expect(s).toEqual({ kind: "on_track", ratePerWeek: 0.4, targetRate: 0.46 });
    if (s.kind === "on_track") expect(s.ratePerWeek).toBe(rate.lbPerWeek);
  });

  it("suggests more food when the gain is under half the target", () => {
    const s = calorieSuggestion(rateAt(line(0.1), TODAY), TODAY, 0.46, null);
    expect(s.kind).toBe("increase");
    if (s.kind === "increase") {
      expect(s.ratePerWeek).toBe(0.1);
      expect(s.delta).toBeGreaterThanOrEqual(100);
      expect(s.delta).toBeLessThanOrEqual(250);
    }
  });

  it("suggests easing off when the gain is far above the target", () => {
    const s = calorieSuggestion(rateAt(line(1.4), TODAY), TODAY, 0.46, null);
    expect(s.kind).toBe("reassess");
    if (s.kind === "reassess") expect(s.delta).toBeLessThan(0);
  });

  it("needs ≥ 8 weigh-ins spanning ≥ 13 days, more than the pace line needs", () => {
    const four = rateAt(line(0.4, 28, 7), TODAY); // 4 weigh-ins over 21 days: pace ok, rule not
    expect(four.status).toBe("ok");
    expect(calorieSuggestion(four, TODAY, 0.46, null)).toEqual({ kind: "insufficient", daysOfData: 22, weighIns: 4 });
    const short = rateAt(line(0.4, 12), TODAY); // 12 days
    expect(calorieSuggestion(short, TODAY, 0.46, null)).toMatchObject({ kind: "insufficient", weighIns: 12, daysOfData: 12 });
    expect(calorieSuggestion(rateAt([], TODAY), TODAY, 0.46, null)).toEqual({ kind: "insufficient", daysOfData: 0, weighIns: 0 });
  });

  it("waits 14 days after a calorie change", () => {
    expect(calorieSuggestion(rateAt(line(0.1), TODAY), TODAY, 0.46, "2026-10-10")).toEqual({ kind: "cooldown", lastChange: "2026-10-10", nextCheck: "2026-10-24" });
    expect(calorieSuggestion(rateAt(line(0.1), TODAY), TODAY, 0.46, "2026-10-03").kind).toBe("increase");
  });

  it("flags early water so a 'too fast' call can say why", () => {
    const s = calorieSuggestion(rateAt(line(1.4), TODAY, "2026-10-01"), TODAY, 0.46, null);
    expect(s).toMatchObject({ kind: "reassess", earlyWater: true });
  });

  it("the legacy weigh-ins form still works for old callers", () => {
    expect(calorieSuggestion(line(0.4), TODAY, 0.46, null).kind).toBe("on_track");
  });
});
