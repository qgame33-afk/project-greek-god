import { describe, expect, it } from "vitest";
import { PROGRAM_BY_KEY } from "@/lib/training/program";
import { ascentProgress, bustFillLine, planRatePerWeek, trendCaption, trendTone } from "./ascent";
import { dailyLine, fmtHours, type DailyLineInput } from "./daily-line";
import { cardDelay, DAWN, DAWN_KEY, shouldPlayDawn } from "./dawn";
import { kcalSummary, ofGoal, ratio } from "./fuel";
import { dayPart, firstName, greeting } from "./greeting";
import { nextSession, planFacts, prescription, upcomingLabel } from "./plan";
import { latestRecords } from "./records";
import { sparkSeries } from "./spark";
import { restDayRecommendations } from "./recovery-recs";
import { daysLeft, programWeeks, timeline, timelineElapsed, trainingWeek } from "./timeline";
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

  it("colours the weekly trend by the plan rate, not the sign", () => {
    const r = planRatePerWeek(163, 183, "2026-10-16", "2027-08-01")!;
    expect(r).toBeCloseTo(0.484, 2);
    expect(trendTone(0.4, r)).toBe("good");
    expect(trendTone(0.2, r)).toBe("neutral");
    expect(trendTone(0.85, r)).toBe("neutral"); // between 1.6r and 2r
    expect(trendTone(1.2, r)).toBe("warn");
    expect(trendTone(-0.3, r)).toBe("neutral");
    expect(trendTone(null, r)).toBe("neutral");
    expect(trendTone(-0.4, -0.5)).toBe("good"); // cutting plan
    expect(trendCaption("warn", 1.2, "+0.5 lb")).toBe("Faster than plan");
    expect(trendCaption("neutral", 0.1, "+0.5 lb")).toBe("Plan +0.5 lb/wk");
    expect(trendCaption("neutral", null, "+0.5 lb")).toBe("Needs 2 weeks of data");
  });
});

describe("greeting", () => {
  it("switches by time of day and uses the first name", () => {
    expect(dayPart(6)).toBe("morning");
    expect(dayPart(12)).toBe("afternoon");
    expect(dayPart(17)).toBe("evening");
    expect(dayPart(2)).toBe("evening");
    expect(greeting(7, "Quinton Hayes")).toBe("Good morning, Quinton");
    expect(greeting(14, "  ")).toBe("Good afternoon");
    expect(greeting(21, null)).toBe("Good evening");
    expect(firstName("me@example.com")).toBeNull();
  });
});

