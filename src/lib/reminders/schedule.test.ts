import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDERS, anyOn, buildNotice, dueByTime, evaluateReminders, localParts, normalizeSettings, overflowKinds, scheduledOn, type ReminderFacts, type ReminderSettings } from "./schedule";

const facts = (over: Partial<ReminderFacts> = {}): ReminderFacts => ({
  plannedWorkout: { name: "Pull B", exercises: 6, minutes: 70 },
  workoutDone: false,
  mealsLogged: 1,
  caloriesToday: 900,
  calorieGoal: 3300,
  waterMl: 1400,
  waterGoalMl: 3000,
  weighedInToday: false,
  weighInsThisWeek: 3,
  lastPhotoDate: "2026-09-14",
  lastMonthReviewSaved: false,
  sleepGoalH: 8,
  ...over,
});

const on = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...DEFAULT_REMINDERS,
  workout: { on: true, time: "17:00" },
  ...over,
});

// Friday Oct 16 2026, Toronto is on EDT (UTC−4): 21:00Z = 17:00 local
const at = (iso: string) => new Date(iso);

describe("normalizeSettings", () => {
  it("defaults everything off and repairs bad values", () => {
    const s = normalizeSettings({ workout: { on: true, time: "25:00" }, weighin: { on: "yes", day: 9 }, photos: { on: true, day: 31, time: "07:30" }, junk: 1 });
    expect(s.workout).toEqual({ on: true, time: "17:00" });
    expect(s.weighin).toEqual({ on: false, day: 0, time: "08:00" });
    expect(s.photos).toEqual({ on: true, day: 1, time: "07:30" });
    expect(s.food.on).toBe(false);
    expect(anyOn(normalizeSettings(null))).toBe(false);
    expect(anyOn(normalizeSettings([]))).toBe(false);
    expect(anyOn(s)).toBe(true);
  });
});

describe("localParts", () => {
  it("reads wall-clock time in the user's timezone", () => {
    expect(localParts(at("2026-10-16T21:07:00Z"), "America/Toronto")).toEqual({ date: "2026-10-16", minutes: 17 * 60 + 7, weekday: 5, day: 16 });
    expect(localParts(at("2026-10-16T15:30:00Z"), "Asia/Tokyo")).toMatchObject({ date: "2026-10-17", minutes: 30, weekday: 6 });
  });

  it("follows daylight saving changes", () => {
    // Toronto falls back on Sunday Nov 1 2026: 13:00Z is 08:00 EST
    expect(localParts(at("2026-11-01T13:00:00Z"), "America/Toronto")).toMatchObject({ date: "2026-11-01", minutes: 480, weekday: 0, day: 1 });
    expect(localParts(at("2026-10-31T12:00:00Z"), "America/Toronto")).toMatchObject({ minutes: 480 }); // 08:00 EDT
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(localParts(at("2026-10-16T21:00:00Z"), "Mars/Olympus")).toMatchObject({ date: "2026-10-16", minutes: 21 * 60 });
  });
});

