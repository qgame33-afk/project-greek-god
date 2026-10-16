// Personal-record detection. A record needs real prior history: a logged working set
// whose e1RM beats every earlier completed working set of that exercise. The first-ever
// log of an exercise is a FIRST BENCHMARK, never a record.

import { e1rm } from "@/lib/training/progression";
import { round } from "@/lib/units";
import type { ExerciseGroup } from "./session";
import type { WSet } from "./types";

export interface PriorBest {
  /** Best e1RM (lb) across every completed working set before this session; null if none qualifies. */
  e1rm: number | null;
  /** How many completed working sets exist before this session (0 = never done). */
  sets: number;
  /** The set that holds the record, for "beat 185 × 6". */
  weightLb: number | null;
  reps: number | null;
}

export type PRKind = "pr" | "first" | null;

/**
 * A record has to beat the old best e1RM by a real margin. 185×7 (e1RM 228.2) over 180×8
 * (228.0) is formula noise, not a record — and it would read "+0 over your best".
 */
export const PR_MIN_GAIN_LB = 1;

const beats = (v: number, best: number) => v >= best + PR_MIN_GAIN_LB;

export function setE1rm(s: Pick<WSet, "kind" | "completed" | "weight_lb" | "reps">): number | null {
  if (s.kind !== "working" || !s.completed) return null;
  return e1rm(s.weight_lb == null ? null : Number(s.weight_lb), s.reps);
}

const byCompleted = (a: WSet, b: WSet) =>
  (a.completed_at ?? "").localeCompare(b.completed_at ?? "") || a.set_index - b.set_index;

/**
 * Working sets of a group that beat every earlier completed set (prior history plus the
 * sets logged earlier in this session). Empty when there is no prior e1RM to beat.
 */
export function prSetIds(g: ExerciseGroup, prior: PriorBest | undefined): Set<string> {
  const out = new Set<string>();
  if (!prior || prior.sets === 0 || prior.e1rm == null) return out;
  let best = prior.e1rm;
  for (const s of g.working.filter((x) => x.completed).sort(byCompleted)) {
    const v = setE1rm(s);
    if (v != null && beats(v, best)) out.add(s.id);
    if (v != null && v > best) best = v;
  }
  return out;
}

/**
 * Classify a set the moment it is logged. `before` = the group's sets as they were just
 * before the tap (the logged set itself may appear unlogged in it).
 */
export function classifyLog(
  logged: Pick<WSet, "id" | "kind" | "weight_lb" | "reps">,
  before: ExerciseGroup,
  prior: PriorBest | undefined,
): { kind: PRKind; e1rm: number | null; gain: number | null } {
  if (logged.kind !== "working" || !prior) return { kind: null, e1rm: null, gain: null };
  const v = e1rm(logged.weight_lb == null ? null : Number(logged.weight_lb), logged.reps);
  if (prior.sets === 0) return { kind: "first", e1rm: v, gain: null };
  if (v == null || prior.e1rm == null) return { kind: null, e1rm: v, gain: null };
  let best = prior.e1rm;
  for (const s of before.working) {
    if (s.id === logged.id || !s.completed) continue;
    const x = setE1rm(s);
    if (x != null && x > best) best = x;
  }
  if (beats(v, best)) return { kind: "pr", e1rm: v, gain: round(v - prior.e1rm, 1) };
  return { kind: null, e1rm: v, gain: null };
}

export interface Plaque {
  slug: string;
  name: string;
  weightLb: number;
  reps: number;
  e1rm: number;
  /** Gain over the best e1RM before this session, lb. */
  gain: number;
}

/** One plaque per exercise that set a record: its best set this session vs prior best. */
export function sessionRecords(groups: ExerciseGroup[], priors: Record<string, PriorBest>): Plaque[] {
  const out: Plaque[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const prior = priors[g.slug];
    if (!prior || prior.sets === 0 || prior.e1rm == null || seen.has(g.slug)) continue;
    let best: WSet | null = null;
    let bestV = -Infinity;
    for (const s of g.working) {
      const v = setE1rm(s);
      if (v != null && v > bestV) {
        best = s;
        bestV = v;
      }
    }
    if (best && beats(bestV, prior.e1rm)) {
      seen.add(g.slug);
      out.push({ slug: g.slug, name: g.name, weightLb: Number(best.weight_lb), reps: best.reps ?? 0, e1rm: bestV, gain: round(bestV - prior.e1rm, 1) });
    }
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** Exercises logged for the first time ever in this session. */
export function firstBenchmarks(groups: ExerciseGroup[], priors: Record<string, PriorBest>): { slug: string; name: string }[] {
  const out: { slug: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const p = priors[g.slug];
    if (!p || p.sets > 0 || g.done === 0 || seen.has(g.slug)) continue;
    seen.add(g.slug);
    out.push({ slug: g.slug, name: g.name });
  }
  return out;
}
