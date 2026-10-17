import { describe, expect, it } from "vitest";
import type { PastSet } from "@/lib/training/progression";
import { mkSet } from "./fixtures";
import { groupSets } from "./session";
import { comparisonLine, durationSec, effectiveEnd, improvements, isStaleSession, lastCompletedAt, sessionTotals, volumeDeltaPct } from "./summary";

describe("session totals", () => {
  it("counts working volume only", () => {
    const t = sessionTotals([
      mkSet({ completed: true, weight_lb: 185, reps: 8 }),
      mkSet({ completed: true, weight_lb: 185, reps: 7, set_index: 1 }),
      mkSet({ completed: true, kind: "warmup", weight_lb: 95, reps: 5 }),
      mkSet({ completed: false, weight_lb: 185, reps: 6, set_index: 2 }),
      mkSet({ completed: true, exercise_order: 1, exercise_slug: "farmer-carry", weight_lb: 70, reps: null, duration_sec: 40 }),
      mkSet({ completed: true, exercise_order: 2, exercise_slug: "pull-up", weight_lb: null, reps: 10 }),
    ]);
    expect(t).toEqual({ volumeLb: 185 * 15, setsCompleted: 4, exercises: 3, warmups: 1 });
  });

  it("is zero for an empty session", () => {
    expect(sessionTotals([])).toEqual({ volumeLb: 0, setsCompleted: 0, exercises: 0, warmups: 0 });
  });
});

describe("duration", () => {
  const start = "2026-10-16T18:00:00Z";
  it("uses now when finished right after training", () => {
    const now = Date.parse("2026-10-16T19:08:00Z");
    const end = effectiveEnd(start, now, "2026-10-16T19:05:00Z");
    expect(durationSec(start, end)).toBe(68 * 60);
  });
  it("ends near the last set when the session was left open", () => {
    const now = Date.parse("2026-10-17T07:00:00Z");
    const end = effectiveEnd(start, now, "2026-10-16T19:05:00Z");
    expect(durationSec(start, end)).toBe(65 * 60 + 60);
  });
  it("caps an empty session", () => {
    const end = effectiveEnd(start, Date.parse("2026-10-18T07:00:00Z"), null);
    expect(durationSec(start, end)).toBe(2 * 3600);
  });
  it("finds the last logged set", () => {
    expect(
      lastCompletedAt([
        mkSet({ completed: true, completed_at: "2026-10-16T18:30:00Z" }),
        mkSet({ completed: true, completed_at: "2026-10-16T18:50:00Z" }),
        mkSet({ completed: false, completed_at: null }),
      ]),
    ).toBe("2026-10-16T18:50:00Z");
  });
});

describe("stale sessions", () => {
  // Started 23:45 Toronto (03:45Z) on Oct 16; it is now Oct 17 locally.
  const started = "2026-10-17T03:45:00Z";
  it("a workout that runs past midnight is not stale while sets are being logged", () => {
    expect(isStaleSession("2026-10-16", "2026-10-17", started, "2026-10-17T04:01:00Z", Date.parse("2026-10-17T04:03:00Z"))).toBe(false);
    expect(isStaleSession("2026-10-16", "2026-10-17", started, null, Date.parse("2026-10-17T04:03:00Z"))).toBe(false);
  });

  it("goes stale once nothing has been logged for the idle window", () => {
    expect(isStaleSession("2026-10-16", "2026-10-17", started, "2026-10-17T04:01:00Z", Date.parse("2026-10-17T06:02:00Z"))).toBe(true);
    expect(isStaleSession("2026-10-15", "2026-10-17", "2026-10-15T22:00:00Z", null, Date.parse("2026-10-17T12:00:00Z"))).toBe(true);
  });

  it("today's session is never stale", () => {
    expect(isStaleSession("2026-10-17", "2026-10-17", started, null, Date.parse("2026-10-18T03:00:00Z"))).toBe(false);
  });
});

describe("comparison", () => {
  it("compares volume with the last session of the template", () => {
    expect(volumeDeltaPct(14820, 14250)).toBe(4);
    expect(comparisonLine(4, "Push A")).toBe("Volume +4% vs last Push A");
    expect(comparisonLine(-3, "Push A")).toBe("Volume −3% vs last Push A");
    expect(comparisonLine(0, "Push A")).toBe("Volume level with last Push A");
    expect(volumeDeltaPct(1000, 0)).toBeNull();
    expect(volumeDeltaPct(1000, null)).toBeNull();
    expect(comparisonLine(null, "Push A")).toBeNull();
  });

  it("lists real improvements vs the previous session", () => {
    const hist: Record<string, PastSet[]> = {
      "barbell-bench-press": [
        { local_date: "2026-10-09", session_id: "o", set_index: 0, weight_lb: 180, reps: 8, duration_sec: null, rir: 1 },
        { local_date: "2026-10-09", session_id: "o", set_index: 1, weight_lb: 180, reps: 8, duration_sec: null, rir: 1 },
      ],
      "incline-db-press": [{ local_date: "2026-10-09", session_id: "o", set_index: 0, weight_lb: 60, reps: 8, duration_sec: null, rir: 1 }],
      "cable-lateral-raise": [{ local_date: "2026-10-09", session_id: "o", set_index: 0, weight_lb: 20, reps: 15, duration_sec: null, rir: 1 }],
    };
    const groups = groupSets([
      mkSet({ completed: true, weight_lb: 185, reps: 6 }),
      mkSet({ exercise_order: 1, exercise_slug: "incline-db-press", exercise_name: "Incline Dumbbell Press", completed: true, weight_lb: 60, reps: 10 }),
      mkSet({ exercise_order: 2, exercise_slug: "cable-lateral-raise", exercise_name: "Cable Lateral Raises", completed: true, weight_lb: 20, reps: 12 }),
    ]);
    const out = improvements(groups, hist, (n) => String(n), "lb");
    expect(out).toEqual([
      { slug: "barbell-bench-press", name: "Barbell Bench Press", text: "Top set 185 lb, up 5 lb" },
      { slug: "incline-db-press", name: "Incline Dumbbell Press", text: "+2 reps at 60 lb" },
    ]);
  });
});
