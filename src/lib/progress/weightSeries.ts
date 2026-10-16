// Chart series for the bodyweight chart: weigh-ins, the 7-day average, and the optional
// illustrative PLAN line. Values come out in the display unit. Pure and unit-tested.

import { avgWindow, plannedWeight, sortWeighIns, type WeighIn } from "@/lib/bodyweight";
import { addDays, daysBetween, parseISODate, type ISODate } from "@/lib/dates";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { PlanInput } from "./plan";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "ALL", days: null },
];

export function isRangeKey(v: unknown): v is RangeKey {
  return v === "7d" || v === "30d" || v === "90d" || v === "all";
}

/** First date shown for a range. ALL starts at the earliest of the first weigh-in and the plan start. */
export function rangeFrom(range: RangeKey, today: ISODate, firstDate: ISODate | null, planStart?: ISODate | null): ISODate {
  const r = RANGES.find((x) => x.key === range)!;
  if (r.days != null) return addDays(today, -(r.days - 1));
  const candidates = [firstDate, planStart].filter((d): d is ISODate => !!d && d <= today);
  return candidates.length ? candidates.sort()[0] : addDays(today, -29);
}

export interface WeightRow {
  date: ISODate;
  /** Local-noon epoch ms — the numeric x value. */
  t: number;
  weight: number | null;
  avg: number | null;
  plan: number | null;
  note: string | null;
}

export const dateToT = (d: ISODate) => parseISODate(d).getTime();

/**
 * Rows for every weigh-in in [from, to] plus the range ends (so the PLAN line spans the
 * window). The 7-day average uses all weigh-ins, so the first visible point still has
 * its trailing context. PLAN is only defined inside the programme window.
 */
export function buildWeightRows(
  weights: (WeighIn & { notes?: string | null })[],
  opts: { from: ISODate; to: ISODate; unit: WeightUnit; plan?: PlanInput | null },
): WeightRow[] {
  const all = sortWeighIns(weights);
  const { from, to, unit, plan } = opts;
  const disp = (lb: number | null) => (lb == null ? null : round(toDisplayWeight(lb, unit), 2));
  const planAt = (d: ISODate) =>
    plan && d >= plan.startDate && d <= plan.targetDate ? disp(plannedWeight(d, plan.startDate, plan.targetDate, plan.startLb, plan.goalLb)) : null;

  const rows: WeightRow[] = all
    .filter((w) => w.local_date >= from && w.local_date <= to)
    .map((w) => ({
      date: w.local_date,
      t: dateToT(w.local_date),
      weight: disp(Number(w.weight_lb)),
      avg: disp(avgWindow(all, w.local_date)),
      plan: planAt(w.local_date),
      note: w.notes ?? null,
    }));

  if (plan) {
    const have = new Set(rows.map((r) => r.date));
    // Anchor the plan line at the range ends and at the programme start inside the range.
    const anchors = [from, to, plan.startDate].filter((d) => d >= from && d <= to && !have.has(d));
    for (const d of new Set(anchors)) {
      const p = planAt(d);
      if (p != null) rows.push({ date: d, t: dateToT(d), weight: null, avg: null, plan: p, note: null });
    }
    rows.sort((a, b) => a.t - b.t);
  }
  return rows;
}

/** Y domain with a little air, rounded to whole units. */
export function yDomain(rows: WeightRow[], showPlan: boolean): [number, number] | null {
  const vals: number[] = [];
  for (const r of rows) {
    if (r.weight != null) vals.push(r.weight);
    if (r.avg != null) vals.push(r.avg);
    if (showPlan && r.plan != null) vals.push(r.plan);
  }
  if (!vals.length) return null;
  let lo = Math.floor(Math.min(...vals) - 0.6);
  let hi = Math.ceil(Math.max(...vals) + 0.6);
  if (hi - lo < 3) {
    const mid = (hi + lo) / 2;
    lo = Math.floor(mid - 1.5);
    hi = Math.ceil(mid + 1.5);
  }
  return [lo, hi];
}

/** Evenly spaced x ticks (epoch ms) for the range — at most `max`, always on whole days. */
export function xTicks(from: ISODate, to: ISODate, max = 5): number[] {
  const days = Math.max(0, daysBetween(from, to));
  if (days === 0) return [dateToT(from)];
  const n = Math.min(max, days + 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(dateToT(addDays(from, Math.round((days * i) / (n - 1)))));
  return [...new Set(out)];
}

/** "OCT 12" — chart tick label. */
export function tickLabel(t: number) {
  const d = new Date(t);
  return `${d.toLocaleString("en-US", { month: "short" }).toUpperCase()} ${d.getDate()}`;
}

/** Index of the row with a weigh-in closest to `index` (scrubbing lands on real data only). */
export function nearestWeighInIndex(rows: WeightRow[], index: number): number | null {
  if (!rows.length) return null;
  const i0 = Math.max(0, Math.min(rows.length - 1, Math.round(index)));
  for (let d = 0; d < rows.length; d++) {
    if (rows[i0 - d]?.weight != null) return i0 - d;
    if (rows[i0 + d]?.weight != null) return i0 + d;
  }
  return null;
}

/** The newest `n` weigh-ins (for the screen-reader table), newest first. */
export function lastWeighIns(rows: WeightRow[], n = 7) {
  return rows.filter((r) => r.weight != null).slice(-n).reverse();
}
