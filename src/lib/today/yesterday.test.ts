import { describe, expect, it } from "vitest";
import { weighInCaption, yesterdayRecap, type RecapSession, type YesterdayInput } from "./yesterday";

const TODAY = "2026-10-16";
const Y = "2026-10-15";

const base = (over: Partial<YesterdayInput> = {}): YesterdayInput => ({
  today: TODAY,
  startDate: "2026-09-11",
  plannedName: "Push B",
  sessions: [],
  prEvents: [],
  volleyball: [],
  food: [],
  water: [],
  weights: [],
  recovery: [],
  mission: null,
  goals: { calories: 3300, protein: 185, waterMl: 3000, sleepH: 8 },
  ...over,
});

const session = (over: Partial<RecapSession> = {}): RecapSession => ({
  id: "s1",
  name: "Push B",
  local_date: Y,
  status: "done",
  sets_completed: 13,
  total_volume_lb: "12450.0",
  duration_sec: 3960,
  started_at: `${Y}T22:00:00Z`,
  ended_at: `${Y}T23:06:00Z`,
  ...over,
});

const pr = (slug: string, e1rm: number, session_id = "s1", local_date = Y) => ({
  session_id,
  exercise_slug: slug,
  exercise_name: slug,
  local_date,
  weight_lb: 100,
  reps: 8,
  e1rm_lb: e1rm,
  prior_best_e1rm: e1rm - 5,
});

