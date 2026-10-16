import { describe, expect, it } from "vitest";
import type { PastSet } from "@/lib/training/progression";
import { mkSet } from "./fixtures";
import {
  cellText,
  columnFor,
  currentGroupKey,
  fieldsFor,
  ghostFor,
  groupSets,
  groupState,
  isGroupComplete,
  moveKey,
  nextPendingGroupKey,
  noteCarrier,
  relocateNotes,
  renumber,
  resolveLog,
  sessionCounts,
  setChip,
  setLabel,
  setLoadText,
  trackingFor,
  upNextSet,
  validateCell,
  retarget,
  defaultTargets,
} from "./session";

const past = (i: number, w: number | null, reps: number | null, dur: number | null = null): PastSet => ({
  local_date: "2026-10-09",
  session_id: "old",
  set_index: i,
  weight_lb: w,
  reps,
  duration_sec: dur,
  rir: 1,
});

function bench() {
  return [
    mkSet({ id: "b0", set_index: 0, suggested_weight_lb: 185 }),
    mkSet({ id: "b1", set_index: 1, suggested_weight_lb: 185 }),
    mkSet({ id: "b2", set_index: 2, suggested_weight_lb: 185 }),
  ];
}
function incline() {
  return [0, 1, 2].map((i) =>
    mkSet({ id: `i${i}`, set_index: i, exercise_order: 1, exercise_slug: "incline-db-press", exercise_name: "Incline Dumbbell Press", target_rep_low: 8, target_rep_high: 10 }),
  );
}

describe("grouping", () => {
  it("groups by order and slug with warm-ups first", () => {
    const warm = mkSet({ id: "w", set_index: 9, kind: "warmup" });
    const groups = groupSets([...incline(), ...bench(), warm]);
    expect(groups.map((g) => g.slug)).toEqual(["barbell-bench-press", "incline-db-press"]);
    expect(groups[0].sets.map((s) => s.id)).toEqual(["w", "b0", "b1", "b2"]);
    expect(groups[0].total).toBe(3);
    expect(setLabel(groups[0], warm)).toBe("W");
    expect(setLabel(groups[0], groups[0].working[1])).toBe("2");
  });

  it("keeps a replaced exercise's logged sets as their own group", () => {
    const sets = [
      mkSet({ id: "a", set_index: 0, completed: true, weight_lb: 185, reps: 8 }),
      mkSet({ id: "b", set_index: 0, exercise_order: 1, exercise_slug: "db-bench-press", exercise_name: "Dumbbell Bench Press" }),
    ];
    const g = groupSets(sets);
    expect(g).toHaveLength(2);
    expect(isGroupComplete(g[0])).toBe(true);
  });

  it("finds the current exercise, skipping done and skipped ones", () => {
    const s = [...bench(), ...incline()].map((x) => (x.exercise_order === 0 ? { ...x, completed: true, weight_lb: 185, reps: 8 } : x));
    const groups = groupSets(s);
    expect(currentGroupKey(groups, new Set())).toBe(groups[1].key);
    const skipped = new Set(["i0", "i1", "i2"]);
    expect(groupState(groups[1], skipped)).toBe("skipped");
    expect(currentGroupKey(groups, skipped)).toBeNull();
    expect(sessionCounts(groups)).toEqual({ done: 3, total: 6 });
  });

  it("wraps to an earlier pending exercise when the last one finishes", () => {
    const groups = groupSets([...bench(), ...incline()]);
    expect(nextPendingGroupKey(groups, groups[0].key, new Set())).toBe(groups[1].key);
    expect(nextPendingGroupKey(groups, groups[1].key, new Set())).toBe(groups[0].key);
  });

  it("UP NEXT is the first unlogged set of the open exercise", () => {
    const s = bench();
    s[0] = { ...s[0], completed: true, weight_lb: 185, reps: 6 };
    const groups = groupSets([...s, ...incline()]);
    expect(upNextSet(groups, groups[0].key, new Set())?.id).toBe("b1");
    expect(upNextSet(groups, groups[1].key, new Set())?.id).toBe("i0");
  });
});

