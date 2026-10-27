import { describe, expect, it } from "vitest";
import { addDays, dateRange, weekday, type ISODate } from "@/lib/dates";
import { aiDigest, candidatePriorities, computePriorities, computeReview, headline, milestoneFor, monthWeightSeries, parseMonthParam, reviewMonths, type ReviewProfile, type ReviewRows } from "./compute";
import { rateAt } from "@/lib/progress/pace";
import { plannedKey, scheduleFrom } from "./plan";

const profile: ReviewProfile = {
  start_date: "2026-09-01",
  start_weight_lb: "163.0",
  goal_weight_lb: 183,
  target_date: "2027-08-01",
  calorie_goal: 3300,
  protein_goal: 185,
  sleep_goal_h: "8.0",
  water_goal_ml: 3000,
  weekly_schedule: { "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b", "0": "rest" },
  roadmap: [],
};

const empty = (): ReviewRows => ({ weights: [], measurements: [], photos: [], sessions: [], sets: [], prs: [], nutrition: [], water: [], recovery: [], plans: [] });

const SEPT = dateRange("2026-09-01", "2026-09-30");
const TODAY = "2026-10-16";

function sessionsOn(dates: ISODate[]) {
  return dates.map((d, i) => ({ id: `s${i}`, local_date: d, status: "done", name: "Session", duration_sec: 3900 }));
}

