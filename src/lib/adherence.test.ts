import { describe, expect, it } from "vitest";
import { planFollowed, planFollowedLabel, sessionsLabel, sessionsSealed } from "./adherence";
import { toMinutes } from "./prefs";

const t = (hhmm: string) => toMinutes(hhmm);
const TODAY = "2026-10-21"; // a Wednesday

describe("planFollowed", () => {
  const plan = [
    { id: "mon-b", local_date: "2026-10-19", at: t("07:40") },
    { id: "mon-d", local_date: "2026-10-19", at: t("18:30") },
    { id: "tue-b", local_date: "2026-10-20", at: t("07:40") },
    { id: "wed-b", local_date: TODAY, at: t("07:40") },
    { id: "wed-l", local_date: TODAY, at: t("12:30") },
    { id: "wed-d", local_date: TODAY, at: t("18:30") },
    { id: "thu-b", local_date: "2026-10-22", at: t("07:40") },
  ];

  it("counts past days and today's meals 2 h after their time", () => {
    const logged = new Set(["mon-b", "mon-d", "wed-b"]);
    // 12:00 on Wednesday: breakfast is due (07:40 + 2 h), lunch is not
    expect(planFollowed(plan, logged, TODAY, t("12:00"))).toEqual({ done: 3, due: 4 });
    // 14:30: lunch is due now
    expect(planFollowed(plan, logged, TODAY, t("14:30"))).toEqual({ done: 3, due: 5 });
    expect(planFollowed(plan, logged, TODAY, t("14:29"))).toEqual({ done: 3, due: 4 });
  });

  it("an early Eaten counts at once; future days never do", () => {
    const logged = new Set(["wed-d", "thu-b"]);
    expect(planFollowed(plan, logged, TODAY, t("09:00"))).toEqual({ done: 1, due: 4 }); // mon×2, tue, wed-d
  });

  it("nothing planned → 0 of 0", () => {
    expect(planFollowed([], new Set(), TODAY, t("12:00"))).toEqual({ done: 0, due: 0 });
    expect(planFollowedLabel({ done: 0, due: 0 })).toBe("Plan followed —");
    expect(planFollowedLabel({ done: 24, due: 28 })).toBe("Plan followed 24 of 28");
  });
});

describe("sessionsSealed", () => {
  // PPL: Mon–Sat training, Sunday rest
  const week = (done: string[], over: Record<string, "train" | "rest" | "volleyball"> = {}) =>
    ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((date, i) => ({
      date,
      kind: over[date] ?? (i === 6 ? ("rest" as const) : ("train" as const)),
      done: done.includes(date),
    }));

  it("sealed of planned, whole week", () => {
    expect(sessionsSealed(week(["2026-10-19", "2026-10-20"]), TODAY)).toEqual({ done: 2, planned: 6 });
    expect(sessionsLabel({ done: 4, planned: 6 })).toBe("4 of 6 sessions");
  });

  it("one volleyball swap per week counts as sealed", () => {
    const swaps = { "2026-10-20": "volleyball" as const, "2026-10-21": "volleyball" as const };
    expect(sessionsSealed(week(["2026-10-19", "2026-10-20"], swaps), TODAY)).toEqual({ done: 2, planned: 6 });
    expect(sessionsSealed(week(["2026-10-19", "2026-10-20", "2026-10-21"], swaps), TODAY)).toEqual({ done: 2, planned: 6 });
  });

  it("a session moved to the rest day still counts, never above the plan", () => {
    const all = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
    expect(sessionsSealed(week(all), "2026-10-25")).toEqual({ done: 6, planned: 6 });
    expect(sessionsSealed(week(["2026-10-25"]), "2026-10-25")).toEqual({ done: 1, planned: 6 });
  });

  it("ignores days outside this week and future 'done' days", () => {
    const days = [...week(["2026-10-19"]), { date: "2026-10-18", kind: "train" as const, done: true }];
    expect(sessionsSealed(days, TODAY)).toEqual({ done: 1, planned: 6 });
    expect(sessionsSealed(week(["2026-10-23"]), TODAY)).toEqual({ done: 0, planned: 6 });
  });

  it("deload and rest weeks", () => {
    expect(sessionsSealed(week([], { "2026-10-22": "rest", "2026-10-24": "rest" }), TODAY)).toEqual({ done: 0, planned: 4 });
    expect(sessionsSealed([], TODAY)).toEqual({ done: 0, planned: 0 });
    expect(sessionsLabel({ done: 0, planned: 0 })).toBe("No sessions planned");
  });
});