describe("dueByTime", () => {
  it("fires inside the 15-minute window that contains the local time, once", () => {
    const s = on({ workout: { on: true, time: "17:05" } });
    const p = (iso: string) => localParts(at(iso), "America/Toronto");
    expect(dueByTime(s, p("2026-10-16T21:00:00Z"))).toEqual([]); // 17:00 run
    expect(dueByTime(s, p("2026-10-16T21:05:00Z"))).toEqual(["workout"]);
    expect(dueByTime(s, p("2026-10-16T21:15:00Z"))).toEqual(["workout"]); // the 17:15 run catches 17:05
    expect(dueByTime(s, p("2026-10-16T21:20:00Z"))).toEqual([]); // 15 minutes later: window closed
    // runs at :00/:15/:30/:45 hit any minute exactly once
    const runs = ["21:00", "21:15", "21:30"].map((t) => dueByTime(s, p(`2026-10-16T${t}:00Z`)).length);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("respects the weekly day and the monthly day", () => {
    const s = on({ workout: { on: false, time: "17:00" }, weighin: { on: true, day: 0, time: "08:00" }, photos: { on: true, day: 1, time: "08:00" }, review: { on: true, time: "08:00" } });
    const sun1 = localParts(at("2026-11-01T13:00:00Z"), "America/Toronto"); // Sunday the 1st, 08:00
    expect(dueByTime(s, sun1)).toEqual(["weighin", "review", "photos"]);
    const sat = localParts(at("2026-10-31T12:00:00Z"), "America/Toronto"); // Saturday 31st, 08:00
    expect(dueByTime(s, sat)).toEqual([]);
  });

  it("ignores reminders that are off", () => {
    expect(dueByTime(DEFAULT_REMINDERS, localParts(at("2026-10-16T21:00:00Z"), "America/Toronto"))).toEqual([]);
  });
});

describe("buildNotice", () => {
  it("writes short, numbers-first copy with deep links", () => {
    const w = buildNotice("workout", "2026-10-16", facts())!;
    expect(w).toMatchObject({ title: "Pull B today", url: "/", tag: "pgg-workout", dueKey: "2026-10-16" });
    expect(w.body).toBe("6 exercises · about 70 min. Open the app when you're at the gym.");
    expect(buildNotice("food", "2026-10-16", facts())!.body).toBe("1 meal logged · 900 of 3,300 kcal. Add the rest while you remember.");
    expect(buildNotice("food", "2026-10-16", facts({ mealsLogged: 0, caloriesToday: 0 }))!.body).toBe("Nothing logged yet today. Your target is 3,300 kcal.");
    expect(buildNotice("hydration", "2026-10-16", facts())!.body).toBe("1.4 L of 3.0 L so far today.");
    expect(buildNotice("weighin", "2026-10-18", facts())!.url).toBe("/progress?tab=weight&log=1");
    expect(buildNotice("photos", "2026-11-01", facts())!.body).toContain("Last set: Sep 14.");
    const review = buildNotice("review", "2026-11-01", facts())!;
    expect(review.title).toBe("October review is ready");
    expect(review.url).toBe("/reviews/2026-10");
    for (const k of ["workout", "food", "hydration", "sleep", "weighin", "photos", "review"] as const) {
      const n = buildNotice(k, "2026-11-01", facts());
      if (n) expect(`${n.title} ${n.body}`).not.toMatch(/!/);
    }
  });

  it("stays quiet when the task is already done", () => {
    expect(buildNotice("workout", "2026-10-16", facts({ workoutDone: true }))).toBeNull();
    expect(buildNotice("workout", "2026-10-18", facts({ plannedWorkout: null }))).toBeNull(); // rest day
    expect(buildNotice("food", "2026-10-16", facts({ mealsLogged: 3 }))).toBeNull();
    expect(buildNotice("food", "2026-10-16", facts({ mealsLogged: 2, caloriesToday: 2900 }))).toBeNull();
    expect(buildNotice("hydration", "2026-10-16", facts({ waterMl: 3000 }))).toBeNull();
    expect(buildNotice("weighin", "2026-10-18", facts({ weighedInToday: true }))).toBeNull();
    expect(buildNotice("photos", "2026-11-01", facts({ lastPhotoDate: "2026-10-25" }))).toBeNull();
    expect(buildNotice("photos", "2026-11-01", facts({ lastPhotoDate: null }))).not.toBeNull();
    expect(buildNotice("review", "2026-11-01", facts({ lastMonthReviewSaved: true }))).toBeNull();
  });
});

describe("evaluateReminders", () => {
  const all = {
    workout: { on: true, time: "08:00" },
    food: { on: true, time: "08:00" },
    hydration: { on: true, time: "08:00" },
    sleep: { on: true, time: "08:00" },
    weighin: { on: true, day: 0, time: "08:00" },
    photos: { on: true, day: 1, time: "08:00" },
    review: { on: true, time: "08:00" },
  };
  const sun1 = at("2026-11-01T13:00:00Z");

  it("sends at most 3 a day, most important first", () => {
    const out = evaluateReminders({ settings: all, timeZone: "America/Toronto", now: sun1, facts: facts(), sentToday: [] });
    expect(out.map((n) => n.kind)).toEqual(["workout", "food", "weighin"]);
  });

  it("counts what was already delivered today and never repeats a reminder", () => {
    const out = evaluateReminders({ settings: all, timeZone: "America/Toronto", now: sun1, facts: facts(), sentToday: ["workout", "sleep"] });
    expect(out.map((n) => n.kind)).toEqual(["food"]);
    expect(evaluateReminders({ settings: all, timeZone: "America/Toronto", now: sun1, facts: facts(), sentToday: ["a", "b", "c"] })).toEqual([]);
  });

  it("skips done tasks without spending the daily budget", () => {
    const out = evaluateReminders({
      settings: all,
      timeZone: "America/Toronto",
      now: sun1,
      facts: facts({ workoutDone: true, mealsLogged: 3, weighedInToday: true }),
      sentToday: [],
    });
    expect(out.map((n) => n.kind)).toEqual(["hydration", "review", "photos"]);
  });

  it("does nothing outside the window or in another timezone's morning", () => {
    expect(evaluateReminders({ settings: all, timeZone: "America/Toronto", now: at("2026-11-01T14:00:00Z"), facts: facts(), sentToday: [] })).toEqual([]);
    const tokyo = evaluateReminders({ settings: { workout: { on: true, time: "08:00" } }, timeZone: "Asia/Tokyo", now: at("2026-10-15T23:05:00Z"), facts: facts(), sentToday: [] });
    expect(tokyo.map((n) => n.dueKey)).toEqual(["2026-10-16"]);
  });
});

describe("daily budget by importance", () => {
  // the state from Settings that used to drop Sleep silently: hydration 15:00, workout 17:00,
  // food 20:00, sleep 22:00 — four on a training day. Toronto, Friday Oct 16 (EDT, UTC−4).
  const day = {
    hydration: { on: true, time: "15:00" },
    workout: { on: true, time: "17:00" },
    food: { on: true, time: "20:00" },
    sleep: { on: true, time: "22:00" },
  };
  const run = (iso: string, sentToday: string[], f = facts()) => evaluateReminders({ settings: day, timeZone: "America/Toronto", now: at(iso), facts: f, sentToday }).map((n) => n.kind);

  it("an early minor reminder still goes out when the later important ones fit", () => {
    expect(run("2026-10-16T19:02:00Z", [])).toEqual(["hydration"]); // 15:02
    expect(run("2026-10-16T21:02:00Z", ["hydration"])).toEqual(["workout"]); // 17:02
    expect(run("2026-10-16T00:02:00Z".replace("10-16", "10-17"), ["hydration", "workout"])).toEqual(["food"]); // 20:02
    expect(run("2026-10-17T02:02:00Z", ["hydration", "workout", "food"])).toEqual([]); // 22:02, cap reached
  });

  it("a minor reminder yields when more important ones later today need the slots", () => {
    // weigh-in day too (Friday): workout, food and weigh-in outrank hydration
    const s = { ...day, weighin: { on: true, day: 5, time: "18:00" } };
    const out = evaluateReminders({ settings: s, timeZone: "America/Toronto", now: at("2026-10-16T19:02:00Z"), facts: facts(), sentToday: [] });
    expect(out).toEqual([]);
    // …but goes out once the later ones are already done or not needed today
    const done = evaluateReminders({ settings: s, timeZone: "America/Toronto", now: at("2026-10-16T19:02:00Z"), facts: facts({ workoutDone: true }), sentToday: [] });
    expect(done.map((n) => n.kind)).toEqual(["hydration"]);
    const rest = evaluateReminders({ settings: s, timeZone: "America/Toronto", now: at("2026-10-16T19:02:00Z"), facts: facts({ plannedWorkout: null }), sentToday: [] });
    expect(rest.map((n) => n.kind)).toEqual(["hydration"]);
  });

  it("lists which reminders lose out on a busy day", () => {
    expect(overflowKinds(day)).toEqual(["sleep"]);
    expect(overflowKinds({ workout: { on: true }, sleep: { on: true } })).toEqual([]);
    expect(overflowKinds({ ...day, review: { on: true }, photos: { on: true } })).toEqual(["review", "photos", "sleep"]);
    expect(scheduledOn(normalizeSettings({ ...day, weighin: { on: true, day: 0 } }), { weekday: 5, day: 16 })).toEqual(["workout", "food", "hydration", "sleep"]);
  });
});
