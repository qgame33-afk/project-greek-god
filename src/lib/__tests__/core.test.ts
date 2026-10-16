import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekStart, monthEnd, dateRange, formatDuration } from "../dates";
import { formatBodyweight, formatDelta, formatHeight, fromDisplayWeight, parseNumber } from "../units";
import { carbsForGoal, kcalFromMacros, macrosConsistent, scaleMacros, sumMacros, caloriesHit } from "../nutrition";
import { avgWindow, calorieSuggestion, plannedWeight, progressPct, weightStats } from "../bodyweight";

describe("dates", () => {
  it("does calendar math across DST and month ends", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-10-16", "2027-08-01")).toBe(289);
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → Monday before
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(monthEnd("2027-02-10")).toBe("2027-02-28");
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(formatDuration(3909)).toBe("1:05:09");
  });
});

describe("units", () => {
  it("formats and converts", () => {
    expect(formatBodyweight(163, "lb")).toBe("163.0 lb");
    expect(formatBodyweight(163, "kg")).toBe("73.9 kg");
    expect(formatDelta(-0.44, "lb")).toBe("−0.4 lb");
    expect(formatHeight(189.2, "in")).toBe("6′2.5″");
    expect(Math.round(fromDisplayWeight(74.5, "kg") * 10) / 10).toBe(164.2);
    expect(parseNumber("72,5")).toBe(72.5);
    expect(parseNumber("  ")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("1.234,5")).toBeNull();
    expect(parseNumber("-2.5")).toBe(-2.5);
  });
});

describe("nutrition", () => {
  it("keeps default targets internally consistent", () => {
    expect(carbsForGoal(3300, 185, 85)).toBe(449);
    expect(kcalFromMacros({ protein: 185, carbs: 449, fat: 85 })).toBe(3301);
    expect(macrosConsistent({ calories: 3300, protein: 185, carbs: 449, fat: 85 })).toBe(true);
    expect(macrosConsistent({ calories: 500, protein: 10, carbs: 10, fat: 1 })).toBe(false);
  });
  it("rescales a portion from its base", () => {
    expect(scaleMacros({ calories: 330, protein: 62, carbs: 0, fat: 7.2 }, 200, 300)).toEqual({ calories: 495, protein: 93, carbs: 0, fat: 10.8 });
    expect(scaleMacros({ calories: 380, protein: 13, carbs: 67, fat: 7 }, 100, 50).calories).toBe(190);
  });
  it("sums entries", () => {
    expect(sumMacros([{ calories: 100.4, protein_g: 10, carbs_g: 5, fat_g: 2 }, { calories: 200, protein_g: 0.05, carbs_g: 0, fat_g: 1 }])).toEqual({ calories: 200 + 100, protein: 10.1, carbs: 5, fat: 3 });
    expect(caloriesHit(2970, 3300)).toBe(true);
    expect(caloriesHit(2900, 3300)).toBe(false);
  });
});

describe("bodyweight", () => {
  const w = (d: string, lb: number) => ({ local_date: d, weight_lb: lb });
  it("averages a 7-day window", () => {
    expect(avgWindow([w("2026-10-10", 160), w("2026-10-16", 164), w("2026-10-17", 170)], "2026-10-16")).toBe(162);
    expect(avgWindow([], "2026-10-16")).toBeNull();
  });
  it("computes progress and stats from real entries only", () => {
    expect(progressPct(163, 163, 183)).toBe(0);
    expect(progressPct(173, 163, 183)).toBe(50);
    expect(progressPct(190, 163, 183)).toBe(100);
    const s = weightStats([], 163, 183, "2026-10-16");
    expect(s.current).toBeNull();
    expect(s.avg7).toBeNull();
    expect(s.progressPct).toBe(0);
    const s2 = weightStats([w("2026-10-16", 164.2)], 163, 183, "2026-10-16");
    expect(s2.current).toBe(164.2);
    expect(s2.fromStart).toBe(1.2);
  });
  it("plans a straight line", () => {
    expect(plannedWeight("2026-10-16", "2026-10-16", "2027-08-01", 163, 183)).toBe(163);
    expect(plannedWeight("2027-08-01", "2026-10-16", "2027-08-01", 163, 183)).toBe(183);
  });
  it("suggests calories only with two weeks of data and respects cooldown", () => {
    const flat = Array.from({ length: 14 }, (_, i) => w(addDays("2026-10-01", i), 163));
    expect(calorieSuggestion(flat.slice(0, 5), "2026-10-14", 0.5, null).kind).toBe("insufficient");
    const s = calorieSuggestion(flat, "2026-10-14", 0.5, null);
    expect(s.kind).toBe("increase");
    if (s.kind === "increase") expect(s.delta).toBe(250);
    expect(calorieSuggestion(flat, "2026-10-14", 0.5, "2026-10-05").kind).toBe("cooldown");
    const fast = Array.from({ length: 14 }, (_, i) => w(addDays("2026-10-01", i), 163 + i * 0.3));
    expect(calorieSuggestion(fast, "2026-10-14", 0.5, null).kind).toBe("reassess");
    const good = Array.from({ length: 14 }, (_, i) => w(addDays("2026-10-01", i), 163 + i * 0.07));
    expect(calorieSuggestion(good, "2026-10-14", 0.5, null).kind).toBe("on_track");
  });
});
