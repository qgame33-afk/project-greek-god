import { describe, expect, it } from "vitest";
import { TEMPLATE_DEFS as PROGRAM_BY_KEY } from "@/lib/training/programs";
import { ascentProgress, bustFillLine, planRatePerWeek, rangePlaque } from "./ascent";
import { dailyLine, fmtHours, type DailyLineInput } from "./daily-line";
import { nextSession, planFacts, prescription, upcomingLabel } from "./plan";
import { latestRecords } from "./records";
import { restDayRecommendations } from "./recovery-recs";
import { daysLeft, programWeeks, timeline, timelineElapsed, trainingWeek } from "./timeline";
import { formatHabitValue, parseHabitValue, valueHabitSpec } from "./value-habit";
import { consistencyStreak, weeklyOverview, type WeekInput } from "./weekly";

describe("timeline", () => {
  it("counts real days to the target date", () => {
    expect(daysLeft("2026-10-16", "2027-08-01")).toBe(289);
    expect(daysLeft("2027-08-01", "2027-08-01")).toBe(0);
    expect(daysLeft("2027-09-01", "2027-08-01")).toBe(0);
  });

  it("numbers training weeks Monday-aligned from the start week", () => {
    // start on a Friday: that whole Mon–Sun week is week 1
    expect(trainingWeek("2026-10-16", "2026-10-16")).toBe(1);
    expect(trainingWeek("2026-10-16", "2026-10-18")).toBe(1); // Sunday
    expect(trainingWeek("2026-10-16", "2026-10-19")).toBe(2); // next Monday
    expect(trainingWeek("2026-09-11", "2026-10-16")).toBe(6);
    expect(trainingWeek("2026-10-20", "2026-10-16")).toBe(0); // before the start
    expect(programWeeks("2026-10-16", "2027-08-01")).toBe(42);
  });

  it("reports elapsed share, labels and edge states", () => {
    expect(timelineElapsed("2026-10-16", "2027-08-01", "2026-10-16")).toBe(0);
    expect(timelineElapsed("2026-10-16", "2027-08-01", "2028-01-01")).toBe(1);
    const t = timeline("2026-09-11", "2027-08-01", "2026-10-16");
    expect(t.daysLeft).toBe(289);
    expect(t.totalDays).toBe(324);
    expect(t.week).toBe(6);
    expect(t.weeks).toBe(47);
    expect(t.countdownLabel).toBe("DAYS TO AUG 1, 2027");
    expect(t.startLabel).toBe("SEP 2026");
    expect(t.endLabel).toBe("AUG 2027");
    expect(t.caption).toBe("11% of timeline");
    expect(timeline("2026-09-11", "2027-08-01", "2027-07-31").countdownLabel).toBe("DAY TO AUG 1, 2027");
    const done = timeline("2026-09-11", "2027-08-01", "2027-08-05");
    expect(done.finished).toBe(true);
    expect(done.daysLeft).toBe(0);
    expect(done.countdownLabel).toBe("TARGET DATE · AUG 1, 2027");
  });
});

