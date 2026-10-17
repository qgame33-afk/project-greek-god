import { describe, expect, it } from "vitest";
import { DEFAULT_DAY_SCHEDULE, mergePrefs, parseAppPrefs, toMinutes, type DaySchedule } from "@/lib/prefs";
import { compareMealTimes, plannedTime, snackCount, snackTimes } from "./meal-times";

const S = DEFAULT_DAY_SCHEDULE;
const t = (hhmm: string) => toMinutes(hhmm);
const rest = { schedule: S, snacksPerDay: 2, train: null };

describe("plannedTime — defaults", () => {
  it("mains use their meal time", () => {
    expect(plannedTime({ slot: "breakfast", position: 0 }, rest)).toEqual({ at: t("07:40"), role: "breakfast" });
    expect(plannedTime({ slot: "lunch", position: 0 }, rest)).toEqual({ at: t("12:30"), role: "lunch" });
    expect(plannedTime({ slot: "dinner", position: 0 }, rest)).toEqual({ at: t("18:30"), role: "dinner" });
  });

  it("snack positions map by count", () => {
    expect(snackTimes(S, 1)).toEqual([t("15:00")]);
    expect(snackTimes(S, 2)).toEqual([t("15:00"), t("21:30")]);
    expect(snackTimes(S, 3)).toEqual([t("10:30"), t("15:00"), t("21:30")]);
    const at = (n: number, pos: number) => plannedTime({ slot: "snack", position: pos }, { ...rest, snacksPerDay: n }).at;
    expect(at(1, 0)).toBe(t("15:00"));
    expect([at(2, 0), at(2, 1)]).toEqual([t("15:00"), t("21:30")]);
    expect([at(3, 0), at(3, 1), at(3, 2)]).toEqual([t("10:30"), t("15:00"), t("21:30")]);
  });

  it("clamps the snack count like the planner (1–3, default 2)", () => {
    expect([0, 1, 2, 3, 7, Number.NaN].map(snackCount)).toEqual([2, 1, 2, 3, 3, 2]);
  });

  it("a snack moved in past the count uses the 3-snack time for its position", () => {
    expect(plannedTime({ slot: "snack", position: 2 }, { ...rest, snacksPerDay: 2 }).at).toBe(t("21:30"));
    expect(plannedTime({ slot: "snack", position: 1 }, { ...rest, snacksPerDay: 1 }).at).toBe(t("15:00"));
  });

  it("uses the user's own times from prefs", () => {
    const schedule: DaySchedule = parseAppPrefs(mergePrefs({}, { day: { meals: { breakfast: "6:50", snacks: ["09:00", "14:00", "20:45"] } } })).day;
    expect(plannedTime({ slot: "breakfast", position: 0 }, { ...rest, schedule }).at).toBe(t("06:50"));
    expect(plannedTime({ slot: "snack", position: 1 }, { ...rest, schedule, snacksPerDay: 2 }).at).toBe(t("20:45"));
  });
});

