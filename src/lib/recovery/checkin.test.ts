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
} from "./checkin";

describe("snapSleep", () => {
  it("recovers quarter hours stored at one decimal", () => {
    expect(snapSleep(7.3)).toBe(7.25); // 7.25 stored as numeric(3,1)
    expect(snapSleep("7.8")).toBe(7.75);
    expect(snapSleep(6.5)).toBe(6.5);
    expect(snapSleep(null)).toBeNull();
    expect(snapSleep("")).toBeNull();
    expect(snapSleep("abc")).toBeNull();
    expect(snapSleep(30)).toBe(16);
  });
});

describe("draft ↔ row", () => {
  const row = {
    local_date: "2026-10-16",
    sleep_hours: "7.3",
    sleep_quality: 4,
    energy: 3,
    soreness: null,
    fatigue: 2,
    stress: 1,
    pain_notes: "Left shoulder",
    volleyball: true,
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
      volleyball: true,
    });
    expect(draftFromRow(null)).toEqual(EMPTY_DRAFT);
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
      volleyball: false,
    });
  });
  it("detects empty and changed drafts", () => {
    expect(isDraftEmpty(EMPTY_DRAFT)).toBe(true);
    expect(isDraftEmpty({ ...EMPTY_DRAFT, volleyball: true })).toBe(false);
    expect(
      draftsEqual(draftFromRow(row), {
        ...draftFromRow(row),
        pain: "Left shoulder  ",
      }),
    ).toBe(true);
    expect(
      draftsEqual(draftFromRow(row), { ...draftFromRow(row), energy: 4 }),
    ).toBe(false);
    expect(filledCount(draftFromRow(row))).toBe(7);
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
