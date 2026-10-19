import { describe, expect, it } from "vitest";
import type { HabitStatus } from "@/lib/habits";
import { mergeCheckin } from "@/lib/recovery/prefill";
import { PROGRAM_BY_KEY } from "@/lib/training/program";
import type { PastSet } from "@/lib/training/progression";
import {
  checkinPatchPayload,
  chipFor,
  chronicleDue,
  closingDate,
  dayEyebrow,
  earlierSummary,
  ENERGY_CHIPS,
  implausibleWeighIn,
  keepTail,
  keyLift,
  lastWeighInCaption,
  LEGS_CHIPS,
  minuteOn,
  plannedEntryId,
  programWeekLabel,
  readinessChip,
  restDayWords,
  ritesOf,
  scaleLine,
  sleepShort,
  sleepSpoken,
} from "./now";

describe("header copy", () => {
  it("dates the day and counts programme days from 1", () => {
    expect(dayEyebrow("2026-10-17", "2026-09-07")).toBe("SAT 17 OCT · DAY 41");
    expect(dayEyebrow("2026-09-07", "2026-09-07")).toBe("MON 7 SEP · DAY 1");
    expect(dayEyebrow("2026-09-01", "2026-09-07")).toBe("TUE 1 SEP");
    expect(dayEyebrow("2026-10-17", null)).toBe("SAT 17 OCT");
  });
  it("counts Monday-aligned programme weeks", () => {
    expect(programWeekLabel("2026-10-17", "2026-09-07", "2027-08-01")).toBe("WEEK 6 OF 47");
    expect(programWeekLabel("2026-09-01", "2026-09-07", "2027-08-01")).toBeNull();
    expect(programWeekLabel("2026-10-17", null, "2027-08-01")).toBeNull();
  });
});

describe("sleep", () => {
  it("formats hours and minutes, and says — when missing", () => {
    expect(sleepShort(7.5)).toBe("7 h 30");
    expect(sleepShort(8)).toBe("8 h");
    expect(sleepShort(7.25)).toBe("7 h 15");
    expect(sleepShort(0.5)).toBe("30 min");
    expect(sleepShort(null)).toBe("—");
    expect(sleepSpoken(7.5)).toBe("7 hours 30 minutes");
    expect(sleepSpoken(null)).toBe("not logged");
  });
});

describe("check-in", () => {
  it("maps chips onto the stored 1–5 scales", () => {
    expect(chipFor(LEGS_CHIPS, 1)).toBe("None");
    expect(chipFor(LEGS_CHIPS, 5)).toBe("Very sore");
    expect(chipFor(ENERGY_CHIPS, 3)).toBe("Okay");
    expect(chipFor(ENERGY_CHIPS, null)).toBeNull();
    expect(chipFor(ENERGY_CHIPS, 0)).toBeNull();
  });

  it("an answer sends only its own field, so fields set on /recovery survive", () => {
    expect(checkinPatchPayload("2026-10-17", { energy: 4 })).toEqual({ local_date: "2026-10-17", energy: 4 });
    expect(checkinPatchPayload("2026-10-17", { sleep: 7.5 })).toEqual({ local_date: "2026-10-17", sleep_hours: 7.5 });
    expect(checkinPatchPayload("2026-10-17", { soreness: 2, sleep: undefined })).toEqual({ local_date: "2026-10-17", soreness: 2 });
    expect(checkinPatchPayload("2026-10-17", { pain: "  left knee " })).toEqual({ local_date: "2026-10-17", pain_notes: "left knee" });
    expect(checkinPatchPayload("2026-10-17", { pain: "  " })).toEqual({ local_date: "2026-10-17", pain_notes: null });
    expect(checkinPatchPayload("2026-10-17", { stress: 9 })).toEqual({ local_date: "2026-10-17", stress: null });
  });

  it("merging the answer into a row from /recovery keeps every other field (fixture)", () => {
    const fromRecovery = {
      local_date: "2026-10-17",
      sleep_hours: "6.5",
      sleep_quality: 4,
      energy: null,
      soreness: null,
      fatigue: 2,
      stress: 3,
      pain_notes: "left knee",
      volleyball: true,
    };
    const payload = checkinPatchPayload("2026-10-17", { energy: 5 });
    // what the server does with a partial upsert: only the sent columns change
    const server = { ...fromRecovery, ...payload };
    expect(server).toMatchObject({ sleep_hours: "6.5", sleep_quality: 4, fatigue: 2, stress: 3, pain_notes: "left knee", volleyball: true, energy: 5 });
    // and the shared merge rule agrees for the optimistic draft
    const draft = mergeCheckin(fromRecovery, { energy: 5 });
    expect(draft).toMatchObject({ sleep: 6.5, quality: 4, fatigue: 2, stress: 3, pain: "left knee", volleyball: true, energy: 5, soreness: null });
  });
});

