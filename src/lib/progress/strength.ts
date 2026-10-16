// Strength & PR summaries computed only from completed, logged working sets.
// e1RM (Epley) is only meaningful for 1–12 reps with load; high-rep and bodyweight sets
// still count for best reps and volume. Nothing is ever inferred for days without sets.

import { addDays, type ISODate } from "@/lib/dates";
import { e1rm as epley } from "@/lib/training/progression";
import { round } from "@/lib/units";

export interface StrengthSet {
  id: string;
  exercise_slug: string;
  exercise_name: string;
  local_date: ISODate;
  session_id: string;
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
  duration_sec?: number | null;
  completed_at?: string | null;
}

export interface TrackedLift {
  key: string;
  name: string;
  slugs: string[];
  /** Load is per dumbbell. */
  perHand?: boolean;
  /** Load is added to bodyweight (pull-ups). */
  bodyweight?: boolean;
}

/** The major lifts from SPEC §15, always listed even before they're logged. */
export const TRACKED_LIFTS: TrackedLift[] = [
  { key: "bench", name: "Bench Press", slugs: ["barbell-bench-press"] },
  { key: "incline-db", name: "Incline Dumbbell Press", slugs: ["incline-db-press"], perHand: true },
  { key: "squat", name: "Back Squat", slugs: ["back-squat"] },
  { key: "rdl", name: "Romanian Deadlift", slugs: ["romanian-deadlift"] },
  { key: "pull-ups", name: "Pull-Ups", slugs: ["weighted-pull-up", "pull-up"], bodyweight: true },
  { key: "ohp", name: "Overhead Press", slugs: ["overhead-press"] },
  { key: "row", name: "Barbell Row", slugs: ["barbell-row"] },
  { key: "preacher", name: "Preacher Curl", slugs: ["preacher-curl"] },
  { key: "leg-press", name: "Leg Press", slugs: ["leg-press"] },
];

export const TRACKED_SLUGS = new Set(TRACKED_LIFTS.flatMap((l) => l.slugs));

const load = (s: StrengthSet) => (s.weight_lb != null && Number(s.weight_lb) > 0 ? Number(s.weight_lb) : 0);
const repsOf = (s: StrengthSet) => (s.reps != null && Number(s.reps) > 0 ? Number(s.reps) : 0);

/** e1RM for a set, or null when the estimate isn't meaningful (no load, 0 or >12 reps). */
export const setE1rm = (s: StrengthSet) => epley(load(s) || null, repsOf(s) || null);

/** Chronological order: date, then completion time, then set number. */
export function chronological<T extends StrengthSet>(sets: T[]): T[] {
  return [...sets].sort(
    (a, b) =>
      a.local_date.localeCompare(b.local_date) ||
      (a.completed_at ?? "").localeCompare(b.completed_at ?? "") ||
      a.session_id.localeCompare(b.session_id) ||
      a.set_index - b.set_index,
  );
}

export interface SessionSummary {
  date: ISODate;
  sessionId: string;
  sets: StrengthSet[];
  bestE1rm: number | null;
  topWeight: number | null;
  maxReps: number | null;
  /** Σ load × reps. */
  volume: number;
  totalReps: number;
  /** Beat every earlier e1RM (requires earlier history). */
  pr: boolean;
  /** e1RM gain over the previous best when pr. */
  prGain: number | null;
  prSet: StrengthSet | null;
}

export interface Best {
  weight: number;
  reps: number;
  date: ISODate;
  set: StrengthSet;
}

export interface LiftSummary {
  sessions: SessionSummary[]; // oldest first
  bestE1rm: number | null;
  bestE1rmSet: StrengthSet | null;
  /** Heaviest load lifted (any reps). */
  heaviest: Best | null;
  /** Most reps in one set (any load, including bodyweight and >12 reps). */
  bestReps: Best | null;
  totalVolume: number;
  totalSets: number;
  lastDate: ISODate | null;
  firstDate: ISODate | null;
  prCount: number;
  /** True when the lift has no loaded sets at all (pure bodyweight). */
  bodyweightOnly: boolean;
  /** e1RM change: best of the last 28 days vs the first session with an e1RM. */
  trend: { from: number; to: number; change: number; since: ISODate } | null;
}

