import { describe, expect, it } from "vitest";
import { bookGild, bookSubtitle, bookTitle, chronicleStamp, monthChange, nextMonthPlan, sessionsLine, terracesReachedIn, titleCredits } from "./chronicle";

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

describe("the chapters' numbers", () => {
  const phys = (change: number | null, early = false) => ({
    physical: { change, monthStartDate: change == null ? null : "2026-09-11", monthEndDate: change == null ? null : "2026-09-30", earlyWater: early },
    training: { planned: 20, plannedDone: 19, sessions: 19, prs: { count: 4, items: Array.from({ length: 4 }, () => ({})) } },
  });

  it("credits: the trend change, sessions of planned, records; a missing change is a dash", () => {
    expect(titleCredits(phys(4) as never, "lb").map((c) => c.value)).toEqual(["+4.0", "19", "4"]);
    expect(titleCredits(phys(4) as never, "lb")[0].label).toBe("lb · trend change");
    expect(titleCredits(phys(null) as never, "lb")[0].value).toBe("—");
    expect(titleCredits(phys(-1.24) as never, "lb")[0].value).toBe("−1.2");
    expect(titleCredits(phys(4.4) as never, "kg")[0].value).toBe("+2.0");
  });

  it("the month figure is a change with its dates, and flags early water", () => {
    expect(monthChange(phys(4, true) as never, "lb")).toEqual({ value: "+4.0 lb", range: "11 → 30 Sep", earlyWater: true });
    expect(monthChange(phys(null) as never, "lb")).toEqual({ value: null, range: null, earlyWater: false });
  });

  it("gilds the statue to the trend at the month's end, not today's", () => {
    const w = Array.from({ length: 40 }, (_, i) => ({ local_date: `2026-${i < 20 ? "09" : "10"}-${String((i % 20) + 10).padStart(2, "0")}`, weight_lb: 163 + i * 0.1 }));
    const sep = bookGild(w, "2026-09-30", 163, 183);
    const oct = bookGild(w, "2026-10-31", 163, 183);
    expect(sep).toBeGreaterThan(0);
    expect(oct).toBeGreaterThan(sep);
    expect(bookGild(w.slice(0, 3), "2026-09-30", 163, 183)).toBe(0); // under 4 weigh-ins: marble
  });

  it("next month's PLAN weight is the straight line at its last day", () => {
    const p = { start_date: "2026-09-01", target_date: "2027-08-01", start_weight_lb: 163, goal_weight_lb: 183 };
    const n = nextMonthPlan("2026-09-01", p)!;
    expect(n.month).toBe("2026-10-01");
    expect(n.end).toBe("2026-10-31");
    expect(n.lb).toBeGreaterThan(165);
    expect(n.lb).toBeLessThan(167);
    expect(nextMonthPlan("2027-08-01", p)).toBeNull();
    expect(nextMonthPlan("2026-09-01", { ...p, goal_weight_lb: null })).toBeNull();
  });

  it("stamps a sealed Book with its sealing day", () => {
    expect(chronicleStamp("2026-09-01", "2026-10-17")).toBe("The Chronicle · 1 Oct");
    expect(chronicleStamp("2026-10-01", "2026-10-17")).toBe("The Chronicle · being written");
  });
});