describe("ascentProgress — one p for the hero, bust and meter", () => {
  it("counts the weigh-ins behind the 7-day average, in the same window", () => {
    const w = [
      { local_date: "2026-10-01", weight_lb: 164 },
      { local_date: "2026-10-10", weight_lb: 165 },
      { local_date: "2026-10-12", weight_lb: 165.4 },
      { local_date: "2026-10-16", weight_lb: 165.9 },
    ];
    const a = ascentProgress(163, 183, w, "2026-10-16");
    expect(a.avgCount).toBe(3); // Oct 10–16
    expect(a.avgEnd).toBe("2026-10-16");
    // last weigh-in older than a week: the window ends at that weigh-in
    const old = ascentProgress(163, 183, w.slice(0, 2), "2026-10-30");
    expect(old.avgEnd).toBe("2026-10-10");
    expect(old.avgCount).toBe(1);
  });

  const w = (d: string, lb: number) => ({ local_date: d, weight_lb: lb });

  it("is 0 with no weigh-ins and reports the start, not a reading", () => {
    const a = ascentProgress(163, 183, [], "2026-10-16");
    expect(a.p).toBe(0);
    expect(a.hasData).toBe(false);
    expect(a.latest).toBeNull();
    expect(a.trend).toBeNull();
    expect(a.toGo).toBe(20);
  });

  it("uses the 7-day average when present", () => {
    const a = ascentProgress(163, 183, [w("2026-10-14", 166), w("2026-10-15", 167), w("2026-10-16", 168)], "2026-10-16");
    expect(a.avg7).toBe(167);
    expect(a.latest).toBe(168);
    expect(a.p).toBeCloseTo(0.2, 5);
    expect(a.toGo).toBe(16);
  });

  it("falls back to the latest weigh-in when the last one is old and clamps 0–1", () => {
    const old = ascentProgress(163, 183, [w("2026-09-01", 173)], "2026-10-16");
    expect(old.avg7).toBe(173); // averaged at the last weigh-in when it's older than a week
    expect(old.p).toBeCloseTo(0.5, 5);
    expect(ascentProgress(163, 183, [w("2026-10-16", 160)], "2026-10-16").p).toBe(0);
    expect(ascentProgress(163, 183, [w("2026-10-16", 190)], "2026-10-16").p).toBe(1);
  });

  it("ignores future-dated rows and handles a missing goal", () => {
    const a = ascentProgress(163, 183, [w("2026-10-20", 180)], "2026-10-16");
    expect(a.hasData).toBe(false);
    expect(ascentProgress(163, null, [w("2026-10-16", 170)], "2026-10-16").p).toBe(0);
  });

  it("maps p onto the bust figure so early progress is visible", () => {
    expect(bustFillLine(0)).toBe(0);
    expect(bustFillLine(1)).toBe(1);
    expect(bustFillLine(1.4)).toBe(1);
    expect(bustFillLine(0.11)).toBeCloseTo(0.1757, 3);
    expect(bustFillLine(0.5)).toBeCloseTo(0.515, 3);
    expect(bustFillLine(Number.NaN)).toBe(0);
  });

  it("plans the weekly rate from start to goal", () => {
    expect(planRatePerWeek(163, 183, "2026-10-16", "2027-08-01")!).toBeCloseTo(0.484, 2);
  });
});