describe("parseMonthParam / reviewMonths / milestones", () => {
  it("accepts YYYY-MM and rejects junk", () => {
    expect(parseMonthParam("2026-09")).toBe("2026-09-01");
    expect(parseMonthParam("2026-12-14")).toBe("2026-12-01");
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("sept")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
  });

  it("lists every month from the start month to today", () => {
    expect(reviewMonths("2026-09-11", "2026-10-16")).toEqual(["2026-09-01", "2026-10-01"]);
    expect(reviewMonths("2026-11-03", "2027-02-01")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(reviewMonths("2026-10-16", "2026-10-16")).toEqual(["2026-10-01"]);
  });

  it("resolves milestones exactly like the Roadmap tab: edits by offset first, then the default for that position", () => {
    const plan = { start_date: "2026-10-02", target_date: "2027-08-01" }; // 11 months, Oct → Aug
    expect(milestoneFor("2026-11-01", plan)?.title).toBe("Build the habits");
    expect(milestoneFor("2026-11-01", { ...plan, roadmap: [{ offset: 1, title: "Volleyball season", detail: "x" }] })).toEqual({ title: "Volleyball season", detail: "x" });
    // an edit with only a detail keeps the default title
    expect(milestoneFor("2026-11-01", { ...plan, roadmap: [{ offset: 1, title: "", detail: "Mine" }] })).toEqual({ title: "Build the habits", detail: "Mine" });
    // malformed rows are ignored, never thrown
    expect(milestoneFor("2026-11-01", { ...plan, roadmap: [{ month: "2026-11-01", title: "Old shape" }, null, 7] })?.title).toBe("Build the habits");
    expect(milestoneFor("2027-07-01", plan)?.title).toBe("Refine");
    expect(milestoneFor("2027-08-01", plan)?.title).toBe("Final review");
    expect(milestoneFor("2026-09-01", plan)).toBeNull();
    expect(milestoneFor("2028-01-01", plan)).toBeNull();
  });

  it("a 12-month programme ends on Final review, with Refine before it and Keep climbing in the extra month", () => {
    const plan = { start_date: "2026-09-01", target_date: "2027-08-01" };
    expect(milestoneFor("2027-08-01", plan)?.title).toBe("Final review");
    expect(milestoneFor("2027-07-01", plan)?.title).toBe("Refine");
    expect(milestoneFor("2027-06-01", plan)?.title).toBe("Keep climbing");
    expect(milestoneFor("2026-09-01", plan)?.title).toBe("The start");
  });

  it("resolves plans: override first, then the weekly schedule", () => {
    const sched = scheduleFrom({ "1": "legs_a", bogus: "x" });
    expect(sched["1"]).toBe("legs_a");
    expect(sched["0"]).toBe("rest");
    expect(plannedKey("2026-09-07", sched, {})).toBe("legs_a"); // Monday
    expect(plannedKey("2026-09-07", sched, { "2026-09-07": "rest" })).toBe("rest");
  });

  it("merges the weekly schedule over the active program's default week", () => {
    // a new account (no program yet) follows the two-set split
    expect(scheduleFrom({})["2"]).toBe("chest_a");
    // an account still on Push/Pull/Legs keeps its week
    expect(scheduleFrom({ "1": "push_a" })["2"]).toBe("pull_a");
    // prefs.program wins
    expect(scheduleFrom({}, { program: "ppl" })["4"]).toBe("push_b");
  });

  it("maps a stale other-program key on or after the switch, never the switch's own rows", () => {
    const ctx = { program: "twoset" as const, since: "2026-10-22" };
    const sched = scheduleFrom({ "4": "arms_b" }, { program: "twoset" });
    expect(plannedKey("2026-10-23", sched, { "2026-10-23": "push_b" }, ctx)).toBe("arms_b");
    expect(plannedKey("2026-10-21", sched, { "2026-10-21": "pull_a" }, ctx)).toBe("pull_a");
    expect(plannedKey("2026-10-22", sched, { "2026-10-22": { template_key: "pull_a", note: "program-switch" } }, ctx)).toBe("pull_a");
  });
});

describe("window", () => {
  it("covers a complete month", () => {
    const s = computeReview({ month: "2026-09-14", today: TODAY, profile, rows: empty() });
    expect(s.month).toBe("2026-09-01");
    expect(s.label).toBe("September 2026");
    expect(s.window).toMatchObject({ from: "2026-09-01", to: "2026-09-30", days: 30, complete: true, monthIndex: 1, monthsTotal: 12, outOfRange: null });
    expect(s.milestone?.title).toBe("The start");
  });

  it("starts at the programme start date mid-month", () => {
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile: { ...profile, start_date: "2026-09-11" }, rows: empty() });
    expect(s.window.from).toBe("2026-09-11");
    expect(s.window.days).toBe(20);
  });

  it("stops at today for the month in progress", () => {
    const s = computeReview({ month: "2026-10-01", today: TODAY, profile, rows: empty() });
    expect(s.window).toMatchObject({ from: "2026-10-01", to: TODAY, days: 16, complete: false, monthIndex: 2 });
  });

  it("flags months before the start and in the future, with no priorities", () => {
    const before = computeReview({ month: "2026-08-01", today: TODAY, profile, rows: empty() });
    expect(before.window.outOfRange).toBe("before");
    expect(before.window.days).toBe(0);
    expect(computePriorities(before)).toEqual([]);
    const future = computeReview({ month: "2026-12-01", today: TODAY, profile, rows: empty() });
    expect(future.window.outOfRange).toBe("future");
  });

  it("returns honest nulls when nothing was logged", () => {
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows: empty() });
    expect(s.physical.monthStartAvg).toBeNull();
    expect(s.physical.change).toBeNull();
    expect(s.nutrition.avgCalories).toBeNull();
    expect(s.nutrition.daysLogged).toBe(0);
    expect(s.recovery.avgSleep).toBeNull();
    expect(s.training.sessions).toBe(0);
    expect(s.training.planned).toBe(26); // 30 days − 4 Sundays
    expect(s.training.adherencePct).toBe(0);
  });
});

