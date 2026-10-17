// The Hall (docs/DESIGN-V2.md §3.6.2): records as plaques, the main lifts first → latest, and
// the athletic tests. Everything here is read from logged sets and tests through the existing
// strength and athletic helpers (summarizeLift, testSeries, testPR, prIds); a record is a set
// that beat every earlier e1RM by the one record margin (lib/workout/pr). Pure.

import { addDays, type ISODate } from "@/lib/dates";
import { TEST_BY_KEY, prIds, sprintDistances, testPR, testSeries, type TestRow, type TestType } from "./athletic";
import { TRACKED_LIFTS, metricMode, otherExercises, sessionMetric, setE1rm, type LiftSummary, type StrengthSet } from "./strength";

export interface HallLift {
  key: string;
  name: string;
  sets: StrengthSet[];
  tracked: boolean;
  /** Load is added to bodyweight (pull-ups): an e1RM of the added load would mislead. */
  bodyweight: boolean;
  /** Load is per dumbbell. */
  perHand: boolean;
}

/** The tracked lifts (always listed, logged or not) followed by everything else he has logged. */
export function hallLifts(sets: StrengthSet[]): HallLift[] {
  const tracked = TRACKED_LIFTS.map((l) => ({
    key: l.key,
    name: l.name,
    sets: sets.filter((s) => l.slugs.includes(s.exercise_slug)),
    tracked: true,
    bodyweight: !!l.bodyweight,
    perHand: !!l.perHand,
  }));
  const others = otherExercises(sets).map((o) => ({ key: o.slug, name: o.name, sets: o.sets, tracked: false, bodyweight: false, perHand: false }));
  return [...tracked, ...others];
}

export interface RecordEntry {
  liftKey: string;
  name: string;
  date: ISODate;
  /** The set that set the record. */
  set: StrengthSet;
  /** Its e1RM (Epley, lb). */
  e1rm: number;
  /** e1RM gain over the best before it (lb). */
  gain: number | null;
  /** The best e1RM it beat (lb). */
  previous: number | null;
  bodyweight: boolean;
  perHand: boolean;
}

/** Every record ever set, newest first (ties: the bigger e1RM first). */
export function allRecords(lifts: HallLift[], summaries: Map<string, LiftSummary>): RecordEntry[] {
  const out: RecordEntry[] = [];
  for (const l of lifts) {
    const s = summaries.get(l.key);
    if (!s) continue;
    for (const x of s.sessions) {
      if (!x.pr || !x.prSet) continue;
      const e = setE1rm(x.prSet);
      if (e == null) continue;
      out.push({
        liftKey: l.key,
        name: l.name,
        date: x.date,
        set: x.prSet,
        e1rm: e,
        gain: x.prGain,
        previous: x.prGain != null && x.bestE1rm != null ? Math.round((x.bestE1rm - x.prGain) * 10) / 10 : null,
        bodyweight: l.bodyweight,
        perHand: l.perHand,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.e1rm - a.e1rm);
}

/** The standing record of each lift (its latest), newest first. */
export function standingRecords(records: RecordEntry[]): RecordEntry[] {
  const seen = new Set<string>();
  return records.filter((r) => (seen.has(r.liftKey) ? false : (seen.add(r.liftKey), true)));
}

/** Records set in [from, to]. */
export const recordsBetween = (records: RecordEntry[], from: ISODate, to: ISODate) => records.filter((r) => r.date >= from && r.date <= to);

/** Records in the 30 days ending today. */
export const recentRecords = (records: RecordEntry[], today: ISODate) => recordsBetween(records, addDays(today, -29), today);

export interface FirstLatest {
  mode: "e1rm" | "load" | "reps";
  first: { value: number; date: ISODate };
  latest: { value: number; date: ISODate };
  /** latest − first, in the metric's unit (lb, or reps). */
  change: number;
  /** One value per session, oldest first (for the sparkline). */
  values: number[];
}

/**
 * The lift's line on the Hall: its first logged session → its latest, in the metric that
 * describes it (e1RM; added load or reps for bodyweight lifts). Null until a session exists.
 */
export function firstLatest(s: LiftSummary, opts: { bodyweight?: boolean } = {}): FirstLatest | null {
  const mode = metricMode(s, opts);
  const pts = s.sessions.map((x) => ({ date: x.date, v: sessionMetric(x, mode) })).filter((p): p is { date: ISODate; v: number } => p.v != null);
  if (!pts.length) return null;
  const first = pts[0];
  const latest = pts.at(-1)!;
  return {
    mode,
    first: { value: first.v, date: first.date },
    latest: { value: latest.v, date: latest.date },
    change: Math.round((latest.v - first.v) * 10) / 10,
    values: pts.map((p) => p.v),
  };
}

/* --------------------------------------------------------------- athletic */

export interface TestLine<T extends TestRow = TestRow> {
  type: TestType;
  label: string;
  /** The sprint distance shown (the most-used one), else null. */
  distance: number | null;
  series: T[];
  latest: T | null;
  best: T | null;
  /** The latest result is the record (and there was an earlier one to beat). */
  latestIsRecord: boolean;
  /** latest − first in the stored unit (in or s); null with one result. */
  change: number | null;
  /** The change is an improvement (higher jump, faster sprint). */
  improved: boolean;
  first: T | null;
  /** Results that set a record when logged (the first result is a benchmark, not a record). */
  recordIds: Set<string>;
}

/** One athletic test, summarised from logged results only. Nothing predicted. */
export function testLine<T extends TestRow>(rows: T[], type: TestType): TestLine<T> {
  const def = TEST_BY_KEY[type];
  const distance = type === "sprint" ? (sprintDistances(rows)[0] ?? null) : null;
  const series = testSeries(rows, type, distance);
  const latest = series.at(-1) ?? null;
  const first = series[0] ?? null;
  const best = testPR(rows, type, distance);
  const records = prIds(rows, type, distance);
  const change = latest && first && latest !== first ? Math.round((Number(latest.value) - Number(first.value)) * 100) / 100 : null;
  const improved = change == null || !def.better ? false : def.better === "higher" ? change > 0 : change < 0;
  return {
    type,
    label: def.label,
    distance,
    series,
    latest,
    best,
    latestIsRecord: !!latest && series.length > 1 && records.has(latest.id),
    change,
    improved,
    first,
    recordIds: records,
  };
}
