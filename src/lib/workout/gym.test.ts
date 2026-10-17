import { describe, expect, it } from "vitest";
import type { PastSet } from "@/lib/training/progression";
import { mkSet, mkSuggestion } from "./fixtures";
import { asPastSets, changedPlate, clockTime, endsAt, friezeSegments, gymDate, lastRealSession, liftResults, loadText, runningBest, signedLoad, targetLine } from "./gym";
import { sessionRecords, type PriorBest } from "./pr";
import { groupSets } from "./session";

const fmt = (lb: number) => String(lb);
const past = (p: Partial<PastSet>): PastSet => ({ local_date: "2026-10-12", session_id: "p1", set_index: 0, weight_lb: 185, reps: 6, duration_sec: null, rir: null, mode: "standard", ...p });
const prior = (e1rm: number | null, sets = 9): PriorBest => ({ e1rm, sets, weightLb: null, reps: null });

describe("clockTime / gymDate / loadText", () => {
  it("formats a local wall-clock time", () => {
    expect(clockTime(new Date(2026, 9, 19, 17, 41))).toBe("5:41 pm");
    expect(clockTime(new Date(2026, 9, 19, 0, 5))).toBe("12:05 am");
    expect(clockTime(new Date(2026, 9, 19, 12, 0))).toBe("12:00 pm");
    expect(clockTime("nope")).toBe("—");
  });
  it("formats a day the Canadian way", () => {
    expect(gymDate("2026-10-19")).toBe("Mon 19 Oct");
  });
  it("groups thousands and keeps one decimal", () => {
    expect(loadText(1000, "lb")).toBe("1,000");
    expect(loadText(192.5, "lb")).toBe("192.5");
    expect(loadText(null, "lb")).toBe("—");
    expect(loadText(220.462, "kg")).toBe("100");
  });
});

describe("targetLine", () => {
  const ref = [past({ weight_lb: 185, reps: 8 }), past({ set_index: 1, weight_lb: 185, reps: 6 })];
  it("an increase names the old top set", () => {
    expect(targetLine(mkSuggestion("increase", 190), ref, fmt, "weight_reps")).toBe("190 × 5–8 · up 5 from 185 × 8");
  });
  it("hold, add reps, reset and deload say what the rule decided", () => {
    expect(targetLine(mkSuggestion("hold", 185), ref, fmt, "weight_reps")).toBe("185 × 5–8 · hold");
    expect(targetLine(mkSuggestion("add_reps", 185), ref, fmt, "weight_reps")).toBe("185 × 5–8 · same load, add a rep");
    expect(targetLine(mkSuggestion("reset", 165), ref, fmt, "weight_reps")).toBe("165 × 5–8 · reset from 185");
    expect(targetLine(mkSuggestion("deload", 165), ref, fmt, "weight_reps")).toBe("165 × 5–8 · deload, 3+ in reserve");
  });
  it("no history: a first-time line, never a number", () => {
    expect(targetLine(mkSuggestion("first", null), null, fmt, "weight_reps")).toBe("First time · 5–8 to find your baseline");
    expect(targetLine(mkSuggestion("first", null), null, fmt, "bodyweight_reps")).toBe("First time · bodyweight × 5–8");
  });
  it("bodyweight with added load reads BW +", () => {
    expect(targetLine(mkSuggestion("hold", 10), [past({ weight_lb: 10, reps: 8 })], fmt, "bodyweight_reps")).toBe("BW +10 × 5–8 · hold");
  });
  it("lastRealSession skips deloads", () => {
    const h = [past({ local_date: "2026-10-14", session_id: "d", mode: "deload" }), past({ local_date: "2026-10-10", session_id: "r" })];
    expect(lastRealSession(h)?.[0].session_id).toBe("r");
    expect(lastRealSession([])).toBeNull();
  });
});

describe("changedPlate", () => {
  it("+5 lb adds a 2.5 per side", () => {
    expect(changedPlate(190, 185, "lb")).toEqual({ index: 2, caption: "2.5 = today's +5 lb" });
  });
  it("a swap marks the first plate that differs", () => {
    // 215 = 45 · 35 · 5 per side; 225 = 45 · 45
    expect(changedPlate(225, 215, "lb")).toEqual({ index: 1, caption: "45 · today's +10 lb" });
  });
  it("nothing when lighter, equal, unknown or unloadable", () => {
    expect(changedPlate(185, 190, "lb")).toBeNull();
    expect(changedPlate(185, 185, "lb")).toBeNull();
    expect(changedPlate(185, null, "lb")).toBeNull();
    expect(changedPlate(186, 185, "lb")).toBeNull();
  });
});

