// Pure scheduling logic for the training week: the colonnade's day states, missed-workout
// detection, rescheduling moves, volleyball load advice and deload advice.
// No React, no Supabase: every function takes plain rows and returns plain data.

import { addDays, dayName, weekStart, type ISODate } from "@/lib/dates";

/** A template key ("push_a" …) or "rest". */
export type PlanKey = string;

/** What is planned on one date, already resolved (override first, else the weekly schedule). */
export interface PlanLike {
  date: ISODate;
  key: PlanKey;
  /** Template display name ("Pull A"); null on rest days. */
  name: string | null;
  /** True when a day_plans row exists for this date. */
  overridden: boolean;
  reason?: string | null;
  movedFrom?: ISODate | null;
}

export interface SessionLike {
  local_date: ISODate;
  status: string; // active | done | discarded
  template_key: string | null;
  name?: string | null;
}

export interface VolleyballLike {
  local_date: ISODate;
}

export interface RecoveryLike {
  local_date: ISODate;
  soreness: number | null;
  fatigue: number | null;
}

/* ------------------------------------------------------------ colonnade */

export interface ColonnadeDay {
  date: ISODate;
  kind: "train" | "rest";
  label: string;
  done: boolean;
  today: boolean;
  volleyball: boolean;
  missed?: boolean;
}

/**
 * The seven colonnade slots for `dates` (Mon → Sun).
 * - A day is a training column when something is planned or a workout was actually done.
 * - `done` = a completed session exists on that date.
 * - `missed` = a planned training day before today with no completed session (rendered quietly).
 */
export function weekDays({
  dates,
  plans,
  sessions,
  volleyball,
  today,
}: {
  dates: ISODate[];
  plans: PlanLike[];
  sessions: SessionLike[];
  volleyball: VolleyballLike[];
  today: ISODate;
}): ColonnadeDay[] {
  return dates.map((date) => {
    const plan = plans.find((p) => p.date === date);
    const doneSession = sessions.find((s) => s.local_date === date && s.status === "done");
    const planned = !!plan && plan.key !== "rest";
    const train = planned || !!doneSession;
    return {
      date,
      kind: train ? "train" : "rest",
      label: doneSession?.name ?? (planned ? (plan!.name ?? plan!.key) : "Rest"),
      done: !!doneSession,
      today: date === today,
      volleyball: volleyball.some((v) => v.local_date === date),
      missed: planned && !doneSession && date < today,
    };
  });
}

/** True when every training column in the week is done (and there is at least one). */
export function weekComplete(days: Pick<ColonnadeDay, "kind" | "done">[]): boolean {
  const train = days.filter((d) => d.kind === "train");
  return train.length > 0 && train.every((d) => d.done);
}

/* ------------------------------------------------------- missed workouts */

export interface MissedWorkout {
  date: ISODate;
  key: PlanKey;
  name: string;
}

/**
 * Planned training days in the `lookback` days before today that have no session and no
 * override. A plan counts as handled when:
 * - any session (done or in progress) exists on that date, or
 * - the same template was done or started later, up to today (done on another day), or
 * - the date has a day_plans override (moved, swapped, or marked rest — the user decided).
 * Days before `since` (e.g. the programme start date) are never flagged. Newest first.
 */
export function missedWorkouts({
  today,
  plans,
  sessions,
  since,
  lookback = 7,
}: {
  today: ISODate;
  plans: PlanLike[];
  sessions: SessionLike[];
  since?: ISODate | null;
  lookback?: number;
}): MissedWorkout[] {
  const live = sessions.filter((s) => s.status === "done" || s.status === "active");
  const out: MissedWorkout[] = [];
  for (let i = 1; i <= lookback; i++) {
    const date = addDays(today, -i);
    if (since && date < since) continue;
    const plan = plans.find((p) => p.date === date);
    if (!plan || plan.key === "rest" || plan.overridden) continue;
    if (live.some((s) => s.local_date === date)) continue;
    if (live.some((s) => s.template_key === plan.key && s.local_date > date && s.local_date <= today)) continue;
    out.push({ date, key: plan.key, name: plan.name ?? plan.key });
  }
  return out;
}

/* ------------------------------------------------------------ rescheduling */

export interface DayPlanWrite {
  plan_date: ISODate;
  template_key: PlanKey;
  reason: "rescheduled" | "swap" | "rest" | "custom";
  moved_from: ISODate | null;
}

export type MoveKind = "move" | "swap" | "replace";

export interface PlannedMove {
  kind: MoveKind;
  writes: DayPlanWrite[];
  /** The template that loses its day (replace only). */
  displaced: PlanKey | null;
}

/**
 * Move the workout planned on `from` to `to`. Both dates get a day_plans row with reason
 * "rescheduled":
 * - target is a rest day → move; `from` becomes rest.
 * - target has a workout and `from` is today or later → swap the two days.
 * - target has a workout and `from` is in the past (a missed day) → the moved workout
 *   replaces it; the past day is closed as rest. The replaced workout is reported, never
 *   silently re-placed.
 */