describe("readiness chip", () => {
  const g = (level: "go" | "legs" | "trim" | "ease" | "recover" | "rest" | "unknown", hasCheckin = true) => ({ level, hasCheckin });
  it("speaks to the session kind when ready", () => {
    expect(readinessChip(g("go"), "push_a")).toBe("Ready to push");
    expect(readinessChip(g("go"), "pull_b")).toBe("Ready to pull");
    expect(readinessChip(g("go"), "legs_a")).toBe("Ready for legs");
    expect(readinessChip(g("go"), null)).toBe("Ready to train");
    expect(readinessChip(g("ease"), "push_a")).toBe("Go lighter");
  });
  it("says nothing without a check-in", () => {
    expect(readinessChip(g("go", false), "push_a")).toBeNull();
    expect(readinessChip(null, "push_a")).toBeNull();
    expect(readinessChip(g("unknown"), "push_a")).toBeNull();
  });
});

describe("key lift", () => {
  const set = (date: string, sid: string, i: number, w: number, reps: number): PastSet => ({ local_date: date, session_id: sid, set_index: i, weight_lb: w, reps, duration_sec: null, rir: 1 });
  const fmt = (lb: number) => String(lb);
  it("leads with the first loaded lift and the rule's target, from the last top set", () => {
    const history = { "barbell-bench-press": [set("2026-10-12", "s1", 0, 185, 8), set("2026-10-12", "s1", 1, 185, 8), set("2026-10-12", "s1", 2, 185, 8)] };
    const k = keyLift(PROGRAM_BY_KEY.push_a, history, "standard", fmt);
    expect(k?.name).toBe("Barbell Bench Press");
    expect(k?.target).toBe("190 × 5–8");
    expect(k?.from).toBe("185 × 8");
    expect(k?.kind).toBe("increase");
  });
  it("has no target load and no 'from' on a first session", () => {
    const k = keyLift(PROGRAM_BY_KEY.push_a, {}, "standard", fmt);
    expect(k?.name).toBe("Barbell Bench Press");
    expect(k?.from).toBeNull();
  });
  it("is null on a rest day", () => {
    expect(keyLift(null, {}, "standard", fmt)).toBeNull();
  });
});

describe("rites", () => {
  const s = (key: string, done = false): HabitStatus => ({ key, label: key, kind: "check", done, progress: done ? 1 : 0, caption: "", auto: false });
  it("leaves out habits that have a home elsewhere on Now and caps at 6", () => {
    const r = ritesOf(["workout", "protein", "calories", "water", "weighin", "sleep", "steps", "mobility"].map((k) => s(k, k === "mobility")));
    expect(r.shown.map((x) => x.key)).toEqual(["calories", "water", "steps", "mobility"]);
    expect(r).toMatchObject({ more: 0, done: 1, total: 4 });
    const many = ritesOf(["a", "b", "c", "d", "e", "f", "g"].map((k) => s(k)));
    expect(many.shown).toHaveLength(6);
    expect(many.more).toBe(1);
  });
});

describe("earlier summary", () => {
  it("lists what was done and never counts misses", () => {
    expect(
      earlierSummary([
        { kind: "weighin", done: true, label: "Weigh-in" },
        { kind: "checkin", done: true, label: "Check-in" },
        { kind: "meal", done: true, label: "Bagel" },
        { kind: "meal", done: true, label: "Bowl" },
        { kind: "meal", done: false, label: "Wrap" },
      ]),
    ).toBe("weigh-in · check-in · 2 meals logged");
    expect(earlierSummary([{ kind: "meal", done: false, label: "Wrap" }])).toBe("1 earlier meal");
    expect(earlierSummary([])).toBe("");
  });
});

describe("chronicle card", () => {
  it("shows last month's book on days 1–3 only", () => {
    expect(chronicleDue("2026-11-01", "2026-09-07")).toEqual({ month: "2026-10-01", param: "2026-10", book: "II", monthName: "October" });
    expect(chronicleDue("2026-10-03", "2026-09-07")).toMatchObject({ book: "I", monthName: "September" });
    expect(chronicleDue("2026-10-04", "2026-09-07")).toBeNull();
    expect(chronicleDue("2026-09-02", "2026-09-07")).toBeNull();
    expect(chronicleDue("2026-10-02", null)).toBeNull();
  });
});