describe("liftResults", () => {
  const sess = (sets: Parameters<typeof mkSet>[0][]) => groupSets(sets.map((p, i) => mkSet({ completed: true, completed_at: `2026-10-19T17:0${i}:00Z`, set_index: i, ...p })));
  it("a record leads with its e1RM gain", () => {
    const groups = sess([{ weight_lb: 190, reps: 6 }]);
    const priors = { "barbell-bench-press": prior(222) };
    const plaques = sessionRecords(groups, priors);
    const r = liftResults(groups, {}, priors, plaques, "standard", "lb");
    expect(r[0]).toMatchObject({ timing: "record", delta: "+6 e1RM" });
  });
  it("a first log is a first benchmark", () => {
    const groups = sess([{ weight_lb: 135, reps: 8 }]);
    expect(liftResults(groups, {}, { "barbell-bench-press": prior(null, 0) }, [], "standard", "lb")[0]).toMatchObject({ timing: "first", delta: null });
  });
  it("same top load: reps decide (+2 reps, = last, −1 rep)", () => {
    const hist = { "barbell-bench-press": [past({ weight_lb: 185, reps: 6 })] };
    const priors = { "barbell-bench-press": prior(250) };
    expect(liftResults(sess([{ weight_lb: 185, reps: 8 }]), hist, priors, [], "standard", "lb")[0]).toMatchObject({ timing: "beat", delta: "+2 reps" });
    expect(liftResults(sess([{ weight_lb: 185, reps: 6 }]), hist, priors, [], "standard", "lb")[0]).toMatchObject({ timing: "matched", delta: "= last" });
    expect(liftResults(sess([{ weight_lb: 185, reps: 5 }]), hist, priors, [], "standard", "lb")[0]).toMatchObject({ timing: "below", delta: "−1 rep" });
  });
  it("a different load compares e1RM", () => {
    const hist = { "barbell-bench-press": [past({ weight_lb: 185, reps: 6 })] }; // 222
    const priors = { "barbell-bench-press": prior(250) };
    expect(liftResults(sess([{ weight_lb: 190, reps: 6 }]), hist, priors, [], "standard", "lb")[0]).toMatchObject({ timing: "beat", delta: "+6 e1RM" });
    expect(liftResults(sess([{ weight_lb: 175, reps: 6 }]), hist, priors, [], "standard", "lb")[0]).toMatchObject({ timing: "below", delta: "−12 e1RM" });
  });
  it("a deload compares only with a deload", () => {
    const hist = { "barbell-bench-press": [past({ weight_lb: 185, reps: 6 })] };
    expect(liftResults(sess([{ weight_lb: 165, reps: 6 }]), hist, { "barbell-bench-press": prior(250) }, [], "deload", "lb")[0]).toMatchObject({ timing: null, delta: null });
  });
  it("timed work compares seconds", () => {
    const hist = { "farmer-carry": [past({ weight_lb: 70, reps: null, duration_sec: 40 })] };
    const groups = sess([{ exercise_slug: "farmer-carry", exercise_name: "Farmer carry", weight_lb: 70, reps: null, duration_sec: 45 }]);
    expect(liftResults(groups, hist, { "farmer-carry": prior(null) }, [], "standard", "lb")[0]).toMatchObject({ timing: "beat", delta: "+5 s" });
  });
  it("skips lifts with nothing logged", () => {
    const groups = groupSets([mkSet({ weight_lb: 185, reps: 6 })]);
    expect(liftResults(groups, {}, {}, [], "standard", "lb")).toEqual([]);
  });
});

describe("helpers", () => {
  it("signedLoad uses a real minus and the user's unit", () => {
    expect(signedLoad(6, "lb")).toBe("+6");
    expect(signedLoad(-12.4, "lb")).toBe("−12");
    expect(signedLoad(11.02, "kg")).toBe("+5");
  });
  it("asPastSets keeps completed working sets with the session mode", () => {
    const out = asPastSets([mkSet({ completed: true, weight_lb: 185, reps: 6 }), mkSet({ kind: "warmup", completed: true }), mkSet({})], "standard");
    expect(out["barbell-bench-press"]).toHaveLength(1);
    expect(out["barbell-bench-press"][0]).toMatchObject({ weight_lb: 185, reps: 6, mode: "standard" });
  });
  it("friezeSegments: logged, current, later, skipped", () => {
    const a = mkSet({ id: "a", completed: true });
    const b = mkSet({ id: "b", set_index: 1 });
    const c = mkSet({ id: "c", set_index: 2 });
    const d = mkSet({ id: "d", set_index: 3, kind: "warmup" });
    expect(friezeSegments(groupSets([a, b, c, d]), "b", new Set(["c"])).map((s) => s.state)).toEqual(["logged", "current", "skipped"]);
  });
  it("endsAt adds the typical length", () => {
    expect(endsAt("2026-10-19T16:30:00Z", 68)).toBe(Date.parse("2026-10-19T17:38:00Z"));
    expect(endsAt("2026-10-19T16:30:00Z", null)).toBeNull();
  });
  it("runningBest folds in this session's sets", () => {
    const s = mkSet({ id: "x", completed: true, weight_lb: 190, reps: 6 }); // 228
    expect(runningBest(prior(222), [s])?.e1rm).toBe(228);
    expect(runningBest(prior(222), [s], "x")?.e1rm).toBe(222);
    expect(runningBest(prior(null, 0), [s])?.sets).toBe(0);
  });
});
