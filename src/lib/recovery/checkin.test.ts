import { describe, expect, it } from "vitest";
import {
  draftFromRow,
  draftsEqual,
  draftToPayload,
  EMPTY_DRAFT,
  filledCount,
  formatHours,
  formatSleep,
  isDraftEmpty,
  parseSleepInput,
  snapSleep,
  storedSleep,
} from "./checkin";

describe("snapSleep", () => {
  it("snaps typed values to the stepper's quarter-hour grid", () => {
    expect(snapSleep(7.3)).toBe(7.25);
    expect(snapSleep("7.8")).toBe(7.75);
    expect(snapSleep(6.5)).toBe(6.5);
    expect(snapSleep(null)).toBeNull();
    expect(snapSleep("")).toBeNull();
    expect(snapSleep("abc")).toBeNull();
    expect(snapSleep(30)).toBe(16);
  });
});

describe("storedSleep", () => {
  it("keeps the logged value exactly (numeric(4,2)), never snapping it", () => {
    expect(storedSleep("7.25")).toBe(7.25);
    expect(storedSleep("6.60")).toBe(6.6);
    expect(storedSleep(7.75)).toBe(7.75);
    expect(storedSleep(null)).toBeNull();
    expect(storedSleep("")).toBeNull();
    expect(storedSleep(-1)).toBeNull();
    expect(storedSleep(25)).toBeNull();
  });
});

describe("draft ↔ row", () => {
  const row = {
    local_date: "2026-10-16",
    sleep_hours: "7.25",
    sleep_quality: 4,
    energy: 3,
    soreness: null,
    fatigue: 2,
    stress: 1,
    pain_notes: "Left shoulder",
  };
  it("prefills from a saved check-in without inventing values", () => {
    expect(draftFromRow(row)).toEqual({
      sleep: 7.25,
      quality: 4,
      energy: 3,
      soreness: null,
      fatigue: 2,
      stress: 1,
      pain: "Left shoulder",
      volleyball: false,
    });
    expect(draftFromRow(null)).toEqual(EMPTY_DRAFT);
  });
  it("keeps an off-grid legacy value when another field changes", () => {
    const legacy = { ...row, sleep_hours: "6.60" };
    const d = draftFromRow(legacy);
    expect(d.sleep).toBe(6.6);
    expect(draftToPayload("2026-10-15", { ...d, stress: 2 }).sleep_hours).toBe(
      6.6,
    );
  });
  it("saves blanks as null and trims the pain note", () => {
    const p = draftToPayload("2026-10-16", {
      ...EMPTY_DRAFT,
      sleep: 7.25,
      pain: "   ",
      energy: 5,
    });
    expect(p).toEqual({
      local_date: "2026-10-16",
      sleep_hours: 7.25,
      sleep_quality: null,
      energy: 5,
      soreness: null,
      fatigue: null,
      stress: null,
      pain_notes: null,
    });
  });
  it("detects empty and changed drafts", () => {
    expect(isDraftEmpty(EMPTY_DRAFT)).toBe(true);
    // the deprecated volleyball flag is not a check-in answer
    expect(isDraftEmpty({ ...EMPTY_DRAFT, volleyball: true })).toBe(true);
    expect(filledCount({ ...EMPTY_DRAFT, volleyball: true, sleep: 7, pain: "x" })).toBe(2);
    expect(
      draftsEqual(draftFromRow(row), {
        ...draftFromRow(row),
        pain: "Left shoulder  ",
      }),
    ).toBe(true);
    expect(
      draftsEqual(draftFromRow(row), { ...draftFromRow(row), energy: 4 }),
    ).toBe(false);
    expect(filledCount(draftFromRow(row))).toBe(6);
  });
});

describe("sleep input and display", () => {
  it("parses decimals, commas and h:mm", () => {
    expect(parseSleepInput("7.5")).toBe(7.5);
    expect(parseSleepInput("7,25")).toBe(7.25);
    expect(parseSleepInput("7:30")).toBe(7.5);
    expect(parseSleepInput("6h45")).toBe(6.75);
    expect(parseSleepInput("7.1")).toBe(7);
    expect(parseSleepInput("")).toBeNull();
    expect(parseSleepInput("7:75")).toBeNull();
    expect(parseSleepInput("25")).toBeNull();
    expect(parseSleepInput("seven")).toBeNull();
  });
  it("formats hours", () => {
    expect(formatSleep(7.25)).toBe("7 h 15 min");
    expect(formatSleep(8)).toBe("8 h");
    expect(formatSleep(0.5)).toBe("30 min");
    expect(formatSleep(null)).toBe("—");
    expect(formatHours(7.5)).toBe("7.5");
    expect(formatHours(8)).toBe("8");
  });
});
