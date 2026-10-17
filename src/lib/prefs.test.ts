import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "@/lib/workout/prefs";
import { DEFAULT_DAY_SCHEDULE, effectiveTrainAt, formatClock, fromMinutes, isTime, mergePrefs, parseAppPrefs, toMinutes } from "./prefs";

describe("times", () => {
  it("toMinutes / fromMinutes / formatClock", () => {
    expect(toMinutes("16:30")).toBe(990);
    expect(toMinutes("7:05")).toBe(425);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);
    for (const bad of ["24:00", "7.30", "", "12:60", "noon"]) expect(toMinutes(bad)).toBeNaN();
    expect(fromMinutes(990)).toBe("16:30");
    expect(fromMinutes(-30)).toBe("23:30");
    expect(fromMinutes(1470)).toBe("00:30");
    expect(formatClock(990)).toBe("4:30 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60)).toBe("12:00 PM");
    expect(formatClock(7 * 60 + 40)).toBe("7:40 AM");
    expect(isTime("21:30")).toBe(true);
    expect(isTime(930)).toBe(false);
  });
});

describe("parseAppPrefs", () => {
  it("fills every default from nothing", () => {
    for (const raw of [undefined, null, [], "x", 3, {}]) {
      const p = parseAppPrefs(raw);
      expect(p.day).toEqual(DEFAULT_DAY_SCHEDULE);
      expect(p.gymAuto).toBe(true);
      expect(p.tapLogsGhost).toBe(DEFAULT_PREFS.tapLogsGhost);
      expect("coachNoteSeen" in p).toBe(false);
    }
  });

  it("keeps valid values and unknown keys; invalid fields fall back one by one", () => {
    const p = parseAppPrefs({
      tapLogsGhost: false,
      restChime: true,
      coachNoteSeen: true,
      gymAuto: false,
      someFutureKey: { a: 1 },
      day: { trainAt: "6:45", preWorkoutMin: 45, meals: { breakfast: "07:00", lunch: "25:00", dinner: 1830, snacks: ["10:00", "bad"] } },
    });
    expect(p.tapLogsGhost).toBe(false);
    expect(p.restChime).toBe(true);
    expect(p.coachNoteSeen).toBe(true);
    expect(p.gymAuto).toBe(false);
    expect(p.someFutureKey).toEqual({ a: 1 });
    expect(p.day).toEqual({
      trainAt: "06:45",
      preWorkoutMin: 45,
      meals: { breakfast: "07:00", lunch: "12:30", dinner: "18:30", snacks: ["10:00", "15:00", "21:30"] },
    });
  });

  it("rejects an out-of-range pre-workout lead and a non-boolean flag", () => {
    expect(parseAppPrefs({ day: { preWorkoutMin: 500 } }).day.preWorkoutMin).toBe(60);
    expect(parseAppPrefs({ day: { preWorkoutMin: "x" } }).day.preWorkoutMin).toBe(60);
    expect(parseAppPrefs({ day: { preWorkoutMin: 0 } }).day.preWorkoutMin).toBe(0);
    expect(parseAppPrefs({ day: { trainAt: "later" } }).day.trainAt).toBeNull();
    expect("coachNoteSeen" in parseAppPrefs({ coachNoteSeen: "yes" })).toBe(false);
    expect(parseAppPrefs({ gymAuto: "no" }).gymAuto).toBe(true);
  });
});

describe("mergePrefs — the prefsOf() data-loss fix", () => {
  const stored = {
    tapLogsGhost: true,
    systemKeyboard: false,
    restChime: true,
    coachNoteSeen: true,
    day: { trainAt: "16:30", meals: { breakfast: "07:10", snacks: ["10:00", "14:45", "21:00"] } },
    someFutureKey: "kept",
  };

  it("a boolean toggle keeps the day schedule and unknown keys", () => {
    const next = mergePrefs(stored, { restChime: false });
    expect(next).toEqual({ ...stored, restChime: false });
  });

  it("deep-merges day and day.meals", () => {
    const next = mergePrefs(stored, { day: { meals: { dinner: "19:00" } } });
    expect(next.day).toEqual({ trainAt: "16:30", meals: { breakfast: "07:10", dinner: "19:00", snacks: ["10:00", "14:45", "21:00"] } });
    expect(next.tapLogsGhost).toBe(true);
    expect(mergePrefs(stored, { day: { trainAt: "17:15" } }).day).toEqual({ ...stored.day, trainAt: "17:15" });
  });

  it("merges snacks per index", () => {
    const next = mergePrefs(stored, { day: { meals: { snacks: [undefined, "15:30"] } } });
    expect((next.day as { meals: { snacks: string[] } }).meals.snacks).toEqual(["10:00", "15:30", "21:00"]);
    const fresh = mergePrefs({}, { day: { meals: { snacks: [null, "15:30", null] } } });
    expect(fresh.day).toEqual({ meals: { snacks: ["10:30", "15:30", "21:30"] } });
  });

  it("null unsets the training time; invalid times and undefined are ignored", () => {
    expect((mergePrefs(stored, { day: { trainAt: null } }).day as { trainAt: unknown }).trainAt).toBeNull();
    const bad = mergePrefs(stored, { day: { trainAt: "25:99", meals: { lunch: "noon" }, preWorkoutMin: -5 } });
    expect(bad.day).toEqual(stored.day);
    expect(mergePrefs(stored, { restChime: undefined })).toEqual(stored);
  });

  it("works from an empty or broken stored value and never mutates its input", () => {
    expect(mergePrefs(null, { gymAuto: false })).toEqual({ gymAuto: false });
    expect(mergePrefs([1, 2], { gymAuto: false })).toEqual({ gymAuto: false });
    expect(mergePrefs({ day: "junk" }, { day: { trainAt: "6:00" } })).toEqual({ day: { trainAt: "06:00" } });
    const copy = JSON.parse(JSON.stringify(stored));
    mergePrefs(stored, { day: { meals: { snacks: ["09:00", "09:30", "10:00"] } }, restChime: false });
    expect(stored).toEqual(copy);
  });

  it("round-trips through parseAppPrefs", () => {
    const p = parseAppPrefs(mergePrefs(stored, { day: { preWorkoutMin: 45 } }));
    expect(p.day).toEqual({ trainAt: "16:30", preWorkoutMin: 45, meals: { breakfast: "07:10", lunch: "12:30", dinner: "18:30", snacks: ["10:00", "14:45", "21:00"] } });
    expect(p.coachNoteSeen).toBe(true);
    expect(p.someFutureKey).toBe("kept");
  });
});

describe("effectiveTrainAt", () => {
  const none = parseAppPrefs({});
  it("prefers the set training time", () => {
    expect(effectiveTrainAt(parseAppPrefs({ day: { trainAt: "16:30" } }), { workout: { on: true, time: "17:00" } })).toBe("16:30");
  });
  it("falls back to the workout reminder when it is on", () => {
    expect(effectiveTrainAt(none, { workout: { on: true, time: "17:00" } })).toBe("17:00");
    expect(effectiveTrainAt(none, { workout: { on: false, time: "17:00" } })).toBeNull();
    expect(effectiveTrainAt(none, null)).toBeNull();
  });
});