describe("dailyLine", () => {
  const base: DailyLineInput = {
    plan: { kind: "train", name: "Push A", legs: false },
    session: "none",
    checkin: null,
    protein: { eaten: 0, goal: 185 },
    calories: { eaten: 0, goal: 3300 },
    sleepGoalH: 8,
  };
  const legs = { kind: "train" as const, name: "Legs & Abs A", legs: true };

  it("names the session and one number", () => {
    expect(dailyLine(base)).toBe("Push A today. Protein is the lever: 185 g.");
    expect(dailyLine({ ...base, protein: { eaten: 60, goal: 185 } })).toBe("Push A today. Protein is the lever: 125 g to go.");
    expect(dailyLine({ ...base, plan: legs })).toBe("Legs & Abs A today. Protein is the lever: 185 g.");
  });

  it("is recovery-aware and never mentions volleyball or jumps", () => {
    for (const plan of [base.plan, legs]) expect(dailyLine({ ...base, plan })).not.toMatch(/volley|jump/i);
    const tired = { sleepHours: 5.75, energy: 3, soreness: 2, fatigue: 2, pain: false };
    expect(dailyLine({ ...base, checkin: tired })).toBe("Push A today on 5.75 h of sleep. Keep 2 reps in reserve.");
    expect(dailyLine({ ...base, checkin: { ...tired, sleepHours: 7.5, energy: 2 } })).toBe("Push A today. Energy is 2/5, so warm up longer and keep 2 in reserve.");
    expect(dailyLine({ ...base, checkin: { ...tired, pain: true } })).toBe("Push A today. You noted pain, so skip anything that aggravates it.");
  });

  it("follows the session through active and done", () => {
    expect(dailyLine({ ...base, session: "active" })).toBe("Push A is underway. Log every set, then refuel.");
    expect(dailyLine({ ...base, session: "done", protein: { eaten: 120, goal: 185 } })).toBe("Push A done. Protein next: 65 g to go.");
    expect(dailyLine({ ...base, session: "done", protein: { eaten: 190, goal: 185 }, calories: { eaten: 2000, goal: 3300 } })).toBe(
      "Push A done. 1,300 kcal left to fuel the recovery.",
    );
    expect(dailyLine({ ...base, session: "done", protein: { eaten: 190, goal: 185 }, calories: { eaten: 3250, goal: 3300 } })).toBe(
      "Push A done and fuelled. Sleep 8 h to lock it in.",
    );
  });

  it("writes rest-day lines", () => {
    const rest = { ...base, plan: { kind: "rest" as const } };
    expect(dailyLine(rest)).toBe("Rest day. Walk, stretch, sleep 8 h.");
    expect(dailyLine({ ...rest, checkin: { sleepHours: 6, energy: 3, soreness: 2, fatigue: 2, pain: false } })).toBe("Rest day. Last night was 6 h, so aim for 8 h tonight.");
    expect(dailyLine({ ...rest, checkin: { sleepHours: 8, energy: 3, soreness: 4, fatigue: 2, pain: false } })).toBe("Rest day. Soreness is 4/5: walk, stretch, nothing heavy.");
    expect(fmtHours(7.5)).toBe("7.5");
    expect(fmtHours(7.3)).toBe("7.25");
  });

  it("says what the Recovery screen says once a check-in exists", () => {
    const adj = { dropSets: 0, rir: null, loadPct: null, rest: false };
    const tired = { sleepHours: 5.75, energy: 3, soreness: 2, fatigue: 2, pain: false };
    const trim = { level: "trim" as const, score: 2, adjustments: { ...adj, dropSets: 1, rir: "2–3" }, hasCheckin: true, pain: null };
    expect(dailyLine({ ...base, checkin: tired, readiness: trim })).toBe("Push A today, trimmed: one set fewer per exercise, RIR 2–3.");
    expect(dailyLine({ ...base, checkin: tired, readiness: { ...trim, level: "ease", score: 4 } })).toBe(
      "Push A today, lighter: 10% less load, one set fewer, RIR 3.",
    );
    expect(dailyLine({ ...base, readiness: { ...trim, level: "go", score: 0 } })).toBe("Push A today as planned. Recovery markers look fine.");
    // pain never sits next to "markers look fine", and the caveat is said once
    expect(dailyLine({ ...base, readiness: { ...trim, level: "go", score: 1, pain: "left knee" } })).toBe(
      "Push A today as planned, around the sore area. Skip anything that hurts.",
    );
    expect(dailyLine({ ...base, checkin: tired, readiness: { ...trim, pain: "left knee" } })).toBe(
      "Push A today, trimmed: one set fewer per exercise, RIR 2–3. Skip anything that hurts.",
    );
    expect(dailyLine({ ...base, readiness: { ...trim, level: "recover", score: 7, pain: "left knee" } })).toBe(
      "Recovery day suggested. Walk, mobility, sleep. Six days aren't mandatory.",
    );
    // no check-in yet → the guidance has nothing to say and the usual line stands
    expect(dailyLine({ ...base, readiness: { ...trim, level: "unknown", hasCheckin: false } })).toBe("Push A today. Protein is the lever: 185 g.");
    // the session state still wins once training has started
    expect(dailyLine({ ...base, session: "active", readiness: trim })).toBe("Push A is underway. Log every set, then refuel.");
    const rest = { ...base, plan: { kind: "rest" as const } };
    expect(dailyLine({ ...rest, readiness: { ...trim, level: "rest", score: 5 } })).toBe("Rest fully today. An easy walk at most, then sleep.");
    expect(dailyLine({ ...rest, readiness: { ...trim, level: "rest", score: 1 } })).toBe("Rest day. Walk, stretch, sleep 8 h.");
  });
});

