import { describe, expect, it } from "vitest";
import type { Mode } from "./progression";
import { historyTimings, sessionTimingCounts, timingSummary, type HistorySet } from "./timing-history";

let n = 0;
const row = (session: string, date: string, slug: string, idx: number, w: number | null, reps: number | null, dur: number | null = null): HistorySet => ({
  id: `set-${++n}`,
  session_id: session,
  exercise_slug: slug,
  local_date: date,
  set_index: idx,
  weight_lb: w,
  reps,
  duration_sec: dur,
  completed_at: `${date}T17:${String(10 + idx).padStart(2, "0")}:00Z`,
});

const MODES: Record<string, Mode> = { a: "standard", b: "standard", c: "deload", d: "standard", e: "deload" };
const modeOf = (id: string) => MODES[id];

describe("historyTimings", () => {
  const rows = [
    // A: first ever bench session → first benchmarks
    row("a", "2026-09-14", "barbell-bench-press", 0, 185, 6),
    row("a", "2026-09-14", "barbell-bench-press", 1, 185, 6),
    // B: 190 × 6 (e1RM 228) beats 222 → record; 185 × 5 is below set 2 of A
    row("b", "2026-09-21", "barbell-bench-press", 0, 190, 6),
    row("b", "2026-09-21", "barbell-bench-press", 1, 185, 5),
    // C: a deload with no earlier deload → nothing to compare with
    row("c", "2026-09-28", "barbell-bench-press", 0, 135, 8),
    // D: back to standard; compares with B (the last standard session), not C
    row("d", "2026-10-05", "barbell-bench-press", 0, 190, 6),
    row("d", "2026-10-05", "barbell-bench-press", 1, 185, 6),
    // E: a deload that compares with C
    row("e", "2026-10-12", "barbell-bench-press", 0, 135, 9),
    // a high-rep lift compares weight then reps
    row("a", "2026-09-14", "db-lateral-raise", 0, 20, 15),
    row("b", "2026-09-21", "db-lateral-raise", 0, 20, 16),
    row("d", "2026-10-05", "db-lateral-raise", 0, 20, 16),
  ];
  const t = historyTimings(rows, modeOf);
  const at = (i: number) => t.get(rows[i].id!)!;

  it("calls every set of an exercise's first session a first benchmark", () => {
    expect(at(0).timing).toBe("first");
    expect(at(1).timing).toBe("first");
    expect(at(8).timing).toBe("first");
  });

  it("finds records with the 1 lb margin and compares the rest with the same set last time", () => {
    expect(at(2)).toMatchObject({ timing: "record", e1rm: 228, delta: { e1rm: 6 } });
    expect(at(3).timing).toBe("below");
  });

  it("compares deload sets only with deload sets", () => {
    expect(at(4).timing).toBeNull();
    expect(at(7).timing).toBe("beat");
  });

  it("compares a standard session with the last standard one, skipping a deload", () => {
    expect(at(5).timing).toBe("matched");
    // 185 × 6 vs B's set 2 at 185 × 5
    expect(at(6).timing).toBe("beat");
  });

  it("falls back to weight, then reps for high-rep sets", () => {
    expect(at(9).timing).toBe("beat");
    expect(at(10).timing).toBe("matched");
  });

  it("does not count a later set of the same session as history", () => {
    // a record set early in a session raises the bar for the sets after it, as prSetIds does
    const r = [row("x", "2026-09-01", "barbell-squat", 0, 200, 5), row("y", "2026-09-08", "barbell-squat", 0, 210, 5), row("y", "2026-09-08", "barbell-squat", 1, 212.5, 5)];
    const tt = historyTimings(r, () => "standard");
    expect(tt.get(r[1].id!)!.timing).toBe("record");
    // 212.5 × 5 = 247.9 beats 245 (210 × 5) by more than 1 lb → also a record
    expect(tt.get(r[2].id!)!.timing).toBe("record");
  });
});

describe("sessionTimingCounts and timingSummary", () => {
  const rows = [
    row("a", "2026-09-14", "barbell-bench-press", 0, 185, 6),
    row("b", "2026-09-21", "barbell-bench-press", 0, 190, 6),
    row("a", "2026-09-14", "barbell-row", 0, 135, 8),
    row("b", "2026-09-21", "barbell-row", 0, 135, 9),
  ];
  const counts = sessionTimingCounts(rows, historyTimings(rows, () => "standard"));

  it("counts timings per session", () => {
    expect(counts.get("a")).toEqual({ record: 0, beat: 0, matched: 0, below: 0, first: 2 });
    expect(counts.get("b")).toEqual({ record: 2, beat: 0, matched: 0, below: 0, first: 0 });
  });

  it("says it in words", () => {
    expect(timingSummary(counts.get("a"))).toBe("First benchmarks");
    expect(timingSummary(counts.get("b"))).toBe("2 records");
    expect(timingSummary({ record: 3, beat: 8, matched: 2, below: 1, first: 0 })).toBe("3 records · 8 beat last");
    expect(timingSummary({ record: 0, beat: 0, matched: 4, below: 2, first: 0 })).toBe("4 matched");
    expect(timingSummary(undefined)).toBeNull();
  });
});