export function planMove({
  from,
  to,
  fromKey,
  toKey,
  today,
}: {
  from: ISODate;
  to: ISODate;
  fromKey: PlanKey;
  toKey: PlanKey;
  today: ISODate;
}): PlannedMove {
  if (from === to) throw new Error("Pick a different day.");
  if (fromKey === "rest") throw new Error("Nothing is planned on that day.");
  const moved: DayPlanWrite = { plan_date: to, template_key: fromKey, reason: "rescheduled", moved_from: from };
  if (toKey === "rest" || toKey === fromKey) {
    return {
      kind: "move",
      writes: [moved, { plan_date: from, template_key: "rest", reason: "rescheduled", moved_from: null }],
      displaced: null,
    };
  }
  if (from >= today) {
    return {
      kind: "swap",
      writes: [moved, { plan_date: from, template_key: toKey, reason: "rescheduled", moved_from: to }],
      displaced: null,
    };
  }
  return {
    kind: "replace",
    writes: [moved, { plan_date: from, template_key: "rest", reason: "rescheduled", moved_from: null }],
    displaced: toKey,
  };
}

export interface RescheduleOption {
  date: ISODate;
  key: PlanKey;
  name: string | null;
  kind: MoveKind;
  /** Free (rest) days, plus today and tomorrow when catching up on a missed workout. */
  recommended: boolean;
}

/**
 * Where the workout on `from` can go: today and the following `horizon − 1` days (never the
 * past, never `from` itself), each with what the move would do.
 */
export function rescheduleOptions({
  from,
  fromKey,
  today,
  plans,
  horizon = 7,
}: {
  from: ISODate;
  fromKey: PlanKey;
  today: ISODate;
  plans: PlanLike[];
  horizon?: number;
}): RescheduleOption[] {
  const out: RescheduleOption[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    if (date === from) continue;
    const p = plans.find((x) => x.date === date);
    const key = p?.key ?? "rest";
    const { kind } = planMove({ from, to: date, fromKey, toKey: key, today });
    const catchUp = from < today && i <= 1;
    out.push({ date, key, name: p?.name ?? null, kind, recommended: key === "rest" || catchUp });
  }
  return out;
}

