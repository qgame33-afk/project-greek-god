// Double-progression suggestions computed only from completed, logged sets.
// Suggestions are always labelled as suggestions in the UI and never count as data.

import type { LibraryExercise, TemplateExercise } from "./types";
import { shortDate, type ISODate } from "@/lib/dates";
import { round, type WeightUnit } from "@/lib/units";
import { loadStep, loadText, scaleLoad, stepUp } from "./loads";

/** "1–3" → [1, 3], "0–2" → [0, 2], "3" → [3, 3], "Fresh" → null (same as programs.ts rirRange, kept here to avoid an import cycle). */
function rirBounds(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:[–—-]\s*(\d+(?:\.\d+)?))?\s*$/.exec(text);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] == null ? lo : Number(m[2]);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

export type Mode = "standard" | "intro" | "deload";

export interface PastSet {
  local_date: ISODate;
  session_id: string;
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
  duration_sec: number | null;
  rir: number | null;
  /** The mode of the session the set belongs to (what it prescribed); unknown = standard. */
  mode?: Mode;
  /** The template the session was started from (withSessionModes fills it); unknown = null. */
  template_key?: string | null;
  /** When the set was logged (rest-aware comparisons). */
  completed_at?: string | null;
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


function work(s: PastSet, unit: string) {
  return unit === "sec" ? Number(s.duration_sec ?? s.reps ?? 0) : Number(s.reps ?? 0);
}

const topLoad = (sets: PastSet[]) => Math.max(0, ...sets.map((s) => Number(s.weight_lb ?? 0)));

/** "1 of 2 sets was", "2 of 3 sets were". */
const ofSets = (n: number, of: number) => `${n} of ${of} ${of === 1 ? "set" : "sets"} ${n === 1 ? "was" : "were"}`;
/** "the set", "both", "all 3". */
const allOf = (n: number) => (n <= 1 ? "the set" : n === 2 ? "both" : `all ${n}`);

/**
 * Suggest the next session's load/reps for one exercise (double progression, docs/PROGRAM-V3.md §1.3).
 * Each past session is judged against the sets IT prescribed (intro volume plans one set
 * fewer, a deload about half), and deload sessions are planned lighter work, never a
 * performance: progression reads the most recent non-deload sessions. A session from a
 * different template (last time was PPL Push B, now Arms & Shoulders) is judged on the sets it
 * logged, capped at today's plan — never as "missed sets".
 * - all prescribed sets at the top of the range at the target effort → one load step, never more
 * - at the top but below the target effort (RIR under the low end, e.g. 0 on a 1–3 heavy lift) → hold
 * - every set inside the range but not all at the top → same load, add reps
 * - target reps missed → keep the load; reps missed twice in a row at the same load → ~10% reset
 *   (sets left unlogged are a hold, never a reset: they are not a miss of the rep range)
 */
export function suggest(t: TemplateExercise, lib: LibraryExercise | undefined, history: PastSet[], mode: Mode = "standard", ctx: { templateKey?: string | null; /** Display unit for the reason text and load steps (default kg). */ unit?: WeightUnit } = {}): Suggestion {
  const unitW: WeightUnit = ctx.unit ?? "kg";
  const L = (lb: number) => loadText(lb, unitW);
  const unit = t.unit;
  const target = { low: t.repLow, high: t.repHigh, unit };
  const sessions = groupSessions(history);
  const lastSets = sessions[0] ?? [];
  const last = lastSets.length ? describeSession(lastSets, unit) : null;
  const prescribedIn = (s: PastSet[]) => plannedSetCount(t, lib, s[0]?.mode ?? "standard");
  const real = sessions.filter((s) => s[0]?.mode !== "deload");

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
            : `First time: choose a weight you can lift for ${t.repHigh} reps ${t.rir === "Fresh" ? "with full control" : t.rir === "0" ? "to the last clean rep" : `with ${t.rir} reps in reserve`}. This sets your baseline.`,
      last,
    };
  }

  if (mode === "deload") {
    // ~10% under the last real working load (a deload after a deload doesn't compound).
    const top = topLoad(real[0] ?? lastSets);
    return {
      kind: "deload",
      weightLb: top > 0 ? scaleLoad(top, 0.9, lib, unitW) : null,
      target: { ...target, high: Math.max(target.low, target.high - 2) },
      reason: `Light week: about 10% lighter${plannedSetCount(t, lib, "deload") < t.sets ? ", fewer sets" : ""}, stopping 3–4 reps short on every set.`,
      last,
    };
  }

  const ref = real[0];
  if (!ref) {
    // Only deloads logged so far: they set a starting point, not a verdict.
    const top = topLoad(lastSets);
    return {
      kind: top > 0 ? "hold" : "bodyweight",
      weightLb: top > 0 ? top : null,
      target,
      reason: top > 0 ? `Last time was a light week at ${L(top)}. Start there and add load once every set reaches ${t.repHigh}.` : "Last time was a light week. Add a rep to any set you can.",
      last,
    };
  }

  const top = topLoad(ref);
  const atTop = ref.filter((s) => Number(s.weight_lb ?? 0) === top);
  const bodyweight = lib?.tracking === "bodyweight_reps" && top === 0;

  // What that session prescribed, and what this one does.
  const refKey = ref[0]?.template_key ?? null;
  const sameTemplate = !refKey || !ctx.templateKey || refKey === ctx.templateKey;
  const prescribed = sameTemplate ? prescribedIn(ref) : Math.min(ref.length, plannedSetCount(t, lib, "standard"));
  const planned = plannedSetCount(t, lib, mode);
  const allSetsDone = ref.length >= prescribed;
  const judged = atTop.slice(0, prescribed);
  const hitTopAll = allSetsDone && atTop.length >= prescribed && judged.every((s) => work(s, unit) >= t.repHigh);
  // effort: RIR logged on the judged sets against the template's target range
  const bounds = rirBounds(t.rir);
  const loggedRir = judged.map((s) => s.rir).filter((r): r is number => r != null);
  const belowTarget = !!bounds && loggedRir.length > 0 && loggedRir.filter((r) => r < bounds[0]).length >= Math.ceil(loggedRir.length / 2);
  const toSpare = !!bounds && loggedRir.length === judged.length && loggedRir.length > 0 && loggedRir.every((r) => r > bounds[1]);
  const inRangeAll = allSetsDone && ref.slice(0, prescribed).every((s) => work(s, unit) >= t.repLow);
  const repsMissed = (s: PastSet[]) => s.slice(0, s === ref ? prescribed : prescribedIn(s)).some((x) => work(x, unit) < t.repLow);

  const seen = atTop.map((s) => work(s, unit)).join(", ");
  const hit = judged.map((s) => work(s, unit)).join(", ");

  if (bodyweight) {
    if (hitTopAll)
      return { kind: "increase", weightLb: stepUp(0, lib, unitW), target, reason: `You hit ${seen} at bodyweight. Add about ${loadStep(lib, unitW)} ${unitW} with a belt or dumbbell.`, last };
    return { kind: "bodyweight", weightLb: null, target, reason: `Beat ${seen} — add a rep to any set you can.`, last };
  }

  if (hitTopAll && !belowTarget) {
    // exactly one load step, whatever the reps in reserve
    const next = stepUp(top, lib, unitW);
    return {
      kind: "increase",
      weightLb: next,
      target,
      reason:
        unit === "sec"
          ? `You carried ${L(top)} for the full ${t.repHigh} s on every set. Go up to ${L(next)}.`
          : `You hit ${hit} at ${L(top)}, the top of the range ${toSpare ? "with reps to spare" : "at your target effort"}. Add ${loadStep(lib, unitW)} ${unitW}.`,
      last,
    };
  }
  if (hitTopAll && belowTarget) {
    const low = Math.min(...loggedRir);
    return {
      kind: "hold",
      weightLb: top,
      target,
      reason: `Top of the range at ${L(top)}, but at ${low} ${low === 1 ? "rep" : "reps"} in reserve${lib?.category === "compound" ? " on a heavy lift" : ""}. Repeat ${L(top)} and own every rep.`,
      last,
    };
  }
  if (inRangeAll) {
    return {
      kind: "add_reps",
      weightLb: top,
      target,
      reason: `Stay at ${L(top)} and add a rep wherever you can (last time ${seen}). Load goes up once every set reaches ${t.repHigh}.`,
      last,
    };
  }

  // Reps missed in two real sessions in a row at the same top load → small reset.
  const prev = real[1];
  if (prev?.length && top > 0 && repsMissed(ref) && repsMissed(prev) && topLoad(prev) === top) {
    const reset = scaleLoad(top, 0.9, lib, unitW);
    return {
      kind: "reset",
      weightLb: reset,
      target,
      reason: `Missed the ${t.repLow}–${t.repHigh} range twice at ${L(top)}. Drop to ${L(reset)} and build back up — it's the fastest way past a stall.`,
      last,
    };
  }
  return {
    kind: "hold",
    weightLb: top || null,
    target,
    reason: repsMissed(ref)
      ? `Some sets fell short of ${t.repLow} reps at ${L(top)}. Keep the load and aim for ${t.repLow}+ on every set.`
      : `Last time ${ofSets(ref.length, prescribed)} completed. Keep ${L(top)} and complete ${allOf(planned)}.`,
    last,
  };
}

