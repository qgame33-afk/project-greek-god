import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { BLOCK_MAX_WEEKS, DELOAD_WINDOW, blockStrip, lighterWeekAdvice, performanceDips, programWeek } from "./block";
import type { PastSet } from "./progression";
import { deloadAdvice } from "./schedule";

const TODAY = "2026-10-17"; // Saturday; week starts Mon 2026-10-12

/** n done sessions in the week starting `monday`. */
const week = (monday: string, n: number, mode = "standard") => Array.from({ length: n }, (_, i) => ({ local_date: addDays(monday, i), status: "done", mode, template_key: null }));

// The demo user's history: started Fri 11 Sep, then 6/5/6/5 sessions, 4 so far this week.
const DEMO = [...week("2026-09-11", 2), ...week("2026-09-14", 6), ...week("2026-09-21", 5), ...week("2026-09-28", 6), ...week("2026-10-05", 5), ...week("2026-10-12", 4)];

describe("blockStrip", () => {
  it("draws one segment per week since the programme start, ending at this week", () => {
    const b = blockStrip({ sessions: DEMO, today: TODAY, programStart: "2026-09-11", mode: "standard" });
    expect(b.since).toEqual({ kind: "start", week: "2026-09-07" });
    expect(b.weeks.map((w) => w.state)).toEqual(["light", "hard", "hard", "hard", "hard", "hard"]);
    expect(b.weeks.at(-1)).toMatchObject({ start: "2026-10-12", current: true, sessions: 4 });
    expect(b.hardWeeks).toBe(5);
    // hard week 5 of the streak is this week: the deload window is reached
    expect(b.weeksToWindow).toBe(0);
    expect(b.windowIndex).toBe(5);
  });

  it("agrees with deloadAdvice on the hard-week count", () => {
    const cases = [
      { sessions: DEMO, mode: "standard" },
      { sessions: [...week("2026-09-28", 6), ...week("2026-10-05", 2), ...week("2026-10-12", 3)], mode: "standard" },
      { sessions: [...week("2026-09-21", 5), ...week("2026-09-28", 5, "deload"), ...week("2026-10-05", 5), ...week("2026-10-12", 5)], mode: "standard" },
      { sessions: DEMO, mode: "deload" },
    ];
    for (const c of cases) {
      const b = blockStrip({ sessions: c.sessions, today: TODAY, programStart: "2026-09-11", mode: c.mode });
      const d = deloadAdvice({ sessions: c.sessions, recovery: [], today: TODAY, mode: c.mode });
      expect(b.hardWeeks).toBe(d.hardWeeks);
      expect(d.suggest).toBe(b.hardWeeks >= DELOAD_WINDOW);
    }
  });

  it("starts after the last deload week", () => {
    const s = [...week("2026-09-21", 5), ...week("2026-09-28", 5, "deload"), ...week("2026-10-05", 5), ...week("2026-10-12", 2)];
    const b = blockStrip({ sessions: s, today: TODAY, programStart: "2026-09-01", mode: "standard" });
    expect(b.since).toEqual({ kind: "deload", week: "2026-10-05" });
    expect(b.weeks.map((w) => w.state)).toEqual(["hard", "open"]);
    expect(b.hardWeeks).toBe(1);
    // the window is still ahead: never drawn as a future segment
    expect(b.windowIndex).toBeNull();
    expect(b.weeksToWindow).toBe(4);
  });

  it("restarts the streak after a light week", () => {
    const s = [...week("2026-09-21", 5), ...week("2026-09-28", 5), ...week("2026-10-05", 2), ...week("2026-10-12", 4)];
    const b = blockStrip({ sessions: s, today: TODAY, programStart: "2026-09-21", mode: "standard" });
    expect(b.weeks.map((w) => w.state)).toEqual(["hard", "hard", "light", "hard"]);
    expect(b.hardWeeks).toBe(1);
    expect(b.weeksToWindow).toBe(4);
  });

  it("is one open segment for a brand-new programme", () => {
    const b = blockStrip({ sessions: [], today: TODAY, programStart: "2026-10-16", mode: "standard" });
    expect(b.weeks).toEqual([{ start: "2026-10-12", sessions: 0, state: "open", current: true }]);
    expect(b.hardWeeks).toBe(0);
    expect(b.weeksToWindow).toBe(DELOAD_WINDOW);
    expect(b.windowIndex).toBeNull();
  });

  it("fills the current segment as a deload week when deload mode is on", () => {
    const b = blockStrip({ sessions: DEMO, today: TODAY, programStart: "2026-09-11", mode: "deload" });
    expect(b.weeks.at(-1)!.state).toBe("deload");
    expect(b.deloading).toBe(true);
    expect(b.hardWeeks).toBe(0);
  });

  it("marks the window where it fell when the streak ran past it", () => {
    const s = [...week("2026-08-31", 5), ...week("2026-09-07", 5), ...week("2026-09-14", 5), ...week("2026-09-21", 5), ...week("2026-09-28", 5), ...week("2026-10-05", 5), ...week("2026-10-12", 1)];
    const b = blockStrip({ sessions: s, today: TODAY, programStart: "2026-08-31", mode: "standard" });
    expect(b.hardWeeks).toBe(6);
    expect(b.windowIndex).toBe(4);
  });

  it("cuts a very long block to the last weeks and says how many were left off", () => {
    const s = Array.from({ length: 20 }, (_, i) => week(addDays("2026-06-01", i * 7), 5)).flat();
    const b = blockStrip({ sessions: s, today: TODAY, programStart: "2026-06-01", mode: "standard" });
    expect(b.weeks).toHaveLength(BLOCK_MAX_WEEKS);
    expect(b.hidden).toBeGreaterThan(0);
  });

  it("starts at the history edge when the programme start is older than the loaded sessions", () => {
    const b = blockStrip({ sessions: DEMO, today: TODAY, programStart: "2026-01-05", historyFrom: "2026-09-21", mode: "standard" });
    expect(b.since).toEqual({ kind: "history", week: "2026-09-21" });
    expect(b.weeks[0].start).toBe("2026-09-21");
  });

  it("ignores sessions that are not done", () => {
    const b = blockStrip({ sessions: [{ local_date: "2026-10-13", status: "active" }, { local_date: "2026-10-14", status: "discarded" }], today: TODAY, programStart: "2026-10-12", mode: "standard" });
    expect(b.weeks[0].sessions).toBe(0);
  });
});