/** One-line plain-English description of a move, for the confirm step and toasts. */
export function describeMove(m: PlannedMove, names: Record<string, string>, today: ISODate): string {
  const [moved, other] = m.writes;
  const n = (k: string) => names[k] ?? k;
  const day = (d: ISODate) => (d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : dayName(d));
  if (m.kind === "swap") return `${n(moved.template_key)} moves to ${day(moved.plan_date)} and ${n(other.template_key)} to ${day(other.plan_date)}.`;
  if (m.kind === "replace") return `${n(moved.template_key)} replaces ${n(m.displaced!)} ${day(moved.plan_date)}. ${n(m.displaced!)} is skipped unless you move it.`;
  return `${n(moved.template_key)} moves to ${day(moved.plan_date)}. ${other.plan_date < today ? "" : `${cap(day(other.plan_date))} becomes a rest day.`}`.trim();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------- volleyball */

export interface VolleyballAdvice {
  /** True when leg volume / plyometrics should be trimmed (a suggestion, never automatic). */
  heavy: boolean;
  reasons: string[];
}

/**
 * Recommend lighter leg work when on-court volume is high or recovery is down:
 * - ≥ 3 volleyball days in the last 7, or at least one more than the usual weekly count
 *   (and at least 2 — a single session never triggers it), or
 * - the latest check-in from the last 3 days rates soreness or fatigue 4/5 or higher.
 */
export function volleyballAdvice({
  load7d,
  perWeek,
  recovery,
  today,
}: {
  load7d: number;
  perWeek: number;
  recovery: RecoveryLike | null;
  today: ISODate;
}): VolleyballAdvice {
  const reasons: string[] = [];
  if (load7d >= 3 || (load7d >= 2 && load7d >= perWeek + 1)) {
    reasons.push(
      load7d >= perWeek + 1
        ? `${load7d} volleyball days in the last 7, above your usual ${perWeek} a week.`
        : `${load7d} volleyball days in the last 7.`,
    );
  }
  if (recovery && recovery.local_date >= addDays(today, -2) && recovery.local_date <= today) {
    const when = recovery.local_date === today ? "today" : dayName(recovery.local_date);
    const s = recovery.soreness ?? 0;
    const f = recovery.fatigue ?? 0;
    if (s >= 4 && f >= 4) reasons.push(`Soreness ${s}/5 and fatigue ${f}/5 at your check-in ${when === "today" ? "today" : `on ${when}`}.`);
    else if (s >= 4) reasons.push(`Soreness ${s}/5 at your check-in ${when === "today" ? "today" : `on ${when}`}.`);
    else if (f >= 4) reasons.push(`Fatigue ${f}/5 at your check-in ${when === "today" ? "today" : `on ${when}`}.`);
  }
  return { heavy: reasons.length > 0, reasons };
}

/** Latest check-in (by date) that rated soreness or fatigue at all. */
export function latestRecovery<T extends RecoveryLike>(logs: T[]): T | null {
  let best: T | null = null;
  for (const l of logs) {
    if (l.soreness == null && l.fatigue == null) continue;
    if (!best || l.local_date > best.local_date) best = l;
  }
  return best;
}

/* ----------------------------------------------------------------- deload */

export interface DeloadAdvice {
  suggest: boolean;
  /** Consecutive hard weeks (≥ 4 completed non-deload sessions), most recent first. */
  hardWeeks: number;
  reasons: string[];
}

/**
 * Suggest a deload after ~5–7 hard weeks in a row, or when fatigue check-ins stay high
 * (4/5 or more on at least 3 of the last 7 days). Never while already deloading.
 */
export function deloadAdvice({
  sessions,
  recovery,
  today,
  mode,
  hardWeekSessions = 4,
}: {
  sessions: (SessionLike & { mode?: string | null })[];
  recovery: RecoveryLike[];
  today: ISODate;
  mode: string;
  hardWeekSessions?: number;
}): DeloadAdvice {
  if (mode === "deload") return { suggest: false, hardWeeks: 0, reasons: [] };
  const done = sessions.filter((s) => s.status === "done");
  const byWeek = new Map<ISODate, { n: number; deload: boolean }>();
  for (const s of done) {
    const w = weekStart(s.local_date);
    const e = byWeek.get(w) ?? { n: 0, deload: false };
    e.n += 1;
    if (s.mode === "deload") e.deload = true;
    byWeek.set(w, e);
  }
  const current = weekStart(today);
  let hardWeeks = 0;
  // The current week counts once it is already hard; otherwise start from last week.
  const cur = byWeek.get(current);
  if (cur && !cur.deload && cur.n >= hardWeekSessions) hardWeeks++;
  else if (cur?.deload) return finish(0);
  for (let w = addDays(current, -7); ; w = addDays(w, -7)) {
    const e = byWeek.get(w);
    if (!e || e.deload || e.n < hardWeekSessions) break;
    hardWeeks++;
    if (hardWeeks > 52) break;
  }
  return finish(hardWeeks);

  function finish(hw: number): DeloadAdvice {
    const reasons: string[] = [];
    if (hw >= 5) reasons.push(`${hw} hard weeks in a row since your last lighter week.`);
    const recent = recovery.filter((r) => r.local_date > addDays(today, -7) && r.local_date <= today && r.fatigue != null);
    const high = recent.filter((r) => (r.fatigue ?? 0) >= 4).length;
    if (high >= 3) reasons.push(`Fatigue was 4/5 or higher on ${high} of your last ${recent.length} check-ins.`);
    return { suggest: reasons.length > 0, hardWeeks: hw, reasons };
  }
}

/* ---------------------------------------------------------------- history */

export interface WeekGroup<T> {
  weekStart: ISODate;
  items: T[];
}

/** Group rows by Monday-start week, newest week first; rows keep their incoming order. */
export function groupByWeek<T extends { local_date: ISODate }>(rows: T[]): WeekGroup<T>[] {
  const map = new Map<ISODate, T[]>();
  for (const r of rows) {
    const w = weekStart(r.local_date);
    if (!map.has(w)) map.set(w, []);
    map.get(w)!.push(r);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([weekStart, items]) => ({ weekStart, items }));
}

/* --------------------------------------------------------- weekly schedule */

export interface ScheduleIssues {
  /** Templates that appear on more than one weekday. */
  duplicates: PlanKey[];
  /** Templates not scheduled on any weekday. */
  missing: PlanKey[];
  trainingDays: number;
}

/** Check a weekday → template map ("0" = Sunday … "6" = Saturday). Duplicates are allowed. */
export function scheduleIssues(schedule: Record<string, PlanKey>, keys: PlanKey[]): ScheduleIssues {
  const counts = new Map<PlanKey, number>();
  let trainingDays = 0;
  for (let d = 0; d < 7; d++) {
    const k = schedule[String(d)] ?? "rest";
    if (k === "rest") continue;
    trainingDays++;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return {
    duplicates: keys.filter((k) => (counts.get(k) ?? 0) > 1),
    missing: keys.filter((k) => !counts.has(k)),
    trainingDays,
  };
}

/** Weekdays (JS numbers) a template is scheduled on, Monday first. */
export function weekdaysFor(schedule: Record<string, PlanKey>, key: PlanKey): number[] {
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => schedule[String(d)] === key);
}