describe("weeklyOverview", () => {
  const days: WeekInput["days"] = [
    { date: "2026-10-12", kind: "train", label: "Push A" },
    { date: "2026-10-13", kind: "train", label: "Pull A" },
    { date: "2026-10-14", kind: "train", label: "Legs A" },
    { date: "2026-10-15", kind: "train", label: "Push B" },
    { date: "2026-10-16", kind: "train", label: "Pull B" },
    { date: "2026-10-17", kind: "train", label: "Legs B" },
    { date: "2026-10-18", kind: "rest", label: "Rest" },
  ];
  const input: WeekInput = {
    days,
    today: "2026-10-16",
    doneSessions: [
      { id: "a", local_date: "2026-10-12" },
      { id: "b", local_date: "2026-10-13" },
      { id: "c", local_date: "2026-10-15" },
      { id: "old", local_date: "2026-10-09" },
    ],
    food: [
      { local_date: "2026-10-12", calories: 3000, protein_g: 180, entries: 5 },
      { local_date: "2026-10-13", calories: 3400, protein_g: 190, entries: 6 },
      { local_date: "2026-10-16", calories: 900, protein_g: 50, entries: 2 }, // today: partial, excluded
      { local_date: "2026-10-09", calories: 100, protein_g: 10, entries: 1 }, // last week
    ],
    sleep: [
      { local_date: "2026-10-13", sleep_hours: 7 },
      { local_date: "2026-10-16", sleep_hours: 8 },
      { local_date: "2026-10-14", sleep_hours: null },
    ],
    prEvents: [
      { session_id: "a", exercise_slug: "bench", local_date: "2026-10-12" },
      { session_id: "a", exercise_slug: "bench", local_date: "2026-10-12" },
      { session_id: "c", exercise_slug: "incline", local_date: "2026-10-15" },
      { session_id: "old", exercise_slug: "bench", local_date: "2026-10-09" },
    ],
  };

  it("counts only this week's real rows", () => {
    const o = weeklyOverview(input);
    expect(o.scheduled).toBe(6);
    expect(o.done).toBe(3);
    expect(o.due).toBe(4); // Mon–Thu; today not done yet
    expect(o.adherencePct).toBe(75);
    expect(o.avgCalories).toBe(3200);
    expect(o.avgProtein).toBe(185);
    expect(o.nutritionDays).toBe(2);
    expect(o.avgSleep).toBe(7.5);
    expect(o.prs).toBe(2);
    expect(o.colonnade.map((d) => d.done)).toEqual([true, true, false, true, false, false, false]);
    expect(o.colonnade[2].missed).toBe(true);
    expect(o.colonnade[4].today).toBe(true);
    expect(o.colonnade[4].missed).toBe(false);
  });

  it("returns nulls, not guesses, when nothing is logged", () => {
    const o = weeklyOverview({ ...input, today: "2026-10-12", doneSessions: [], food: [], sleep: [], prEvents: [] });
    expect(o.adherencePct).toBeNull();
    expect(o.avgCalories).toBeNull();
    expect(o.avgSleep).toBeNull();
    expect(o.done).toBe(0);
    expect(o.prs).toBe(0);
  });

  it("includes today in adherence once today's session is finished", () => {
    const o = weeklyOverview({ ...input, doneSessions: [...input.doneSessions, { id: "d", local_date: "2026-10-16" }] });
    expect(o.due).toBe(5);
    expect(o.done).toBe(4);
    expect(o.adherencePct).toBe(80);
  });

  it("never counts days before the programme start as due or missed", () => {
    const o = weeklyOverview({ ...input, startDate: "2026-10-16", doneSessions: [], prEvents: [] });
    expect(o.scheduled).toBe(2); // Fri + Sat
    expect(o.due).toBe(0);
    expect(o.adherencePct).toBeNull();
    expect(o.colonnade.some((d) => d.missed)).toBe(false);
  });

  it("computes the streak with the shared 60% rule", () => {
    const d = (date: string, ratio: number) => ({ date, ratio });
    expect(consistencyStreak([d("2026-10-13", 0.8), d("2026-10-14", 0.7), d("2026-10-15", 0.6), d("2026-10-16", 0.2)], "2026-10-16")).toBe(3);
    expect(consistencyStreak([d("2026-10-15", 0.5), d("2026-10-16", 0.9)], "2026-10-16")).toBe(1);
  });
});