describe("plannedTime — session-relative", () => {
  const pushA = { schedule: S, snacksPerDay: 2, train: { at: t("16:30"), durationMin: 70 } };

  it("moves the snack nearest an hour before the session to exactly that time", () => {
    expect(plannedTime({ slot: "snack", position: 0 }, pushA)).toEqual({ at: t("15:30"), role: "pre" });
    expect(plannedTime({ slot: "snack", position: 1 }, pushA)).toEqual({ at: t("21:30"), role: "snack" });
    // 3 snacks: the 15:00 one moves, the 10:30 one stays
    const three = { ...pushA, snacksPerDay: 3 };
    expect(plannedTime({ slot: "snack", position: 0 }, three)).toEqual({ at: t("10:30"), role: "snack" });
    expect(plannedTime({ slot: "snack", position: 1 }, three)).toEqual({ at: t("15:30"), role: "pre" });
    // 1 snack
    expect(plannedTime({ slot: "snack", position: 0 }, { ...pushA, snacksPerDay: 1 })).toEqual({ at: t("15:30"), role: "pre" });
  });

  it("honours preWorkoutMin", () => {
    const schedule = { ...S, preWorkoutMin: 90 };
    expect(plannedTime({ slot: "snack", position: 0 }, { ...pushA, schedule })).toEqual({ at: t("15:00"), role: "pre" });
  });

  it("does not move a snack when none is within 180 minutes", () => {
    // 07:00 session → pre-snack slot 06:00; nearest snack is 10:30 (270 min away)
    const early = { schedule: S, snacksPerDay: 3, train: { at: t("07:00"), durationMin: 60 } };
    for (const pos of [0, 1, 2]) expect(plannedTime({ slot: "snack", position: pos }, early).role).toBe("snack");
    // exactly 180 min away still moves
    const edge = { schedule: S, snacksPerDay: 1, train: { at: t("19:00"), durationMin: 60 } }; // slot 18:00, snack 15:00
    expect(plannedTime({ slot: "snack", position: 0 }, edge)).toEqual({ at: t("18:00"), role: "pre" });
  });

  it("ties go to the earlier snack", () => {
    const schedule = { ...S, meals: { ...S.meals, snacks: ["10:00", "12:00", "21:30"] as [string, string, string] } };
    const ctx = { schedule, snacksPerDay: 3, train: { at: t("12:00"), durationMin: 60 } }; // slot 11:00
    expect(plannedTime({ slot: "snack", position: 0 }, ctx).role).toBe("pre");
    expect(plannedTime({ slot: "snack", position: 1 }, ctx).role).toBe("snack");
  });

  it("the first main meal after the session is the post-workout meal, unmoved", () => {
    expect(plannedTime({ slot: "dinner", position: 0 }, pushA)).toEqual({ at: t("18:30"), role: "post" });
    expect(plannedTime({ slot: "lunch", position: 0 }, pushA).role).toBe("lunch");
    const morning = { schedule: S, snacksPerDay: 2, train: { at: t("09:00"), durationMin: null } }; // ends 10:15 (75 min default)
    expect(plannedTime({ slot: "lunch", position: 0 }, morning)).toEqual({ at: t("12:30"), role: "post" });
    expect(plannedTime({ slot: "dinner", position: 0 }, morning).role).toBe("dinner");
    // a main meal exactly at the session's end counts
    const atEnd = { schedule: S, snacksPerDay: 2, train: { at: t("11:15"), durationMin: 75 } };
    expect(plannedTime({ slot: "lunch", position: 0 }, atEnd).role).toBe("post");
    // nothing after a late session
    const late = { schedule: S, snacksPerDay: 2, train: { at: t("19:00"), durationMin: 60 } };
    expect(plannedTime({ slot: "dinner", position: 0 }, late).role).toBe("dinner");
  });

  it("rest days and an unset training time keep the defaults", () => {
    for (const train of [null, { at: null }]) {
      const ctx = { schedule: S, snacksPerDay: 2, train };
      expect(plannedTime({ slot: "snack", position: 0 }, ctx)).toEqual({ at: t("15:00"), role: "snack" });
      expect(plannedTime({ slot: "dinner", position: 0 }, ctx)).toEqual({ at: t("18:30"), role: "dinner" });
    }
  });

  it("orders a day's meals by time, then slot, then position", () => {
    const meals = [
      { slot: "dinner" as const, position: 0, at: t("18:30") },
      { slot: "snack" as const, position: 0, at: t("15:30") },
      { slot: "breakfast" as const, position: 0, at: t("07:40") },
      { slot: "snack" as const, position: 1, at: t("07:40") },
    ].sort(compareMealTimes);
    expect(meals.map((m) => `${m.slot}${m.position}`)).toEqual(["breakfast0", "snack1", "snack0", "dinner0"]);
  });
});