describe("dailyLine", () => {
  const base: DailyLineInput = {
    plan: { kind: "train", name: "Push A", explosiveFirst: false, legs: false },
    session: "none",
    volleyballToday: false,
    volleyballDays7: 0,
    checkin: null,
    protein: { eaten: 0, goal: 185 },
    calories: { eaten: 0, goal: 3300 },
    sleepGoalH: 8,
  };
  const legs = { kind: "train" as const, name: "Legs A", explosiveFirst: true, legs: true };

  it("names the session and one number", () => {
    expect(dailyLine(base)).toBe("Push A today. Protein is the lever: 185 g.");
    expect(dailyLine({ ...base, protein: { eaten: 60, goal: 185 } })).toBe("Push A today. Protein is the lever: 125 g to go.");
    expect(dailyLine({ ...base, plan: legs })).toBe("Legs A today. Jumps first, while you're fresh.");
  });

  it("is volleyball- and recovery-aware", () => {
    expect(dailyLine({ ...base, plan: legs, volleyballToday: true })).toBe("Legs A today. Volleyball too, so the jumps are optional.");
    expect(dailyLine({ ...base, volleyballToday: true })).toBe("Push A today, volleyball later. Fuel both: 3,300 kcal.");
    expect(dailyLine({ ...base, plan: legs, volleyballDays7: 3 })).toBe("Legs A today. 3 volleyball days this week, so trim the jumps.");
    const tired = { sleepHours: 5.75, energy: 3, soreness: 2, fatigue: 2, pain: false };
    expect(dailyLine({ ...base, checkin: tired })).toBe("Push A today on 5.75 h of sleep. Keep 2 reps in reserve.");
    expect(dailyLine({ ...base, checkin: { ...tired, sleepHours: 7.5, energy: 2 } })).toBe("Push A today. Energy is 2/5, so warm up longer and keep 2 in reserve.");
    expect(dailyLine({ ...base, checkin: { ...tired, pain: true } })).toBe("Push A today. You noted pain, so skip anything that aggravates it.");
  });

  it("follows the session through active and done", () => {
    expect(dailyLine({ ...base, session: "active" })).toBe("Push A is underway. Log every set, then refuel.");
    expect(dailyLine({ ...base, session: "done", protein: { eaten: 120, goal: 185 } })).toBe("Push A done. Protein is the lever now: 65 g to go.");
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
    volleyball: ["2026-10-13", "2026-10-15"],
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
    expect(o.colonnade[1].volleyball).toBe(true);
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

describe("dawn", () => {
  it("plays once per session and never with reduced motion", () => {
    const empty = { getItem: () => null };
    const seen = { getItem: (k: string) => (k === DAWN_KEY ? "1" : null) };
    expect(shouldPlayDawn(empty, false)).toBe(true);
    expect(shouldPlayDawn(seen, false)).toBe(false);
    expect(shouldPlayDawn(empty, true)).toBe(false);
    expect(shouldPlayDawn(null, false)).toBe(false);
    expect(shouldPlayDawn({ getItem: () => { throw new Error("blocked"); } }, false)).toBe(false);
    expect(cardDelay(0)).toBe(DAWN.cardsStart);
    expect(cardDelay(20)).toBe(cardDelay(DAWN.maxStaggered - 1));
  });
});

describe("fuel", () => {
  it("shows calories left, or over without going negative", () => {
    expect(kcalSummary(1840, 3300)).toMatchObject({ left: 1460, over: 0, value: "1,460", label: "KCAL LEFT" });
    expect(kcalSummary(3420, 3300)).toMatchObject({ left: 0, over: 120, value: "+120", label: "KCAL OVER" });
    expect(kcalSummary(100, 0).ratio).toBe(0);
    expect(ratio(142, 185)).toBeCloseTo(0.7676, 3);
    expect(ofGoal(142.4, 185, "g")).toBe("142 / 185 g");
  });
});

describe("plan helpers", () => {
  it("describes templates and finds the next session", () => {
    expect(planFacts(PROGRAM_BY_KEY.legs_a)).toEqual({ kind: "train", name: "Legs A", explosiveFirst: true, legs: true });
    expect(planFacts(PROGRAM_BY_KEY.push_a)).toMatchObject({ explosiveFirst: false, legs: false });
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

describe("sparkSeries", () => {
  const w = (d: string, lb: number) => ({ local_date: d, weight_lb: lb });
  it("needs two weigh-ins in the window", () => {
    expect(sparkSeries([], "2026-10-16")).toBeNull();
    expect(sparkSeries([w("2026-10-16", 165)], "2026-10-16")).toBeNull();
    expect(sparkSeries([w("2026-08-01", 160), w("2026-10-16", 165)], "2026-10-16")).toBeNull();
  });
  it("scales dots and the rolling average into the box", () => {
    const s = sparkSeries([w("2026-09-19", 164), w("2026-10-03", 165), w("2026-10-16", 166)], "2026-10-16", 28, 270, 56, 6)!;
    expect(s.dots.map((d) => d.x)).toEqual([0, 140, 270]);
    expect(s.min).toBe(164);
    expect(s.max).toBe(166);
    expect(s.dots[0].y).toBe(50); // lowest value sits on the bottom padding
    expect(s.dots[2].y).toBe(6); // highest on the top padding
    expect(s.avgPath.startsWith("M0 50")).toBe(true);
    expect(s.avg).toHaveLength(3);
  });
  it("pads a flat series so it doesn't divide by zero", () => {
    const s = sparkSeries([w("2026-10-15", 165), w("2026-10-16", 165)], "2026-10-16")!;
    expect(s.max - s.min).toBe(1);
    expect(s.dots.every((d) => Number.isFinite(d.y))).toBe(true);
  });
});
