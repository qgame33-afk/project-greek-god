// Double-progression suggestions computed only from completed, logged sets.
// Suggestions are always labelled as suggestions in the UI and never count as data.

import type { LibraryExercise, TemplateExercise } from "./types";
import { shortDate, type ISODate } from "@/lib/dates";
import { round } from "@/lib/units";

export type Mode = "standard" | "intro" | "deload";

export interface PastSet {
  local_date: ISODate;
  session_id: string;
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
  duration_sec: number | null;
  rir: number | null;
}

export type SuggestionKind = "first" | "increase" | "add_reps" | "hold" | "reset" | "deload" | "explosive" | "bodyweight";

export interface Suggestion {
  kind: SuggestionKind;
  /** Load to put on the bar, in lb. Null = choose / bodyweight / no load. */
  weightLb: number | null;
  /** Target for each set: reps (or seconds) */
  target: { low: number; high: number; unit: "reps" | "sec" | "each" };
  /** One short sentence explaining why, from the logged numbers. */
  reason: string;
  /** "Oct 9 · 180×8, 180×8, 180×7" — the most recent completed session, or null. */
  last: string | null;
}

/** Group past sets into sessions, newest first. */
export function groupSessions(sets: PastSet[]): PastSet[][] {
  const by = new Map<string, PastSet[]>();
  for (const s of sets) {
    const k = `${s.local_date}|${s.session_id}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(s);
  }
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => v.sort((a, b) => a.set_index - b.set_index));
}

export function describeSession(sets: PastSet[], unit: "reps" | "sec" | "each" = "reps", fmtLoad: (lb: number) => string = (lb) => String(round(lb, 1))): string {
  if (!sets.length) return "";
  const parts = sets.map((s) => {
    const work = unit === "sec" ? `${s.duration_sec ?? s.reps ?? 0}s` : `${s.reps ?? 0}`;
    return s.weight_lb ? `${fmtLoad(Number(s.weight_lb))}×${work}` : work;
  });
  return `${shortDate(sets[0].local_date)} · ${parts.join(", ")}`;
}

function roundTo(lb: number, inc: number) {
  if (!(inc > 0)) return round(lb, 1);
  return round(Math.round(lb / inc) * inc, 1);
}

function work(s: PastSet, unit: string) {
  return unit === "sec" ? Number(s.duration_sec ?? s.reps ?? 0) : Number(s.reps ?? 0);
}

/**
 * Suggest the next session's load/reps for one exercise.
 * - all prescribed sets at the top of the range (and not ground out at 0 RIR) → small load increase
 * - every set inside the range but not all at the top → same load, add reps
 * - target reps missed → keep the load; missed twice in a row at the same load → ~10% reset
 */
export function suggest(t: TemplateExercise, lib: LibraryExercise | undefined, history: PastSet[], mode: Mode = "standard"): Suggestion {
  const unit = t.unit;
  const target = { low: t.repLow, high: t.repHigh, unit };
  const sessions = groupSessions(history);
  const lastSets = sessions[0] ?? [];
  const last = lastSets.length ? describeSession(lastSets, unit) : null;
  const inc = lib?.increment ?? 5;

  if (lib?.category === "explosive" || lib?.tracking === "reps") {
    return {
      kind: "explosive",
      weightLb: null,
      target,
      reason: "Full recovery between sets. Stop the set the moment height or speed drops.",
      last,
    };
  }

  if (!lastSets.length) {
    return {
      kind: "first",
      weightLb: null,
      target,
      reason:
        unit === "sec"
          ? `First time: pick a load you can carry for ${t.repHigh} s with good posture.`
          : lib?.tracking === "bodyweight_reps"
            ? `First time: bodyweight only, clean reps up to ${t.repHigh}. Stop a rep or two short of failure.`
            : `First time: choose a weight you can lift for ${t.repHigh} reps with ${t.rir === "Fresh" ? "full control" : `${t.rir} reps in reserve`}. This sets your baseline.`,
      last,
    };
  }

  const weights = lastSets.map((s) => Number(s.weight_lb ?? 0));
  const top = Math.max(...weights);
  const atTop = lastSets.filter((s) => Number(s.weight_lb ?? 0) === top);
  const bodyweight = lib?.tracking === "bodyweight_reps" && top === 0;

  if (mode === "deload") {
    return {
      kind: "deload",
      weightLb: top > 0 ? roundTo(top * 0.9, inc) : null,
      target: { ...target, high: Math.max(target.low, target.high - 2) },
      reason: "Deload: about 10% lighter, fewer sets, finish every set with 3+ reps in reserve.",
      last,
    };
  }

  const prescribed = t.sets;
  const allSetsDone = lastSets.length >= prescribed;
  const hitTopAll = allSetsDone && atTop.length >= prescribed && atTop.slice(0, prescribed).every((s) => work(s, unit) >= t.repHigh);
  const loggedRir = atTop.map((s) => s.rir).filter((r): r is number => r != null);
  const grinding = loggedRir.length > 0 && loggedRir.filter((r) => r <= 0).length >= Math.ceil(loggedRir.length / 2);
  const inRangeAll = allSetsDone && lastSets.slice(0, prescribed).every((s) => work(s, unit) >= t.repLow);

  const seen = atTop.map((s) => work(s, unit)).join(", ");

  if (bodyweight) {
    if (hitTopAll)
      return { kind: "increase", weightLb: 5, target, reason: `You hit ${seen} at bodyweight. Add about 5 lb with a belt or dumbbell.`, last };
    return { kind: "bodyweight", weightLb: null, target, reason: `Beat ${seen} — add a rep to any set you can.`, last };
  }

  if (hitTopAll && !grinding) {
    const next = roundTo(top + inc, inc);
    return {
      kind: "increase",
      weightLb: next,
      target,
      reason:
        unit === "sec"
          ? `You carried ${top} lb for the full ${t.repHigh} s on every set. Go up to ${next} lb.`
          : `You hit ${seen} at ${top} lb — the top of the range on every set. Add ${round(next - top, 1)} lb.`,
      last,
    };
  }
  if (hitTopAll && grinding) {
    return {
      kind: "hold",
      weightLb: top,
      target,
      reason: `Top of the range at ${top} lb, but at 0 reps in reserve. Repeat the weight and own every rep before adding load.`,
      last,
    };
  }
  if (inRangeAll) {
    return {
      kind: "add_reps",
      weightLb: top,
      target,
      reason: `Stay at ${top} lb and add a rep wherever you can (last time ${seen}). Load goes up once every set reaches ${t.repHigh}.`,
      last,
    };
  }

  // Target missed. Two misses in a row at the same top load → small reset.
  const prev = sessions[1];
  if (prev?.length) {
    const prevTop = Math.max(...prev.map((s) => Number(s.weight_lb ?? 0)));
    const prevMissed = prev.length < prescribed || prev.slice(0, prescribed).some((s) => work(s, unit) < t.repLow);
    if (prevTop === top && prevMissed && top > 0) {
      const reset = roundTo(top * 0.9, inc);
      return {
        kind: "reset",
        weightLb: reset,
        target,
        reason: `Missed the ${t.repLow}–${t.repHigh} range twice at ${top} lb. Drop to ${reset} lb and build back up — it's the fastest way past a stall.`,
        last,
      };
    }
  }
  return {
    kind: "hold",
    weightLb: top || null,
    target,
    reason: allSetsDone
      ? `Some sets fell short of ${t.repLow} reps at ${top} lb. Keep the load and aim for ${t.repLow}+ on every set.`
      : `Last time ${lastSets.length} of ${prescribed} sets were completed. Keep ${top} lb and complete all ${prescribed}.`,
    last,
  };
}

/** Sets per exercise for the session mode. Jumps never drop below 2 quality sets. */
export function plannedSetCount(t: TemplateExercise, lib: LibraryExercise | undefined, mode: Mode, lighterLegs = false): number {
  let n = t.sets;
  const explosive = lib?.category === "explosive";
  if (mode === "intro") n = explosive ? Math.min(n, 2) : Math.max(2, n - 1);
  if (mode === "deload") n = explosive ? 2 : Math.max(1, Math.ceil(n / 2));
  if (lighterLegs && !explosive && lib && lib.primary.some((m) => ["quads", "hamstrings", "glutes", "calves"].includes(m))) n = Math.max(2, n - 1);
  return n;
}

/** Target RIR text for the mode. */
export function modeRir(t: TemplateExercise, mode: Mode) {
  if (mode === "deload" && t.rir !== "Fresh") return "3–4";
  return t.rir;
}

/** Epley e1RM for 1–12 rep sets (null otherwise — high-rep estimates are unreliable). */
export function e1rm(weightLb: number | null | undefined, reps: number | null | undefined) {
  if (!weightLb || !reps || reps < 1 || reps > 12) return null;
  return round(weightLb * (1 + reps / 30), 1);
}
