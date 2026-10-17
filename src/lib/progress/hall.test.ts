import { describe, expect, it } from "vitest";
import { summarizeLift, type StrengthSet } from "./strength";
import { allRecords, firstLatest, hallLifts, recentRecords, standingRecords, testLine } from "./hall";

let n = 0;
const set = (slug: string, date: string, weight: number | null, reps: number, session = date): StrengthSet => ({
  id: `s${++n}`,
  exercise_slug: slug,
  exercise_name: slug,
  local_date: date,
  session_id: `${slug}-${session}`,
  set_index: n,
  weight_lb: weight,
  reps,
  completed_at: `${date}T17:00:${String(n % 60).padStart(2, "0")}Z`,
});

const SETS: StrengthSet[] = [
  set("barbell-bench-press", "2026-09-14", 175, 6),
  set("barbell-bench-press", "2026-09-21", 180, 6), // record (+5.8 e1RM)
  set("barbell-bench-press", "2026-09-28", 180, 5), // not a record
  set("barbell-bench-press", "2026-10-12", 190, 6), // record
  set("back-squat", "2026-09-16", 205, 5),
  set("back-squat", "2026-10-07", 215, 5), // record
  set("weighted-pull-up", "2026-09-15", 0, 8),
  set("weighted-pull-up", "2026-10-06", 10, 8),
  set("cable-fly", "2026-10-01", 40, 12),
];

describe("the Hall", () => {
  const lifts = hallLifts(SETS);
  const summaries = new Map(lifts.map((l) => [l.key, summarizeLift(l.sets)]));

  it("lists every tracked lift, then the others he logged", () => {
    expect(lifts.filter((l) => l.tracked).length).toBeGreaterThanOrEqual(9);
    expect(lifts.find((l) => l.key === "cable-fly")?.tracked).toBe(false);
    expect(lifts.find((l) => l.key === "pull-ups")?.bodyweight).toBe(true);
  });

  it("records are sets that beat every earlier e1RM, newest first; the first session is a benchmark", () => {
    const r = allRecords(lifts, summaries);
    expect(r.map((x) => `${x.liftKey} ${x.date}`)).toEqual(["bench 2026-10-12", "squat 2026-10-07", "bench 2026-09-21"]);
    expect(r[0].set.weight_lb).toBe(190);
    expect(r[0].e1rm).toBeCloseTo(228, 0);
    expect(r[0].previous).toBeCloseTo(216, 0);
    expect(r[0].gain).toBeCloseTo(12, 0);
  });

  it("the standing record is each lift's latest", () => {
    const s = standingRecords(allRecords(lifts, summaries));
    expect(s.map((x) => x.liftKey)).toEqual(["bench", "squat"]);
  });

  it("recent records are the last 30 days", () => {
    expect(recentRecords(allRecords(lifts, summaries), "2026-10-25").length).toBe(2);
    expect(recentRecords(allRecords(lifts, summaries), "2026-11-30").length).toBe(0);
  });

  it("first → latest uses the lift's own metric: e1RM, or added load for bodyweight lifts", () => {
    const bench = firstLatest(summaries.get("bench")!)!;
    expect(bench.mode).toBe("e1rm");
    expect(bench.first.date).toBe("2026-09-14");
    expect(bench.latest.date).toBe("2026-10-12");
    expect(bench.change).toBeCloseTo(bench.latest.value - bench.first.value, 1);
    expect(bench.values).toHaveLength(4);
    const pull = firstLatest(summaries.get("pull-ups")!, { bodyweight: true })!;
    expect(pull.mode).toBe("load");
    expect(firstLatest(summarizeLift([]))).toBeNull();
  });
});

describe("athletic tests", () => {
  const t = (id: string, type: string, date: string, value: number, d?: number) => ({ id, test_type: type, local_date: date, value, sprint_distance_m: d ?? null });
  const rows = [
    t("a1", "approach_vertical", "2026-09-05", 30.5),
    t("a2", "approach_vertical", "2026-10-03", 32),
    t("s1", "standing_vertical", "2026-09-05", 27.25),
    t("p1", "sprint", "2026-09-05", 2.1, 10),
    t("p2", "sprint", "2026-10-03", 2.0, 10),
    t("p3", "sprint", "2026-10-03", 4.6, 30),
  ];

  it("an approach jump that beats the first is the record and an improvement", () => {
    const l = testLine(rows, "approach_vertical");
    expect(l.latest?.id).toBe("a2");
    expect(l.latestIsRecord).toBe(true);
    expect(l.change).toBe(1.5);
    expect(l.improved).toBe(true);
  });

  it("one result is a benchmark: no record, no change", () => {
    const l = testLine(rows, "standing_vertical");
    expect(l.latestIsRecord).toBe(false);
    expect(l.change).toBeNull();
  });

  it("a faster sprint is an improvement, at the most-used distance", () => {
    const l = testLine(rows, "sprint");
    expect(l.distance).toBe(10);
    expect(l.change).toBe(-0.1);
    expect(l.improved).toBe(true);
    expect(l.latestIsRecord).toBe(true);
  });

  it("no results: nothing invented", () => {
    const l = testLine([], "broad_jump");
    expect(l.latest).toBeNull();
    expect(l.best).toBeNull();
    expect(l.change).toBeNull();
  });
});
