import { describe, expect, it } from "vitest";
import {
  deloadAdvice,
  describeMove,
  groupByWeek,
  linkedMoveDates,
  missedWorkouts,
  planMove,
  rescheduleOptions,
  scheduleFreeze,
  scheduleIssues,
  shiftWeek,
  skipToday,
  weekComplete,
  weekDays,
  weekdaysFor,
  type PlanLike,
  type SessionLike,
} from "./schedule";
import { addDays, weekDates } from "@/lib/dates";

// Thursday, Oct 15 2026. Week runs Mon Oct 12 → Sun Oct 18.
const TODAY = "2026-10-15";
const NAMES: Record<string, string> = { push_a: "Push A", pull_a: "Pull A", legs_a: "Legs A", push_b: "Push B", pull_b: "Pull B", legs_b: "Legs B" };
const DEFAULT: Record<number, string> = { 1: "push_a", 2: "pull_a", 3: "legs_a", 4: "push_b", 5: "pull_b", 6: "legs_b", 0: "rest" };

/** Resolve plans for a range from the default schedule plus explicit overrides. */
function plansFor(from: string, days: number, overrides: Record<string, string> = {}): PlanLike[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const wd = new Date(date + "T12:00:00").getDay();
    const o = overrides[date];
    const key = o ?? DEFAULT[wd];
    return { date, key, name: key === "rest" ? null : NAMES[key], overridden: o != null };
  });
}

const done = (local_date: string, template_key: string): SessionLike => ({ local_date, status: "done", template_key, name: NAMES[template_key] });

describe("weekDays", () => {
  const dates = weekDates(TODAY);
  const plans = plansFor(dates[0], 7);

  it("marks done, missed, today and rest days (never volleyball)", () => {
    const days = weekDays({
      dates,
      plans,
      sessions: [done("2026-10-12", "push_a"), done("2026-10-14", "legs_a"), { local_date: "2026-10-15", status: "active", template_key: "push_b" }],
      today: TODAY,
    });
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: "2026-10-12", kind: "train", done: true, missed: false, label: "Push A" });
    expect(days[1]).toMatchObject({ date: "2026-10-13", kind: "train", done: false, missed: true, label: "Pull A" });
    expect(days[2]).toMatchObject({ done: true, missed: false });
    // in-progress today is neither done nor missed
    expect(days[3]).toMatchObject({ today: true, done: false, missed: false });
    expect(days[4]).toMatchObject({ kind: "train", done: false, missed: false }); // future
    expect(days[6]).toMatchObject({ date: "2026-10-18", kind: "rest", label: "Rest", missed: false });
  });

  it("turns a rest day into a gilded column when a workout was actually done", () => {
    const days = weekDays({ dates, plans, sessions: [done("2026-10-11", "push_a"), done("2026-10-18", "pull_b")], today: "2026-10-19" });
    expect(days[6]).toMatchObject({ kind: "train", done: true, label: "Pull B" });
  });

  it("weekComplete needs every training column done", () => {
    expect(weekComplete([{ kind: "train", done: true }, { kind: "rest", done: false }])).toBe(true);
    expect(weekComplete([{ kind: "train", done: true }, { kind: "train", done: false }])).toBe(false);
    expect(weekComplete([{ kind: "rest", done: false }])).toBe(false);
  });
});