describe("physical", () => {
  it("compares the first and last 7-day averages inside the month", () => {
    const rows = empty();
    rows.weights = SEPT.map((d, i) => ({ local_date: d, weight_lb: (163 + i * 0.1).toFixed(1) }));
    rows.weights.push({ local_date: "2026-08-31", weight_lb: 150 }, { local_date: "2026-10-01", weight_lb: 190 }); // outside, ignored
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.physical.weighIns).toBe(30);
    expect(s.physical.monthStartAvg).toBe(163.3);
    expect(s.physical.monthEndAvg).toBe(165.6);
    expect(s.physical.change).toBe(2.3);
    expect(s.physical.spanDays).toBe(29);
    expect(s.physical.gapDays).toBe(23); // Sep 4 → Sep 27, the windows' mean dates
    expect(s.physical.ratePerWeek).toBe(0.7); // the true slope: 0.1 lb a day
    expect(s.physical.plannedRatePerWeek).toBe(0.42); // 20 lb over 334 days
    expect(s.physical.plannedChange).toBe(1.4); // plan over the same 23 days
    expect(s.physical.fromStart).toBe(2.6);
    expect(s.physical.toGoal).toBe(17.4);
    expect(s.physical.low).toBe(163);
    expect(s.physical.high).toBe(165.9);
  });

  it("refuses a monthly change from less than a week of weigh-ins", () => {
    const rows = empty();
    rows.weights = [
      { local_date: "2026-09-25", weight_lb: 165 },
      { local_date: "2026-09-29", weight_lb: 166 },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.physical.monthEndAvg).toBe(165.5);
    expect(s.physical.change).toBeNull();
    expect(s.physical.ratePerWeek).toBeNull();
  });

  describe("recovers a known weekly rate (±0.05 lb/wk)", () => {
    const slope = 0.5; // lb per week
    const series = (days: number[]) => days.map((i) => ({ local_date: addDays("2026-09-01", i), weight_lb: 163 + (slope / 7) * i }));
    const run = (days: number[]) => computeReview({ month: "2026-09-01", today: TODAY, profile, rows: { ...empty(), weights: series(days) } }).physical;
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);

    it("daily weigh-ins across the whole month", () => {
      const p = run(range(30));
      expect(Math.abs(p.ratePerWeek! - slope)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(p.change! - p.plannedChange! * (slope / p.plannedRatePerWeek!))).toBeLessThan(0.1);
    });

    it("sparse weigh-ins (3 a week, uneven)", () => {
      const p = run([0, 2, 5, 7, 8, 12, 15, 16, 19, 22, 26, 27, 29]);
      expect(Math.abs(p.ratePerWeek! - slope)).toBeLessThanOrEqual(0.05);
    });

    it("exactly two weeks of daily weigh-ins", () => {
      const p = run(range(14));
      expect(p.gapDays).toBe(7);
      expect(Math.abs(p.ratePerWeek! - slope)).toBeLessThanOrEqual(0.05);
    });

    it("two weigh-ins a week apart: a month change, but no rate (it needs 4 weigh-ins)", () => {
      const p = run([3, 10]);
      expect(p.gapDays).toBe(7);
      expect(p.change).toBe(0.5);
      expect(p.ratePerWeek).toBeNull();
      expect(p.rateWeighIns).toBe(2);
    });

    it("refuses a month change when the two averages sit less than a week apart; the rate is separate", () => {
      const p = run(range(13)); // centres 3 and 9
      expect(p.gapDays).toBe(6);
      expect(p.change).toBeNull();
      expect(p.plannedChange).toBeNull();
      // the one rate (28 days to Sep 30) has 11 weigh-ins over 10 days
      expect(p.ratePerWeek).toBe(0.5);
    });

    it("is the same rate pace() shows on the month's last day", () => {
      const days = range(30);
      const p = run(days);
      expect(p.ratePerWeek).toBe(rateAt(series(days), "2026-09-30", profile.start_date).lbPerWeek);
    });

    it("an on-plan gain over two weeks reads as on plan, not as a stall", () => {
      // 0.42 lb/wk is the plan; the old first-to-last maths read this as ~0.2 and suggested +100 kcal
      const weights = range(14).map((i) => ({ local_date: addDays("2026-09-01", i), weight_lb: 163 + (0.42 / 7) * i }));
      const nutrition = range(14).map((i) => ({ local_date: addDays("2026-09-01", i), calories: 3300, protein_g: 190, carbs_g: 400, fat_g: 90, entries: 4 }));
      const s = computeReview({ month: "2026-09-01", today: "2026-09-15", profile, rows: { ...empty(), weights, nutrition } });
      const ids = candidatePriorities(s).map((p) => p.id);
      expect(ids).toContain("hold-course");
      expect(ids).not.toContain("calories-up");
    });
  });

  it("measurements: latest in the month vs the last one before it", () => {
    const rows = empty();
    rows.measurements = [
      { local_date: "2026-08-15", biceps_flexed_in: 14.25, waist_in: 30.5, chest_in: null },
      { local_date: "2026-09-20", biceps_flexed_in: "14.5", waist_in: 30.75, chest_in: 39 },
      { local_date: "2026-10-05", biceps_flexed_in: 15, waist_in: 31 },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const m = s.physical.measurements;
    expect(m.date).toBe("2026-09-20");
    expect(m.previousDate).toBe("2026-08-15");
    expect(m.updatedThisMonth).toBe(true);
    const biceps = m.fields.find((f) => f.key === "biceps_flexed_in")!;
    expect(biceps).toMatchObject({ value: 14.5, previous: 14.25, change: 0.25, growthIsGood: true });
    const waist = m.fields.find((f) => f.key === "waist_in")!;
    expect(waist.growthIsGood).toBe(false);
    expect(m.fields.find((f) => f.key === "chest_in")).toMatchObject({ value: 39, previous: null, change: null });
  });

  it("measurements: the month's first entries compare first vs latest; stale months say so", () => {
    const rows = empty();
    rows.measurements = [
      { local_date: "2026-09-02", waist_in: 30.5 },
      { local_date: "2026-09-28", waist_in: 30.25 },
    ];
    const sept = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(sept.physical.measurements.fields[0]).toMatchObject({ value: 30.25, previous: 30.5, change: -0.25 });
    const oct = computeReview({ month: "2026-10-01", today: TODAY, profile, rows });
    expect(oct.physical.measurements.updatedThisMonth).toBe(false);
    expect(oct.physical.measurements.date).toBe("2026-09-28");
  });

  it("counts photos taken in the month", () => {
    const rows = empty();
    rows.photos = [
      { id: "a", local_date: "2026-09-03", pose: "front", storage_path: "u/a.jpg" },
      { id: "b", local_date: "2026-09-03", pose: "side", storage_path: "u/b.jpg" },
      { id: "c", local_date: "2026-10-01", pose: "front", storage_path: "u/c.jpg" },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.physical.photos.count).toBe(2);
    expect(s.physical.photos.dates).toEqual(["2026-09-03"]);
    expect(s.physical.photos.poses).toEqual(["front", "side"]);
  });
});