describe("yesterdayRecap", () => {
  it("summarises a finished session with sets, volume, minutes and records per exercise", () => {
    const r = yesterdayRecap(
      base({
        sessions: [session(), session({ id: "today", local_date: TODAY })],
        // two sets beating the record on one exercise count once; another day's PR never counts
        prEvents: [pr("bench", 200), pr("bench", 205), pr("lateral-raise", 40), pr("squat", 300, "old", "2026-10-14")],
      }),
    );
    expect(r.date).toBe(Y);
    expect(r.training).toEqual({ kind: "done", name: "Push B", sessionId: "s1", sessions: 1, sets: 13, volumeLb: 12450, minutes: 66, prs: 2 });
    expect(r.logged).toBe(1);
  });

  it("joins two sessions on one day and links to the day instead of one summary", () => {
    const r = yesterdayRecap(
      base({
        sessions: [
          session({ id: "b", name: "Arms", started_at: `${Y}T23:30:00Z`, sets_completed: 6, total_volume_lb: 2000, duration_sec: 1200 }),
          session(),
        ],
      }),
    );
    expect(r.training).toMatchObject({ kind: "done", name: "Push B + Arms", sessionId: null, sessions: 2, sets: 19, volumeLb: 14450, minutes: 86 });
  });

  it("falls back to start/end times for the duration, and to null when unknown", () => {
    expect(yesterdayRecap(base({ sessions: [session({ duration_sec: null })] })).training).toMatchObject({ minutes: 66 });
    expect(yesterdayRecap(base({ sessions: [session({ duration_sec: null, ended_at: null })] })).training).toMatchObject({ minutes: null });
    // a very short session reads "1 min" like the summary, never "0 min"
    expect(yesterdayRecap(base({ sessions: [session({ duration_sec: 8 })] })).training).toMatchObject({ minutes: 1 });
  });

  it("ignores discarded sessions and reports a session left open", () => {
    expect(yesterdayRecap(base({ sessions: [session({ status: "discarded" })] })).training).toEqual({ kind: "unlogged", planned: "Push B" });
    expect(yesterdayRecap(base({ sessions: [session({ status: "active", id: "open1" })] })).training).toEqual({ kind: "open", name: "Push B", sessionId: "open1" });
  });

  it("treats volleyball as the day's training when nothing was lifted, and as an extra beside a session", () => {
    const vb = [{ local_date: Y, kind: "practice", duration_min: 90 }];
    const only = yesterdayRecap(base({ plannedName: null, volleyball: vb }));
    expect(only.training).toEqual({ kind: "volleyball" });
    expect(only.volleyball).toEqual({ kind: "practice", minutes: 90 });
    expect(only.logged).toBe(1);
    const both = yesterdayRecap(base({ sessions: [session()], volleyball: vb }));
    expect(both.training.kind).toBe("done");
    expect(both.volleyball).toEqual({ kind: "practice", minutes: 90 });
    // the check-in's volleyball switch alone still counts, without inventing details
    const flag = yesterdayRecap(base({ recovery: [{ local_date: Y, sleep_hours: null, volleyball: true }] }));
    expect(flag.volleyball).toEqual({ kind: null, minutes: null });
  });

  it("separates a planned rest day from a training day with nothing logged", () => {
    expect(yesterdayRecap(base({ plannedName: null })).training).toEqual({ kind: "rest" });
    expect(yesterdayRecap(base()).training).toEqual({ kind: "unlogged", planned: "Push B" });
  });

  it("reads food, water and sleep against the same goal rules as the missions", () => {
    const r = yesterdayRecap(
      base({
        food: [
          { local_date: Y, calories: 3120, protein_g: "190.4", entries: 9 },
          { local_date: TODAY, calories: 500, protein_g: 30, entries: 1 },
        ],
        water: [{ local_date: Y, total_ml: 2750 }],
        recovery: [{ local_date: Y, sleep_hours: "8.25" }],
      }),
    );
    expect(r.calories).toEqual({ value: 3120, goal: 3300, met: true, ratio: 3120 / 3300 }); // within ±10%
    expect(r.protein).toMatchObject({ value: 190.4, met: true });
    expect(r.water).toMatchObject({ value: 2750, met: false });
    expect(r.sleep).toMatchObject({ value: 8.25, met: true });
    expect(r.logged).toBe(3);
    // far over the calorie target is not "met" either
    expect(yesterdayRecap(base({ food: [{ local_date: Y, calories: 4000, protein_g: 100, entries: 3 }] })).calories.met).toBe(false);
  });

  it("never turns a day without logs into zeros", () => {
    const r = yesterdayRecap(base({ food: [{ local_date: Y, calories: 0, protein_g: 0, entries: 0 }], water: [{ local_date: Y, total_ml: 0 }], recovery: [{ local_date: Y, sleep_hours: null }] }));
    expect(r.calories).toEqual({ value: null, goal: 3300, met: false, ratio: 0 });
    expect(r.protein.value).toBeNull();
    expect(r.water.value).toBeNull();
    expect(r.sleep.value).toBeNull();
    expect(r.weight).toEqual({ lb: null, deltaLb: null, prevDate: null });
    expect(r.logged).toBe(0);
  });

  it("reports yesterday's weigh-in and the change since the previous one", () => {
    const r = yesterdayRecap(
      base({
        weights: [
          { local_date: TODAY, weight_lb: 166.9 },
          { local_date: Y, weight_lb: "166.4" },
          { local_date: "2026-10-12", weight_lb: 165.95 },
          { local_date: "2026-10-01", weight_lb: 164 },
        ],
      }),
    );
    expect(r.weight).toEqual({ lb: 166.4, deltaLb: 0.5, prevDate: "2026-10-12" });
    const first = yesterdayRecap(base({ weights: [{ local_date: Y, weight_lb: 163 }] }));
    expect(first.weight).toEqual({ lb: 163, deltaLb: null, prevDate: null });
  });

  it("passes the mission score through and flags a complete day", () => {
    expect(yesterdayRecap(base({ mission: { done: 5, total: 8 } })).missions).toEqual({ done: 5, total: 8, complete: false });
    expect(yesterdayRecap(base({ mission: { done: 8, total: 8 } })).missions).toEqual({ done: 8, total: 8, complete: true });
    expect(yesterdayRecap(base({ mission: { done: 0, total: 0 } })).missions).toBeNull();
  });

  it("marks days before the start date, so a new account isn't shown a blank recap", () => {
    expect(yesterdayRecap(base({ startDate: TODAY })).beforeStart).toBe(true);
    expect(yesterdayRecap(base({ startDate: Y })).beforeStart).toBe(false);
    expect(yesterdayRecap(base({ startDate: null })).beforeStart).toBe(false);
  });

  it("crosses month and year boundaries", () => {
    expect(yesterdayRecap(base({ today: "2027-01-01" })).date).toBe("2026-12-31");
    expect(yesterdayRecap(base({ today: "2026-11-01" })).date).toBe("2026-10-31");
  });
});

describe("weighInCaption", () => {
  it("compares with the previous weigh-in by weekday when it was within the week", () => {
    expect(weighInCaption(0.5, "2026-10-13", Y, "lb", TODAY)).toBe("+0.5 vs Tue");
    expect(weighInCaption(-0.3, "2026-10-09", Y, "lb", TODAY)).toBe("−0.3 vs Fri");
  });
  it("uses a date further back, converts units and shows no change plainly", () => {
    expect(weighInCaption(1.2, "2026-10-02", Y, "lb", TODAY)).toBe("+1.2 vs Oct 2");
    expect(weighInCaption(2.2046226218, "2026-10-14", Y, "kg", TODAY)).toBe("+1.0 vs Wed");
    expect(weighInCaption(0.04, "2026-10-14", Y, "lb", TODAY)).toBe("±0.0 vs Wed");
    expect(weighInCaption(-0.04, "2026-10-14", Y, "lb", TODAY)).toBe("±0.0 vs Wed");
  });
});
