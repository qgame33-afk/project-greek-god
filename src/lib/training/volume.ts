// Pure volume maths for sessions, weeks and templates. Volume = Σ load × reps over completed
// working sets (warm-ups never count), matching the database views.

import { getExercise } from "./library";
import { plannedSetCount, type Mode } from "./progression";
import type { DayTemplate, LibraryExercise, MuscleGroup, TemplateExercise, WarmupStep } from "./types";

export interface SetLike {
  exercise_slug: string | null;
  weight_lb: number | string | null;
  reps: number | null;
  /** exercise_sets rows carry this; set_history rows are completed by definition. */
  completed?: boolean | null;
  kind?: string | null;
}

const counts = (s: SetLike) => s.completed !== false && s.kind !== "warmup";

export interface VolumeSummary {
  volumeLb: number;
  sets: number;
  reps: number;
}

/** Total load × reps, completed working sets and reps for one session's sets. */
export function sessionVolume(sets: SetLike[]): VolumeSummary {
  let volumeLb = 0;
  let n = 0;
  let reps = 0;
  for (const s of sets) {
    if (!counts(s)) continue;
    n++;
    const r = Number(s.reps ?? 0);
    reps += r;
    volumeLb += Number(s.weight_lb ?? 0) * r;
  }
  return { volumeLb: Math.round(volumeLb * 10) / 10, sets: n, reps };
}

export type MuscleKey = MuscleGroup | "other";

/**
 * Completed working sets per muscle, using the library's primary muscles (each primary muscle
 * of the exercise gets one set). `secondary` adds a fractional credit for secondary muscles
 * (0 by default). Exercises not in the library count under "other". Sorted by sets, desc.
 */
