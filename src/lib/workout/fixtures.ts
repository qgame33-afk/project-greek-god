// Test fixtures (used only by *.test.ts).
import type { WSet } from "./types";
import type { Suggestion } from "@/lib/training/progression";

let n = 0;
export function mkSet(p: Partial<WSet> = {}): WSet {
  n++;
  return {
    id: p.id ?? `set-${n}`,
    user_id: "u1",
    session_id: "s1",
    local_date: "2026-10-16",
    exercise_slug: "barbell-bench-press",
    exercise_name: "Barbell Bench Press",
    exercise_order: 0,
    set_index: 0,
    kind: "working",
    weight_lb: null,
    reps: null,
    duration_sec: null,
    rir: null,
    completed: false,
    completed_at: null,
    notes: null,
    target_rep_low: 5,
    target_rep_high: 8,
    target_unit: "reps",
    target_rir: "1–2",
    rest_sec: 180,
    suggested_weight_lb: null,
    created_at: `2026-10-16T18:00:${String(n % 60).padStart(2, "0")}Z`,
    updated_at: "2026-10-16T18:00:00Z",
    ...p,
  };
}

export function mkSuggestion(kind: Suggestion["kind"], weightLb: number | null): Suggestion {
  return { kind, weightLb, target: { low: 5, high: 8, unit: "reps" }, reason: "", last: null };
}
