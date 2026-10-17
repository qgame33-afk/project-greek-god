import { describe, expect, it } from "vitest";
import { mkSet } from "./fixtures";
import {
  emptyJournal,
  isNetworkError,
  journalEmpty,
  journalFromDiff,
  reconcile,
  reconcileNotes,
  recordDelete,
  recordInsert,
  recordUpdate,
  sameSet,
  sameSets,
  setPayload,
} from "./sync";

describe("sameSet", () => {
  it("matches the server's own spelling of the same values", () => {
    const a = mkSet({ id: "a", weight_lb: 185, reps: 6, completed: true, completed_at: "2026-10-16T18:00:00.000Z" });
    // Postgres hands numerics and timestamps back in its own spelling
    const server = { ...a, weight_lb: "185.0" as unknown as number, completed_at: "2026-10-16T18:00:00+00:00", updated_at: "2026-10-16T19:00:00Z" };
    expect(sameSet(a, server)).toBe(true);
    expect(sameSets([a], [server])).toBe(true);
    expect(sameSets([a], [server, mkSet()])).toBe(false);
  });

  it("notices renames, re-orders, notes and warm-up toggles", () => {
    const base = mkSet({ id: "a" });
    for (const change of [{ exercise_slug: "db-bench-press" }, { exercise_order: 3 }, { notes: "seat 4" }, { kind: "warmup" }, { rir: 2 }]) {
      expect(sameSet({ ...base, ...change }, base)).toBe(false);
    }
    expect(sameSet({ ...base, notes: " seat 4 " }, { ...base, notes: "seat 4" })).toBe(true);
  });
});

