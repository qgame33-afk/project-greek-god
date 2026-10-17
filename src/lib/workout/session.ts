// Pure session logic for the live workout: grouping sets into exercises, the accordion's
// current exercise, ghost values, what a ✓ tap logs, input validation and re-ordering.

import type { PastSet } from "@/lib/training/progression";
import type { LibraryExercise } from "@/lib/training/types";
import { round, type WeightUnit } from "@/lib/units";
import type { CellField, Tracking, WSet } from "./types";

/* ------------------------------------------------------------ grouping */

export interface ExerciseGroup {
  /** Unique within a session: `${exercise_order}:${exercise_slug}`. */
  key: string;
  order: number;
  slug: string;
  name: string;
  /** Display order: warm-ups first, then working sets by set_index. */
  sets: WSet[];
  warmups: WSet[];
  working: WSet[];
  /** Completed working sets. */
  done: number;
  /** Working sets in the plan. */
  total: number;
}

export function groupKey(s: Pick<WSet, "exercise_order" | "exercise_slug">) {
  return `${s.exercise_order}:${s.exercise_slug}`;
}

const byIndex = (a: WSet, b: WSet) => a.set_index - b.set_index || a.created_at.localeCompare(b.created_at);

export function groupSets(sets: WSet[]): ExerciseGroup[] {
  const map = new Map<string, WSet[]>();
  for (const s of sets) {
    const k = groupKey(s);
    const list = map.get(k);
    if (list) list.push(s);
    else map.set(k, [s]);
  }
  const groups: ExerciseGroup[] = [];
  for (const [key, list] of map) {
    const warmups = list.filter((s) => s.kind === "warmup").sort(byIndex);
    const working = list.filter((s) => s.kind !== "warmup").sort(byIndex);
    const first = working[0] ?? warmups[0];
    groups.push({
      key,
      order: first.exercise_order,
      slug: first.exercise_slug,
      name: first.exercise_name,
      sets: [...warmups, ...working],
      warmups,
      working,
      done: working.filter((s) => s.completed).length,
      total: working.length,
    });
  }
  const created = (g: ExerciseGroup) => g.sets.reduce((m, s) => (s.created_at < m ? s.created_at : m), g.sets[0].created_at);
  return groups.sort((a, b) => a.order - b.order || created(a).localeCompare(created(b)));
}

/** Every working set logged (warm-ups never block an exercise from finishing). */
export function isGroupComplete(g: ExerciseGroup) {
  if (g.total === 0) return g.sets.every((s) => s.completed);
  return g.done === g.total;
}

/** Skipped = it still has unlogged sets and every one of them was skipped. */
export function isGroupSkipped(g: ExerciseGroup, skipped: ReadonlySet<string>) {
  const open = g.sets.filter((s) => !s.completed);
  return open.length > 0 && open.every((s) => skipped.has(s.id));
}

export type GroupState = "done" | "skipped" | "pending";

export function groupState(g: ExerciseGroup, skipped: ReadonlySet<string>): GroupState {
  if (isGroupComplete(g)) return "done";
  if (isGroupSkipped(g, skipped)) return "skipped";
  return "pending";
}

/** The exercise the accordion opens by default: the first one still to do. */
export function currentGroupKey(groups: ExerciseGroup[], skipped: ReadonlySet<string>): string | null {
  return groups.find((g) => groupState(g, skipped) === "pending")?.key ?? null;
}

/** The group after `key` that still has work, wrapping to earlier skipped-over ones last. */
export function nextPendingGroupKey(groups: ExerciseGroup[], key: string, skipped: ReadonlySet<string>): string | null {
  const i = groups.findIndex((g) => g.key === key);
  const after = groups.slice(i + 1).find((g) => groupState(g, skipped) === "pending");
  if (after) return after.key;
  return groups.slice(0, Math.max(0, i)).find((g) => groupState(g, skipped) === "pending")?.key ?? null;
}

/** First unlogged set of a group in display order (warm-ups first). */
export function firstOpenSet(g: ExerciseGroup): WSet | null {
  return g.sets.find((s) => !s.completed) ?? null;
}

/** The UP NEXT set: first unlogged set of the open group, else of the next pending group. */
export function upNextSet(groups: ExerciseGroup[], openKey: string | null, skipped: ReadonlySet<string>): WSet | null {
  const open = groups.find((g) => g.key === openKey);
  if (open && groupState(open, skipped) === "pending") return firstOpenSet(open);
  const cur = currentGroupKey(groups, skipped);
  const g = groups.find((x) => x.key === cur);
  return g ? firstOpenSet(g) : null;
}

