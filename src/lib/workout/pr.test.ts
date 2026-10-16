import { describe, expect, it } from "vitest";
import { mkSet } from "./fixtures";
import { classifyLog, firstBenchmarks, prSetIds, sessionRecords, setE1rm, type PriorBest } from "./pr";
import { groupSets } from "./session";

const prior = (e1rm: number | null, sets = 9): PriorBest => ({ e1rm, sets, weightLb: null, reps: null });

describe("PR detection", () => {
  it("computes e1RM only for completed working sets of 1–12 reps", () => {
    expect(setE1rm(mkSet({ completed: true, weight_lb: 200, reps: 5 }))).toBe(233.3);
    expect(setE1rm(mkSet({ completed: true, weight_lb: 200, reps: 15 }))).toBeNull();
    expect(setE1rm(mkSet({ completed: true, kind: "warmup", weight_lb: 200, reps: 5 }))).toBeNull();
    expect(setE1rm(mkSet({ completed: false, weight_lb: 200, reps: 5 }))).toBeNull();
  });

  it("fires on a set that beats all prior history", () => {
    const s = mkSet({ id: "x", weight_lb: 205, reps: 5 });
    const [g] = groupSets([s]);
    const r = classifyLog(s, g, prior(233));
    expect(r.kind).toBe("pr");
    expect(r.e1rm).toBe(239.2);
    expect(r.gain).toBe(6.2);
  });

  it("does not fire when it only ties or loses", () => {
    const s = mkSet({ id: "x", weight_lb: 200, reps: 5 });
    const [g] = groupSets([s]);
    expect(classifyLog(s, g, prior(233.3)).kind).toBeNull();
  });

  it("must also beat sets logged earlier in this session", () => {
    const a = mkSet({ id: "a", set_index: 0, completed: true, completed_at: "2026-10-16T18:01:00Z", weight_lb: 210, reps: 5 });
    const b = mkSet({ id: "b", set_index: 1, weight_lb: 205, reps: 5 });
    const [g] = groupSets([a, b]);
    expect(classifyLog(b, g, prior(233)).kind).toBeNull();
  });

  it("first-ever log is a FIRST BENCHMARK, never a record", () => {
    const s = mkSet({ id: "x", weight_lb: 100, reps: 10 });
    const [g] = groupSets([s]);
    expect(classifyLog(s, g, prior(null, 0)).kind).toBe("first");
    expect(prSetIds(groupSets([{ ...s, completed: true }])[0], prior(null, 0)).size).toBe(0);
  });

  it("does not guess when prior history has no e1RM (high-rep or bodyweight only)", () => {
    const s = mkSet({ id: "x", weight_lb: 100, reps: 10 });
    const [g] = groupSets([s]);
    expect(classifyLog(s, g, prior(null, 12)).kind).toBeNull();
    expect(classifyLog({ ...s, kind: "warmup" }, g, prior(50)).kind).toBeNull();
    expect(classifyLog(s, g, undefined).kind).toBeNull();
  });

  it("marks each successive record row", () => {
    const a = mkSet({ id: "a", set_index: 0, completed: true, completed_at: "2026-10-16T18:01:00Z", weight_lb: 205, reps: 5 });
    const b = mkSet({ id: "b", set_index: 1, completed: true, completed_at: "2026-10-16T18:05:00Z", weight_lb: 205, reps: 4 });
    const c = mkSet({ id: "c", set_index: 2, completed: true, completed_at: "2026-10-16T18:09:00Z", weight_lb: 210, reps: 5 });
    const [g] = groupSets([a, b, c]);
    expect([...prSetIds(g, prior(233))]).toEqual(["a", "c"]);
  });

  it("builds Hall of Records plaques from each exercise's best set", () => {
    const sets = [
      mkSet({ id: "a", completed: true, weight_lb: 205, reps: 5 }),
      mkSet({ id: "b", set_index: 1, completed: true, weight_lb: 210, reps: 5 }),
      mkSet({ id: "c", exercise_order: 1, exercise_slug: "incline-db-press", exercise_name: "Incline Dumbbell Press", completed: true, weight_lb: 60, reps: 10 }),
      mkSet({ id: "d", exercise_order: 2, exercise_slug: "hack-squat", exercise_name: "Hack Squat", completed: true, weight_lb: 180, reps: 10 }),
    ];
    const groups = groupSets(sets);
    const priors = { "barbell-bench-press": prior(233), "incline-db-press": prior(90), "hack-squat": prior(null, 0) };
    const plaques = sessionRecords(groups, priors);
    expect(plaques).toEqual([{ slug: "barbell-bench-press", name: "Barbell Bench Press", weightLb: 210, reps: 5, e1rm: 245, gain: 12 }]);
    expect(firstBenchmarks(groups, priors)).toEqual([{ slug: "hack-squat", name: "Hack Squat" }]);
  });
});
