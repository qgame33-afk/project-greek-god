// Athletic testing: test definitions, personal records, squat relative to bodyweight and
// volleyball frequency. Values are stored in inches (heights/distances) and seconds
// (sprints). Nothing here predicts future results. Pure and unit-tested.

import { addDays, type ISODate } from "@/lib/dates";
import { round } from "@/lib/units";

export type TestType = "standing_vertical" | "approach_vertical" | "standing_reach" | "broad_jump" | "sprint";

export interface TestDef {
  key: TestType;
  label: string;
  short: string;
  kind: "length" | "time";
  /** Which direction is a record. Standing reach is a reference measurement, not a record. */
  better: "higher" | "lower" | null;
  how: string;
}

export const TESTS: TestDef[] = [
  { key: "standing_vertical", label: "Standing vertical", short: "Standing vert", kind: "length", better: "higher", how: "Feet set, no step. Best of 3 after a full warm-up." },
  { key: "approach_vertical", label: "Approach vertical", short: "Approach vert", kind: "length", better: "higher", how: "Your normal 3–4 step approach. Best of 3." },
  { key: "standing_reach", label: "Standing reach", short: "Reach", kind: "length", better: null, how: "Flat-footed, one arm straight up against the wall." },
  { key: "broad_jump", label: "Broad jump", short: "Broad jump", kind: "length", better: "higher", how: "Two feet to two feet, stick the landing. Measure to the heel." },
  { key: "sprint", label: "Sprint", short: "Sprint", kind: "time", better: "lower", how: "Same distance and start each time. Hand or app timing, noted." },
];

export const TEST_BY_KEY = Object.fromEntries(TESTS.map((t) => [t.key, t])) as Record<TestType, TestDef>;

export const isTestType = (v: unknown): v is TestType => TESTS.some((t) => t.key === v);

export interface TestRow {
  id: string;
  local_date: ISODate;
  test_type: string;
  value: number | string;
  sprint_distance_m?: number | string | null;
  created_at?: string;
}

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

/** Results for one test (one sprint distance when given), oldest first. */
export function testSeries<T extends TestRow>(rows: T[], type: TestType, distanceM?: number | null): T[] {
  return rows
    .filter((r) => r.test_type === type && (type !== "sprint" || distanceM == null || num(r.sprint_distance_m) === distanceM))
    .sort((a, b) => a.local_date.localeCompare(b.local_date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/** Best result: highest for jumps, fastest for a sprint distance; null for reference tests. */
export function testPR<T extends TestRow>(rows: T[], type: TestType, distanceM?: number | null): T | null {
  const def = TEST_BY_KEY[type];
  if (!def?.better) return null;
  const s = testSeries(rows, type, distanceM);
  let best: T | null = null;
  for (const r of s) {
    const v = Number(r.value);
    if (!best) best = r;
    else if (def.better === "higher" ? v > Number(best.value) : v < Number(best.value)) best = r;
  }
  return best;
}

/** IDs of results that set a new record when they were logged (first result is a benchmark, not a PR). */
export function prIds<T extends TestRow>(rows: T[], type: TestType, distanceM?: number | null): Set<string> {
  const def = TEST_BY_KEY[type];
  const out = new Set<string>();
  if (!def?.better) return out;
  let best: number | null = null;
  for (const r of testSeries(rows, type, distanceM)) {
    const v = Number(r.value);
    if (best != null && (def.better === "higher" ? v > best : v < best)) out.add(r.id);
    if (best == null || (def.better === "higher" ? v > best : v < best)) best = v;
  }
  return out;
}

/** Sprint distances that have results, most-used first. */
export function sprintDistances(rows: TestRow[]): number[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.test_type !== "sprint") continue;
    const d = num(r.sprint_distance_m);
    if (d == null || !Number.isFinite(d)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([d]) => d);
}

/** Back-squat estimated 1RM ÷ trend bodyweight, e.g. 1.42. Null when either is missing. */
export function squatToBodyweight(e1rmLb: number | null | undefined, bodyweightLb: number | null | undefined): number | null {
  if (!e1rmLb || !bodyweightLb || e1rmLb <= 0 || bodyweightLb <= 0) return null;
  return round(e1rmLb / bodyweightLb, 2);
}

/** Highest point reached: standing reach + vertical. */
export function touchHeight(reachIn: number | null | undefined, verticalIn: number | null | undefined): number | null {
  if (!reachIn || !verticalIn) return null;
  return round(reachIn + verticalIn, 2);
}

/**
 * @deprecated removed in P2 with the Hall's athletic section.
 * Volleyball sessions per week over the last `weeks` weeks (rolling 7-day windows that end
 * today), plus the per-week counts oldest first.
 */
export function volleyballFrequency(sessions: { local_date: ISODate }[], today: ISODate, weeks = 4) {
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = addDays(today, -7 * (weeks - 1 - i));
    const start = addDays(end, -6);
    return { start, end, count: 0 };
  });
  for (const s of sessions) {
    const b = buckets.find((x) => s.local_date >= x.start && s.local_date <= x.end);
    if (b) b.count += 1;
  }
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return { perWeek: round(total / weeks, 1), total, weeks: buckets };
}

/** 104 in → "8′8″" (broad jump reads naturally in feet). */
export function feetInches(inches: number) {
  let ft = Math.floor(inches / 12);
  let rest = round(inches - ft * 12, 1);
  if (rest >= 12) {
    ft += 1;
    rest = round(rest - 12, 1);
  }
  return `${ft}′${Number.isInteger(rest) ? rest : rest.toFixed(1)}″`;
}