/** 1-based number of a working set within its exercise ("Set 2"); warm-ups are "W". */
export function setLabel(g: ExerciseGroup, s: WSet): string {
  if (s.kind === "warmup") return "W";
  return String(g.working.findIndex((x) => x.id === s.id) + 1);
}

export function sessionCounts(groups: ExerciseGroup[]) {
  let done = 0;
  let total = 0;
  for (const g of groups) {
    done += g.done;
    total += g.total;
  }
  return { done, total };
}

/* ------------------------------------------------------------ tracking */

/** How a group records sets: from the library, else inferred from the stored target unit. */
export function trackingFor(lib: LibraryExercise | undefined, targetUnit?: string | null): Tracking {
  if (lib) return lib.tracking;
  return targetUnit === "sec" ? "weight_time" : "weight_reps";
}

export const hasWeight = (t: Tracking) => t !== "reps";
export const isTimed = (t: Tracking) => t === "weight_time";
/** RIR is asked for on lifts only — never on jumps or carries. */
export const hasRir = (t: Tracking) => t === "weight_reps" || t === "bodyweight_reps";
/** A load is required to log (bodyweight lifts may leave it blank). */
export const needsWeight = (t: Tracking) => t === "weight_reps" || t === "weight_time";

/** Equipment where a bodyweight-only set is real. */
const ZERO_LOAD_EQUIPMENT = new Set<LibraryExercise["equipment"]>(["bodyweight", "box", "other"]);

/**
 * Whether 0 is a real load. A bar, a stack or a sled always weighs something, a carry needs
 * something in the hands, and a dumbbell press or curl without dumbbells isn't the lift — so
 * "0 lb × 10" there is a typo, and it would poison the next suggestion ("you hit 10 at 0 lb").
 * Added load on bodyweight lifts, and dumbbell moves with a real bodyweight version (split
 * squats, lunges), may be 0.
 */
export function zeroLoadOk(lib: Pick<LibraryExercise, "equipment" | "bodyweightOk"> | undefined, t: Tracking): boolean {
  if (!needsWeight(t)) return true;
  if (isTimed(t)) return false;
  if (!lib) return true;
  return !!lib.bodyweightOk || ZERO_LOAD_EQUIPMENT.has(lib.equipment);
}

export function workOf(s: Pick<WSet, "reps" | "duration_sec">, t: Tracking): number | null {
  return isTimed(t) ? s.duration_sec : s.reps;
}

/** Order the keypad's Next button walks through on a row. */
export function fieldsFor(t: Tracking): CellField[] {
  const f: CellField[] = [];
  if (hasWeight(t)) f.push("weight");
  f.push("work");
  if (hasRir(t)) f.push("rir");
  return f;
}

/* -------------------------------------------------------------- ghosts */

export interface Ghost {
  weight: number | null;
  work: number | null;
  /** Where the weight came from (drives the cell's accessible label). */
  weightSource: "session" | "suggested" | "last" | "ramp" | null;
  workSource: "session" | "last" | "target" | null;
}

const NO_GHOST: Ghost = { weight: null, work: null, weightSource: null, workSource: null };
const RAMP = [0.5, 0.7, 0.85];
const RAMP_REPS = [5, 3, 1];

function roundTo(v: number, inc: number) {
  return inc > 0 ? round(Math.round(v / inc) * inc, 1) : round(v, 1);
}

const same = (a: number | null | undefined, b: number | null | undefined) => Number(a ?? 0) === Number(b ?? 0);

/**
 * Ghost values for an unlogged set — shown dotted, never counted until ✓ is tapped.
 * Weight: the last set logged this session › the suggested load › last session's set.
 * Work: last session's same set when the load matches › this session's previous set at the
 * same load › the bottom of the range after a load increase › a fixed target (3 jumps).
 */