describe("reconcile: two devices on one session", () => {
  const t = "2026-10-16T18:05:00Z";
  // Planned rows both devices loaded when the session started.
  const lat0 = mkSet({ id: "lat0", exercise_slug: "lat-pulldown", set_index: 0 });
  const lat1 = mkSet({ id: "lat1", exercise_slug: "lat-pulldown", set_index: 1 });
  const row0 = mkSet({ id: "row0", exercise_slug: "chest-row", exercise_order: 1 });
  const logged = (s: ReturnType<typeof mkSet>, w: number, r: number) => ({ ...s, weight_lb: w, reps: r, completed: true, completed_at: t });

  it("a stale laptop never reverts or deletes sets the phone logged", () => {
    // The phone logged both lat pulldown sets; the laptop (page left open) logged the row.
    const server = [logged(lat0, 150, 10), logged(lat1, 150, 10), row0];
    const laptopRow = logged(row0, 100, 10);
    let j = emptyJournal();
    j = recordUpdate(j, row0, { weight_lb: 100 });
    j = recordUpdate(j, { ...row0, weight_lb: 100 }, { reps: 10 });
    j = recordUpdate(j, { ...row0, weight_lb: 100, reps: 10 }, { completed: true, completed_at: t });
    const r = reconcile([lat0, lat1, laptopRow], server, j);
    // Only the laptop's own row is written, and only the fields it changed.
    expect(r.push).toEqual([{ kind: "update", id: "row0", values: { weight_lb: 100, reps: 10, completed: true, completed_at: t } }]);
    // The laptop now shows the phone's sets.
    expect(r.sets.find((s) => s.id === "lat0")).toMatchObject({ weight_lb: 150, reps: 10, completed: true });
    expect(r.sets.find((s) => s.id === "row0")).toMatchObject({ weight_lb: 100, completed: true });
    expect(r.conflicts).toBe(0);
  });

  it("forgets changes the server already holds", () => {
    const j = recordUpdate(emptyJournal(), row0, { weight_lb: 100, reps: 10, completed: true, completed_at: t });
    const r = reconcile([logged(row0, 100, 10)], [{ ...logged(row0, 100, 10), weight_lb: "100.0" as unknown as number, completed_at: "2026-10-16T18:05:00+00:00" }], j);
    expect(r.push).toEqual([]);
    expect(journalEmpty(r.journal)).toBe(true);
  });

  it("a newer change from another device wins over a write that never landed", () => {
    // Laptop typed 100 (lost); the phone then logged 105 × 8 on the same set.
    const j = recordUpdate(emptyJournal(), row0, { weight_lb: 100 });
    const r = reconcile([{ ...row0, weight_lb: 100 }], [logged(row0, 105, 8)], j);
    expect(r.push).toEqual([]);
    expect(r.sets[0]).toMatchObject({ weight_lb: 105, reps: 8, completed: true });
    expect(r.conflicts).toBe(1);
  });

  it("re-sends only the fields of a lost write that nobody else changed", () => {
    const j = recordUpdate(emptyJournal(), row0, { weight_lb: 100, rir: 2 });
    const r = reconcile([{ ...row0, weight_lb: 100, rir: 2 }], [{ ...row0, rir: 1 }], j);
    expect(r.push).toEqual([{ kind: "update", id: "row0", values: { weight_lb: 100 } }]);
    expect(r.sets[0]).toMatchObject({ weight_lb: 100, rir: 1 });
    expect(Object.keys(r.journal.sets.row0.base)).toEqual(["weight_lb"]);
  });

  it("inserts a set added here that the server never got, and keeps sets added elsewhere", () => {
    const added = mkSet({ id: "added", set_index: 2 });
    const theirs = mkSet({ id: "theirs", set_index: 3 });
    const r = reconcile([lat0, added], [lat0, theirs], recordInsert(emptyJournal(), added));
    expect(r.push).toEqual([{ kind: "insert", row: added }]);
    expect(r.sets.map((s) => s.id).sort()).toEqual(["added", "lat0", "theirs"]);
  });

  it("re-deletes a set removed here, unless another device logged it since", () => {
    const j = recordDelete(emptyJournal(), lat1);
    expect(reconcile([lat0], [lat0, lat1], j).push).toEqual([{ kind: "delete", id: "lat1" }]);
    const r = reconcile([lat0], [lat0, logged(lat1, 150, 10)], j);
    expect(r.push).toEqual([]);
    expect(r.sets.map((s) => s.id)).toEqual(["lat0", "lat1"]);
  });

  it("a set logged here stays logged even if another device removed the row", () => {
    const j = recordUpdate(emptyJournal(), lat1, { weight_lb: 150, reps: 10, completed: true, completed_at: t });
    const mine = logged(lat1, 150, 10);
    const r = reconcile([lat0, mine], [lat0], j);
    expect(r.push).toEqual([{ kind: "insert", row: mine }]);
    // …but an unlogged edit to a row removed elsewhere follows the removal
    const j2 = recordUpdate(emptyJournal(), lat1, { weight_lb: 150 });
    expect(reconcile([lat0, { ...lat1, weight_lb: 150 }], [lat0], j2).sets.map((s) => s.id)).toEqual(["lat0"]);
  });

  it("rows this device never touched follow the server, including removals", () => {
    const r = reconcile([lat0, lat1], [logged(lat0, 150, 10)], emptyJournal());
    expect(r.sets).toEqual([logged(lat0, 150, 10)]);
    expect(r.push).toEqual([]);
  });

  it("session notes follow the same three-way rule", () => {
    expect(reconcileNotes("seat 4", null, null)).toEqual({ notes: "seat 4", push: true, base: null });
    expect(reconcileNotes("seat 4", "seat 4", null)).toEqual({ notes: "seat 4", push: false, base: undefined });
    expect(reconcileNotes("seat 4", "felt strong", null)).toEqual({ notes: "felt strong", push: false, base: undefined });
    expect(reconcileNotes("old", "from phone", undefined)).toEqual({ notes: "from phone", push: false, base: undefined });
  });

  it("converts a pre-journal dirty copy: its differences are this device's", () => {
    const mine = logged(row0, 100, 10);
    const added = mkSet({ id: "added" });
    const j = journalFromDiff([mine, added], [row0, lat0], "note", null);
    const r = reconcile([mine, added], [row0, lat0], j);
    expect(r.push).toContainEqual({ kind: "update", id: "row0", values: { weight_lb: 100, reps: 10, completed: true, completed_at: t } });
    expect(r.push).toContainEqual({ kind: "insert", row: added });
    expect(r.push).toContainEqual({ kind: "delete", id: "lat0" });
    expect(j.notesBase).toBeNull();
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