describe("training", () => {
  const trainingDays = SEPT.filter((d) => weekday(d) !== 0);
  const missed = new Set(["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-09-07", "2026-09-14"]); // 4 Fridays + 2 Mondays

  it("counts sessions against the plan and finds the most-missed weekday", () => {
    const rows = empty();
    rows.sessions = [
      ...sessionsOn(trainingDays.filter((d) => !missed.has(d))),
      { id: "x1", local_date: "2026-09-10", status: "discarded", name: "x", duration_sec: 0 },
      { id: "x2", local_date: "2026-09-12", status: "active", name: "x", duration_sec: 0 },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.training.planned).toBe(26);
    expect(s.training.sessions).toBe(20);
    expect(s.training.adherencePct).toBe(77);
    expect(s.training.missedByWeekday[5]).toBe(4);
    expect(s.training.missedByWeekday[1]).toBe(2);
    expect(s.training.avgSessionMin).toBe(65);
    expect(s.training.weeks[0]).toEqual({ weekStart: "2026-08-31", planned: 5, done: 4, extra: 0 }); // Tue–Sat, Fri missed
    const pr = computePriorities(s);
    const adh = pr.find((p) => p.id === "adherence")!;
    expect(adh.detail).toContain("20 of 26");
    expect(adh.detail).toContain("Fridays (4)");
  });

  it("honours day plan overrides and caps adherence at 100%", () => {
    const rows = empty();
    rows.plans = [
      { plan_date: "2026-09-06", template_key: "push_a" }, // Sunday made a training day
      { plan_date: "2026-09-07", template_key: "rest" }, // Monday made rest
    ];
    rows.sessions = sessionsOn([...trainingDays, "2026-09-06", "2026-09-13"]);
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.training.planned).toBe(26);
    expect(s.training.sessions).toBe(28);
    expect(s.training.plannedDone).toBe(26);
    expect(s.training.extraSessions).toBe(2); // the Monday made rest, and an unplanned Sunday
    expect(s.training.adherencePct).toBe(100);
  });

  it("an extra session on a rest day doesn't make up a missed planned day", () => {
    const rows = empty();
    const mondaysOnly = { ...profile, weekly_schedule: { "0": "rest", "1": "push_a", "2": "rest", "3": "rest", "4": "rest", "5": "rest", "6": "rest" } };
    rows.sessions = sessionsOn(["2026-09-07", "2026-09-15", "2026-09-21", "2026-09-28"]); // Mon 14 missed, trained Tue 15
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile: mondaysOnly, rows });
    expect(s.training).toMatchObject({ sessions: 4, planned: 4, plannedDone: 3, extraSessions: 1, adherencePct: 75 });
    expect(s.training.missedByWeekday[1]).toBe(1);
    expect(s.training.weeks.find((w) => w.weekStart === "2026-09-14")).toEqual({ weekStart: "2026-09-14", planned: 1, done: 0, extra: 1 });
    expect(headline(s)[0]).toBe("3/4 sessions +1");
  });

  it("doesn't count today as missed before it's done", () => {
    const rows = empty();
    const octDays = dateRange("2026-10-01", "2026-10-15").filter((d) => weekday(d) !== 0);
    rows.sessions = sessionsOn(octDays);
    const s = computeReview({ month: "2026-10-01", today: TODAY, profile, rows }); // Oct 16 is a Friday
    expect(s.training.planned).toBe(octDays.length);
    expect(s.training.adherencePct).toBe(100);
    rows.sessions = sessionsOn([...octDays, TODAY]);
    const s2 = computeReview({ month: "2026-10-01", today: TODAY, profile, rows });
    expect(s2.training.planned).toBe(octDays.length + 1);
  });

  it("computes sets, volume, lift changes and stalls", () => {
    const rows = empty();
    const bench = [
      ["2026-09-07", 185, 5],
      ["2026-09-14", 190, 5],
      ["2026-09-21", 190, 6],
      ["2026-09-28", 195, 6],
    ] as const;
    const squat = [
      ["2026-09-09", 245, 5],
      ["2026-09-16", 245, 4],
      ["2026-09-23", 240, 5],
    ] as const;
    const e = (w: number, r: number) => Math.round(w * (1 + r / 30) * 10) / 10;
    rows.sets = [
      ...bench.map(([d, w, r]) => ({ local_date: d, exercise_slug: "barbell-bench-press", exercise_name: "Barbell Bench Press", weight_lb: w, reps: r, e1rm_lb: e(w, r) })),
      ...squat.map(([d, w, r]) => ({ local_date: d, exercise_slug: "back-squat", exercise_name: "Barbell Back Squat", weight_lb: w, reps: r, e1rm_lb: e(w, r) })),
      { local_date: "2026-09-08", exercise_slug: "cable-curl", exercise_name: "Cable Curl", weight_lb: "40", reps: 12, e1rm_lb: null },
      { local_date: "2026-10-02", exercise_slug: "barbell-bench-press", exercise_name: "Barbell Bench Press", weight_lb: 200, reps: 5, e1rm_lb: e(200, 5) },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.training.workingSets).toBe(8);
    expect(s.training.volumeLb).toBe(185 * 5 + 190 * 5 + 190 * 6 + 195 * 6 + 245 * 5 + 245 * 4 + 240 * 5 + 40 * 12);
    const b = s.training.lifts.find((l) => l.slug === "barbell-bench-press")!;
    expect(b).toMatchObject({ sessions: 4, startE1rm: 215.8, endE1rm: 234, change: 18.2, main: true, stalled: false });
    const sq = s.training.lifts.find((l) => l.slug === "back-squat")!;
    expect(sq.stalled).toBe(true);
    expect(s.training.stalled.map((l) => l.slug)).toEqual(["back-squat"]);
    expect(s.training.lifts[0].slug).toBe("barbell-bench-press"); // main lifts lead, in programme order
    const stall = candidatePriorities(s).find((p) => p.id === "stalled")!;
    expect(stall.title).toBe("Restart Barbell Back Squat progress");
    expect(stall.detail).toContain("3 sessions");
  });

  it("keeps the best PR per exercise and measures the gain from the pre-month best", () => {
    const rows = empty();
    rows.prs = [
      { local_date: "2026-09-14", exercise_slug: "barbell-bench-press", exercise_name: "Barbell Bench Press", weight_lb: 190, reps: 5, e1rm_lb: 221.7, prior_best_e1rm: 215.8 },
      { local_date: "2026-09-28", exercise_slug: "barbell-bench-press", exercise_name: "Barbell Bench Press", weight_lb: 195, reps: 6, e1rm_lb: 234, prior_best_e1rm: 227.3 },
      { local_date: "2026-09-20", exercise_slug: "leg-press", exercise_name: "Leg Press", weight_lb: 380, reps: 12, e1rm_lb: 532, prior_best_e1rm: 530 },
      { local_date: "2026-08-20", exercise_slug: "leg-press", exercise_name: "Leg Press", weight_lb: 370, reps: 12, e1rm_lb: 518, prior_best_e1rm: 500 },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    expect(s.training.prs.count).toBe(3);
    expect(s.training.prs.items).toHaveLength(2);
    expect(s.training.prs.items[0]).toMatchObject({ slug: "barbell-bench-press", e1rm: 234, gain: 18.2, date: "2026-09-28", weight: 195, reps: 6 });
    expect(s.training.prs.items[1]).toMatchObject({ slug: "leg-press", gain: 2 });
  });
});

