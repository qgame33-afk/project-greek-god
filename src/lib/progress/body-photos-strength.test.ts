import { describe, expect, it } from "vitest";
import { fieldSeries, fieldSummary, fmtLen, hasAnyValue, measureStep, snap } from "./measurements";
import { clampPct, defaultComparePair, fitWithin, groupPhotosByMonth, nearestByDate, photoPath, thumbPath } from "./photos";
import { formatSet, metricMode, otherExercises, summarizeLift, type StrengthSet } from "./strength";

describe("measurements", () => {
  const rows = [
    { local_date: "2026-11-01", biceps_flexed_in: 14.5, waist_in: null },
    { local_date: "2026-10-01", biceps_flexed_in: 14.25, waist_in: 30.5 },
    { local_date: "2026-12-01", biceps_flexed_in: "14.75" as unknown as number, waist_in: 30.75 },
  ];
  it("summarises change since the first entry", () => {
    expect(fieldSeries(rows, "biceps_flexed_in").map((x) => x.value)).toEqual([14.25, 14.5, 14.75]);
    const s = fieldSummary(rows, "biceps_flexed_in");
    expect(s).toMatchObject({ latest: 14.75, first: 14.25, change: 0.5, count: 3, latestDate: "2026-12-01", firstDate: "2026-10-01" });
    expect(fieldSummary(rows, "calf_in")).toMatchObject({ latest: null, change: null, count: 0 });
    expect(fieldSummary([rows[1]], "waist_in").change).toBeNull();
  });
  it("steps by 0.25 in or 0.5 cm and snaps", () => {
    expect(measureStep("in")).toBe(0.25);
    expect(measureStep("cm")).toBe(0.5);
    expect(snap(14.37, 0.25)).toBe(14.25);
    expect(snap(36.8, 0.5)).toBe(37);
  });
  it("formats lengths at quarter-inch or 0.1 cm precision", () => {
    expect(fmtLen(39, "in")).toBe("39.0");
    expect(fmtLen(14.5, "in")).toBe("14.5");
    expect(fmtLen(11.6, "in")).toBe("11.6");
    expect(fmtLen(46.75, "in")).toBe("46.75");
    expect(fmtLen(14.5, "in", true)).toBe("14.50");
    expect(fmtLen(14.5, "cm")).toBe("36.8");
    expect(fmtLen(null, "in")).toBe("—");
  });
  it("detects empty entries", () => {
    expect(hasAnyValue({})).toBe(false);
    expect(hasAnyValue({ body_fat_pct: 12 })).toBe(true);
    expect(hasAnyValue({ waist_in: 30 })).toBe(true);
  });
});

describe("photos", () => {
  const uid = "6f1b2c3d-1111-4222-8333-944455566677";
  it("names objects under the user's folder", () => {
    expect(photoPath(uid, "2026-10-16", "front", "abc-123")).toBe(`${uid}/2026-10-16-front-abc-123.jpg`);
    expect(photoPath(uid, "2026-10-16", "flex_back", "a/../b")).toBe(`${uid}/2026-10-16-flex_back-ab.jpg`);
    expect(() => photoPath("../other", "2026-10-16", "front", "x")).toThrow();
    expect(() => photoPath(uid, "16/10/2026", "front", "x")).toThrow();
    expect(() => photoPath(uid, "2026-10-16", "selfie" as "front", "x")).toThrow();
    expect(thumbPath(`${uid}/2026-10-16-front-x.jpg`)).toBe(`${uid}/2026-10-16-front-x.thumb.jpg`);
    expect(thumbPath(`${uid}/a.png`)).toBe(`${uid}/a.png.thumb.jpg`);
  });
  it("downscales to the longest edge without upscaling", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500, scale: 2000 / 4032 });
    expect(fitWithin(3024, 4032, 2000)).toMatchObject({ width: 1500, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(fitWithin(0, 600, 2000).width).toBe(0);
  });
  it("groups chronologically by month and finds nearest values", () => {
    const photos = [
      { id: "1", local_date: "2026-10-02", pose: "front" },
      { id: "2", local_date: "2026-11-20", pose: "front" },
      { id: "3", local_date: "2026-10-30", pose: "side" },
      { id: "4", local_date: "2026-12-01", pose: "side" },
      { id: "5", local_date: "2026-10-30", pose: "front" },
    ];
    const g = groupPhotosByMonth(photos);
    expect(g.map((x) => x.month)).toEqual(["2026-12-01", "2026-11-01", "2026-10-01"]);
    expect(g[2].photos.map((p) => p.id)).toEqual(["3", "5", "1"].filter((id) => ["3", "5"].includes(id)).concat("1"));
    expect(defaultComparePair(photos)!.map((p) => p.id)).toEqual(["1", "2"]);
    expect(defaultComparePair(photos, "side")!.map((p) => p.id)).toEqual(["3", "4"]);
    expect(defaultComparePair([photos[0]])).toBeNull();
    const weights = [{ local_date: "2026-10-01" }, { local_date: "2026-10-05" }];
    expect(nearestByDate(weights, "2026-10-03", 7)).toEqual({ row: weights[0], days: 2 });
    expect(nearestByDate(weights, "2026-10-04", 7)!.row).toBe(weights[1]);
    expect(nearestByDate(weights, "2026-11-30", 7)).toBeNull();
    expect(clampPct(140)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(50);
  });
});

