// Pure aggregation helpers for the coach context. Every number here is computed from the
// user's own rows — nothing is estimated or filled in. Unit-tested in aggregate.test.ts.

import { addDays, daysBetween, type ISODate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import { resolvePlanKey, scheduleFor } from "@/lib/training/programs";
import type { ProgramId } from "@/lib/training/types";
import { round } from "@/lib/units";

/* ------------------------------------------------------------------ lifts */

export interface HistorySet {
  session_id: string;
  local_date: ISODate;
  exercise_slug: string;
  exercise_name: string;
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
  duration_sec: number | null;
  e1rm_lb: number | null;
  completed_at?: string | null;
}

export interface LiftSession {
  date: ISODate;
  sessionId: string;
  bestE1rm: number | null;
  topWeight: number | null;
  sets: HistorySet[];
}

export interface LiftTrend {
  slug: string;
  name: string;
  sessions: LiftSession[];
  firstDate: ISODate;
  lastDate: ISODate;
  firstE1rm: number | null;
  latestE1rm: number | null;
  /** latest − first session's best e1RM, lb */
  change: number | null;
  /** best e1RM inside the window */
  windowBest: number | null;
  /** sessions that had at least one 1–12 rep weighted set (so an e1RM exists) */
  e1rmSessions: number;
  /** heaviest set of the first / latest session (for high-rep lifts without an e1RM) */
  firstTop: { weight: number; reps: number | null } | null;
  lastTop: { weight: number; reps: number | null } | null;
  /** consecutive most-recent sessions that did not beat the earlier best e1RM in the window */
  sessionsSinceGain: number;
  /** no e1RM gain in 3+ sessions */
  stalled: boolean;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Group completed working sets into per-exercise, per-session trends (oldest session first). */
export function liftTrends(sets: HistorySet[]): LiftTrend[] {
  const byEx = new Map<string, HistorySet[]>();
  for (const s of sets) {
    if (!s.exercise_slug) continue;
    if (!byEx.has(s.exercise_slug)) byEx.set(s.exercise_slug, []);
    byEx.get(s.exercise_slug)!.push(s);
  }
  const out: LiftTrend[] = [];
  for (const [slug, rows] of byEx) {
    const bySession = new Map<string, HistorySet[]>();
    for (const r of rows) {
      const k = `${r.local_date}|${r.session_id}`;
      if (!bySession.has(k)) bySession.set(k, []);
      bySession.get(k)!.push(r);
    }
    const sessions: LiftSession[] = [...bySession.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => {
        const ss = [...v].sort((a, b) => a.set_index - b.set_index);
        const e = ss.map((x) => num(x.e1rm_lb)).filter((x): x is number => x != null);
        const w = ss.map((x) => num(x.weight_lb)).filter((x): x is number => x != null && x > 0);
        return {
          date: ss[0].local_date,
          sessionId: ss[0].session_id,
          bestE1rm: e.length ? Math.max(...e) : null,
          topWeight: w.length ? Math.max(...w) : null,
          sets: ss,
        };
      });
    const withE = sessions.filter((s) => s.bestE1rm != null);
    let runningMax: number | null = null;
    let lastGain = -1;
    withE.forEach((s, i) => {
      if (runningMax == null || s.bestE1rm! > runningMax + 0.05) {
        runningMax = s.bestE1rm!;
        lastGain = i;
      }
    });
    const sinceGain = lastGain === -1 ? 0 : withE.length - 1 - lastGain;
    const top = (ls: LiftSession | undefined) => {
      if (!ls || ls.topWeight == null) return null;
      const reps = ls.sets.filter((x) => num(x.weight_lb) === ls.topWeight).map((x) => num(x.reps) ?? 0);
      return { weight: ls.topWeight, reps: reps.length ? Math.max(...reps) : null };
    };
    const first = withE[0]?.bestE1rm ?? null;
    const latest = withE.at(-1)?.bestE1rm ?? null;
    out.push({
      slug,
      name: rows.find((r) => r.exercise_name)?.exercise_name ?? getExercise(slug)?.name ?? slug,
      sessions,
      firstDate: sessions[0].date,
      lastDate: sessions.at(-1)!.date,
      firstE1rm: first,
      latestE1rm: latest,
      change: first != null && latest != null && withE.length > 1 ? round(latest - first, 1) : null,
      windowBest: runningMax,
      e1rmSessions: withE.length,
      firstTop: top(sessions[0]),
      lastTop: top(sessions.at(-1)),
      sessionsSinceGain: sinceGain,
      stalled: sinceGain >= 3,
    });
  }
  // compounds first, then by how often they were trained
  const rank = (t: LiftTrend) => (getExercise(t.slug)?.category === "compound" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));
}

/** "185×6, 185×6, 185×5" — loads via `fmtLoad` (user units), bodyweight sets as reps, timed sets in seconds. */
export function describeSets(sets: HistorySet[], fmtLoad: (lb: number) => string): string {
  return [...sets]
    .sort((a, b) => a.set_index - b.set_index)
    .map((s) => {
      const w = num(s.weight_lb);
      const r = num(s.reps);
      const d = num(s.duration_sec);
      const work = r != null && r > 0 ? `${r}` : d != null ? `${d}s` : "—";
      return w && w > 0 ? `${fmtLoad(w)}×${work}` : `BW×${work}`;
    })
    .join(", ");
}

/* -------------------------------------------------------------- schedule */

export interface PlanOverride {
  plan_date: ISODate;
  template_key: string;
  reason: string | null;
  moved_from: ISODate | null;
  note?: string | null;
}

export interface ResolvedPlan {
  date: ISODate;
  key: string; // template key or "rest"
  overridden: boolean;
  reason: string | null;
  movedFrom: ISODate | null;
}

/** Weekly schedule merged over the active program's default week (= scheduleFor). */
export function mergeSchedule(raw: unknown, prefs?: unknown): Record<string, string> {
  return scheduleFor({ weekly_schedule: raw, prefs });
}

/** What's planned on a date: the one plan resolver (programs.ts resolvePlanKey). */
export function resolvePlan(
  date: ISODate,
  schedule: Record<string, string>,
  overrides: PlanOverride[],
  ctx: { program: ProgramId; since: ISODate | null } = { program: "arnold", since: null },
): ResolvedPlan {
  const o = overrides.find((p) => p.plan_date === date);
  return {
    date,
    key: resolvePlanKey(date, schedule, o, ctx),
    overridden: !!o,
    reason: o?.reason ?? null,
    movedFrom: o?.moved_from ?? null,
  };
}

/**
 * Planned training days vs days with a finished session, from..to inclusive.
 * Today counts as planned only once it has a session (the day isn't over).
 */
export function trainingAdherence(
  doneDates: ISODate[],
  from: ISODate,
  to: ISODate,
  today: ISODate,
  planOf: (d: ISODate) => string,
): { planned: number; done: number; plannedDone: number; extra: number } {
  const done = new Set(doneDates.filter((d) => d >= from && d <= to));
  let planned = 0;
  let plannedDone = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const isTraining = planOf(d) !== "rest";
    if (!isTraining) continue;
    if (d === today && !done.has(d)) continue;
    if (d > today) continue;
    planned++;
    if (done.has(d)) plannedDone++;
  }
  return { planned, done: done.size, plannedDone, extra: done.size - plannedDone };
}