describe("nutrition & recovery", () => {
  it("averages over logged days only and tracks weekly trend", () => {
    const rows = empty();
    rows.nutrition = [
      // week of Aug 31: 3 days at ~2,800
      { local_date: "2026-09-01", calories: 2800, protein_g: "150", carbs_g: 350, fat_g: 80, entries: 4 },
      { local_date: "2026-09-02", calories: 2700, protein_g: 140, carbs_g: 340, fat_g: 75, entries: 3 },
      { local_date: "2026-09-03", calories: 2900, protein_g: 160, carbs_g: 360, fat_g: 85, entries: 5 },
      { local_date: "2026-09-04", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, entries: 0 }, // not logged
      // week of Sep 28: 3 days at ~3,300
      { local_date: "2026-09-28", calories: 3300, protein_g: 190, carbs_g: 420, fat_g: 90, entries: 4 },
      { local_date: "2026-09-29", calories: 3250, protein_g: 185, carbs_g: 410, fat_g: 88, entries: 4 },
      { local_date: "2026-09-30", calories: 3350, protein_g: 200, carbs_g: 430, fat_g: 92, entries: 4 },
      { local_date: "2026-10-01", calories: 9999, protein_g: 999, carbs_g: 0, fat_g: 0, entries: 1 }, // outside
    ];
    rows.water = [
      { local_date: "2026-09-01", total_ml: 3500 },
      { local_date: "2026-09-02", total_ml: 2000 },
      { local_date: "2026-09-03", total_ml: 0 },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const n = s.nutrition;
    expect(n.daysLogged).toBe(6);
    expect(n.daysInWindow).toBe(30);
    expect(n.avgCalories).toBe(3050);
    expect(n.avgProtein).toBe(171);
    expect(n.calorieHitDays).toBe(3);
    expect(n.proteinHitDays).toBe(3);
    expect(n.trend).toBe("up");
    expect(n.trendDelta).toBe(500);
    expect(n.trendFrom).toBe("2026-08-31");
    expect(n.trendTo).toBe("2026-09-28");
    expect(n.weeks.find((w) => w.weekStart === "2026-09-07")).toEqual({ weekStart: "2026-09-07", days: 0, avgCalories: null, avgProtein: null });
    expect(n.waterAvgMl).toBe(2750);
    expect(n.waterDays).toBe(2);
    expect(n.waterGoalDays).toBe(1);
  });

  it("summarises check-ins, sleep against the goal and pain notes (no volleyball)", () => {
    const rows = empty();
    rows.recovery = [
      { local_date: "2026-09-01", sleep_hours: "7.5", sleep_quality: 3, energy: 3, soreness: 2, fatigue: 2, stress: 2, pain_notes: "" },
      { local_date: "2026-09-02", sleep_hours: 8.25, sleep_quality: 4, energy: 4, soreness: 3, fatigue: 3, stress: 1, pain_notes: "left knee" },
      { local_date: "2026-09-03", sleep_hours: null, sleep_quality: null, energy: 2, soreness: null, fatigue: 4, stress: null },
    ];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const r = s.recovery;
    expect(r.checkIns).toBe(3);
    expect(r.sleepNights).toBe(2);
    expect(r.avgSleep).toBe(7.9);
    expect(r.nightsAtGoal).toBe(1);
    expect(r.avgFatigue).toBe(3);
    expect(r.avgEnergy).toBe(3);
    expect(r.painDays).toBe(1);
    expect("volleyballDays" in r).toBe(false);
  });
});

/* ------------------------------------------------------------- priorities */

function richMonth(opts: { gainPerDay: number; calories: number; protein: number; sleep: number; fatigue?: number }) {
  const rows = empty();
  rows.weights = SEPT.map((d, i) => ({ local_date: d, weight_lb: 163 + i * opts.gainPerDay }));
  rows.nutrition = SEPT.map((d) => ({ local_date: d, calories: opts.calories, protein_g: opts.protein, carbs_g: 400, fat_g: 90, entries: 4 }));
  rows.recovery = SEPT.map((d) => ({ local_date: d, sleep_hours: opts.sleep, sleep_quality: 3, energy: 3, soreness: 2, fatigue: opts.fatigue ?? 2, stress: 2 }));
  rows.sessions = sessionsOn(SEPT.filter((d) => weekday(d) !== 0));
  rows.photos = [{ id: "p", local_date: "2026-09-02", pose: "front", storage_path: "u/p.jpg" }];
  rows.measurements = [{ local_date: "2026-09-02", waist_in: 30.5 }];
  return computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
}

describe("priorities", () => {
  it("suggests +150 kcal when the trend stalls and intake already matches the target", () => {
    const s = richMonth({ gainPerDay: 0, calories: 3300, protein: 190, sleep: 8.5 });
    const p = computePriorities(s);
    expect(p[0].id).toBe("calories-up");
    expect(p[0].title).toBe("Consider +150 kcal a day");
    expect(p[0].detail).toContain("only changes if you confirm");
    expect(p[0].evidence).toContain("Plan +0.42 lb/wk");
  });

  it("asks to eat to the current target first when logged intake is short", () => {
    const s = richMonth({ gainPerDay: 0.005, calories: 2800, protein: 190, sleep: 8.5 });
    const p = computePriorities(s);
    expect(p[0].id).toBe("eat-to-target");
    expect(p[0].detail).toContain("2,800 kcal");
    expect(p[0].detail).toContain("500 kcal gap");
  });

  it("flags gaining much faster than planned", () => {
    const s = richMonth({ gainPerDay: 0.2, calories: 3800, protein: 190, sleep: 8.5 });
    expect(computePriorities(s)[0].id).toBe("calories-down");
  });

  it("names the protein gap with concrete foods", () => {
    const s = richMonth({ gainPerDay: 0.06, calories: 3300, protein: 150, sleep: 8.5 });
    const p = computePriorities(s).find((x) => x.id === "protein")!;
    expect(p.title).toBe("Close the 35 g protein gap");
    expect(p.detail).toMatch(/Greek yogurt/);
    expect(p.evidence).toEqual(["150 g avg", "185 g target", "Hit on 0 of 30 days"]);
  });

  it("returns at most 3, never more than 2 from one area, and always cites numbers", () => {
    const s = richMonth({ gainPerDay: 0, calories: 2600, protein: 120, sleep: 6.5, fatigue: 4 });
    const p = computePriorities(s);
    expect(p.length).toBe(3);
    const areas = p.map((x) => x.area);
    for (const a of new Set(areas)) expect(areas.filter((x) => x === a).length).toBeLessThanOrEqual(2);
    for (const x of p) {
      expect(x.evidence.length).toBeGreaterThan(0);
      expect(x.evidence.some((e) => /\d/.test(e))).toBe(true);
      expect(x.detail).not.toMatch(/!/);
    }
    expect(p.map((x) => x.id)).toContain("sleep");
  });

  it("holds the course when on plan, and asks for photos/measurements on a complete month without them", () => {
    const rows = empty();
    rows.weights = SEPT.map((d, i) => ({ local_date: d, weight_lb: 163 + i * 0.06 }));
    rows.nutrition = SEPT.map((d) => ({ local_date: d, calories: 3300, protein_g: 190, carbs_g: 400, fat_g: 90, entries: 4 }));
    rows.sessions = sessionsOn(SEPT.filter((d) => weekday(d) !== 0));
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const ids = computePriorities(s).map((p) => p.id);
    expect(ids).toEqual(["check-in-photos", "hold-course"]);
  });

  it("asks for more weigh-ins and food logs when the data is thin", () => {
    const rows = empty();
    rows.weights = [{ local_date: "2026-09-03", weight_lb: 164 }];
    rows.nutrition = [{ local_date: "2026-09-03", calories: 3000, protein_g: 180, carbs_g: 1, fat_g: 1, entries: 2 }];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const ids = computePriorities(s).map((p) => p.id);
    expect(ids).toContain("log-food");
    expect(ids).toContain("weigh-in");
  });

  it("formats weights in kg when the user prefers kg", () => {
    const s = richMonth({ gainPerDay: 0, calories: 3300, protein: 190, sleep: 8.5 });
    const p = computePriorities(s, "kg");
    expect(p[0].evidence.join(" ")).toContain("kg/wk");
  });
});

describe("headline & AI digest", () => {
  it("summarises the month in one line", () => {
    const s = richMonth({ gainPerDay: 0.06, calories: 3300, protein: 190, sleep: 7.5 });
    expect(headline(s)).toEqual(["26/26 sessions", "+1.4 lb", "190 g protein", "7.5 h sleep"]);
  });

  it("gives the AI computed numbers only — no file paths, notes or raw rows", () => {
    const rows = empty();
    rows.photos = [{ id: "p", local_date: "2026-09-02", pose: "front", storage_path: "user-123/secret.jpg" }];
    rows.recovery = [{ local_date: "2026-09-02", sleep_hours: 7, sleep_quality: 3, energy: 3, soreness: 2, fatigue: 2, stress: 2, pain_notes: "my private note" }];
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows });
    const d = aiDigest(s, computePriorities(s));
    const json = JSON.stringify(d);
    expect(json).not.toContain("secret.jpg");
    expect(json).not.toContain("private note");
    expect(d.progressPhotos).toBe(1);
    expect(d.status).toBe("complete");
    expect(JSON.stringify(aiDigest(computeReview({ month: "2026-10-01", today: TODAY, profile, rows }), []))).toContain("in progress through Oct 16");
  });

  it("is consistent with addDays boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });
});