describe("ghost values", () => {
  const last = [past(0, 180, 8), past(1, 180, 8), past(2, 180, 7)];

  it("uses the suggested load and the bottom of the range after an increase", () => {
    const [g] = groupSets(bench());
    const gh = ghostFor(g.working[0], g, last, "weight_reps", 5);
    expect(gh).toMatchObject({ weight: 185, weightSource: "suggested", work: 5, workSource: "target" });
  });

  it("repeats last session's set when the load is unchanged", () => {
    const sets = bench().map((s) => ({ ...s, suggested_weight_lb: 180 }));
    const [g] = groupSets(sets);
    expect(ghostFor(g.working[2], g, last, "weight_reps")).toMatchObject({ weight: 180, work: 7, workSource: "last" });
  });

  it("carries the load logged earlier this session", () => {
    const sets = bench();
    sets[0] = { ...sets[0], completed: true, weight_lb: 175, reps: 8 };
    const [g] = groupSets(sets);
    expect(ghostFor(g.working[1], g, last, "weight_reps")).toMatchObject({ weight: 175, weightSource: "session", work: 8, workSource: "session" });
  });

  it("matches reps against a typed weight", () => {
    const sets = bench();
    sets[1] = { ...sets[1], weight_lb: 180 };
    const [g] = groupSets(sets);
    expect(ghostFor(g.working[1], g, last, "weight_reps")).toMatchObject({ work: 8, workSource: "last" });
  });

  it("has no ghost on a first-ever exercise with a range", () => {
    const [g] = groupSets(bench().map((s) => ({ ...s, suggested_weight_lb: null })));
    expect(ghostFor(g.working[0], g, [], "weight_reps")).toMatchObject({ weight: null, work: null });
  });

  it("uses a fixed target for jumps and seconds for carries", () => {
    const jump = mkSet({ id: "j", exercise_slug: "box-jump", target_rep_low: 3, target_rep_high: 3 });
    const [gj] = groupSets([jump]);
    expect(ghostFor(jump, gj, [], "reps")).toMatchObject({ weight: null, work: 3 });
    const carry = mkSet({ id: "c", exercise_slug: "farmer-carry", target_unit: "sec", target_rep_low: 30, target_rep_high: 45, suggested_weight_lb: 70 });
    const [gc] = groupSets([carry]);
    expect(ghostFor(carry, gc, [past(0, 70, null, 45)], "weight_time")).toMatchObject({ weight: 70, work: 45 });
  });

  it("ramps warm-up ghosts from the working load", () => {
    const sets = [...bench(), mkSet({ id: "w1", kind: "warmup", set_index: 5 }), mkSet({ id: "w2", kind: "warmup", set_index: 6 })];
    const [g] = groupSets(sets);
    expect(ghostFor(g.warmups[0], g, last, "weight_reps", 5)).toMatchObject({ weight: 95, work: 5 });
    expect(ghostFor(g.warmups[1], g, last, "weight_reps", 5)).toMatchObject({ weight: 130, work: 3 });
  });

  it("logged sets have no ghost", () => {
    const s = mkSet({ completed: true, weight_lb: 100, reps: 5 });
    const [g] = groupSets([s]);
    expect(ghostFor(s, g, last, "weight_reps").weight).toBeNull();
  });
});