/**
 * Sets per exercise for the session mode. A lift written with 3+ sets loses one in intro ("Fewer
 * sets") and about half in a deload. A two-set lift — every lift of the two-set split — keeps its
 * two sets in every mode (Quinton: exactly two working sets); intro and deload make those sets
 * easier instead (modeRir: 2–3 and 3–4 in reserve) and a deload is about 10% lighter.
 */
export function plannedSetCount(t: TemplateExercise, lib: LibraryExercise | undefined, mode: Mode, lighterLegs = false): number {
  let n = t.sets;
  const explosive = lib?.category === "explosive";
  if (mode === "intro") n = explosive ? Math.min(n, 2) : n > 2 ? n - 1 : n;
  if (mode === "deload") n = explosive ? 2 : n > 2 ? Math.ceil(n / 2) : n;
  if (lighterLegs && !explosive && lib && lib.primary.some((m) => ["quads", "hamstrings", "glutes", "calves"].includes(m))) n = Math.max(2, n - 1);
  return n;
}

/** Target RIR text for the mode: a deload stops 3–4 short; intro on a two-set lift (which can't lose a set) stops 2–3 short. */
export function modeRir(t: TemplateExercise, mode: Mode) {
  if (t.rir === "Fresh") return t.rir;
  if (mode === "deload") return "3–4";
  if (mode === "intro" && t.sets <= 2) return "2–3";
  return t.rir;
}

/** Epley e1RM for 1–12 rep sets (null otherwise — high-rep estimates are unreliable). */
export function e1rm(weightLb: number | null | undefined, reps: number | null | undefined) {
  if (!weightLb || !reps || reps < 1 || reps > 12) return null;
  return round(weightLb * (1 + reps / 30), 1);
}