export function ghostFor(set: WSet, g: ExerciseGroup, last: PastSet[], t: Tracking, inc = 5): Ghost {
  if (set.completed) return NO_GHOST;

  if (set.kind === "warmup") {
    if (isTimed(t) || !hasWeight(t)) return NO_GHOST;
    const firstWorking = g.working.find((s) => !s.completed) ?? g.working[0];
    const base = firstWorking ? (firstWorking.weight_lb ?? ghostFor(firstWorking, g, last, t, inc).weight) : null;
    if (!base) return NO_GHOST;
    const k = Math.min(g.warmups.findIndex((s) => s.id === set.id), RAMP.length - 1);
    const w = Math.max(inc, roundTo(Number(base) * RAMP[Math.max(0, k)], inc));
    return { weight: w, work: RAMP_REPS[Math.max(0, k)], weightSource: "ramp", workSource: "target" };
  }

  const pos = g.working.findIndex((s) => s.id === set.id);
  const prevInSession = [...g.working.slice(0, Math.max(0, pos))].reverse().find((s) => s.completed) ?? null;
  const lastSame = last[pos] ?? last.at(-1) ?? null;
  const work = (s: { reps: number | null; duration_sec: number | null }) => (isTimed(t) ? s.duration_sec : s.reps);

  let weight: number | null = null;
  let weightSource: Ghost["weightSource"] = null;
  if (hasWeight(t)) {
    if (prevInSession) {
      weight = prevInSession.weight_lb == null ? null : Number(prevInSession.weight_lb);
      weightSource = weight == null ? null : "session";
    } else if (set.suggested_weight_lb != null) {
      weight = Number(set.suggested_weight_lb);
      weightSource = "suggested";
    } else if (lastSame?.weight_lb) {
      weight = Number(lastSame.weight_lb);
      weightSource = "last";
    }
  }

  // Reps are matched against the load actually on the bar: a typed weight beats the ghost.
  const load = set.weight_lb != null ? Number(set.weight_lb) : weight;
  let w: number | null = null;
  let workSource: Ghost["workSource"] = null;
  if (lastSame && work(lastSame) != null && same(lastSame.weight_lb, load)) {
    w = work(lastSame);
    workSource = "last";
  } else if (prevInSession && work(prevInSession) != null && same(prevInSession.weight_lb, load)) {
    w = work(prevInSession);
    workSource = "session";
  } else if (lastSame && set.target_rep_low != null) {
    w = set.target_rep_low;
    workSource = "target";
  } else if (set.target_rep_low != null && set.target_rep_low === set.target_rep_high) {
    w = set.target_rep_low;
    workSource = "target";
  }
  return { weight, work: w, weightSource, workSource };
}

/* ------------------------------------------------------------- logging */

export type LogValues = Pick<WSet, "weight_lb" | "reps" | "duration_sec" | "completed" | "completed_at">;

/**
 * What a ✓ tap writes. Typed values win; ghosts fill the gaps only when the
 * "Tap ✓ logs shown values" preference is on. Returns the field to open the keypad on
 * when something required is still missing (or a load of 0 where 0 isn't a real load).
 */
export function resolveLog(
  set: WSet,
  ghost: Ghost,
  t: Tracking,
  useGhosts: boolean,
  nowIso: string,
  zeroOk = true,
): { ok: true; values: LogValues } | { ok: false; field: CellField } {
  const typedWork = workOf(set, t);
  const work = typedWork ?? (useGhosts ? ghost.work : null);
  const weight = set.weight_lb != null ? Number(set.weight_lb) : useGhosts ? ghost.weight : null;
  if (needsWeight(t) && (weight == null || (!zeroOk && weight <= 0))) return { ok: false, field: "weight" };
  if (work == null || work <= 0) return { ok: false, field: "work" };
  return {
    ok: true,
    values: {
      weight_lb: hasWeight(t) ? weight : null,
      reps: isTimed(t) ? set.reps : work,
      duration_sec: isTimed(t) ? work : set.duration_sec,
      completed: true,
      completed_at: nowIso,
    },
  };
}

/* ---------------------------------------------------------- validation */

export const LIMITS = {
  weightLb: 1500,
  reps: 100,
  seconds: 900,
  rir: 10,
};

export type Check = { ok: true; stored: number | null } | { ok: false; error: string };

/**
 * Validate one typed cell (in display units) and convert to the stored value.
 * Blank clears the cell. Rejects negatives, junk, absurd numbers, 0 reps/seconds and a 0
 * load where 0 isn't a real load (`zeroOk`, see zeroLoadOk) with a short reason.
 */