describe("logging", () => {
  const now = "2026-10-16T18:10:00Z";
  const ghost = { weight: 185, work: 6, weightSource: "suggested" as const, workSource: "target" as const };

  it("logs ghosts only when the preference allows", () => {
    const s = mkSet();
    expect(resolveLog(s, ghost, "weight_reps", true, now)).toEqual({
      ok: true,
      values: { weight_lb: 185, reps: 6, duration_sec: null, completed: true, completed_at: now },
    });
    expect(resolveLog(s, ghost, "weight_reps", false, now)).toEqual({ ok: false, field: "weight" });
  });

  it("typed values win over ghosts", () => {
    const s = mkSet({ weight_lb: 190 });
    const r = resolveLog(s, ghost, "weight_reps", true, now);
    expect(r.ok && r.values.weight_lb).toBe(190);
  });

  it("opens the keypad on reps when there is nothing to log", () => {
    const s = mkSet({ weight_lb: 100 });
    expect(resolveLog(s, { ...ghost, work: null }, "weight_reps", true, now)).toEqual({ ok: false, field: "work" });
  });

  it("lets bodyweight lifts log without load and carries log seconds", () => {
    const bw = resolveLog(mkSet({ reps: 8 }), { weight: null, work: null, weightSource: null, workSource: null }, "bodyweight_reps", true, now);
    expect(bw).toMatchObject({ ok: true, values: { weight_lb: null, reps: 8 } });
    const carry = resolveLog(mkSet({ weight_lb: 70, duration_sec: 40 }), ghost, "weight_time", true, now);
    expect(carry).toMatchObject({ ok: true, values: { weight_lb: 70, duration_sec: 40, reps: null } });
  });
});

describe("validation", () => {
  it("rejects negatives, junk and absurd values inline", () => {
    expect(validateCell("weight", "-5", "lb", "weight_reps")).toEqual({ ok: false, error: "Weight can't be negative." });
    expect(validateCell("weight", "abc", "lb", "weight_reps").ok).toBe(false);
    expect(validateCell("weight", "2000", "lb", "weight_reps").ok).toBe(false);
    expect(validateCell("work", "150", "lb", "weight_reps").ok).toBe(false);
    expect(validateCell("work", "6.5", "lb", "weight_reps").ok).toBe(false);
    expect(validateCell("rir", "11", "lb", "weight_reps").ok).toBe(false);
    expect(validateCell("work", "1000", "lb", "weight_time").ok).toBe(false);
  });

  it("converts kg to stored pounds and accepts blanks", () => {
    expect(validateCell("weight", "100", "kg", "weight_reps")).toEqual({ ok: true, stored: 220.5 });
    expect(validateCell("weight", "182,5", "lb", "weight_reps")).toEqual({ ok: true, stored: 182.5 });
    expect(validateCell("work", "", "lb", "weight_reps")).toEqual({ ok: true, stored: null });
    expect(validateCell("work", "45", "lb", "weight_time")).toEqual({ ok: true, stored: 45 });
  });

  it("maps cells to columns and back to text", () => {
    expect(columnFor("work", "weight_time")).toBe("duration_sec");
    expect(columnFor("work", "weight_reps")).toBe("reps");
    expect(cellText({ weight_lb: 220.5, reps: 5, duration_sec: null, rir: 2 }, "weight", "weight_reps", "kg")).toBe("100");
    expect(cellText({ weight_lb: 182.5, reps: 5, duration_sec: null, rir: 2 }, "weight", "weight_reps", "lb")).toBe("182.5");
    expect(fieldsFor("reps")).toEqual(["work"]);
    expect(fieldsFor("weight_time")).toEqual(["weight", "work"]);
    expect(fieldsFor("weight_reps")).toEqual(["weight", "work", "rir"]);
  });

  it("infers tracking without a library entry", () => {
    expect(trackingFor(undefined, "sec")).toBe("weight_time");
    expect(trackingFor(undefined, "reps")).toBe("weight_reps");
  });
});

