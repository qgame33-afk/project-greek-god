// Gym Mode and the Inscription (DESIGN-V2 §3.2, §3.3): the short lines the screen speaks — the
// target line under the lift, the plate that changed since last time, each lift's result for
// the Inscription and the next-time rule. Pure: every number comes from logged sets, the plan
// or a fixed rule (progression, the one record rule), never from a guess.

import { e1rm, groupSessions, type Mode, type PastSet, type Suggestion } from "@/lib/training/progression";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { repRange } from "./copy";
import { platesFor } from "./plates";
import { PR_MIN_GAIN_LB, setE1rm, type Plaque, type PriorBest } from "./pr";
import type { ExerciseGroup } from "./session";
import { modeFamily, type SetTiming } from "./timing";
import type { Tracking, WSet } from "./types";

type Fmt = (lb: number) => string;

/* ------------------------------------------------------------- time copy */

/** "5:41 pm" — the local wall-clock time of an ISO timestamp (or epoch ms). */
export function clockTime(ts: string | number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 19 Oct" for an ISO date (YYYY-MM-DD), read as a local calendar day. */
export function gymDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return iso;
  const dt = new Date(y, mo - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[mo - 1]}`;
}

/** "1,000" — a load in display units with thousands grouping (the deck and tower values). */
export function loadText(lb: number | null | undefined, unit: WeightUnit): string {
  if (lb == null || !Number.isFinite(Number(lb))) return "—";
  const v = round(toDisplayWeight(Number(lb), unit), 1);
  return v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: Number.isInteger(v) ? 0 : 1 });
}

/* ------------------------------------------------------------ target line */

/** The most recent past session that counts as performance (deloads never do). */
export function lastRealSession(history: PastSet[]): PastSet[] | null {
  return groupSessions(history).find((s) => s[0]?.mode !== "deload") ?? null;
}

/**
 * The lift header's target line (§3.2.1): "190 × 5–8 · up 5 from 185 × 6". Built from the
 * progression rule's own suggestion and the session it judged — never a free-form guess.
 * `ref` is that session (lastRealSession). Returns the line and whether it carries a load.
 */
export function targetLine(s: Suggestion, ref: PastSet[] | null, fmt: Fmt, tracking: Tracking): string {
  const range = repRange(s.target.low, s.target.high, s.target.unit);
  const w = s.weightLb;
  if (w == null) {
    if (s.kind === "first") return tracking === "bodyweight_reps" || tracking === "reps" ? `First time · bodyweight × ${range}` : `First time · ${range} to find your baseline`;
    if (s.kind === "explosive") return `${range} · full recovery, max quality`;
    if (s.kind === "bodyweight") return `Bodyweight × ${range} · add a rep`;
    return range;
  }
  const load = tracking === "bodyweight_reps" ? `BW +${fmt(w)}` : fmt(w);
  const head = `${load} × ${range}`;
  const top = ref?.length ? Math.max(0, ...ref.map((x) => Number(x.weight_lb ?? 0))) : 0;
  switch (s.kind) {
    case "increase": {
      if (top <= 0) return `${head} · add load`;
      const atTop = ref!.filter((x) => Number(x.weight_lb ?? 0) === top);
      const reps = Math.max(0, ...atTop.map((x) => Number((s.target.unit === "sec" ? x.duration_sec : x.reps) ?? 0)));
      const unitWord = s.target.unit === "sec" ? " s" : "";
      return `${head} · up ${fmt(round(w - top, 1))} from ${fmt(top)} × ${reps}${unitWord}`;
    }
    case "add_reps":
      return `${head} · same load, add a rep`;
    case "reset":
      return top > 0 ? `${head} · reset from ${fmt(top)}` : `${head} · reset`;
    case "deload":
      return `${head} · light week, stop 3–4 reps short`;
    case "hold":
      return `${head} · hold`;
    default:
      return head;
  }
}

/* ----------------------------------------------------------------- plates */

export interface PlateChange {
  /** Index in today's per-side plates of the plate that changed. */
  index: number;
  /** "2.5 = today's +5 lb" */
  caption: string;
}

/**
 * The plate that changed since last session (§3.2.1): only when today's load is heavier than
 * last time's and both are loadable on a bar. With one plate added per side the caption names
 * it ("2.5 = today's +5 lb"); otherwise it marks the first plate that differs.
 */
export function changedPlate(todayTotal: number | null, lastTotal: number | null, unit: WeightUnit): PlateChange | null {
  if (todayTotal == null || lastTotal == null || !(todayTotal > lastTotal)) return null;
  const now = platesFor(todayTotal, unit);
  const was = platesFor(lastTotal, unit);
  if (!now || !was || now.leftover > 0 || !now.perSide.length) return null;
  const diff = round(todayTotal - lastTotal, 2);
  const diffText = Number.isInteger(diff) ? String(diff) : String(round(diff, 1));
  let i = 0;
  while (i < now.perSide.length && i < was.perSide.length && now.perSide[i] === was.perSide[i]) i++;
  if (i >= now.perSide.length) return null;
  const plate = now.perSide[i];
  const added = now.perSide.length === was.perSide.length + 1 && i === was.perSide.length;
  return { index: i, caption: added ? `${plate} = today's +${diffText} ${unit}` : `${plate} · today's +${diffText} ${unit}` };
}

/* ------------------------------------------------------- Inscription rows */

export interface LiftResult {
  key: string;
  slug: string;
  name: string;
  /** The session's best working set of this lift ("190 × 6"). */
  best: Pick<WSet, "weight_lb" | "reps" | "duration_sec">;
  timing: SetTiming;
  /** "+6 e1RM", "= last", "+2 reps", "−1 rep", "+5 s", or null with no comparison. */
  delta: string | null;
}

const minus = (n: number) => `−${n}`;

/** Signed load in the user's unit, rounded: "+4", "−2.5". */
export function signedLoad(lb: number, unit: WeightUnit): string {
  const v = unit === "kg" ? round(lb / 2.2046226218, 1) : Math.round(lb);
  const abs = Math.abs(v);
  const t = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return v >= 0 ? `+${t}` : minus(Number(t));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function bestOf(sets: Pick<WSet, "weight_lb" | "reps" | "duration_sec">[]) {
  let best = sets[0];
  let bestE = -Infinity;
  for (const s of sets) {
    const e = e1rm(s.weight_lb == null ? null : Number(s.weight_lb), s.reps) ?? -Infinity;
    const w = Number(s.weight_lb ?? 0);
    const bw = Number(best.weight_lb ?? 0);
    const work = Number(s.reps ?? s.duration_sec ?? 0);
    const bwork = Number(best.reps ?? best.duration_sec ?? 0);
    if (e > bestE || (e === bestE && (w > bw || (w === bw && work > bwork)))) {
      best = s;
      bestE = e;
    }
  }
  return best;
}

/**
 * The Classification (§3.3): one row per lift with its best set and how it compares with the
 * previous session of that lift in the same mode family. Records come from the one record rule
 * (sessionRecords' plaques); a first-ever log is a first benchmark. Never a guilt word.
 */
export function liftResults(
  groups: ExerciseGroup[],
  history: Record<string, PastSet[]>,
  priors: Record<string, PriorBest> | null | undefined,
  plaques: Plaque[],
  mode: Mode | null | undefined,
  unit: WeightUnit,
): LiftResult[] {
  const out: LiftResult[] = [];
  for (const g of groups) {
    const done = g.working.filter((s) => s.completed);
    if (!done.length) continue;
    const best = bestOf(done);
    const base = { key: g.key, slug: g.slug, name: g.name, best };
    const plaque = plaques.find((p) => p.slug === g.slug);
    if (plaque) {
      out.push({ ...base, timing: "record", delta: `${signedLoad(Math.max(PR_MIN_GAIN_LB, plaque.gain), unit)} e1RM` });
      continue;
    }
    const prior = priors?.[g.slug];
    if (prior && prior.sets === 0) {
      out.push({ ...base, timing: "first", delta: null });
      continue;
    }
    const fam = modeFamily(mode);
    const prev = groupSessions(history[g.slug] ?? []).find((s) => modeFamily(s[0]?.mode) === fam);
    if (!prev?.length) {
      out.push({ ...base, timing: null, delta: null });
      continue;
    }
    const pBest = bestOf(prev);
    const top = Math.max(0, ...done.map((s) => Number(s.weight_lb ?? 0)));
    const pTop = Math.max(0, ...prev.map((s) => Number(s.weight_lb ?? 0)));
    const nowE = setE1rm({ ...best, kind: "working", completed: true });
    const prevE = e1rm(pBest.weight_lb == null ? null : Number(pBest.weight_lb), pBest.reps);
    if (top > 0 && top === pTop) {
      const reps = Math.max(0, ...done.filter((s) => Number(s.weight_lb ?? 0) === top).map((s) => Number(s.reps ?? 0)));
      const pReps = Math.max(0, ...prev.filter((s) => Number(s.weight_lb ?? 0) === pTop).map((s) => Number(s.reps ?? 0)));
      const d = reps - pReps;
      if (reps > 0 || pReps > 0) {
        out.push({ ...base, timing: d > 0 ? "beat" : d < 0 ? "below" : "matched", delta: d === 0 ? "= last" : d > 0 ? `+${plural(d, "rep", "reps")}` : `${minus(-d)} ${-d === 1 ? "rep" : "reps"}` });
        continue;
      }
    }
    if (nowE != null && prevE != null) {
      const diff = nowE - prevE;
      const timing: SetTiming = diff >= PR_MIN_GAIN_LB ? "beat" : diff <= -PR_MIN_GAIN_LB ? "below" : "matched";
      out.push({ ...base, timing, delta: timing === "matched" ? "= last" : `${signedLoad(diff, unit)} e1RM` });
      continue;
    }
    // Timed, bodyweight or high-rep work: weight, then reps, then seconds.
    const w = Number(best.weight_lb ?? 0) - Number(pBest.weight_lb ?? 0);
    const r = Number(best.reps ?? 0) - Number(pBest.reps ?? 0);
    const sec = Number(best.duration_sec ?? 0) - Number(pBest.duration_sec ?? 0);
    if (w !== 0) out.push({ ...base, timing: w > 0 ? "beat" : "below", delta: `${signedLoad(w, unit)} ${unit}` });
    else if (r !== 0) out.push({ ...base, timing: r > 0 ? "beat" : "below", delta: r > 0 ? `+${plural(r, "rep", "reps")}` : `${minus(-r)} ${-r === 1 ? "rep" : "reps"}` });
    else if (sec !== 0) out.push({ ...base, timing: sec > 0 ? "beat" : "below", delta: sec > 0 ? `+${sec} s` : `${minus(-sec)} s` });
    else out.push({ ...base, timing: "matched", delta: "= last" });
  }
  return out;
}

/** This session's completed working sets as past sets (for the next-time rule). */
export function asPastSets(sets: WSet[], mode: Mode | null | undefined): Record<string, PastSet[]> {
  const out: Record<string, PastSet[]> = {};
  for (const s of sets) {
    if (!s.completed || s.kind === "warmup") continue;
    (out[s.exercise_slug] ??= []).push({
      local_date: s.local_date,
      session_id: s.session_id,
      set_index: s.set_index,
      weight_lb: s.weight_lb == null ? null : Number(s.weight_lb),
      reps: s.reps,
      duration_sec: s.duration_sec,
      rir: s.rir == null ? null : Number(s.rir),
      mode: (mode ?? "standard") as Mode,
    });
  }
  return out;
}

/* ------------------------------------------------------------- the frieze */

export interface FriezeSegment {
  id: string;
  group: string;
  state: "logged" | "current" | "later" | "skipped";
}

/** One segment per working set, grouped by lift (§3.2.1). Warm-ups are not counted. */
export function friezeSegments(groups: ExerciseGroup[], currentId: string | null, skipped: ReadonlySet<string>): FriezeSegment[] {
  const out: FriezeSegment[] = [];
  for (const g of groups)
    for (const s of g.working)
      out.push({ id: s.id, group: g.key, state: s.completed ? "logged" : s.id === currentId ? "current" : skipped.has(s.id) ? "skipped" : "later" });
  return out;
}

/** When the session should end: start + the typical length of this template (CALC). */
export function endsAt(startedAt: string, typicalMin: number | null | undefined): number | null {
  if (!typicalMin || typicalMin <= 0) return null;
  const t = Date.parse(startedAt);
  return Number.isFinite(t) ? t + typicalMin * 60000 : null;
}

/** Whether a heavier set at `weightLb` would beat the running best (prior + this session). */
export function runningBest(prior: PriorBest | undefined, sessionSets: WSet[], excludeId?: string): PriorBest | undefined {
  if (!prior || prior.sets === 0 || prior.e1rm == null) return prior;
  let best = prior.e1rm;
  for (const s of sessionSets) {
    if (s.id === excludeId) continue;
    const v = setE1rm(s);
    if (v != null && v > best) best = v;
  }
  return best === prior.e1rm ? prior : { ...prior, e1rm: best };
}
