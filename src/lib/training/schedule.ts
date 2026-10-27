// Pure scheduling logic for the training week: the week's day states, missed-workout
// detection, rescheduling moves (and "rest today, shift the week"), and deload advice.
// No React, no Supabase: every function takes plain rows and returns plain data.

import { addDays, dayName, weekday, weekStart, type ISODate } from "@/lib/dates";

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

/** @deprecated nothing reads volleyball any more; removed in P2. */
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
  /** @deprecated always false (no volleyball); removed in P2. */
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
  today,
}: {
  dates: ISODate[];
  plans: PlanLike[];
  sessions: SessionLike[];
  /** @deprecated ignored. */
  volleyball?: VolleyballLike[];
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
      volleyball: false,
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
  /** Name of a different workout that was done that day instead, if any. */
  doneInstead?: string | null;
}

/**
 * Planned training days in the `lookback` days before today whose workout was not done.
 * A planned day counts as handled when:
 * - a session of that template (or a free-form session with no template) exists on the date, or
 * - the same template was done or started later, up to today (done on another day), or
 * - the same template was done earlier in that week on a day that planned something else
 *   (the user swapped days without telling the app), or
 * - the date was set to rest (the user decided to skip or rest).
 * Moved, swapped or kept training overrides are still plans: a workout moved to Thursday and
 * then skipped on Thursday is surfaced. Days before `since` are never flagged. Newest first.
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
  const planOn = (d: ISODate) => plans.find((p) => p.date === d);
  const out: MissedWorkout[] = [];
  for (let i = 1; i <= lookback; i++) {
    const date = addDays(today, -i);
    if (since && date < since) continue;
    const plan = planOn(date);
    if (!plan || plan.key === "rest") continue;
    const onDay = live.filter((s) => s.local_date === date);
    if (onDay.some((s) => s.template_key === plan.key || s.template_key == null)) continue;
    if (live.some((s) => s.template_key === plan.key && s.local_date > date && s.local_date <= today)) continue;
    const ws = weekStart(date);
    const doneEarlier = live.some((s) => s.template_key === plan.key && s.local_date >= ws && s.local_date < date && planOn(s.local_date)?.key !== plan.key);
    if (doneEarlier) continue;
    const instead = onDay.find((s) => s.template_key !== plan.key);
    out.push({ date, key: plan.key, name: plan.name ?? plan.key, doneInstead: instead ? (instead.name ?? null) : null });
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
  /** The source day is already used (past, or another workout was trained there). */
  closed?: boolean;
}

/**
 * Move the workout planned on `from` to `to`. Both dates get a day_plans row with reason
 * "rescheduled":
 * - target is a rest day → move; `from` becomes rest.
 * - target has a workout and `from` is today or later → swap the two days.
 * - target has a workout and `from` is in the past (a missed day) or `closed` (another workout
 *   was already trained there) → the moved workout replaces it; the source day is closed as
 *   rest. The replaced workout is reported, never silently re-placed.
 */
