// Set timing (DESIGN-V2 §4.3): how a logged working set compares with last time — record,
// beat, matched, below, first benchmark, or nothing to compare. Gym Mode's set tower, the
// Inscription and Train's exercise detail all read it from here. Never red: the UI pairs
// each result with a glyph and a word. Pure.

import { e1rm as e1rmOf, groupSessions, type Mode, type PastSet } from "@/lib/training/progression";
import { round } from "@/lib/units";
import { beatsRecord, PR_MIN_GAIN_LB, setE1rm, type PriorBest } from "./pr";
import type { WSet } from "./types";

export type SetTiming = "record" | "beat" | "matched" | "below" | "first" | null;

export interface TimingResult {
  timing: SetTiming;
  e1rm: number | null;
  delta: { e1rm?: number; reps?: number; weightLb?: number; durationSec?: number } | null;
}

type Prior = { weight_lb: number | null; reps: number | null; duration_sec: number | null };

/** The e1RM band inside which two sets read as "matched" (the record rule's own margin). */
export const MATCH_BAND_LB = PR_MIN_GAIN_LB;

const n = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const cmp = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);
const clean = (v: number) => (v === 0 ? 0 : round(v, 1));

/**
 * set: the logged set. priorSameIndex: the same set_index of the most recent previous
 * session of this exercise in the same mode family (null if none). priorBest: best e1RM
 * BEFORE this set (prior history plus sets logged earlier this session; the caller folds
 * those in, as prSetIds does — timingsForGroup() does it for you).
 */
export function setTiming(
  set: Pick<WSet, "kind" | "completed" | "weight_lb" | "reps" | "duration_sec">,
  priorSameIndex: Prior | null,
  priorBest: PriorBest | undefined,
): TimingResult {
  if (set.kind !== "working" || !set.completed) return { timing: null, e1rm: null, delta: null };
  const v = setE1rm(set);
  if (priorBest?.sets === 0) return { timing: "first", e1rm: v, delta: null };
  if (v != null && priorBest?.e1rm != null && beatsRecord(v, priorBest.e1rm)) return { timing: "record", e1rm: v, delta: { e1rm: clean(v - priorBest.e1rm) } };
  if (!priorSameIndex) return { timing: null, e1rm: v, delta: null };

  const w = n(set.weight_lb);
  const r = n(set.reps);
  const d = n(set.duration_sec);
  const pw = n(priorSameIndex.weight_lb);
  const pr = n(priorSameIndex.reps);
  const pd = n(priorSameIndex.duration_sec);
  const pv = e1rmOf(pw, pr);

  if (v != null && pv != null) {
    const diff = v - pv;
    const timing: SetTiming = diff >= MATCH_BAND_LB ? "beat" : diff <= -MATCH_BAND_LB ? "below" : "matched";
    return { timing, e1rm: v, delta: { e1rm: clean(diff) } };
  }

  // High reps, bodyweight or timed sets: weight, then reps, then duration.
  const order = cmp(w, pw) || cmp(r, pr) || cmp(d, pd);
  const delta: NonNullable<TimingResult["delta"]> = {};
  if (w != null || pw != null) delta.weightLb = clean((w ?? 0) - (pw ?? 0));
  if (r != null || pr != null) delta.reps = (r ?? 0) - (pr ?? 0);
  if (d != null || pd != null) delta.durationSec = (d ?? 0) - (pd ?? 0);
  return { timing: order > 0 ? "beat" : order < 0 ? "below" : "matched", e1rm: v, delta };
}

/** Deload sets only compare with deload sets; standard and intro are one family. */
export function modeFamily(mode: Mode | null | undefined): "deload" | "standard" {
  return mode === "deload" ? "deload" : "standard";
}

/**
 * The prior set to compare with: the same set_index in the most recent previous session
 * of this exercise whose mode is in the same family. Null when there is none (so a deload
 * week with no earlier deload gets no comparison).
 */
export function priorSameIndex(history: PastSet[], setIndex: number, mode: Mode | null | undefined): Prior | null {
  const fam = modeFamily(mode);
  const session = groupSessions(history).find((s) => modeFamily(s[0]?.mode) === fam);
  const hit = session?.find((s) => s.set_index === setIndex);
  return hit ? { weight_lb: hit.weight_lb, reps: hit.reps, duration_sec: hit.duration_sec } : null;
}

/**
 * Timing for each completed working set of one exercise in one session, in the order they
 * were logged, folding each set's e1RM into the running best exactly as prSetIds does (so a
 * "record" here is always a record there). Keyed by set id.
 */
export function timingsForGroup(
  working: WSet[],
  prior: PriorBest | undefined,
  history: PastSet[],
  mode: Mode | null | undefined,
): Map<string, TimingResult> {
  const out = new Map<string, TimingResult>();
  const done = working
    .filter((s) => s.kind === "working" && s.completed)
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? "") || a.set_index - b.set_index);
  let best = prior;
  for (const s of done) {
    out.set(s.id, setTiming(s, priorSameIndex(history, s.set_index, mode), best));
    const v = setE1rm(s);
    if (best && best.sets > 0 && best.e1rm != null && v != null && v > best.e1rm) best = { ...best, e1rm: v };
  }
  return out;
}

/**
 * The record carrot (§3.2.5): the fewest reps (≤ 12) at `weightLb` that would set a record,
 * with that e1RM. Null with no history (a first benchmark), no prior e1RM, no load, or when
 * no rep count up to 12 would do it.
 */
export function recordReps(weightLb: number | null | undefined, prior: PriorBest | undefined): { reps: number; e1rm: number; best: number } | null {
  if (!prior || prior.sets === 0 || prior.e1rm == null || !weightLb || weightLb <= 0) return null;
  for (let r = 1; r <= 12; r++) {
    const v = e1rmOf(weightLb, r);
    if (v != null && beatsRecord(v, prior.e1rm)) return { reps: r, e1rm: v, best: prior.e1rm };
  }
  return null;
}
