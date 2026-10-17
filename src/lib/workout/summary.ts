// Session totals and the Session Summary's comparisons, computed only from logged sets.

import { groupSessions, type PastSet } from "@/lib/training/progression";
import type { ExerciseGroup } from "./session";
import type { WSet } from "./types";

export interface Totals {
  /** Σ weight × reps over completed working sets (warm-ups and timed sets excluded). */
  volumeLb: number;
  /** Completed working sets. */
  setsCompleted: number;
  /** Exercises with at least one completed working set. */
  exercises: number;
  /** Completed warm-up sets (shown, never counted). */
  warmups: number;
}

export function sessionTotals(sets: Pick<WSet, "kind" | "completed" | "weight_lb" | "reps" | "exercise_slug" | "exercise_order">[]): Totals {
  let volume = 0;
  let count = 0;
  let warmups = 0;
  const ex = new Set<string>();
  for (const s of sets) {
    if (!s.completed) continue;
    if (s.kind === "warmup") {
      warmups++;
      continue;
    }
    count++;
    ex.add(`${s.exercise_order}:${s.exercise_slug}`);
    const w = Number(s.weight_lb ?? 0);
    const r = Number(s.reps ?? 0);
    if (w > 0 && r > 0) volume += w * r;
  }
  return { volumeLb: Math.round(volume * 10) / 10, setsCompleted: count, exercises: ex.size, warmups };
}

const IDLE_MS = 2 * 60 * 60 * 1000;
const COOL_DOWN_MS = 60 * 1000;

/**
 * When the session really ended. Finishing right after training uses now; a session left
 * open for hours (finished the next morning) ends shortly after its last logged set, so the
 * duration stays honest.
 */
export function effectiveEnd(startedAt: string, nowMs: number, lastCompletedAt: string | null): number {
  const start = Date.parse(startedAt);
  if (!lastCompletedAt) return Math.max(start, Math.min(nowMs, start + IDLE_MS));
  const last = Date.parse(lastCompletedAt);
  if (nowMs - last > IDLE_MS) return Math.max(start, last + COOL_DOWN_MS);
  return Math.max(start, nowMs);
}

/**
 * A live session from an earlier day that has gone quiet (nothing logged for the idle
 * window): it asks to be finished or discarded. A workout that simply runs past midnight
 * is not stale while sets are still being logged.
 */
export function isStaleSession(localDate: string, today: string, startedAt: string, lastCompleted: string | null, nowMs: number): boolean {
  if (localDate >= today) return false;
  const last = Math.max(Date.parse(startedAt), lastCompleted ? Date.parse(lastCompleted) : 0);
  return nowMs - last > IDLE_MS;
}

export function durationSec(startedAt: string, endMs: number) {
  return Math.max(0, Math.round((endMs - Date.parse(startedAt)) / 1000));
}

export function lastCompletedAt(sets: Pick<WSet, "completed" | "completed_at">[]): string | null {
  let best: string | null = null;
  for (const s of sets) if (s.completed && s.completed_at && (!best || s.completed_at > best)) best = s.completed_at;
  return best;
}

/** Whole-percent change, or null when there is nothing honest to compare against. */
export function volumeDeltaPct(current: number, previous: number | null | undefined): number | null {
  if (!previous || previous <= 0 || !Number.isFinite(current)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "Volume +4% vs last Push A" — numbers first, never red. */
export function comparisonLine(pct: number | null, templateName: string): string | null {
  if (pct == null) return null;
  if (pct === 0) return `Volume level with last ${templateName}`;
  return `Volume ${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs last ${templateName}`;
}

export interface Improvement {
  slug: string;
  name: string;
  text: string;
}

/**
 * Notable improvements vs the previous session of each exercise: a heavier top set, or
 * more reps at the same top load. Only real logged numbers are compared.
 */
export function improvements(
  groups: ExerciseGroup[],
  history: Record<string, PastSet[]>,
  fmt: (lb: number) => string,
  unit: string,
  skip: ReadonlySet<string> = new Set(),
): Improvement[] {
  const out: Improvement[] = [];
  for (const g of groups) {
    if (skip.has(g.slug)) continue;
    const done = g.working.filter((s) => s.completed && Number(s.weight_lb ?? 0) > 0 && (s.reps ?? 0) > 0);
    const prev = groupSessions(history[g.slug] ?? [])[0];
    if (!done.length || !prev?.length) continue;
    const top = Math.max(...done.map((s) => Number(s.weight_lb)));
    const prevTop = Math.max(...prev.map((s) => Number(s.weight_lb ?? 0)));
    if (prevTop <= 0) continue;
    if (top > prevTop) {
      out.push({ slug: g.slug, name: g.name, text: `Top set ${fmt(top)} ${unit}, up ${fmt(top - prevTop)} ${unit}` });
      continue;
    }
    if (top === prevTop) {
      const reps = done.filter((s) => Number(s.weight_lb) === top).reduce((a, s) => a + (s.reps ?? 0), 0);
      const prevReps = prev.filter((s) => Number(s.weight_lb ?? 0) === prevTop).reduce((a, s) => a + (s.reps ?? 0), 0);
      if (reps > prevReps) out.push({ slug: g.slug, name: g.name, text: `+${reps - prevReps} reps at ${fmt(top)} ${unit}` });
    }
  }
  return out;
}
