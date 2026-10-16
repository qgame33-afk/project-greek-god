import { describe, expect, it } from "vitest";
import { mkSuggestion } from "./fixtures";
import { autoAdvances, nextCell, nudgeStep, padNudge, padPress, type PadBuffer, type PadKey } from "./numpad";
import { platesFor, platesLabel } from "./plates";
import { demoUrl, formatGain, localizeLb, repRange, suggestionHeadline, suggestionReason, targetChips } from "./copy";
import { parsePrefs } from "./prefs";

const type = (start: PadBuffer, keys: PadKey[], field: "weight" | "work" | "rir") => keys.reduce((b, k) => padPress(b, k, field), start);

describe("NumberPad input", () => {
  it("first key replaces the value", () => {
    expect(type({ text: "185", fresh: true }, ["1", "9", "0"], "weight").text).toBe("190");
    expect(type({ text: "185", fresh: false }, ["5"], "weight").text).toBe("1855");
  });

  it("weight takes one decimal place and four integer digits", () => {
    expect(type({ text: "", fresh: true }, ["1", "8", "2", ".", "5", "5"], "weight").text).toBe("182.5");
    expect(type({ text: "", fresh: true }, [".", "5"], "weight").text).toBe("0.5");
    expect(type({ text: "", fresh: true }, ["1", "2", "3", "4", "5"], "weight").text).toBe("1234");
    expect(type({ text: "", fresh: true }, ["0", "5"], "weight").text).toBe("5");
  });

  it("reps are whole numbers up to three digits", () => {
    expect(type({ text: "", fresh: true }, ["1", ".", "2"], "work").text).toBe("12");
    expect(type({ text: "", fresh: true }, ["1", "2", "3", "4"], "work").text).toBe("123");
  });

  it("RIR is a single digit that advances on its own on a logged row", () => {
    expect(type({ text: "2", fresh: false }, ["3"], "rir").text).toBe("3");
    expect(autoAdvances("rir", "3", true)).toBe(true);
    expect(autoAdvances("rir", "back", true)).toBe(false);
    expect(autoAdvances("weight", "3", true)).toBe(false);
  });

  it("never auto-advances off an unlogged row, so Log set logs the set just typed", () => {
    expect(autoAdvances("rir", "2", false)).toBe(false);
    expect(autoAdvances("rir", "0", false)).toBe(false);
  });

  it("backspace clears a fresh value and deletes otherwise", () => {
    expect(padPress({ text: "185", fresh: true }, "back", "weight").text).toBe("");
    expect(padPress({ text: "185", fresh: false }, "back", "weight").text).toBe("18");
  });

  it("nudges by the exercise increment and never below zero", () => {
    expect(padNudge("185", 5, "weight")).toBe("190");
    expect(padNudge("2.5", -5, "weight")).toBe("0");
    expect(padNudge("20", 2.5, "weight")).toBe("22.5");
    expect(padNudge("", 1, "work")).toBe("1");
    expect(nudgeStep("weight", { incrementLb: 2.5, unit: "lb", timed: false })).toBe(2.5);
    expect(nudgeStep("weight", { incrementLb: 5, unit: "kg", timed: false })).toBe(2.5);
    expect(nudgeStep("work", { incrementLb: 5, unit: "lb", timed: true })).toBe(5);
  });

  it("Next walks weight → reps → RIR → next set", () => {
    const rows = ["a", "b"];
    const f = (): ("weight" | "work" | "rir")[] => ["weight", "work", "rir"];
    expect(nextCell(rows, { setId: "a", field: "weight" }, f)).toEqual({ setId: "a", field: "work" });
    expect(nextCell(rows, { setId: "a", field: "rir" }, f)).toEqual({ setId: "b", field: "weight" });
    expect(nextCell(rows, { setId: "b", field: "rir" }, f)).toBeNull();
  });
});