/* ------------------------------------------------------------- nutrition */

export interface DayTotals {
  local_date: ISODate;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  entries: number | null;
}

export interface NutritionWindow {
  from: ISODate;
  to: ISODate;
  days: number;
  daysLogged: number;
  avg: { calories: number; protein: number; carbs: number; fat: number } | null;
}

/** Averages over the `n` days ending at `end` (inclusive), counting only days that have entries. */
export function nutritionWindow(days: DayTotals[], end: ISODate, n: number): NutritionWindow {
  const from = addDays(end, -(n - 1));
  const logged = days.filter((d) => d.local_date >= from && d.local_date <= end && (num(d.entries) ?? 0) > 0);
  if (!logged.length) return { from, to: end, days: n, daysLogged: 0, avg: null };
  const sum = (k: keyof DayTotals) => logged.reduce((a, d) => a + (num(d[k]) ?? 0), 0);
  return {
    from,
    to: end,
    days: n,
    daysLogged: logged.length,
    avg: {
      calories: Math.round(sum("calories") / logged.length),
      protein: Math.round(sum("protein_g") / logged.length),
      carbs: Math.round(sum("carbs_g") / logged.length),
      fat: Math.round(sum("fat_g") / logged.length),
    },
  };
}

/* ------------------------------------------------------------ bodyweight */

export interface MonthWeight {
  month: string; // YYYY-MM
  avg: number;
  n: number;
  first: { date: ISODate; lb: number };
  last: { date: ISODate; lb: number };
}