describe("ordering and notes", () => {
  it("moves a group and renumbers only changed rows", () => {
    const groups = groupSets([...bench(), ...incline()]);
    const keys = moveKey(groups.map((g) => g.key), groups[1].key, -1);
    expect(keys[0]).toBe(groups[1].key);
    const changes = renumber(groups, keys);
    expect(changes).toHaveLength(6);
    expect(changes.find((c) => c.id === "i0")?.exercise_order).toBe(0);
    expect(changes.find((c) => c.id === "b0")?.exercise_order).toBe(1);
    expect(moveKey(keys, keys[0], -1)).toBe(keys);
  });

  it("keeps notes from unlogged sets when finishing", () => {
    const s = bench();
    s[0] = { ...s[0], completed: true, weight_lb: 185, reps: 6, notes: "Good bar speed" };
    s[2] = { ...s[2], notes: "Shoulder twinge — stopped" };
    const inc = incline();
    inc[0] = { ...inc[0], notes: "Skipped, bench taken" };
    const { moves, sessionLines } = relocateNotes(groupSets([...s, ...inc]));
    expect(moves).toEqual([{ id: "b0", notes: "Good bar speed · Shoulder twinge — stopped" }]);
    expect(sessionLines).toEqual(["Incline Dumbbell Press: Skipped, bench taken"]);
    expect(noteCarrier(groupSets(s)[0])?.id).toBe("b0");
  });

  it("formats chips and load text", () => {
    const fmt = (n: number) => String(n);
    expect(setChip({ weight_lb: 185, reps: 8, duration_sec: null }, "weight_reps", fmt)).toBe("185×8");
    expect(setChip({ weight_lb: 70, reps: null, duration_sec: 45 }, "weight_time", fmt)).toBe("70×45s");
    expect(setChip({ weight_lb: null, reps: 3, duration_sec: null }, "reps", fmt)).toBe("3");
    expect(setChip({ weight_lb: 10, reps: 6, duration_sec: null }, "bodyweight_reps", fmt)).toBe("+10×6");
    expect(setLoadText({ weight_lb: 185, reps: 6, duration_sec: null }, "weight_reps", fmt, "lb")).toBe("185 × 6");
    expect(setLoadText({ weight_lb: null, reps: 8, duration_sec: null }, "bodyweight_reps", fmt, "lb")).toBe("8 reps");
  });
});

describe("targets for swaps and additions", () => {
  const lib = (p: Partial<import("@/lib/training/types").LibraryExercise>) =>
    ({ slug: "x", name: "X", primary: [], secondary: [], category: "compound", equipment: "barbell", tracking: "weight_reps", rest: 150, increment: 5, instructions: [], formTips: [], substitutes: [], ...p }) as import("@/lib/training/types").LibraryExercise;

  it("keeps the prescription for a like-for-like swap", () => {
    expect(retarget({ low: 5, high: 8, unit: "reps", rir: "1–2", sets: 3 }, lib({ rest: 120, perSide: false }))).toEqual({ sets: 3, low: 5, high: 8, unit: "reps", rir: "1–2", rest: 120 });
    expect(retarget({ low: 10, high: 12, unit: "reps", rir: "1–2", sets: 2 }, lib({ perSide: true })).unit).toBe("each");
  });

  it("re-targets when the movement type changes", () => {
    expect(retarget({ low: 5, high: 8, unit: "reps", rir: "1–2", sets: 3 }, lib({ tracking: "weight_time", category: "carry", rest: 90 }))).toEqual({ sets: 3, low: 30, high: 45, unit: "sec", rir: "1–2", rest: 90 });
    expect(retarget({ low: 8, high: 12, unit: "reps", rir: "1–2", sets: 3 }, lib({ category: "explosive", tracking: "reps", rest: 120 }))).toMatchObject({ low: 3, high: 3, rir: "Fresh" });
  });

  it("gives added exercises honest defaults", () => {
    expect(defaultTargets(lib({ category: "isolation", rest: 75 }))).toEqual({ sets: 3, low: 10, high: 15, unit: "reps", rir: "1–2", rest: 75 });
    expect(defaultTargets(lib({ category: "explosive", tracking: "reps" }))).toMatchObject({ low: 3, high: 3, rir: "Fresh" });
  });
});
