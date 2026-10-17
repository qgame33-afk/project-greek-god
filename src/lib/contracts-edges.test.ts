// Edge cases for the DESIGN-V2 §4 contracts that the per-module tests don't pin down:
// same-day duplicate weigh-ins, verdict boundaries, an early-morning session before the
// check-in, early training and the meal clock, history that hasn't loaded yet, duplicate
// check-in rows, and the adherence counts at their edges.

import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { DEFAULT_DAY_SCHEDULE, toMinutes } from "@/lib/prefs";
import { planFollowed, sessionsSealed } from "./adherence";
import { dayPhase, dayState, type DayInput } from "./now/day-engine";
import { plannedTime } from "./now/meal-times";
import { gildFraction, pace, paceCorridor, rateAt, trendAt, trendSeries, verdictFor, type RateReading } from "./progress/pace";
import { sleepPrefill } from "./recovery/prefill";
import { mkSet } from "./workout/fixtures";
import { setTiming } from "./workout/timing";

const t = (hhmm: string) => toMinutes(hhmm);
const TODAY = "2026-10-17";

describe("pace: same-day duplicate weigh-ins", () => {
  // two readings on each of 5 days (morning and a re-weigh)
  const w = [0, -2, -4, -6, -12].flatMap((d, i) => [
    { local_date: addDays(TODAY, d), weight_lb: 168 - i * 0.2 },
    { local_date: addDays(TODAY, d), weight_lb: 168.4 - i * 0.2 },
  ]);

  it("trendSeries has one point per date and agrees with trendAt on each of them", () => {
    const s = trendSeries(w);
    expect(s.map((p) => p.date)).toEqual([...new Set(w.map((x) => x.local_date))].sort());
    for (const p of s) expect(trendAt(w, p.date).lb).toBe(p.lb);
  });

  it("the rate counts every reading and never returns NaN", () => {
    const r = rateAt(w, TODAY);
    expect(r.n).toBe(10);
    expect(r.status).toBe("ok");
    expect(Number.isFinite(r.lbPerWeek)).toBe(true);
    expect(r.lbPerWeek).toBeGreaterThan(0);
  });
});

describe("pace: verdict boundaries", () => {
  const c = paceCorridor(168.4, TODAY, "2027-08-01", 180, 185)!;
  const ok = (lbPerWeek: number): RateReading => ({ lbPerWeek, n: 20, spanDays: 27, from: addDays(TODAY, -27), to: TODAY, status: "ok", includesEarlyWater: false });

  it("the corridor's own edges are on pace, not outside it", () => {
    expect(verdictFor(ok(c.minRate), c, 168.4)).toBe("on_pace");
    expect(verdictFor(ok(c.maxRate), c, 168.4)).toBe("top");
  });

  it("a trend exactly at the band floor has arrived", () => {
    expect(verdictFor(ok(0.1), paceCorridor(180, TODAY, "2027-08-01", 180, 185), 180)).toBe("arrived");
  });

  it("past the target date and above the band says so, without a projection", () => {
    const w = Array.from({ length: 14 }, (_, i) => ({ local_date: addDays(TODAY, -i), weight_lb: 186.5 }));
    const p = pace({
      weighIns: w,
      today: TODAY,
      profile: { start_weight_lb: 163, goal_weight_lb: 183, goal_range_min_lb: 180, goal_range_max_lb: 185, start_date: "2026-01-01", target_date: "2026-10-01" },
    });
    expect(p.verdict).toBe("arrived");
    expect(p.sentence).toBe("You're above 180–185 lb.");
    expect(p.projection).toBeNull();
    expect(p.corridor).toBeNull();
    expect(p.ariaLabel).not.toMatch(/NaN|undefined/);
  });

  it("gilding uses the weigh-in count, so 3 readings never gild even on a high trend", () => {
    expect(gildFraction(175, 163, 183, 3)).toBe(0);
    expect(gildFraction(175, 163, 183, 4)).toBeCloseTo(0.6, 5);
  });
});