export function planMove({
  from,
  to,
  fromKey,
  toKey,
  today,
  closed = false,
}: {
  from: ISODate;
  to: ISODate;
  fromKey: PlanKey;
  toKey: PlanKey;
  today: ISODate;
  closed?: boolean;
}): PlannedMove {
  if (from === to) throw new Error("Pick a different day.");
  if (fromKey === "rest") throw new Error("Nothing is planned on that day.");
  const moved: DayPlanWrite = { plan_date: to, template_key: fromKey, reason: "rescheduled", moved_from: from };
  const isClosed = closed || from < today;
  if (toKey === "rest" || toKey === fromKey) {
    return {
      kind: "move",
      writes: [moved, { plan_date: from, template_key: "rest", reason: "rescheduled", moved_from: null }],
      displaced: null,
      closed: isClosed,
    };
  }
  if (!isClosed) {
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
    closed: true,
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
  closed = false,
}: {
  from: ISODate;
  fromKey: PlanKey;
  today: ISODate;
  plans: PlanLike[];
  horizon?: number;
  /** The source day is already used (see planMove). */
  closed?: boolean;
}): RescheduleOption[] {
  const out: RescheduleOption[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    if (date === from) continue;
    const p = plans.find((x) => x.date === date);
    const key = p?.key ?? "rest";
    const { kind } = planMove({ from, to: date, fromKey, toKey: key, today, closed });
    const catchUp = (from < today || closed) && i <= 1;
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
  return `${n(moved.template_key)} moves to ${day(moved.plan_date)}. ${m.closed || other.plan_date < today ? "" : `${cap(day(other.plan_date))} becomes a rest day.`}`.trim();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------- rest today (Q§10, §4.4) */

/**
 * "Rest today, shift the week": today becomes rest and every planned day up to the first rest
 * day within `horizon` days takes the day before it, so the week keeps its order and only the
 * rest day moves. `plans` are the resolved plans (override first) for today onwards. Returns []
 * when no rest day falls within the horizon (then only "skip it" is offered).
 */
export function shiftWeek({ from, plans, horizon = 7 }: { from: ISODate; plans: Pick<PlanLike, "date" | "key">[]; horizon?: number }): DayPlanWrite[] {
  const keyOn = (d: ISODate) => plans.find((p) => p.date === d)?.key ?? "rest";
  if (keyOn(from) === "rest") return [];
  let restAt: ISODate | null = null;
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(from, i);
    if (keyOn(d) === "rest") {
      restAt = d;
      break;
    }
  }
  if (!restAt) return [];
  const out: DayPlanWrite[] = [{ plan_date: from, template_key: "rest", reason: "rest", moved_from: null }];
  for (let d = addDays(from, 1); d <= restAt; d = addDays(d, 1)) {
    const prev = addDays(d, -1);
    out.push({ plan_date: d, template_key: keyOn(prev), reason: "rescheduled", moved_from: prev });
  }
  return out;
}

/** "Rest today, skip it": one write, today → rest. */
export function skipToday(from: ISODate): DayPlanWrite[] {
  return [{ plan_date: from, template_key: "rest", reason: "rest", moved_from: null }];
}

/* ------------------------------------------------------------- volleyball */

/** @deprecated only types the always-empty useTrainingWeek().vbAdvice; removed when the screens stop reading it. */
export interface VolleyballAdvice {
  /** True when leg volume / plyometrics should be trimmed (a suggestion, never automatic). */
  heavy: boolean;
  reasons: string[];
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
  historyFrom,
}: {
  sessions: (SessionLike & { mode?: string | null })[];
  recovery: RecoveryLike[];
  today: ISODate;
  mode: string;
  hardWeekSessions?: number;
  /** First date the `sessions` cover; a streak reaching it is reported as "at least". */
  historyFrom?: ISODate | null;
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
  else if (cur?.deload) return finish(0, "deload");
  let end: "deload" | "light" | "data" = "light";
  for (let w = addDays(current, -7); ; w = addDays(w, -7)) {
    if (historyFrom && w < weekStart(historyFrom)) {
      end = "data";
      break;
    }
    const e = byWeek.get(w);
    if (e?.deload) end = "deload";
    if (!e || e.deload || e.n < hardWeekSessions) break;
    hardWeeks++;
    if (hardWeeks > 52) break;
  }
  return finish(hardWeeks, end);

  function finish(hw: number, end: "deload" | "light" | "data"): DeloadAdvice {
    const reasons: string[] = [];
    if (hw >= 5)
      reasons.push(
        end === "data" ? `At least ${hw} hard weeks in a row.` : end === "deload" ? `${hw} hard weeks in a row since your last light week.` : `${hw} hard weeks in a row.`,
      );
    const recent = recovery.filter((r) => r.local_date > addDays(today, -7) && r.local_date <= today && r.fatigue != null);
    const high = recent.filter((r) => (r.fatigue ?? 0) >= 4).length;
    if (high >= 3) reasons.push(`Tiredness was 4/5 or higher on ${high} of your last ${recent.length} check-ins.`);
    return { suggest: reasons.length > 0, hardWeeks: hw, reasons };
  }
}

/* ------------------------------------------------------- plan bookkeeping */

export interface DayPlanRowLike {
  plan_date: ISODate;
  template_key: PlanKey;
  reason: string | null;
  moved_from: ISODate | null;
}

/**
 * Other dates written by the same reschedule as `date`, so resetting one side never orphans
 * the other: the source of a move into `date`, and any day moved here from `date`.
 */
export function linkedMoveDates(date: ISODate, rows: DayPlanRowLike[]): ISODate[] {
  const out = new Set<ISODate>();
  const own = rows.find((r) => r.plan_date === date);
  if (own?.reason === "rescheduled" && own.moved_from) {
    const src = rows.find((r) => r.plan_date === own.moved_from);
    if (src && src.reason === "rescheduled" && (src.moved_from == null || src.moved_from === date)) out.add(src.plan_date);
  }
  for (const r of rows) if (r.reason === "rescheduled" && r.moved_from === date && r.plan_date !== date) out.add(r.plan_date);
  out.delete(date);
  return [...out].sort();
}

/**
 * When the weekly schedule changes, keep the recent past as it was planned: one "custom"
 * day_plans row for each past date in [from, today) with no override whose old weekday plan
 * differs from the new one. Without this, a new schedule would invent missed workouts for
 * days that were rest days at the time. With `trainedToday` (a workout was started or
 * finished today) today keeps its plan too, so a finished workout never sits on a day that
 * now says something else (§1.1).
 */
export function scheduleFreeze({
  from,
  today,
  oldSchedule,
  newSchedule,
  overridden,
  trainedToday = false,
}: {
  from: ISODate;
  today: ISODate;
  oldSchedule: Record<string, PlanKey>;
  newSchedule: Record<string, PlanKey>;
  /** Dates that already have a day_plans row. */
  overridden: ISODate[];
  trainedToday?: boolean;
}): DayPlanWrite[] {
  const out: DayPlanWrite[] = [];
  for (let d = from; trainedToday ? d <= today : d < today; d = addDays(d, 1)) {
    if (overridden.includes(d)) continue;
    const wd = String(weekday(d));
    const before = oldSchedule[wd] ?? "rest";
    const after = newSchedule[wd] ?? "rest";
    if (before !== after) out.push({ plan_date: d, template_key: before, reason: "custom", moved_from: null });
  }
  return out;
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