export function weeklySetsByMuscle(sets: SetLike[], opts: { secondary?: number } = {}): { muscle: MuscleKey; sets: number }[] {
  const secondary = opts.secondary ?? 0;
  const map = new Map<MuscleKey, number>();
  const add = (m: MuscleKey, v: number) => map.set(m, (map.get(m) ?? 0) + v);
  for (const s of sets) {
    if (!counts(s)) continue;
    const lib = s.exercise_slug ? getExercise(s.exercise_slug) : undefined;
    if (!lib) {
      add("other", 1);
      continue;
    }
    for (const m of lib.primary) add(m, 1);
    if (secondary > 0) for (const m of lib.secondary) if (!lib.primary.includes(m)) add(m, secondary);
  }
  return [...map.entries()]
    .map(([muscle, n]) => ({ muscle, sets: Math.round(n * 10) / 10 }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

/** Exercise and working-set counts for a template as written. */
export function templateSummary(t: Pick<DayTemplate, "exercises">): { exercises: number; sets: number } {
  return { exercises: t.exercises.length, sets: t.exercises.reduce((n, e) => n + e.sets, 0) };
}

/**
 * The template as it would actually start in a given mode: intro and deload set counts,
 * deload rep targets (top of the range − 2, as the deload suggestion sets them), and for
 * "lighter legs" the optional jumps are dropped and every leg lift loses a set (never below
 * 2). Mirrors `buildSessionSets`, so the sets, ranges and durations shown before starting
 * are honest.
 */
export function modeTemplate<T extends DayTemplate>(t: T, mode: Mode, lighterLegs = false): T {
  const exercises = t.exercises
    .filter((e) => !(lighterLegs && e.optional))
    .map((e) => {
      const lib = getExercise(e.slug);
      const sets = plannedSetCount(e, lib, mode, lighterLegs);
      const fixedTarget = lib?.category === "explosive" || lib?.tracking === "reps";
      const repHigh = mode === "deload" && !fixedTarget ? Math.max(e.repLow, e.repHigh - 2) : e.repHigh;
      return { ...e, sets, repHigh };
    });
  return { ...t, exercises };
}

/* ------------------------------------------------------ template equality */

/** One exercise with a fixed key order and no empty optional fields. */
function canonExercise(e: TemplateExercise) {
  return {
    slug: e.slug,
    name: e.name,
    sets: Number(e.sets),
    repLow: Number(e.repLow),
    repHigh: Number(e.repHigh),
    unit: e.unit,
    rir: e.rir,
    rest: Number(e.rest),
    optional: e.optional ? true : undefined,
    note: e.note ? e.note : undefined,
  };
}

/**
 * Compare the editable content of two templates (name, focus, warm-up, exercises). Insensitive
 * to object key order (Postgres jsonb reorders keys) and to absent vs empty optional fields.
 */
export function sameTemplateContent(
  a: Pick<DayTemplate, "name" | "focus" | "warmup" | "exercises">,
  b: Pick<DayTemplate, "name" | "focus" | "warmup" | "exercises">,
): boolean {
  const canon = (t: typeof a) =>
    JSON.stringify({
      name: t.name,
      focus: t.focus ?? "",
      warmup: (t.warmup ?? []).map((w) => ({ label: w.label, detail: w.detail })),
      exercises: (t.exercises ?? []).map(canonExercise),
    });
  return canon(a) === canon(b);
}

const LEG_MUSCLES: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves", "adductors"];

/** A leg day: most of its exercises train the legs, or it includes jumps. */
export function isLegDay(t: Pick<DayTemplate, "exercises">): boolean {
  if (!t.exercises.length) return false;
  let legs = 0;
  for (const e of t.exercises) {
    const lib = getExercise(e.slug);
    if (!lib) continue;
    if (lib.category === "explosive" || lib.primary.some((m) => LEG_MUSCLES.includes(m))) legs++;
  }
  return legs / t.exercises.length >= 0.5;
}

/* --------------------------------------------------------------- labels */

export const MUSCLE_LABEL: Record<MuscleKey, string> = {
  chest: "Chest",
  upper_chest: "Upper chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  lower_back: "Lower back",
  biceps: "Biceps",
  brachialis: "Brachialis",
  forearms: "Forearms",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  grip: "Grip",
  full_body: "Full body",
  other: "Other",
};

export type Region = "chest" | "back" | "shoulders" | "arms" | "legs" | "core";

export const REGION_LABEL: Record<Region, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  legs: "Legs",
  core: "Core",
};

const REGION_OF: Record<MuscleGroup, Region | null> = {
  chest: "chest",
  upper_chest: "chest",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  lats: "back",
  upper_back: "back",
  traps: "back",
  lower_back: "back",
  biceps: "arms",
  brachialis: "arms",
  forearms: "arms",
  triceps: "arms",
  grip: "arms",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  adductors: "legs",
  calves: "legs",
  abs: "core",
  obliques: "core",
  full_body: null,
};

/** Body region of an exercise from its first primary muscle (null when unknown). */
export function regionOf(primary: MuscleGroup[]): Region | null {
  for (const m of primary) {
    const r = REGION_OF[m];
    if (r) return r;
  }
  return null;
}

/* ------------------------------------------------------- template editing */


export const RIR_OPTIONS = ["0–1", "1–2", "2–3", "3–4", "Fresh"] as const;

/** A sensible starting prescription when an exercise is added to a template. */
export function newTemplateExercise(lib: LibraryExercise): TemplateExercise {
  const base = { slug: lib.slug, name: lib.name, sets: 3, rest: lib.rest } as const;
  if (lib.category === "explosive" || lib.tracking === "reps") return { ...base, repLow: 3, repHigh: 3, unit: lib.perSide ? "each" : "reps", rir: "Fresh" };
  if (lib.category === "carry" || lib.tracking === "weight_time") return { ...base, sets: 2, repLow: 30, repHigh: 45, unit: "sec", rir: "1–2" };
  if (lib.category === "compound") return { ...base, repLow: 6, repHigh: 10, unit: lib.perSide ? "each" : "reps", rir: "1–2" };
  return { ...base, repLow: 10, repHigh: 15, unit: lib.perSide ? "each" : "reps", rir: "1–2" };
}

/** Swap an exercise for a substitute, keeping the prescription (sets, reps, RIR, rest, notes). */
export function substituteExercise(e: TemplateExercise, lib: LibraryExercise): TemplateExercise {
  const unit = e.unit === "sec" ? "sec" : lib.perSide ? "each" : e.unit === "each" ? "reps" : e.unit;
  return { ...e, slug: lib.slug, name: lib.name, unit };
}

/** Move an item from one index to another (returns a new array; out-of-range is a no-op). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export interface TemplateErrors {
  name?: string;
  exercises?: string;
  exercise: Record<number, string>;
  warmup: Record<number, string>;
}

/** Validate an edited template. `ok` is false when anything would be unsafe to save. */
export function validateTemplate(t: { name: string; exercises: TemplateExercise[]; warmup: WarmupStep[] }): { ok: boolean; errors: TemplateErrors } {
  const errors: TemplateErrors = { exercise: {}, warmup: {} };
  const name = t.name.trim();
  if (!name) errors.name = "Give the workout a name.";
  else if (name.length > 40) errors.name = "Keep the name under 40 characters.";
  if (!t.exercises.length) errors.exercises = "Add at least one exercise.";
  t.exercises.forEach((e, i) => {
    const max = e.unit === "sec" ? 600 : 100;
    if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10) errors.exercise[i] = "Sets must be 1–10.";
    else if (!Number.isInteger(e.repLow) || e.repLow < 1) errors.exercise[i] = `Enter the low end of the ${e.unit === "sec" ? "time" : "rep"} range.`;
    else if (!Number.isInteger(e.repHigh) || e.repHigh < e.repLow) errors.exercise[i] = "The top of the range must be at least the bottom.";
    else if (e.repHigh > max) errors.exercise[i] = e.unit === "sec" ? "Keep timed sets to 10 minutes or less." : "Keep the range to 100 reps or fewer.";
    else if (!Number.isFinite(e.rest) || e.rest < 0 || e.rest > 900) errors.exercise[i] = "Rest must be 0–15 min.";
    else if (!e.name.trim()) errors.exercise[i] = "Give the exercise a name.";
  });
  t.warmup.forEach((w, i) => {
    if (!w.label.trim() && !w.detail.trim()) errors.warmup[i] = "Fill in or remove this step.";
    else if (!w.label.trim()) errors.warmup[i] = "Give the step a short title.";
  });
  const ok = !errors.name && !errors.exercises && !Object.keys(errors.exercise).length && !Object.keys(errors.warmup).length;
  return { ok, errors };
}

/* ------------------------------------------------------ exercise history */

export interface DailyLike {
  local_date: string | null;
  best_e1rm_lb: number | null;
  top_weight_lb: number | null;
  max_reps: number | null;
  volume_lb: number | null;
  sets: number | null;
  had_pr: boolean | null;
}

export interface SeriesPoint {
  date: string;
  /** The line: e1RM, top weight or best reps for the day (null when not measurable). */
  value: number | null;
  /** The bars: volume (load × reps) or completed sets. */
  bar: number;
  pr: boolean;
}

export interface StrengthSeries {
  metric: "e1rm" | "weight" | "reps";
  bars: "volume" | "sets";
  points: SeriesPoint[];
}

/**
 * Chart series for one exercise from the per-day view. The line is e1RM when any day has one
 * (weighted sets of 1–12 reps), else the top weight, else the best reps. Bars are volume, or
 * set counts for unloaded work. Days are returned oldest first; `from` trims the range.
 */
export function strengthSeries(daily: DailyLike[], from?: string | null): StrengthSeries {
  const rows = daily.filter((d): d is DailyLike & { local_date: string } => !!d.local_date && (!from || d.local_date >= from)).sort((a, b) => a.local_date.localeCompare(b.local_date));
  const all = daily;
  const metric: StrengthSeries["metric"] = all.some((d) => Number(d.best_e1rm_lb) > 0) ? "e1rm" : all.some((d) => Number(d.top_weight_lb) > 0) ? "weight" : "reps";
  const bars: StrengthSeries["bars"] = all.some((d) => Number(d.volume_lb) > 0) ? "volume" : "sets";
  const pick = (d: DailyLike) => {
    const v = metric === "e1rm" ? d.best_e1rm_lb : metric === "weight" ? d.top_weight_lb : d.max_reps;
    return v == null || !(Number(v) > 0) ? null : Number(v);
  };
  return {
    metric,
    bars,
    points: rows.map((d) => ({ date: d.local_date, value: pick(d), bar: Number(bars === "volume" ? d.volume_lb : d.sets) || 0, pr: !!d.had_pr })),
  };
}

export interface HistorySetLike {
  id: string | null;
  session_id: string | null;
  local_date: string | null;
  set_index: number | null;
  weight_lb: number | null;
  reps: number | null;
  duration_sec: number | null;
  rir: number | null;
  notes: string | null;
  e1rm_lb: number | null;
  completed_at?: string | null;
}

export interface SessionSets<T extends HistorySetLike> {
  sessionId: string;
  date: string;
  sets: T[];
  topE1rm: number | null;
  topWeight: number | null;
  volumeLb: number;
}

/** Group an exercise's completed sets into sessions, newest first, sets in order. */
export function sessionsFromSets<T extends HistorySetLike>(rows: T[]): SessionSets<T>[] {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.session_id || !r.local_date) continue;
    if (!by.has(r.session_id)) by.set(r.session_id, []);
    by.get(r.session_id)!.push(r);
  }
  return [...by.entries()]
    .map(([sessionId, sets]) => {
      sets.sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
      const e = sets.map((s) => Number(s.e1rm_lb)).filter((n) => n > 0);
      const w = sets.map((s) => Number(s.weight_lb)).filter((n) => n > 0);
      return {
        sessionId,
        date: sets[0].local_date!,
        sets,
        topE1rm: e.length ? Math.max(...e) : null,
        topWeight: w.length ? Math.max(...w) : null,
        volumeLb: Math.round(sets.reduce((n, s) => n + Number(s.weight_lb ?? 0) * Number(s.reps ?? 0), 0) * 10) / 10,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (b.sets[0].completed_at ?? "").localeCompare(a.sets[0].completed_at ?? ""));
}

/** Evenly spaced, round axis ticks covering [lo, hi] (steps of 1, 2, 2.5 or 5 × 10ⁿ). */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = Math.max(hi - lo, 1);
  const raw = span / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