describe("missedWorkouts", () => {
  const plans = plansFor("2026-10-05", 14);

  it("finds planned days with no session in the last 7 days, newest first", () => {
    const sessions = [done("2026-10-08", "push_b"), done("2026-10-09", "pull_b"), done("2026-10-10", "legs_b"), done("2026-10-12", "push_a"), done("2026-10-14", "legs_a")];
    const m = missedWorkouts({ today: TODAY, plans, sessions });
    expect(m.map((x) => x.date)).toEqual(["2026-10-13"]);
    expect(m[0]).toMatchObject({ key: "pull_a", name: "Pull A" });
  });

  it("ignores today, rest days, rest overrides and days before the start date", () => {
    const p = plansFor("2026-10-05", 14, { "2026-10-13": "rest", "2026-10-12": "push_b" });
    const m = missedWorkouts({ today: TODAY, plans: p, sessions: [], since: "2026-10-10" });
    // 10-10 Legs B missed; 10-11 Sunday rest; 10-12 swapped to Push B and not done; 10-13 set to rest; 10-14 Legs A missed
    expect(m.map((x) => x.date)).toEqual(["2026-10-14", "2026-10-12", "2026-10-10"]);
    expect(m[1]).toMatchObject({ key: "push_b", name: "Push B" });
  });

  it("treats the same template done later as handled, but not a different one done that day", () => {
    const m = missedWorkouts({ today: TODAY, plans, sessions: [done("2026-10-14", "pull_a")], since: "2026-10-13" });
    // Pull A planned on the 13th was done on the 14th; Legs A planned on the 14th was not done
    expect(m).toEqual([{ date: "2026-10-14", key: "legs_a", name: "Legs A", doneInstead: "Pull A" }]);
  });

  it("surfaces a workout that was moved to another day and then skipped there", () => {
    const p = plansFor("2026-10-05", 14, { "2026-10-12": "rest", "2026-10-13": "push_a" }).map((x) =>
      x.date === "2026-10-13" ? { ...x, reason: "rescheduled", movedFrom: "2026-10-12" } : x,
    );
    const m = missedWorkouts({ today: TODAY, plans: p, sessions: [done("2026-10-14", "legs_a")], since: "2026-10-12" });
    expect(m.map((x) => [x.date, x.key])).toEqual([["2026-10-13", "push_a"]]);
  });

  it("counts a template done earlier in the week on another day as handled", () => {
    // Pull B done Monday (planned Push A); Friday's Pull B is covered, Monday's Push A is not
    const p = plansFor("2026-10-12", 7);
    const m = missedWorkouts({ today: "2026-10-17", plans: p, sessions: [done("2026-10-12", "pull_b"), done("2026-10-13", "pull_a"), done("2026-10-14", "legs_a"), done("2026-10-15", "push_b")], since: "2026-10-12" });
    expect(m.map((x) => x.key)).toEqual(["push_a"]);
    expect(m[0].doneInstead).toBe("Pull B");
  });

  it("does not let a duplicate weekday plan borrow another day's session", () => {
    const p = plansFor("2026-10-12", 7, { "2026-10-15": "push_a" });
    const m = missedWorkouts({ today: "2026-10-17", plans: p, sessions: [done("2026-10-12", "push_a")], since: "2026-10-15" });
    expect(m.map((x) => [x.date, x.key])).toEqual([["2026-10-16", "pull_b"], ["2026-10-15", "push_a"]]);
  });

  it("counts a free-form session on the day as handled", () => {
    const m = missedWorkouts({ today: TODAY, plans, sessions: [{ local_date: "2026-10-14", status: "done", template_key: null, name: "Custom" }], since: "2026-10-14" });
    expect(m).toEqual([]);
  });

  it("counts an in-progress session as handled", () => {
    const m = missedWorkouts({ today: TODAY, plans, sessions: [{ local_date: "2026-10-14", status: "active", template_key: "legs_a" }], since: "2026-10-14" });
    expect(m).toEqual([]);
  });
});

describe("planMove", () => {
  it("moves to a rest day and rests the old day", () => {
    const m = planMove({ from: "2026-10-16", to: "2026-10-18", fromKey: "pull_b", toKey: "rest", today: TODAY });
    expect(m.kind).toBe("move");
    expect(m.writes).toEqual([
      { plan_date: "2026-10-18", template_key: "pull_b", reason: "rescheduled", moved_from: "2026-10-16" },
      { plan_date: "2026-10-16", template_key: "rest", reason: "rescheduled", moved_from: null },
    ]);
  });

  it("swaps two future workouts", () => {
    const m = planMove({ from: "2026-10-16", to: "2026-10-17", fromKey: "pull_b", toKey: "legs_b", today: TODAY });
    expect(m.kind).toBe("swap");
    expect(m.writes[1]).toEqual({ plan_date: "2026-10-16", template_key: "legs_b", reason: "rescheduled", moved_from: "2026-10-17" });
  });

  it("replaces when catching up a missed workout onto a training day", () => {
    const m = planMove({ from: "2026-10-13", to: TODAY, fromKey: "pull_a", toKey: "push_b", today: TODAY });
    expect(m.kind).toBe("replace");
    expect(m.displaced).toBe("push_b");
    expect(m.writes[1]).toMatchObject({ plan_date: "2026-10-13", template_key: "rest" });
    expect(describeMove(m, NAMES, TODAY)).toBe("Pull A replaces Push B today. Push B is skipped unless you move it.");
  });

  it("never swaps out of a day that was already trained", () => {
    // Push A was done today although Push B was planned; moving Push B onto Friday's Pull B replaces it
    const m = planMove({ from: TODAY, to: "2026-10-16", fromKey: "push_b", toKey: "pull_b", today: TODAY, closed: true });
    expect(m.kind).toBe("replace");
    expect(m.writes[1]).toMatchObject({ plan_date: TODAY, template_key: "rest" });
    const free = planMove({ from: TODAY, to: "2026-10-18", fromKey: "push_b", toKey: "rest", today: TODAY, closed: true });
    expect(describeMove(free, NAMES, TODAY)).toBe("Push B moves to Sunday.");
  });

  it("rejects no-op and rest moves", () => {
    expect(() => planMove({ from: TODAY, to: TODAY, fromKey: "push_b", toKey: "push_b", today: TODAY })).toThrow();
    expect(() => planMove({ from: TODAY, to: "2026-10-18", fromKey: "rest", toKey: "rest", today: TODAY })).toThrow();
  });

  it("describes moves in plain English", () => {
    const move = planMove({ from: "2026-10-16", to: "2026-10-18", fromKey: "pull_b", toKey: "rest", today: TODAY });
    expect(describeMove(move, NAMES, TODAY)).toBe("Pull B moves to Sunday. Tomorrow becomes a rest day.");
    const swap = planMove({ from: TODAY, to: "2026-10-16", fromKey: "push_b", toKey: "pull_b", today: TODAY });
    expect(describeMove(swap, NAMES, TODAY)).toBe("Push B moves to tomorrow and Pull B to today.");
    const catchUp = planMove({ from: "2026-10-13", to: "2026-10-18", fromKey: "pull_a", toKey: "rest", today: TODAY });
    expect(describeMove(catchUp, NAMES, TODAY)).toBe("Pull A moves to Sunday.");
  });
});

