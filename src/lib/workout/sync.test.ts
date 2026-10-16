import { describe, expect, it } from "vitest";
import { mkSet } from "./fixtures";
import { diffSets, isEmptyDiff, isNetworkError, sameSet, setPayload } from "./sync";

describe("diffSets", () => {
  it("is empty when the server matches the device", () => {
    const a = mkSet({ id: "a", weight_lb: 185, reps: 6, completed: true, completed_at: "2026-10-16T18:00:00.000Z" });
    // Postgres hands numerics and timestamps back in its own spelling
    const server = { ...a, weight_lb: "185.0" as unknown as number, completed_at: "2026-10-16T18:00:00+00:00", updated_at: "2026-10-16T19:00:00Z" };
    expect(isEmptyDiff(diffSets([a], [server]))).toBe(true);
  });

  it("re-sends a logged set whose write was dropped", () => {
    const local = mkSet({ id: "a", weight_lb: 185, reps: 6, completed: true, completed_at: "2026-10-16T18:00:00Z" });
    const server = { ...local, weight_lb: null, reps: null, completed: false, completed_at: null };
    expect(diffSets([local], [server]).upserts.map((s) => s.id)).toEqual(["a"]);
  });

  it("inserts sets the server never saw and deletes ones removed on the device", () => {
    const kept = mkSet({ id: "kept" });
    const added = mkSet({ id: "added" });
    const removed = mkSet({ id: "removed" });
    const d = diffSets([kept, added], [kept, removed]);
    expect(d.upserts.map((s) => s.id)).toEqual(["added"]);
    expect(d.deletes).toEqual(["removed"]);
  });

  it("notices renames, re-orders, notes and warm-up toggles", () => {
    const base = mkSet({ id: "a" });
    for (const change of [{ exercise_slug: "db-bench-press" }, { exercise_order: 3 }, { notes: "seat 4" }, { kind: "warmup" }, { rir: 2 }]) {
      expect(sameSet({ ...base, ...change }, base)).toBe(false);
    }
    expect(sameSet({ ...base, notes: " seat 4 " }, { ...base, notes: "seat 4" })).toBe(true);
  });
});

describe("setPayload", () => {
  it("leaves the server's own timestamps out", () => {
    const p = setPayload(mkSet({ id: "a" }));
    expect(p.id).toBe("a");
    expect("created_at" in p).toBe(false);
    expect("updated_at" in p).toBe(false);
    expect(p.exercise_slug).toBe("barbell-bench-press");
  });
});

describe("isNetworkError", () => {
  it("separates a dead connection from a rejection", () => {
    expect(isNetworkError("TypeError: Failed to fetch")).toBe(true);
    expect(isNetworkError("Load failed")).toBe(true);
    expect(isNetworkError("Offline — changes will sync when you're back online.")).toBe(true);
    expect(isNetworkError('new row violates check constraint "exercise_sets_reps_check"')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