describe("the scale", () => {
  it("captions the last weigh-in by recency", () => {
    expect(lastWeighInCaption("2026-10-16", "2026-10-17", "168.0")).toBe("Yesterday was 168.0");
    expect(lastWeighInCaption("2026-10-15", "2026-10-17", "168.0")).toBe("Thursday was 168.0");
    expect(lastWeighInCaption("2026-10-02", "2026-10-17", "168.0")).toBe("2 Oct was 168.0");
  });
  it("flags a change over 10% as implausible", () => {
    expect(implausibleWeighIn(186, 168)).toBe(true);
    expect(implausibleWeighIn(169, 168)).toBe(false);
    expect(implausibleWeighIn(169, null)).toBe(false);
  });
  it("describes the scale reading", () => {
    expect(scaleLine({ lb: "168.6", date: "2026-10-17", time: "7:04 am" }, "2026-10-17")).toBe("Scale 168.6 · 7:04 am");
    expect(scaleLine({ lb: "168.2", date: "2026-10-16" }, "2026-10-17")).toBe("No weigh-in today · last 168.2 Fri");
    expect(scaleLine({ lb: "168.2", date: "2026-10-14" }, "2026-10-17")).toBe("No weigh-in today · last 168.2 Wed");
    expect(scaleLine(null, "2026-10-17")).toBe("No weigh-ins yet");
  });
  it("places a timestamp on the day's clock", () => {
    const d = new Date(2026, 9, 17, 7, 4);
    expect(minuteOn(d.toISOString(), "2026-10-17")).toBe(424);
    expect(minuteOn(new Date(2026, 9, 16, 23, 0).toISOString(), "2026-10-17")).toBe(0);
    expect(minuteOn(new Date(2026, 9, 18, 1, 0).toISOString(), "2026-10-17")).toBeNull();
    expect(minuteOn(null, "2026-10-17")).toBeNull();
  });
});

describe("Eaten entry ids", () => {
  let n = 0;
  const make = () => `id-${++n}`;
  it("keeps one id per planned meal, so a repeat tap never logs twice", () => {
    const first = plannedEntryId(null, "meal-a", make);
    expect(plannedEntryId(first, "meal-a", make)).toBe(first);
  });
  it("gives the next meal its own id (regression: the card's reused Eaten logged nothing for meal 2)", () => {
    const a = plannedEntryId(null, "meal-a", make);
    const b = plannedEntryId(a, "meal-b", make);
    expect(b.mealId).toBe("meal-b");
    expect(b.id).not.toBe(a.id);
    // and back to the first meal (after an Undo) is a fresh id too, never meal b's
    expect(plannedEntryId(b, "meal-a", make).id).not.toBe(b.id);
  });
});

describe("rest-day line", () => {
  it("keeps the movement words, without 'easy', '(optional)', sleep, fuel or the next session", () => {
    const recs = [
      { key: "walk", label: "Easy walk (optional)" },
      { key: "mobility", label: "Mobility flow" },
      { key: "sleep", label: "Sleep" },
      { key: "fuel", label: "Eat to plan" },
      { key: "next", label: "Prep for Push A" },
    ];
    expect(restDayWords(recs)).toEqual(["walk", "mobility flow"]);
  });
  it("drops repeats and caps the list", () => {
    const recs = [
      { key: "mobility", label: "Mobility flow" },
      { key: "walk", label: "Easy walk" },
      { key: "mobility", label: "Mobility flow" },
      { key: "pain", label: "Gentle movement only" },
    ];
    expect(restDayWords(recs)).toEqual(["mobility flow", "walk"]);
    expect(restDayWords(recs, 3)).toEqual(["mobility flow", "walk", "gentle movement only"]);
    expect(restDayWords([])).toEqual([]);
  });
});

describe("keepTail", () => {
  it("binds the part after the last ' · ' with no-break spaces", () => {
    expect(keepTail("No weigh-in today · last 165.9 Sat")).toBe("No weigh-in today · last\u00A0165.9\u00A0Sat");
    expect(keepTail("Scale 168.6 · 7:04 am")).toBe("Scale 168.6 · 7:04\u00A0am");
    expect(keepTail("No weigh-ins yet")).toBe("No weigh-ins yet");
  });
});

describe("closingDate", () => {
  it("closes the day that just ended until 05:00, then today", () => {
    expect(closingDate("2026-10-19", 0)).toBe("2026-10-18");
    expect(closingDate("2026-10-19", 40)).toBe("2026-10-18");
    expect(closingDate("2026-10-19", 4 * 60 + 59)).toBe("2026-10-18");
    expect(closingDate("2026-10-19", 5 * 60)).toBe("2026-10-19");
    expect(closingDate("2026-10-19", 21 * 60 + 30)).toBe("2026-10-19");
    expect(closingDate("2026-11-01", 30)).toBe("2026-10-31");
  });
});
