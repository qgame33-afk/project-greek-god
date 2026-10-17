import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { BLOCK_MAX_WEEKS, DELOAD_WINDOW, blockStrip, programWeek } from "./block";
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