export function validateCell(field: CellField, raw: string, unit: WeightUnit, t: Tracking, zeroOk = true): Check {
  const s = raw.trim().replace(",", ".");
  if (s === "" || s === ".") return { ok: true, stored: null };
  if (s.startsWith("-") || s.startsWith("−")) return { ok: false, error: field === "weight" ? "Weight can't be negative." : "Can't be negative." };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "Enter a number." };
  if (field === "weight") {
    const max = unit === "kg" ? Math.round(LIMITS.weightLb / 2.2046226218) : LIMITS.weightLb;
    if (n > max) return { ok: false, error: `Over ${max} ${unit}. Check the number.` };
    const lb = round(unit === "kg" ? n * 2.2046226218 : n, 1);
    if (lb <= 0 && !zeroOk) return { ok: false, error: `Weight must be above 0 ${unit}.` };
    return { ok: true, stored: lb };
  }
  if (field === "rir") {
    if (!Number.isInteger(n)) return { ok: false, error: "RIR is a whole number." };
    if (n > LIMITS.rir) return { ok: false, error: `RIR runs 0–${LIMITS.rir}.` };
    return { ok: true, stored: n };
  }
  if (!Number.isInteger(n)) return { ok: false, error: isTimed(t) ? "Whole seconds only." : "Whole reps only." };
  // A set needs at least one rep (a 0 could never be logged, so say so instead of reopening).
  if (n === 0) return { ok: false, error: isTimed(t) ? "At least 1 second." : "At least 1 rep." };
  if (isTimed(t)) {
    if (n > LIMITS.seconds) return { ok: false, error: `Over ${LIMITS.seconds} s. Check the number.` };
    return { ok: true, stored: n };
  }
  if (n > LIMITS.reps) return { ok: false, error: `Over ${LIMITS.reps} reps. Check the number.` };
  return { ok: true, stored: n };
}

/* ---------------------------------------------------------- cell errors */

/** Rejected entries, one per cell: fixing one cell never hides another cell's error. */
export type CellErrors = Readonly<Record<string, string>>;

const CELLS: CellField[] = ["weight", "work", "rir"];

/** Record (or with null, clear) one cell's error; every other cell keeps its own. */
export function withCellError(e: CellErrors, setId: string, field: CellField, error: string | null): CellErrors {
  const key = `${setId}:${field}`;
  if (error == null) {
    if (!(key in e)) return e;
    const n = { ...e };
    delete n[key];
    return n;
  }
  return e[key] === error ? e : { ...e, [key]: error };
}

/** The cells of a row still holding a rejected value, in entry order. */
export function rowErrorFields(e: CellErrors, setId: string): CellField[] {
  return CELLS.filter((f) => e[`${setId}:${f}`]);
}

/** The DB column a cell writes to. */
export function columnFor(field: CellField, t: Tracking): "weight_lb" | "reps" | "duration_sec" | "rir" {
  if (field === "weight") return "weight_lb";
  if (field === "rir") return "rir";
  return isTimed(t) ? "duration_sec" : "reps";
}