describe("strength", () => {
  let n = 0;
  const set = (date: string, session: string, weight: number | null, reps: number, idx = 0, slug = "barbell-bench-press"): StrengthSet => ({
    id: `s${n++}`,
    exercise_slug: slug,
    exercise_name: slug === "barbell-bench-press" ? "Barbell Bench Press" : slug,
    local_date: date,
    session_id: session,
    set_index: idx,
    weight_lb: weight,
    reps,
    completed_at: `${date}T18:${String(10 + idx).padStart(2, "0")}:00Z`,
  });

  it("summarises sessions, bests and PRs from logged sets only", () => {
    const sets = [
      set("2026-10-05", "A", 165, 8, 0),
      set("2026-10-05", "A", 165, 7, 1),
      set("2026-10-12", "B", 170, 8, 0), // PR: 215.3 > 209
      set("2026-10-12", "B", 170, 6, 1),
      set("2026-10-19", "C", 170, 15, 0), // high reps: no e1RM, still best reps + volume
      set("2026-10-19", "C", 0, 20, 1), // bodyweight-ish set
    ];
    const s = summarizeLift(sets);
    expect(s.sessions).toHaveLength(3);
    expect(s.sessions[0].pr).toBe(false); // first-ever session is a benchmark, not a PR
    expect(s.sessions[1].pr).toBe(true);
    expect(s.sessions[1].prGain).toBeCloseTo(215.3 - 209, 1);
    expect(s.sessions[2].bestE1rm).toBeNull();
    expect(s.sessions[2].pr).toBe(false);
    expect(s.prCount).toBe(1);
    expect(s.bestE1rm).toBe(215.3);
    expect(s.bestE1rmSet!.weight_lb).toBe(170);
    expect(s.heaviest).toMatchObject({ weight: 170, reps: 15 });
    expect(s.bestReps).toMatchObject({ reps: 20, weight: 0 });
    expect(s.totalVolume).toBe(165 * 15 + 170 * 14 + 170 * 15);
    expect(s.sessions[2].totalReps).toBe(35);
    expect(s.lastDate).toBe("2026-10-19");
    expect(s.trend).toEqual({ from: 209, to: 215.3, change: 6.3, since: "2026-10-05" });
    expect(metricMode(s)).toBe("e1rm");
  });

  it("uses the workout's record margin: formula noise is not a PR", () => {
    // 185×7 → 228.2 over a prior 180×8 → 228.0 (the workout and the views agree: no record)
    const noise = summarizeLift([set("2026-10-05", "A", 180, 8, 0), set("2026-10-12", "B", 185, 7, 0)]);
    expect(noise.sessions[1].pr).toBe(false);
    expect(noise.prCount).toBe(0);
    const real = summarizeLift([set("2026-10-05", "A", 180, 8, 0), set("2026-10-12", "B", 190, 7, 0)]);
    expect(real.sessions[1].pr).toBe(true);
  });

  it("handles pure bodyweight lifts and empty history", () => {
    const bw = summarizeLift([set("2026-10-01", "A", null, 10, 0, "pull-up"), set("2026-10-08", "B", null, 12, 0, "pull-up")]);
    expect(bw.bodyweightOnly).toBe(true);
    expect(bw.bestE1rm).toBeNull();
    expect(bw.bestReps!.reps).toBe(12);
    expect(bw.prCount).toBe(0);
    expect(metricMode(bw)).toBe("reps");
    // weighted pull-ups: added load is tracked, never an e1RM of the added load
    const weighted = summarizeLift([set("2026-10-01", "A", 17.5, 10, 0, "weighted-pull-up")]);
    expect(metricMode(weighted)).toBe("e1rm");
    expect(metricMode(weighted, { bodyweight: true })).toBe("load");
    const none = summarizeLift([]);
    expect(none).toMatchObject({ sessions: [], bestE1rm: null, heaviest: null, totalVolume: 0, lastDate: null, trend: null });
  });

  it("groups untracked exercises and formats sets", () => {
    const others = otherExercises([set("2026-10-01", "A", 50, 10, 0, "cable-lateral-raise"), set("2026-10-02", "B", 165, 5)]);
    expect(others.map((o) => o.slug)).toEqual(["cable-lateral-raise"]);
    const fmt = (lb: number) => String(lb);
    expect(formatSet({ weight_lb: 185, reps: 6 }, fmt)).toBe("185 × 6");
    expect(formatSet({ weight_lb: 0, reps: 12 }, fmt)).toBe("BW × 12");
    expect(formatSet({ weight_lb: 25, reps: 8 }, fmt, true)).toBe("BW+25 × 8");
  });
});