export function summarizeLift(input: StrengthSet[]): LiftSummary {
  const sets = chronological(input);
  const byKey = new Map<string, StrengthSet[]>();
  for (const s of sets) {
    const k = `${s.local_date}|${s.session_id}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(s);
  }

  let runningBest: number | null = null;
  const sessions: SessionSummary[] = [];
  for (const [k, list] of byKey) {
    const [date, sessionId] = k.split("|");
    const before = runningBest;
    let bestE: number | null = null;
    let prSet: StrengthSet | null = null;
    let top: number | null = null;
    let maxReps: number | null = null;
    let volume = 0;
    let totalReps = 0;
    for (const s of list) {
      const e = setE1rm(s);
      if (e != null && (bestE == null || e > bestE)) bestE = e;
      if (e != null && before != null && e > before && (!prSet || e > (setE1rm(prSet) ?? 0))) prSet = s;
      if (load(s) > 0 && (top == null || load(s) > top)) top = load(s);
      if (repsOf(s) > 0 && (maxReps == null || repsOf(s) > maxReps)) maxReps = repsOf(s);
      volume += load(s) * repsOf(s);
      totalReps += repsOf(s);
    }
    if (bestE != null && (runningBest == null || bestE > runningBest)) runningBest = bestE;
    const pr = !!prSet;
    sessions.push({
      date,
      sessionId,
      sets: list,
      bestE1rm: bestE,
      topWeight: top,
      maxReps,
      volume: round(volume, 1),
      totalReps,
      pr,
      prGain: pr && before != null && bestE != null ? round(bestE - before, 1) : null,
      prSet,
    });
  }

  let bestE1rm: number | null = null;
  let bestE1rmSet: StrengthSet | null = null;
  let heaviest: Best | null = null;
  let bestReps: Best | null = null;
  let totalVolume = 0;
  for (const s of sets) {
    const e = setE1rm(s);
    if (e != null && (bestE1rm == null || e > bestE1rm)) {
      bestE1rm = e;
      bestE1rmSet = s;
    }
    const w = load(s);
    const r = repsOf(s);
    if (w > 0 && (!heaviest || w > heaviest.weight || (w === heaviest.weight && r > heaviest.reps))) heaviest = { weight: w, reps: r, date: s.local_date, set: s };
    if (r > 0 && (!bestReps || r > bestReps.reps || (r === bestReps.reps && w > bestReps.weight))) bestReps = { weight: w, reps: r, date: s.local_date, set: s };
    totalVolume += w * r;
  }

  const withE = sessions.filter((x) => x.bestE1rm != null);
  let trend: LiftSummary["trend"] = null;
  if (withE.length >= 2) {
    const last = withE.at(-1)!;
    const windowStart = addDays(last.date, -27);
    const recent = Math.max(...withE.filter((x) => x.date >= windowStart && x !== withE[0]).map((x) => x.bestE1rm!), last.bestE1rm!);
    const first = withE[0];
    trend = { from: first.bestE1rm!, to: recent, change: round(recent - first.bestE1rm!, 1), since: first.date };
  }

  return {
    sessions,
    bestE1rm,
    bestE1rmSet,
    heaviest,
    bestReps,
    totalVolume: round(totalVolume, 1),
    totalSets: sets.length,
    lastDate: sessions.at(-1)?.date ?? null,
    firstDate: sessions[0]?.date ?? null,
    prCount: sessions.filter((x) => x.pr).length,
    bodyweightOnly: sets.length > 0 && sets.every((s) => load(s) === 0),
    trend,
  };
}

/** One value per session for sparklines/charts: e1RM, else top load, else max reps. */
export function sessionMetric(s: SessionSummary, mode: "e1rm" | "load" | "reps"): number | null {
  if (mode === "e1rm") return s.bestE1rm;
  if (mode === "load") return s.topWeight;
  return s.maxReps;
}

/**
 * Which metric best describes a lift's history. For bodyweight lifts (pull-ups) the logged
 * load is only the added weight, so an e1RM of it would mislead — use added load or reps.
 */
export function metricMode(summary: LiftSummary, opts: { bodyweight?: boolean } = {}): "e1rm" | "load" | "reps" {
  if (!opts.bodyweight && summary.sessions.some((s) => s.bestE1rm != null)) return "e1rm";
  if (summary.sessions.some((s) => s.topWeight != null)) return "load";
  return "reps";
}

/** Exercises logged outside the tracked list, grouped by slug, most recent first. */
export function otherExercises(sets: StrengthSet[]): { slug: string; name: string; sets: StrengthSet[]; lastDate: ISODate }[] {
  const by = new Map<string, StrengthSet[]>();
  for (const s of sets) {
    if (TRACKED_SLUGS.has(s.exercise_slug)) continue;
    if (!by.has(s.exercise_slug)) by.set(s.exercise_slug, []);
    by.get(s.exercise_slug)!.push(s);
  }
  return [...by.entries()]
    .map(([slug, list]) => {
      const lastDate = list.reduce((a, s) => (s.local_date > a ? s.local_date : a), list[0].local_date);
      const latest = list.filter((s) => s.local_date === lastDate)[0];
      return { slug, name: latest.exercise_name, sets: list, lastDate };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

/** "185 × 6", "BW × 12", "BW+25 × 8" (pull-ups). `fmt` formats a load in the user's unit. */
export function formatSet(s: { weight_lb: number | null; reps: number | null }, fmt: (lb: number) => string, bodyweight = false) {
  const w = s.weight_lb != null && Number(s.weight_lb) > 0 ? Number(s.weight_lb) : 0;
  const r = s.reps ?? 0;
  if (w === 0) return `BW × ${r}`;
  return `${bodyweight ? "BW+" : ""}${fmt(w)} × ${r}`;
}