/** A stored cell value in display units, as the keypad/input text. */
export function cellText(set: Pick<WSet, "weight_lb" | "reps" | "duration_sec" | "rir">, field: CellField, t: Tracking, unit: WeightUnit): string {
  if (field === "weight") {
    if (set.weight_lb == null) return "";
    const v = unit === "kg" ? Number(set.weight_lb) / 2.2046226218 : Number(set.weight_lb);
    const r = round(v, 1);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  if (field === "rir") return set.rir == null ? "" : String(Number(set.rir));
  const w = workOf(set, t);
  return w == null ? "" : String(w);
}

/* ------------------------------------------------------------ ordering */

/** Move a group one place up/down; returns the new order of keys (unchanged at the ends). */
export function moveKey(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const out = [...keys];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Re-number exercise_order 0…n−1 for groups in the given order and return only the
 * set rows whose order actually changes.
 */
export function renumber(groups: ExerciseGroup[], orderedKeys: string[]): { id: string; exercise_order: number }[] {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const out: { id: string; exercise_order: number }[] = [];
  orderedKeys.forEach((k, i) => {
    const g = byKey.get(k);
    if (!g) return;
    for (const s of g.sets) if (s.exercise_order !== i) out.push({ id: s.id, exercise_order: i });
  });
  return out;
}

/* -------------------------------------------------------------- notes */

/** The set that carries the exercise-level note: the first working set (else the first set). */
export function noteCarrier(g: ExerciseGroup): WSet | null {
  return g.working[0] ?? g.sets[0] ?? null;
}

/**
 * Before unlogged sets are deleted at Finish, keep any notes they carry: move them onto a
 * logged set of the same exercise, or (when nothing was logged) into the session notes.
 */
export function relocateNotes(groups: ExerciseGroup[]): { moves: { id: string; notes: string }[]; sessionLines: string[] } {
  const moves: { id: string; notes: string }[] = [];
  const sessionLines: string[] = [];
  for (const g of groups) {
    const lost = g.sets.filter((s) => !s.completed && s.notes?.trim());
    if (!lost.length) continue;
    const keep = g.working.find((s) => s.completed) ?? g.sets.find((s) => s.completed);
    const text = lost.map((s) => s.notes!.trim());
    if (keep) {
      const merged = [keep.notes?.trim(), ...text].filter(Boolean).join(" · ");
      moves.push({ id: keep.id, notes: merged.slice(0, 1000) });
    } else {
      sessionLines.push(`${g.name}: ${text.join(" · ")}`);
    }
  }
  return { moves, sessionLines };
}

/* -------------------------------------------------------------- copy */

/** "185×8" / "70×45s" / "8" / "+10×6" style chip text for a logged or past set. */
export function setChip(s: { weight_lb: number | null; reps: number | null; duration_sec: number | null }, t: Tracking, fmt: (lb: number) => string): string {
  const work = isTimed(t) ? `${s.duration_sec ?? 0}s` : `${s.reps ?? 0}`;
  const w = s.weight_lb == null ? 0 : Number(s.weight_lb);
  if (!hasWeight(t) || w <= 0) return work;
  return `${t === "bodyweight_reps" ? "+" : ""}${fmt(w)}×${work}`;
}

/** "185 × 6" for toasts and the rest dock. */
export function setLoadText(
  s: { weight_lb: number | null; reps: number | null; duration_sec: number | null },
  t: Tracking,
  fmt: (lb: number) => string,
  unit: string,
): string {
  const work = isTimed(t) ? `${s.duration_sec ?? 0} s` : `${s.reps ?? 0}`;
  const w = s.weight_lb == null ? 0 : Number(s.weight_lb);
  if (!hasWeight(t) || w <= 0) return isTimed(t) ? work : `${work} reps`;
  if (t === "bodyweight_reps") return `BW +${fmt(w)} × ${work}`;
  return isTimed(t) ? `${fmt(w)} ${unit} × ${work}` : `${fmt(w)} × ${work}`;
}

/* ------------------------------------------------------------- targets */

export interface Targets {
  sets: number;
  low: number;
  high: number;
  unit: "reps" | "sec" | "each";
  rir: string;
  rest: number;
}

/** Sensible targets for an exercise added from the library mid-session. */
export function defaultTargets(lib: LibraryExercise): Targets {
  const rest = lib.rest;
  if (lib.category === "explosive") return { sets: 3, low: 3, high: 3, unit: "reps", rir: "Fresh", rest };
  if (lib.tracking === "weight_time") return { sets: 2, low: 30, high: 45, unit: "sec", rir: "1–2", rest };
  const unit = lib.perSide ? "each" : "reps";
  if (lib.category === "compound") return { sets: 3, low: 6, high: 10, unit, rir: "1–2", rest };
  return { sets: 3, low: 10, high: 15, unit, rir: "1–2", rest };
}

/**
 * Targets when swapping one exercise for another: keep the prescription where the movement
 * type matches, otherwise fall back to the new exercise's defaults (a carry can't keep a
 * 5–8 rep range, jumps never inherit a grinding RIR).
 */
export function retarget(prev: { low: number | null; high: number | null; unit: string | null; rir: string | null; sets: number }, lib: LibraryExercise): Targets {
  const def = defaultTargets(lib);
  const prevTimed = prev.unit === "sec";
  const nextTimed = lib.tracking === "weight_time";
  const prevFresh = prev.rir === "Fresh";
  const nextFresh = lib.category === "explosive";
  if (prev.low == null || prev.high == null || prevTimed !== nextTimed || prevFresh !== nextFresh) return { ...def, sets: prev.sets || def.sets };
  const unit = nextTimed ? "sec" : lib.perSide ? "each" : "reps";
  return { sets: prev.sets || def.sets, low: prev.low, high: prev.high, unit, rir: prev.rir ?? def.rir, rest: lib.rest };
}