describe("rescheduleOptions", () => {
  it("lists the next 7 days from today, excluding the source day", () => {
    const plans = plansFor(TODAY, 8);
    const opts = rescheduleOptions({ from: "2026-10-16", fromKey: "pull_b", today: TODAY, plans });
    expect(opts.map((o) => o.date)).toEqual(["2026-10-15", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(opts.find((o) => o.date === "2026-10-18")).toMatchObject({ key: "rest", kind: "move", recommended: true });
    expect(opts.find((o) => o.date === "2026-10-17")).toMatchObject({ key: "legs_b", kind: "swap", recommended: false });
  });

  it("recommends today and tomorrow when catching up a missed day", () => {
    const plans = plansFor(TODAY, 8);
    const opts = rescheduleOptions({ from: "2026-10-13", fromKey: "pull_a", today: TODAY, plans });
    expect(opts).toHaveLength(7);
    expect(opts[0]).toMatchObject({ date: TODAY, kind: "replace", recommended: true });
    expect(opts[1]).toMatchObject({ date: "2026-10-16", recommended: true });
    expect(opts[2]).toMatchObject({ date: "2026-10-17", recommended: false });
  });
});

describe("deloadAdvice", () => {
  /** n done sessions in each of `weeks` consecutive weeks ending with the week before TODAY. */
  function weeksOf(weeks: number, n: number, mode = "standard") {
    const out: (SessionLike & { mode: string })[] = [];
    for (let w = 1; w <= weeks; w++) {
      const monday = addDays("2026-10-12", -7 * w);
      for (let i = 0; i < n; i++) out.push({ local_date: addDays(monday, i), status: "done", template_key: "push_a", mode });
    }
    return out;
  }

  it("suggests a deload after 5 hard weeks", () => {
    const a = deloadAdvice({ sessions: weeksOf(5, 5), recovery: [], today: TODAY, mode: "standard" });
    expect(a).toMatchObject({ suggest: true, hardWeeks: 5 });
    expect(a.reasons[0]).toBe("5 hard weeks in a row.");
  });

  it("says when the streak started at a deload, or ran past the fetched history", () => {
    const s = [...weeksOf(5, 5), ...weeksOf(6, 5, "deload").filter((x) => x.local_date < addDays("2026-10-12", -35))];
    expect(deloadAdvice({ sessions: s, recovery: [], today: TODAY, mode: "standard" }).reasons[0]).toBe("5 hard weeks in a row since your last light week.");
    const capped = deloadAdvice({ sessions: weeksOf(9, 5), recovery: [], today: TODAY, mode: "standard", historyFrom: addDays("2026-10-12", -42) });
    expect(capped).toMatchObject({ hardWeeks: 6 });
    expect(capped.reasons[0]).toBe("At least 6 hard weeks in a row.");
  });

  it("does not suggest after 4 hard weeks or when weeks are light", () => {
    expect(deloadAdvice({ sessions: weeksOf(4, 6), recovery: [], today: TODAY, mode: "standard" }).suggest).toBe(false);
    expect(deloadAdvice({ sessions: weeksOf(8, 3), recovery: [], today: TODAY, mode: "standard" }).hardWeeks).toBe(0);
  });

  it("resets the count at a deload week", () => {
    const s = [...weeksOf(3, 5), ...weeksOf(4, 5, "deload").filter((x) => x.local_date < addDays("2026-10-12", -21))];
    expect(deloadAdvice({ sessions: s, recovery: [], today: TODAY, mode: "standard" }).hardWeeks).toBe(3);
  });

  it("counts the current week once it is already hard", () => {
    const cur = Array.from({ length: 4 }, (_, i) => ({ local_date: addDays("2026-10-12", i), status: "done", template_key: "x", mode: "standard" }));
    expect(deloadAdvice({ sessions: [...weeksOf(4, 4), ...cur], recovery: [], today: TODAY, mode: "standard" }).hardWeeks).toBe(5);
  });

  it("suggests on persistently high fatigue and never while deloading", () => {
    const recovery = ["2026-10-11", "2026-10-13", "2026-10-14", "2026-10-15"].map((d, i) => ({ local_date: d, soreness: 2, fatigue: i === 0 ? 2 : 4 }));
    const a = deloadAdvice({ sessions: [], recovery, today: TODAY, mode: "standard" });
    expect(a.suggest).toBe(true);
    expect(a.reasons).toEqual(["Tiredness was 4/5 or higher on 3 of your last 4 check-ins."]);
    expect(deloadAdvice({ sessions: weeksOf(6, 6), recovery, today: TODAY, mode: "deload" }).suggest).toBe(false);
  });
});

describe("groupByWeek", () => {
  it("groups Monday–Sunday, newest week first", () => {
    const g = groupByWeek([{ local_date: "2026-10-14" }, { local_date: "2026-10-12" }, { local_date: "2026-10-11" }, { local_date: "2026-10-05" }]);
    expect(g.map((x) => x.weekStart)).toEqual(["2026-10-12", "2026-10-05"]);
    expect(g[0].items.map((x) => x.local_date)).toEqual(["2026-10-14", "2026-10-12"]);
    expect(g[1].items).toHaveLength(2);
  });
});

describe("scheduleIssues", () => {
  const keys = Object.keys(NAMES);
  it("accepts the default program", () => {
    const s = Object.fromEntries(Object.entries(DEFAULT).map(([k, v]) => [k, v]));
    expect(scheduleIssues(s, keys)).toEqual({ duplicates: [], missing: [], trainingDays: 6 });
  });
  it("reports duplicates and unscheduled templates", () => {
    const s = { "0": "rest", "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_a", "5": "pull_b", "6": "rest" };
    expect(scheduleIssues(s, keys)).toEqual({ duplicates: ["push_a"], missing: ["push_b", "legs_b"], trainingDays: 5 });
    expect(weekdaysFor(s, "push_a")).toEqual([1, 4]);
    expect(weekdaysFor(s, "legs_b")).toEqual([]);
  });
});

describe("linkedMoveDates", () => {
  it("pairs both sides of a move, a swap and a catch-up", () => {
    const move = [
      { plan_date: "2026-10-18", template_key: "legs_b", reason: "rescheduled", moved_from: "2026-10-17" },
      { plan_date: "2026-10-17", template_key: "rest", reason: "rescheduled", moved_from: null },
    ];
    expect(linkedMoveDates("2026-10-18", move)).toEqual(["2026-10-17"]);
    expect(linkedMoveDates("2026-10-17", move)).toEqual(["2026-10-18"]);
    const swap = [
      { plan_date: "2026-10-16", template_key: "legs_b", reason: "rescheduled", moved_from: "2026-10-17" },
      { plan_date: "2026-10-17", template_key: "pull_b", reason: "rescheduled", moved_from: "2026-10-16" },
    ];
    expect(linkedMoveDates("2026-10-16", swap)).toEqual(["2026-10-17"]);
    expect(linkedMoveDates("2026-10-17", swap)).toEqual(["2026-10-16"]);
  });

  it("leaves unrelated overrides alone", () => {
    const rows = [
      { plan_date: "2026-10-16", template_key: "push_a", reason: "swap", moved_from: null },
      { plan_date: "2026-10-17", template_key: "rest", reason: "rest", moved_from: null },
      // a newer move whose source was later re-planned on its own
      { plan_date: "2026-10-18", template_key: "legs_b", reason: "rescheduled", moved_from: "2026-10-17" },
    ];
    expect(linkedMoveDates("2026-10-16", rows)).toEqual([]);
    expect(linkedMoveDates("2026-10-18", rows)).toEqual([]);
  });
});

describe("scheduleFreeze", () => {
  const old: Record<string, string> = { "0": "rest", "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b" };

  it("keeps changed past weekdays as they were planned, never today or later", () => {
    const next = { ...old, "0": "legs_b", "3": "rest" };
    const w = scheduleFreeze({ from: "2026-10-05", today: TODAY, oldSchedule: old, newSchedule: next, overridden: ["2026-10-07"] });
    // Sundays 10-11 (was rest) and Wednesday 10-14 (was Legs A); 10-07 already has an override
    expect(w).toEqual([
      { plan_date: "2026-10-11", template_key: "rest", reason: "custom", moved_from: null },
      { plan_date: "2026-10-14", template_key: "legs_a", reason: "custom", moved_from: null },
    ]);
  });

  it("writes nothing when the past is unchanged", () => {
    expect(scheduleFreeze({ from: "2026-10-01", today: TODAY, oldSchedule: old, newSchedule: { ...old }, overridden: [] })).toEqual([]);
  });

  it("keeps today's plan too once a workout was started or finished today (trainedToday)", () => {
    // Thursday Oct 15: Push B was trained; swapping Thursday and Saturday must not move it
    const next = { ...old, "4": "legs_b", "6": "push_b" };
    expect(scheduleFreeze({ from: "2026-10-12", today: TODAY, oldSchedule: old, newSchedule: next, overridden: [], trainedToday: true })).toEqual([
      { plan_date: TODAY, template_key: "push_b", reason: "custom", moved_from: null },
    ]);
    expect(scheduleFreeze({ from: "2026-10-12", today: TODAY, oldSchedule: old, newSchedule: next, overridden: [], trainedToday: false })).toEqual([]);
  });
});

describe("shiftWeek (rest today, shift the week)", () => {
  const ARNOLD: Record<number, string> = { 1: "shoulders_arms_a", 2: "chest_back_a", 3: "legs_abs_a", 4: "shoulders_arms_b", 5: "chest_back_b", 6: "legs_abs_b", 0: "rest" };
  const plans = (from: string, n: number, over: Record<string, string> = {}) =>
    Array.from({ length: n }, (_, i) => {
      const date = addDays(from, i);
      return { date, key: over[date] ?? ARNOLD[new Date(date + "T12:00:00Z").getUTCDay()] };
    });

  it("on a Tuesday: rest today and every day up to Sunday takes the day before it", () => {
    const tue = "2026-10-20";
    expect(shiftWeek({ from: tue, plans: plans(tue, 8) })).toEqual([
      { plan_date: "2026-10-20", template_key: "rest", reason: "rest", moved_from: null },
      { plan_date: "2026-10-21", template_key: "chest_back_a", reason: "rescheduled", moved_from: "2026-10-20" },
      { plan_date: "2026-10-22", template_key: "legs_abs_a", reason: "rescheduled", moved_from: "2026-10-21" },
      { plan_date: "2026-10-23", template_key: "shoulders_arms_b", reason: "rescheduled", moved_from: "2026-10-22" },
      { plan_date: "2026-10-24", template_key: "chest_back_b", reason: "rescheduled", moved_from: "2026-10-23" },
      { plan_date: "2026-10-25", template_key: "legs_abs_b", reason: "rescheduled", moved_from: "2026-10-24" },
    ]);
  });

  it("is empty without a rest day in the next 7 days, and offers 'skip it' instead", () => {
    const tue = "2026-10-20";
    expect(shiftWeek({ from: tue, plans: plans(tue, 8, { "2026-10-25": "legs_abs_b" }) })).toEqual([]);
    expect(skipToday(tue)).toEqual([{ plan_date: tue, template_key: "rest", reason: "rest", moved_from: null }]);
  });

  it("carries an existing override in the window", () => {
    const tue = "2026-10-20";
    const w = shiftWeek({ from: tue, plans: plans(tue, 8, { "2026-10-22": "shoulders_arms_b", "2026-10-23": "rest" }) });
    expect(w.map((x) => [x.plan_date, x.template_key])).toEqual([
      ["2026-10-20", "rest"],
      ["2026-10-21", "chest_back_a"],
      ["2026-10-22", "legs_abs_a"],
      ["2026-10-23", "shoulders_arms_b"],
    ]);
  });
});

describe("no volleyball", () => {
  it("exports no volleyball advice any more", async () => {
    const mod = (await import("./schedule")) as Record<string, unknown>;
    expect(typeof mod.shiftWeek).toBe("function");
  });
});