describe("plates", () => {
  it("loads a barbell per side", () => {
    expect(platesFor(225, "lb")?.perSide).toEqual([45, 45]);
    expect(platesLabel(185, "lb")).toBe("45 bar + 45 · 25 per side");
    expect(platesLabel(190, "lb")).toBe("45 bar + 45 · 25 · 2.5 per side");
    expect(platesLabel(45, "lb")).toBe("Empty 45 lb bar");
    expect(platesLabel(30, "lb")).toBeNull();
    expect(platesLabel(100, "kg")).toBe("20 bar + 25 · 15 per side");
    expect(platesLabel(186, "lb")).toBe("45 bar + 45 · 25 per side (+0.5 not loadable)");
    expect(platesLabel(405, "lb")).toBe("45 bar + 45×4 per side");
    expect(platesLabel(1999, "lb")).toBeNull(); // a typo, not a load
  });
});

describe("copy", () => {
  it("formats ranges and target chips", () => {
    expect(repRange(5, 8, "reps")).toBe("5–8");
    expect(repRange(8, 8, "each")).toBe("8 each");
    expect(repRange(30, 45, "sec")).toBe("30–45 s");
    expect(targetChips({ sets: 3, low: 5, high: 8, unit: "reps", rir: "1–2", restSec: 180 })).toEqual(["3 × 5–8", "RIR 1–2", "Rest 3:00"]);
    expect(targetChips({ sets: 3, low: 3, high: 3, unit: "reps", rir: "Fresh", restSec: 120 })).toEqual(["3 × 3", "Stay fresh", "Rest 2:00"]);
  });

  it("localizes pound figures in sentences for kg users", () => {
    expect(localizeLb("You hit 8, 8 at 180 lb. Add 5 lb.", "kg")).toBe("You hit 8, 8 at 81.6 kg. Add 2.3 kg.");
    expect(localizeLb("At 180 lb.", "lb")).toBe("At 180 lb.");
  });

  it("builds the SUGGESTED headline", () => {
    const fmt = (n: number) => String(n);
    expect(suggestionHeadline(mkSuggestion("increase", 185), fmt, "lb")).toBe("185 lb × 5–8");
    expect(suggestionHeadline(mkSuggestion("first", null), fmt, "lb")).toBe("Find your baseline");
    expect(suggestionHeadline(mkSuggestion("increase", 5), fmt, "lb", true)).toBe("BW +5 lb × 5–8");
    expect(demoUrl("Barbell Bench Press")).toContain("youtube.com/results?search_query=Barbell%20Bench%20Press");
  });

  it("parses stored prefs with safe defaults", () => {
    expect(parsePrefs(null)).toEqual({ tapLogsGhost: true, systemKeyboard: false, restFocus: false, haptics: true, restChime: false });
    expect(parsePrefs({ systemKeyboard: true, restChime: "yes" })).toMatchObject({ systemKeyboard: true, restChime: false });
  });

  it("words a first bodyweight movement without talking about choosing a weight", () => {
    const first = { ...mkSuggestion("first", null), target: { low: 10, high: 15, unit: "reps" as const }, reason: "First time: choose a weight you can lift for 15 reps." };
    expect(suggestionReason(first, "bodyweight_reps", "lb")).toMatch(/^First time: bodyweight only, clean reps up to 10–15\./);
    expect(suggestionReason(first, "weight_reps", "lb")).toBe(first.reason);
    expect(suggestionReason({ ...mkSuggestion("hold", 180), reason: "Stay at 180 lb." }, "weight_reps", "kg")).toBe("Stay at 81.6 kg.");
  });

  it("formats record gains without ever saying +0", () => {
    expect(formatGain(6.2, "lb")).toBe("+6");
    expect(formatGain(1, "lb")).toBe("+1");
    expect(formatGain(1, "kg")).toBe("+0.5");
    expect(formatGain(11, "kg")).toBe("+5");
    expect(formatGain(30, "kg")).toBe("+14");
  });
});