describe("monthWeightSeries", () => {
  it("plots the month's weigh-ins, a 7-day average that uses earlier weigh-ins, and the plan line", () => {
    const weights = [
      { local_date: "2026-09-28", weight_lb: 164 },
      { local_date: "2026-09-30", weight_lb: "166" },
      { local_date: "2026-10-02", weight_lb: 165 },
      { local_date: "2026-10-05", weight_lb: 167 },
      { local_date: "2026-10-20", weight_lb: 170 }, // after the window
      { local_date: "2026-10-03", weight_lb: null },
    ];
    const s = monthWeightSeries(weights, { from: "2026-10-01", to: "2026-10-16", outOfRange: null }, profile);
    expect(s.points).toEqual([
      { date: "2026-10-02", weight: 165 },
      { date: "2026-10-05", weight: 167 },
    ]);
    expect(s.avg).toEqual([
      { date: "2026-10-02", weight: 165 }, // Sep 28, Sep 30, Oct 2
      { date: "2026-10-05", weight: 166 }, // Sep 30, Oct 2, Oct 5
    ]);
    // 163 → 183 over Sep 1 2026 – Aug 1 2027 (334 days): Oct 1 is day 30, Oct 16 day 45
    expect(s.plan!.from).toBeCloseTo(163 + (20 * 30) / 334, 2);
    expect(s.plan!.to).toBeCloseTo(163 + (20 * 45) / 334, 2);
  });

  it("draws nothing for months outside the programme and no plan without a goal", () => {
    expect(monthWeightSeries([{ local_date: "2026-08-10", weight_lb: 160 }], { from: "2026-08-01", to: "2026-08-31", outOfRange: "before" }, profile).points).toEqual([]);
    expect(monthWeightSeries([], { from: "2026-10-01", to: "2026-10-16", outOfRange: null }, { ...profile, goal_weight_lb: null }).plan).toBeNull();
  });
});

describe("priorities with nothing logged", () => {
  it("asks for a first session instead of a schedule change", () => {
    const s = computeReview({ month: "2026-09-01", today: TODAY, profile, rows: empty() });
    const ps = computePriorities(s);
    expect(ps[0].id).toBe("first-session");
    expect(ps.some((p) => p.id === "adherence")).toBe(false);
    expect(ps[0].evidence).toEqual([`0/${s.training.planned} planned days`]);
  });
});

describe("physical · one rate, early water", () => {
  it("flags months that include the programme's first 14 days", () => {
    const sep = computeReview({ month: "2026-09-01", today: TODAY, profile, rows: empty() });
    expect(sep.physical.earlyWater).toBe(true); // programme starts Sep 1
    const oct = computeReview({ month: "2026-10-01", today: TODAY, profile, rows: empty() });
    expect(oct.physical.earlyWater).toBe(false);
  });
});