describe("latestRecords", () => {
  it("collapses a session's PR sets and reports the gain over the prior best", () => {
    const ev = (session: string, slug: string, date: string, w: number, reps: number, e1: number, prior: number) => ({
      session_id: session,
      exercise_slug: slug,
      exercise_name: slug.toUpperCase(),
      local_date: date,
      weight_lb: w,
      reps,
      e1rm_lb: e1,
      prior_best_e1rm: prior,
    });
    const r = latestRecords([
      ev("s1", "bench", "2026-10-12", 185, 6, 222, 216),
      ev("s1", "bench", "2026-10-12", 190, 5, 221.7, 222), // not higher: keeps the better set
      ev("s1", "bench", "2026-10-12", 195, 5, 227.5, 222),
      ev("s2", "squat", "2026-10-14", 225, 5, 262.5, 255),
      ev("s0", "row", "2026-10-01", 135, 8, 171, 165),
      ev("s3", "curl", "2026-10-15", 70, 8, 88.7, 85),
    ]);
    expect(r.map((x) => x.slug)).toEqual(["curl", "squat", "bench"]);
    const bench = r[2];
    expect(bench.weightLb).toBe(195);
    expect(bench.e1rmLb).toBe(227.5);
    expect(bench.gainLb).toBe(11.5); // vs 216 before the session
  });

  it("skips incomplete rows", () => {
    expect(latestRecords([{ session_id: null, exercise_slug: null, exercise_name: null, local_date: null, weight_lb: null, reps: null, e1rm_lb: null, prior_best_e1rm: null }])).toEqual([]);
  });
});

describe("restDayRecommendations", () => {
  const next = { name: "Push A", when: "Tomorrow", exercises: 6, minutes: 70 };
  it("returns three items ending with the next session", () => {
    const r = restDayRecommendations(null, 8, next);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.key)).toEqual(["walk", "mobility", "next"]);
    expect(r[2].label).toBe("Prep for Push A");
    expect(r[2].detail).toContain("Tomorrow · 6 exercises · ~70 min");
  });
  it("puts sleep first after a short night and mobility first when sore", () => {
    const r = restDayRecommendations({ sleepHours: 6.5, energy: 3, soreness: 4, fatigue: 2, pain: false }, 8, null);
    expect(r.map((x) => x.key)).toEqual(["sleep", "mobility", "fuel"]);
    expect(r[0].detail).toBe("Last night was 6.5 h. Aim for 8 h or more tonight.");
    const sore = restDayRecommendations({ sleepHours: 8, energy: 3, soreness: 5, fatigue: 2, pain: false }, 8, next);
    expect(sore.map((x) => x.key)).toEqual(["mobility", "walk", "next"]);
  });
});

