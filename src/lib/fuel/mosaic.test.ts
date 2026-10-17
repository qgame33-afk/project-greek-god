import { describe, expect, it } from "vitest";
import type { Slot } from "@/lib/meals/types";
import { DEFAULT_DAY_SCHEDULE, toMinutes } from "@/lib/prefs";
import { coinStatus, mosaicRows, nextMealId, planAverage, planPercent } from "./mosaic";

const t = (s: string) => toMinutes(s);

describe("mosaicRows", () => {
  it("orders the plan's places by the day's times (2 snacks: afternoon and evening)", () => {
    const meals = [
      { slot: "dinner" as const, position: 0 },
      { slot: "snack" as const, position: 1 },
      { slot: "breakfast" as const, position: 0 },
      { slot: "snack" as const, position: 0 },
      { slot: "lunch" as const, position: 0 },
      { slot: "lunch" as const, position: 0 },
    ];
    expect(mosaicRows(meals, DEFAULT_DAY_SCHEDULE, 2).map((r) => r.short)).toEqual(["Brk", "Lun", "Snk 1", "Din", "Snk 2"]);
  });

  it("3 snacks start mid-morning; only places in the plan are rows", () => {
    const meals: { slot: Slot; position: number }[] = [0, 1, 2].map((position) => ({ slot: "snack" as const, position }));
    meals.push({ slot: "lunch", position: 0 });
    expect(mosaicRows(meals, DEFAULT_DAY_SCHEDULE, 3).map((r) => r.key)).toEqual(["snack:0", "lunch:0", "snack:1", "snack:2"]);
  });

  it("with no plan shows the default places for the snacks setting, one snack unnumbered", () => {
    expect(mosaicRows([], DEFAULT_DAY_SCHEDULE, 1).map((r) => [r.short, r.spoken])).toEqual([
      ["Brk", "breakfast"],
      ["Lun", "lunch"],
      ["Snk", "snack"],
      ["Din", "dinner"],
    ]);
  });
});

describe("coinStatus", () => {
  const base = { id: "a", local_date: "2026-10-17", at: t("12:30"), servings: 1.5, logged: [] as { amount: number; unit: string }[] };
  it("eaten when a linked entry has the planned servings; changed when it differs", () => {
    expect(coinStatus({ ...base, logged: [{ amount: 1.5, unit: "serving" }] }, "2026-10-17", t("13:00"))).toBe("eaten");
    expect(coinStatus({ ...base, logged: [{ amount: 1, unit: "serving" }] }, "2026-10-17", t("13:00"))).toBe("changed");
    expect(coinStatus({ ...base, logged: [{ amount: 300, unit: "g" }] }, "2026-10-17", t("13:00"))).toBe("changed");
  });
  it("missed when its day passed or it is 2 h past its time; planned otherwise", () => {
    expect(coinStatus({ ...base, local_date: "2026-10-16" }, "2026-10-17", t("08:00"))).toBe("missed");
    expect(coinStatus(base, "2026-10-17", t("14:31"))).toBe("missed");
    expect(coinStatus(base, "2026-10-17", t("14:30"))).toBe("planned");
    expect(coinStatus({ ...base, local_date: "2026-10-18" }, "2026-10-17", t("23:00"))).toBe("planned");
  });
});

describe("nextMealId", () => {
  const day = [
    { id: "bk", at: t("07:40"), eaten: true },
    { id: "ln", at: t("12:30"), eaten: false },
    { id: "s1", at: t("15:00"), eaten: false },
  ];
  it("is the earliest meal not eaten from an hour ago on", () => {
    expect(nextMealId(day, t("13:00"))).toBe("ln");
    expect(nextMealId(day, t("14:00"))).toBe("s1");
  });
  it("falls back to the earliest not eaten, and is null when all are eaten", () => {
    expect(nextMealId(day, t("20:00"))).toBe("ln");
    expect(nextMealId(day.map((m) => ({ ...m, eaten: true })), t("20:00"))).toBeNull();
  });
});

describe("plan average and percent", () => {
  it("averages only days with a plan", () => {
    expect(planAverage({ a: { kcal: 3300, protein: 190 }, b: { kcal: 3280, protein: 182 }, c: undefined, d: { kcal: 0, protein: 0 } })).toEqual({ kcal: 3290, protein: 186, days: 2 });
    expect(planAverage({})).toBeNull();
  });
  it("is a whole percent of the target, or null", () => {
    expect(planPercent(3168, 3300)).toBe(96);
    expect(planPercent(3168, 0)).toBeNull();
    expect(planPercent(undefined, 3300)).toBeNull();
  });
});