describe("programWeek", () => {
  it("counts weeks from the week the programme started", () => {
    expect(programWeek("2026-09-11", TODAY)).toBe(6);
    expect(programWeek("2026-10-16", TODAY)).toBe(1);
    expect(programWeek("2026-10-12", "2026-10-19")).toBe(2);
    expect(programWeek(null, TODAY)).toBeNull();
    expect(programWeek("2026-11-01", TODAY)).toBeNull();
  });
});

/* -------------------------------------------- lighter weeks (PROGRAM-ARNOLD §4.3) */

describe("lighterWeekAdvice", () => {
  const T = "2026-11-20"; // a Friday; the week starts Mon 2026-11-16
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(T, -i));
  const ck = (over: Partial<{ sleep_hours: number | null; soreness: number | null; fatigue: number | null }> = {}) =>
    days7.map((d) => ({ local_date: d, sleep_hours: 8, soreness: 2, fatigue: 2, ...over }));
  const base = {
    today: T,
    mode: "standard" as const,
    modeSetAt: null,
    snoozedUntil: null,
    sessions: [] as { local_date: string; status: string; mode?: string | null }[],
    checkins: ck(),
    sleepGoalH: 8,
    history: {},
    plannedByWeek: [],
    historyFrom: "2026-09-01",
  };
  const tired3 = days7.map((d, i) => ({ local_date: d, sleep_hours: 8, soreness: 2, fatigue: i < 3 ? 4 : 2 }));
  const sore3 = days7.map((d, i) => ({ local_date: d, sleep_hours: 8, soreness: i < 3 ? 5 : 2, fatigue: 2 }));

  it("says nothing when every signal is fine", () => {
    expect(lighterWeekAdvice(base).kind).toBeNull();
  });

  it("one signal → a lighter week (fatigue, soreness or sleep alone)", () => {
    const f = lighterWeekAdvice({ ...base, checkins: tired3 });
    expect(f.kind).toBe("lighter");
    expect(f.reasons).toEqual(["Tiredness 4 of 5 or higher on 3 of your last 7 check-ins."]);
    expect(lighterWeekAdvice({ ...base, checkins: sore3 }).reasons).toEqual(["Soreness 4 of 5 or higher on 3 of your last 7 check-ins."]);
    const s = lighterWeekAdvice({ ...base, checkins: ck({ sleep_hours: 6.25 }) });
    expect(s.kind).toBe("lighter");
    expect(s.reasons).toEqual(["Sleep averaged 6.25 h against 8."]);
  });

  /** n lifts whose latest session (T−2) fell 2+ reps at the same load against T−9. */
  const dips = (n: number, of: number, restLatest = 120, restPrev = 120) => {
    const h: Record<string, PastSet[]> = {};
    for (let i = 0; i < of; i++) {
      const slug = `lift-${i}`;
      const mk = (d: string, reps: number, rest: number) =>
        [0, 1].map((k) => ({ local_date: d, session_id: `${slug}${d}`, set_index: k, weight_lb: 100, reps, duration_sec: null, rir: null, mode: "standard" as const, completed_at: new Date(Date.parse(`${d}T18:00:00Z`) + k * rest * 1000).toISOString() }));
      h[slug] = [...mk(addDays(T, -2), i < n ? 8 : 10, restLatest), ...mk(addDays(T, -9), 10, restPrev)];
    }
    return h;
  };

  it("performance: reps down on 3+ lifts and 40%+ of those compared", () => {
    const p = lighterWeekAdvice({ ...base, history: dips(4, 9) });
    expect(p.kind).toBe("lighter");
    expect(p.reasons).toEqual(["Reps dropped on 4 of 9 lifts at the same weight."]);
    expect(lighterWeekAdvice({ ...base, history: dips(3, 9) }).kind).toBeNull(); // 33%
    expect(performanceDips(dips(4, 9), T)).toMatchObject({ dips: 4, compared: 9 });
  });

  it("skips dips explained by a much shorter rest", () => {
    expect(performanceDips(dips(4, 4, 60, 150), T).compared).toBe(0);
  });

  it("two signals, or 5 hard weeks in a row → a deload", () => {
    const two = lighterWeekAdvice({ ...base, checkins: days7.map((d, i) => ({ local_date: d, sleep_hours: 8, soreness: i < 3 ? 4 : 2, fatigue: i < 3 ? 4 : 2 })) });
    expect(two.kind).toBe("deload");
    expect(two.reasons).toHaveLength(2);
    const hard = [...week("2026-10-12", 5), ...week("2026-10-19", 5), ...week("2026-10-26", 5), ...week("2026-11-02", 5), ...week("2026-11-09", 5)];
    const streak = lighterWeekAdvice({ ...base, sessions: hard });
    expect(streak.kind).toBe("deload");
    expect(streak.reasons[0]).toBe("5 hard weeks in a row.");
  });

  it("missed workouts count only with high average soreness or tiredness", () => {
    const missed = [{ weekStart: "2026-11-02", planned: 6, done: 3 }, { weekStart: "2026-11-09", planned: 6, done: 4 }];
    expect(lighterWeekAdvice({ ...base, plannedByWeek: missed }).kind).toBeNull();
    expect(lighterWeekAdvice({ ...base, plannedByWeek: missed, checkins: ck({ soreness: 4 }) }).kind).toBe("lighter");
  });

  it("suggests going back to normal 7 days after a lighter or deload mode was set", () => {
    expect(lighterWeekAdvice({ ...base, mode: "intro", modeSetAt: addDays(T, -7) }).kind).toBe("standard");
    expect(lighterWeekAdvice({ ...base, mode: "intro", modeSetAt: addDays(T, -6) }).kind).toBeNull();
    expect(lighterWeekAdvice({ ...base, mode: "deload", modeSetAt: addDays(T, -8), checkins: tired3 }).kind).toBe("standard");
    expect(lighterWeekAdvice({ ...base, mode: "deload", modeSetAt: addDays(T, -2), checkins: tired3 }).kind).toBeNull();
  });

  it("stays quiet while snoozed, right after a deload week, and in the first 3 weeks", () => {
    expect(lighterWeekAdvice({ ...base, checkins: tired3, snoozedUntil: addDays(T, 3) }).kind).toBeNull();
    expect(lighterWeekAdvice({ ...base, checkins: tired3, sessions: week("2026-11-02", 3, "deload") }).kind).toBeNull();
    expect(lighterWeekAdvice({ ...base, checkins: tired3, sessions: week("2026-10-12", 3, "deload") }).kind).toBe("lighter");
    expect(lighterWeekAdvice({ ...base, checkins: tired3, historyFrom: addDays(T, -10) }).kind).toBeNull();
  });
});