describe("plan helpers", () => {
  it("describes templates and finds the next session", () => {
    expect(planFacts(PROGRAM_BY_KEY.legs_a)).toEqual({ kind: "train", name: "Legs A", legs: true });
    expect(planFacts(PROGRAM_BY_KEY.legs_abs_a)).toEqual({ kind: "train", name: "Legs & Abs A", legs: true });
    expect(planFacts(PROGRAM_BY_KEY.shoulders_arms_a)).toMatchObject({ legs: false });
    expect(planFacts(PROGRAM_BY_KEY.push_a)).toMatchObject({ legs: false });
    expect(planFacts(null)).toEqual({ kind: "rest" });
    expect(prescription({ sets: 3, repLow: 5, repHigh: 8, unit: "reps" })).toBe("3 × 5–8");
    expect(prescription({ sets: 3, repLow: 12, repHigh: 20, unit: "each" })).toBe("3 × 12–20 each");
    expect(prescription({ sets: 3, repLow: 3, repHigh: 3, unit: "reps" })).toBe("3 × 3");
    expect(upcomingLabel("2026-10-19", "2026-10-18")).toBe("Tomorrow");
    expect(upcomingLabel("2026-10-20", "2026-10-18")).toBe("Tuesday");
    const n = nextSession("2026-10-18", (d) => (d === "2026-10-19" ? PROGRAM_BY_KEY.push_a : null));
    expect(n).toMatchObject({ date: "2026-10-19", name: "Push A", when: "Tomorrow", exercises: 6 });
    expect(nextSession("2026-10-18", () => null)).toBeNull();
  });
});

describe("valueHabitSpec — Today's value-habit sheet", () => {
  it("steps use the profile goal when the definition has no target", () => {
    const s = valueHabitSpec("steps", { label: "Steps", target: null, unit: "steps" }, 8000);
    expect(s).toMatchObject({ label: "Steps", target: 8000, unit: "steps", step: 500, max: 100000, integer: true });
    expect(s.chips).toEqual([2500, 5000, 7500, 8000]);
  });

  it("steps chips never duplicate the goal", () => {
    expect(valueHabitSpec("steps", { label: "Steps", target: null, unit: null }, 5000).chips).toEqual([2500, 5000, 7500]);
  });

  it("a custom habit keeps its own label, target and unit — never the steps settings", () => {
    const s = valueHabitSpec("reading", { label: "Read (optional)", target: 20, unit: "pages" }, 8000);
    expect(s).toMatchObject({ label: "Read", target: 20, unit: "pages", step: 1, integer: false });
    expect(s.max).toBeGreaterThanOrEqual(200);
    expect(s.chips).toEqual([10, 20]);
  });

  it("a decimal target allows one decimal", () => {
    const s = valueHabitSpec("water_extra", { label: "Extra water", target: 1.5, unit: "L" }, 8000);
    expect(s.integer).toBe(false);
    expect(parseHabitValue("1.25", s)).toBe(1.3);
    expect(formatHabitValue(1.3, s.integer)).toBe("1.3");
  });

  it("falls back safely when the definition is missing or the target is 0", () => {
    expect(valueHabitSpec("steps", null, 8000).target).toBe(8000);
    expect(valueHabitSpec("custom", { label: "X", target: 0, unit: null }, 8000).target).toBe(1);
  });

  it("parses only real, in-range numbers", () => {
    const steps = valueHabitSpec("steps", null, 8000);
    expect(parseHabitValue("", steps)).toBeNull();
    expect(parseHabitValue("6,500", steps)).toBe(6500);
    expect(parseHabitValue("200000", steps)).toBeNull();
    expect(parseHabitValue("-5", steps)).toBeNull();
    expect(parseHabitValue("12abc", steps)).toBeNull();
    expect(parseHabitValue("12.5", steps)).toBeNull(); // steps are whole — never rounded, never read as 125
    expect(parseHabitValue("12.5", valueHabitSpec("reading", { label: "Read", target: 20, unit: "pages" }, 8000))).toBe(12.5);
    expect(parseHabitValue("0", steps)).toBe(0);
    expect(formatHabitValue(6500, true)).toBe("6,500");
  });
});

describe("rangePlaque", () => {
  it("formats both ends of the climb to the same precision", () => {
    expect(rangePlaque(163, 183, "lb")).toBe("163 → 183 lb");
    expect(rangePlaque(163, 183, "kg")).toBe("73.9 → 83.0 kg");
    expect(rangePlaque(163.5, 183, "lb")).toBe("163.5 → 183.0 lb");
  });
});
