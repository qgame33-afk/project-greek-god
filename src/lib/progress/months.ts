// Month-level aggregates: monthly weigh-in averages, the customisable roadmap, and
// month-to-month measurement snapshots. Pure and unit-tested.

import { DEFAULT_ROADMAP, plannedWeight, type WeighIn } from "@/lib/bodyweight";
import { addMonths, daysBetween, monthEnd, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import { round } from "@/lib/units";
import type { PlanInput } from "./plan";

/** "2026-10" */
export const monthKey = (d: ISODate) => d.slice(0, 7);

/** First-of-month dates from a's month to b's month, inclusive. */
export function monthsBetween(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let m = monthStart(a);
  const end = monthStart(b);
  while (m <= end && out.length < 240) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

/** Mean of the weigh-ins inside a month (to `upTo` when given). Null when none. */
export function monthlyAverage(weights: WeighIn[], month: ISODate, upTo?: ISODate): number | null {
  const s = monthStart(month);
  let e = monthEnd(month);
  if (upTo && upTo < e) e = upTo;
  const xs = weights.filter((w) => w.local_date >= s && w.local_date <= e).map((w) => Number(w.weight_lb));
  if (!xs.length) return null;
  return round(xs.reduce((a, b) => a + b, 0) / xs.length, 2);
}

/* ------------------------------------------------------------------ roadmap */

export interface RoadmapOverride {
  offset: number;
  title: string;
  detail: string;
}

/** Validate the profile.roadmap jsonb — anything malformed is ignored, never thrown. */
export function parseRoadmap(json: unknown): RoadmapOverride[] {
  if (!Array.isArray(json)) return [];
  const out: RoadmapOverride[] = [];
  for (const x of json) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const offset = Number(o.offset);
    if (!Number.isInteger(offset) || offset < 0 || offset > 240) continue;
    const title = typeof o.title === "string" ? o.title.slice(0, 80) : "";
    const detail = typeof o.detail === "string" ? o.detail.slice(0, 400) : "";
    if (!title && !detail) continue;
    out.push({ offset, title, detail });
  }
  return out;
}

/** Replace (or add) one override, keeping the list sorted by offset. */
export function upsertOverride(list: RoadmapOverride[], next: RoadmapOverride): RoadmapOverride[] {
  return [...list.filter((o) => o.offset !== next.offset), next].sort((a, b) => a.offset - b.offset);
}

export function removeOverride(list: RoadmapOverride[], offset: number): RoadmapOverride[] {
  return list.filter((o) => o.offset !== offset);
}

/**
 * The built-in milestone for a month index in a programme of `n` months. The spec's plan
 * runs October → August (11 months). The last month is always the final review and the
 * one before it the optional refine phase; the opening milestones follow in order, and
 * any extra months in a longer programme keep climbing.
 */
export function defaultMilestone(i: number, n: number): { title: string; detail: string } | null {
  const D = DEFAULT_ROADMAP;
  if (n <= 0 || i < 0 || i >= n) return null;
  if (n === 1) return D[10];
  if (i === n - 1) return D[10];
  if (i === n - 2 && n >= 3) return D[9];
  if (i <= 8) return D[i];
  return D[6]; // extra months in a longer plan: "Keep climbing"
}

export type MonthStatus = "past" | "current" | "future";

export interface RoadmapEntry {
  month: ISODate;
  offset: number;
  title: string;
  detail: string;
  custom: boolean;
  status: MonthStatus;
  /** Planned weight at the end of the month (lb). */
  plan: number | null;
  /** Mean of the month's weigh-ins (month-to-date for the current month), lb. */
  logged: number | null;
  /** Weigh-ins counted in `logged`. */
  loggedCount: number;
  /** 0–1: how much of the rail below this node is gold (time elapsed). */
  railFill: number;
}

export function roadmapMonths(opts: {
  plan: PlanInput;
  today: ISODate;
  overrides: RoadmapOverride[];
  weights: WeighIn[];
  /** Formats the start weight for the opening milestone ("Start at 163 lb."). */
  startLabel?: string;
}): RoadmapEntry[] {
  const { plan, today, overrides, weights, startLabel } = opts;
  const months = monthsBetween(plan.startDate, plan.targetDate);
  const n = months.length;
  const cur = monthStart(today);
  return months.map((month, i) => {
    const o = overrides.find((x) => x.offset === i);
    const d = defaultMilestone(i, n);
    let detail = o?.detail ?? d?.detail ?? "";
    if (!o && i === 0 && startLabel) detail = detail.replace(/163 lb/, startLabel);
    const status: MonthStatus = month < cur ? "past" : month === cur ? "current" : "future";
    const end = monthEnd(month);
    const planDate = end > plan.targetDate ? plan.targetDate : end;
    const s = monthStart(month);
    const inMonth = weights.filter((w) => w.local_date >= s && w.local_date <= (status === "current" ? today : end));
    let railFill = 0;
    if (status === "past") railFill = 1;
    else if (status === "current") railFill = Math.min(1, Math.max(0, (daysBetween(s, today) + 0.5) / (daysBetween(s, end) + 1)));
    return {
      month,
      offset: i,
      title: o?.title || d?.title || "",
      detail,
      custom: !!o,
      status,
      plan: round(plannedWeight(planDate, plan.startDate, plan.targetDate, plan.startLb, plan.goalLb), 1),
      logged: status === "future" ? null : monthlyAverage(weights, month, status === "current" ? today : undefined),
      loggedCount: status === "future" ? 0 : inMonth.length,
      railFill,
    };
  });
}

/** "YYYY-MM" for the Monthly Review route. */
export const reviewSlug = (month: ISODate) => monthKey(month);

/* ------------------------------------------------------------ measurements */

type MeasureRow = { local_date: ISODate } & Record<string, unknown>;

/** Months that contain at least one measurement entry, newest first. */
export function measurementMonths(rows: MeasureRow[]): ISODate[] {
  return [...new Set(rows.map((r) => monthStart(r.local_date)))].sort().reverse();
}

/** Latest non-null value of `field` within the month. */
export function monthSnapshot(rows: MeasureRow[], month: ISODate, field: string): { value: number; date: ISODate } | null {
  const s = monthStart(month);
  const e = monthEnd(month);
  const hits = rows
    .filter((r) => r.local_date >= s && r.local_date <= e && r[field] != null && Number.isFinite(Number(r[field])))
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const last = hits.at(-1);
  return last ? { value: Number(last[field]), date: last.local_date } : null;
}

export interface MonthCompareRow {
  field: string;
  a: { value: number; date: ISODate } | null;
  b: { value: number; date: ISODate } | null;
  /** b − a, null unless both exist. */
  diff: number | null;
}

export function compareMonths(rows: MeasureRow[], a: ISODate, b: ISODate, fields: string[]): MonthCompareRow[] {
  return fields.map((field) => {
    const va = monthSnapshot(rows, a, field);
    const vb = monthSnapshot(rows, b, field);
    return { field, a: va, b: vb, diff: va && vb ? round(vb.value - va.value, 2) : null };
  });
}

/** "OCTOBER" / "OCT 2026" style labels for month nodes and placards. */
export function monthUpper(d: ISODate, withYear = false) {
  const x = parseISODate(d);
  const m = x.toLocaleString("en-US", { month: "long" }).toUpperCase();
  return withYear ? `${m} ${x.getFullYear()}` : m;
}