describe("day engine: an early-morning session", () => {
  const MONDAY = "2026-10-19";
  const base = (p: Partial<DayInput>): DayInput => ({
    date: MONDAY,
    now: t("07:00"),
    plan: { kind: "train", key: "push-a", name: "Push A", at: t("06:00"), durationMin: 60 },
    session: { status: "none" },
    meals: [],
    checkInDone: false,
    weighInDone: false,
    dawnDismissed: false,
    sealed: false,
    lightsOut: null,
    ...p,
  });

  it("refuel beats an unfinished Dawn for two hours, then Dawn comes back before 10:30", () => {
    const done = { status: "done" as const, endedAt: t("07:05") };
    expect(dayPhase(base({ now: t("07:30"), session: done }))).toBe("refuel");
    expect(dayPhase(base({ now: t("09:05"), session: done }))).toBe("refuel");
    expect(dayPhase(base({ now: t("09:06"), session: done }))).toBe("dawn");
    expect(dayPhase(base({ now: t("10:30"), session: done }))).toBe("fuel");
  });

  it("a finished session never asks to Begin again, and its rail Train segment is done", () => {
    const s = dayState(base({ now: t("12:00"), session: { status: "done", endedAt: t("07:05") }, checkInDone: true, weighInDone: true, dawnDoneAt: t("08:00") }));
    expect(s.phase).toBe("fuel");
    expect(s.next.kind).not.toBe("begin");
    const train = s.rail.filter((r) => r.phase === "train");
    expect(train.length).toBeGreaterThan(0);
    expect(train.every((r) => r.state === "done")).toBe(true);
    expect(s.later.some((x) => x.kind === "session")).toBe(false);
    expect(s.earlier.some((x) => x.kind === "session" && x.done)).toBe(true);
  });

  it("no meals planned: Fuel and Dusk fall back to logging food", () => {
    expect(dayState(base({ now: t("12:00"), plan: { kind: "rest" }, checkInDone: true, weighInDone: true })).next).toEqual({ kind: "log_food" });
    expect(dayState(base({ now: t("19:00"), plan: { kind: "rest" }, checkInDone: true, weighInDone: true })).next).toEqual({ kind: "log_food" });
  });
});

describe("meal times: early training", () => {
  const ctx = (at: string) => ({ schedule: DEFAULT_DAY_SCHEDULE, snacksPerDay: 2, train: { at: t(at), durationMin: 60 } });

  it("a 06:00 session moves no snack (none within 3 h of 05:00) and breakfast is the post meal", () => {
    expect(plannedTime({ slot: "snack", position: 0 }, ctx("06:00"))).toEqual({ at: t("15:00"), role: "snack" });
    expect(plannedTime({ slot: "breakfast", position: 0 }, ctx("06:00"))).toEqual({ at: t("07:40"), role: "post" });
  });

  it("a session just after midnight never produces a negative time", () => {
    const schedule = { ...DEFAULT_DAY_SCHEDULE, meals: { ...DEFAULT_DAY_SCHEDULE.meals, snacks: ["01:00", "15:00", "21:30"] as [string, string, string] } };
    expect(plannedTime({ slot: "snack", position: 0 }, { schedule, snacksPerDay: 3, train: { at: t("00:30") } })).toEqual({ at: 0, role: "pre" });
  });
});

describe("set timing before history has loaded", () => {
  it("an unknown prior best is never 'first' or 'record'; it compares with last time", () => {
    const set = mkSet({ completed: true, weight_lb: 200, reps: 5 });
    expect(setTiming(set, { weight_lb: 190, reps: 5, duration_sec: null }, undefined).timing).toBe("beat");
    expect(setTiming(set, null, undefined).timing).toBeNull();
  });
});

describe("check-in prefill with duplicate rows", () => {
  it("one night counts once", () => {
    const rows = [
      { local_date: "2026-10-16", sleep_hours: 6 },
      { local_date: "2026-10-16", sleep_hours: 6 },
      { local_date: "2026-10-16", sleep_hours: 6 },
      { local_date: "2026-10-15", sleep_hours: 8 },
    ];
    expect(sleepPrefill(rows, TODAY)).toEqual({ hours: null, nights: 2 });
  });
});

describe("adherence edges", () => {
  it("a meal due exactly now (at + 120 = now) is due", () => {
    expect(planFollowed([{ id: "a", local_date: TODAY, at: t("12:00") }], new Set(), TODAY, t("14:00"))).toEqual({ done: 0, due: 1 });
    expect(planFollowed([{ id: "a", local_date: TODAY, at: t("12:00") }], new Set(), TODAY, t("13:59"))).toEqual({ done: 0, due: 0 });
  });

  it("two volleyball swaps in a week count once; done never exceeds planned", () => {
    const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    const days = week.map((date, i) => ({ date, kind: (i === 1 || i === 3 ? "volleyball" : i === 6 ? "rest" : "train") as "train" | "rest" | "volleyball", done: date <= TODAY }));
    expect(sessionsSealed(days, TODAY)).toEqual({ done: 5, planned: 6 });
  });
});
