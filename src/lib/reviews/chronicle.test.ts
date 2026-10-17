import { describe, expect, it } from "vitest";
import { bookSubtitle, bookTitle, sessionsLine, terracesReachedIn } from "./chronicle";

const stats = (over: { from?: string; to?: string; monthIndex?: number; sessions?: number; records?: number; planned?: number; plannedDone?: number } = {}) => ({
  month: (over.from ?? "2026-10-01").slice(0, 8) + "01",
  window: { from: over.from ?? "2026-10-01", to: over.to ?? "2026-10-31", days: 31, complete: true, monthIndex: over.monthIndex ?? 2, monthsTotal: 11, outOfRange: null },
  training: {
    sessions: over.sessions ?? 0,
    planned: over.planned ?? 0,
    plannedDone: over.plannedDone ?? 0,
    prs: { count: over.records ?? 0, items: Array.from({ length: over.records ?? 0 }, (_, i) => ({ slug: `l${i}`, name: "Lift", date: "2026-10-05", weight: 100, reps: 5, e1rm: 120, gain: 2 })) },
  },
});

const T = [
  { index: 1, numeral: "I", lb: 165, reachedOn: "2026-09-22" },
  { index: 2, numeral: "II", lb: 167.5, reachedOn: "2026-10-14" },
  { index: 3, numeral: "III", lb: 170, reachedOn: null },
];

describe("the Book's subtitle states only what the logs show", () => {
  it("the current month is being written", () => {
    expect(bookSubtitle(stats({ records: 4 }) as never, { startDate: "2026-09-11", current: true })).toBe("being written");
  });
  it("the first month began the climb", () => {
    expect(bookSubtitle(stats({ from: "2026-09-11", to: "2026-09-30", sessions: 19 }) as never, { startDate: "2026-09-11", current: false })).toBe("in which the climb began");
  });
  it("a terrace beats records and sessions", () => {
    expect(bookSubtitle(stats({ records: 4, sessions: 20 }) as never, { startDate: "2026-09-11", current: false, terraces: T })).toBe("in which Terrace II was reached");
    expect(terracesReachedIn(T, "2026-09-01", "2026-10-31").map((t) => t.numeral)).toEqual(["I", "II"]);
  });
  it("then records, then sessions, then a quiet month", () => {
    const o = { startDate: "2026-09-11", current: false, terraces: [] };
    expect(bookSubtitle(stats({ records: 3, sessions: 12 }) as never, o)).toBe("in which 3 records were set");
    expect(bookSubtitle(stats({ records: 1 }) as never, o)).toBe("in which a record was set");
    expect(bookSubtitle(stats({ sessions: 12 }) as never, o)).toBe("in which 12 sessions were sealed");
    expect(bookSubtitle(stats({ sessions: 1 }) as never, o)).toBe("in which one session was sealed");
    expect(bookSubtitle(stats() as never, o)).toBe("a quiet month");
  });
  it("titles the Book with its Roman numeral and the month in film capitals", () => {
    expect(bookTitle(stats({ monthIndex: 2 }) as never, { startDate: "2026-09-11", current: false })).toMatchObject({ book: "Book II", numeral: "II", film: "OCTOBER" });
  });
  it("sessions read X of Y planned, never a percentage", () => {
    expect(sessionsLine({ planned: 20, plannedDone: 19, sessions: 21 } as never)).toEqual({ value: "19", label: "sessions of 20" });
    expect(sessionsLine({ planned: 0, plannedDone: 0, sessions: 0 } as never)).toEqual({ value: "—", label: "sessions" });
  });
});