/** Calendar-month weigh-in averages (oldest first). */
export function monthlyWeights(w: { local_date: ISODate; weight_lb: number }[]): MonthWeight[] {
  const by = new Map<string, { local_date: ISODate; weight_lb: number }[]>();
  for (const x of [...w].sort((a, b) => a.local_date.localeCompare(b.local_date))) {
    const k = x.local_date.slice(0, 7);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(x);
  }
  return [...by.entries()].map(([month, xs]) => ({
    month,
    avg: round(xs.reduce((a, b) => a + Number(b.weight_lb), 0) / xs.length, 1),
    n: xs.length,
    first: { date: xs[0].local_date, lb: Number(xs[0].weight_lb) },
    last: { date: xs.at(-1)!.local_date, lb: Number(xs.at(-1)!.weight_lb) },
  }));
}

/* -------------------------------------------------------------- recovery */

export interface CheckIn {
  local_date: ISODate;
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  stress: number | null;
  pain_notes: string | null;
}

type Metric = "sleep_hours" | "sleep_quality" | "energy" | "soreness" | "fatigue" | "stress";

export interface RecoverySummary {
  recent: CheckIn[]; // newest first
  avg: Partial<Record<Metric, number>>;
  counts: Partial<Record<Metric, number>>;
  pain: { date: ISODate; note: string }[];
}

/** The latest `n` check-ins with averages of whatever was filled in. Pain notes are surfaced, never summarised away. */
export function recoverySummary(logs: CheckIn[], n = 7): RecoverySummary {
  const recent = [...logs].sort((a, b) => b.local_date.localeCompare(a.local_date)).slice(0, n);
  const metrics: Metric[] = ["sleep_hours", "sleep_quality", "energy", "soreness", "fatigue", "stress"];
  const avg: RecoverySummary["avg"] = {};
  const counts: RecoverySummary["counts"] = {};
  for (const k of metrics) {
    const xs = recent.map((r) => num(r[k])).filter((x): x is number => x != null);
    counts[k] = xs.length;
    if (xs.length) avg[k] = round(xs.reduce((a, b) => a + b, 0) / xs.length, k === "sleep_hours" ? 2 : 1);
  }
  const pain = recent.filter((r) => r.pain_notes && r.pain_notes.trim()).map((r) => ({ date: r.local_date, note: r.pain_notes!.trim() }));
  return { recent, avg, counts, pain };
}

/* ---------------------------------------------------------- measurements */

export const MEASUREMENT_FIELDS = [
  { key: "biceps_flexed_in", label: "Flexed biceps", length: true },
  { key: "forearm_in", label: "Forearm", length: true },
  { key: "chest_in", label: "Chest", length: true },
  { key: "shoulders_in", label: "Shoulders", length: true },
  { key: "waist_in", label: "Waist", length: true },
  { key: "hips_in", label: "Hips", length: true },
  { key: "thigh_in", label: "Thigh", length: true },
  { key: "calf_in", label: "Calf", length: true },
  { key: "body_fat_pct", label: "Body-fat estimate", length: false },
] as const;

export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];
export type MeasurementRow = { local_date: ISODate } & Partial<Record<MeasurementKey, number | null>>;

export interface MeasurementChange {
  key: MeasurementKey;
  label: string;
  length: boolean;
  first: { date: ISODate; v: number };
  latest: { date: ISODate; v: number };
  change: number;
  entries: number;
}

/** First vs latest value of every field that has at least one entry. */
export function measurementChanges(rows: MeasurementRow[]): MeasurementChange[] {
  const sorted = [...rows].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const out: MeasurementChange[] = [];
  for (const f of MEASUREMENT_FIELDS) {
    const xs = sorted.filter((r) => num(r[f.key]) != null).map((r) => ({ date: r.local_date, v: Number(r[f.key]) }));
    if (!xs.length) continue;
    out.push({ key: f.key, label: f.label, length: f.length, first: xs[0], latest: xs.at(-1)!, change: round(xs.at(-1)!.v - xs[0].v, 2), entries: xs.length });
  }
  return out;
}

/* ------------------------------------------------------------------ misc */

/** Weeks between two dates, one decimal. */
export function weeksBetween(a: ISODate, b: ISODate) {
  return round(daysBetween(a, b) / 7, 1);
}

/** Signed number with a true minus: "+0.4", "−1.2", "0". */
export function signed(n: number, dp = 1) {
  const v = round(n, dp);
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`;
}
