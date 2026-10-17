// "How far up the climb am I": the hero TARGET %, the Gilded Bust and the fluted meter all
// read from ascentProgress(), which is built on the one trend in lib/progress/pace.ts.

import type { WeighIn } from "@/lib/bodyweight";
import { daysBetween, type ISODate } from "@/lib/dates";
import { gildFraction, MIN_WEIGHINS, trendAt, type Pace, type PaceVerdict } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export interface Ascent {
  /** Latest logged weigh-in, or null when nothing has been logged. */
  latest: number | null;
  latestDate: ISODate | null;
  /** The 7-day trend (pace.trendAt): ending today, or at the last weigh-in when that is older. */
  avg7: number | null;
  /** Weigh-ins inside the trend's window. */
  avgCount: number;
  /** Last day of that window: today, or the last weigh-in when it's more than a week old. */
  avgEnd: ISODate;
  /** The trend weight p is computed from (null only before the first weigh-in). */
  trend: number | null;
  /** goal − trend (or goal − start before any weigh-in). */
  toGo: number | null;
  start: number | null;
  goal: number | null;
  /** 0–1, clamped. 0 when there is no weigh-in. The climb, not the statue (see `gild`). */
  p: number;
  /** 0–1 statue gild: like p, but 0 until MIN_WEIGHINS (4) weigh-ins exist (pace.gildFraction). */
  gild: number;
  /** Weigh-ins still needed before the gilding begins (0 once it has). */
  weighInsToGild: number;
  /** True once at least one weigh-in exists. */
  hasData: boolean;
  count: number;
}

/**
 * p = clamp((trend − start) / (goal − start), 0, 1), with the trend from pace.trendAt.
 * With no weigh-ins p is 0 and the start weight is reported as the start — never as a reading.
 */
export function ascentProgress(startLb: number | null | undefined, goalLb: number | null | undefined, weights: WeighIn[], ref: ISODate): Ascent {
  const start = startLb == null || !Number.isFinite(Number(startLb)) ? null : Number(startLb);
  const goal = goalLb == null || !Number.isFinite(Number(goalLb)) ? null : Number(goalLb);
  const valid = weights.filter((w) => Number.isFinite(Number(w.weight_lb)) && Number(w.weight_lb) > 0 && w.local_date <= ref);
  const t = trendAt(valid, ref);
  const trend = t.lb;
  let p = 0;
  if (trend != null && start != null && goal != null) {
    p = goal === start ? 1 : clamp01((trend - start) / (goal - start));
  }
  const gild = start != null && goal != null ? gildFraction(trend, start, goal, valid.length) : 0;
  return {
    latest: t.latest?.lb ?? null,
    latestDate: t.latest?.date ?? null,
    avg7: trend,
    avgCount: t.n,
    avgEnd: t.end,
    trend,
    toGo: goal == null ? null : trend != null ? round1(goal - trend) : start != null ? round1(goal - start) : null,
    start,
    goal,
    p,
    gild,
    weighInsToGild: Math.max(0, MIN_WEIGHINS - valid.length),
    hasData: valid.length > 0,
    count: valid.length,
  };
}

/** Planned rate of gain, lb per week: (goal − start) ÷ programme weeks. */
export function planRatePerWeek(startLb: number | null, goalLb: number | null, startDate: ISODate, targetDate: ISODate): number | null {
  if (startLb == null || goalLb == null) return null;
  const weeks = daysBetween(startDate, targetDate) / 7;
  if (weeks <= 0) return null;
  return (goalLb - startLb) / weeks;
}

export type TrendTone = "good" | "warn" | "neutral";

/** The old screens' tone for a pace verdict: on pace or arrived reads good, faster than the corridor reads warn. */
export function paceTone(verdict: PaceVerdict): TrendTone {
  if (verdict === "on_pace" || verdict === "top" || verdict === "arrived") return "good";
  if (verdict === "above") return "warn";
  return "neutral";
}

/** A short caption for the rate on the old screens, from the pace verdict and rate status. */
export function paceCaption(p: Pick<Pace, "verdict" | "rate">): string {
  switch (p.verdict) {
    case "needs_data":
      if (p.rate.status === "needs_weighins") return `${p.rate.n} of 4 weigh-ins · last 4 weeks`;
      if (p.rate.status === "needs_span") return `Needs 10 days of weigh-ins`;
      return "Set a goal band";
    case "below":
      return "Under your corridor";
    case "on_pace":
      return "On pace · last 4 weeks";
    case "top":
      return "Top of your corridor";
    case "above":
      return "Faster than your corridor";
    case "arrived":
      return "Inside the goal band";
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// The bust engraving's base starts ~8% above the bottom of its box and its crown ends ~95%
// up (measured from the mask's alpha), so p maps onto the figure itself: p = 0 gilds
// nothing, a small p already gilds the shoulders, and p = 1 gilds the whole box.
const FIGURE_BASE = 0.08;
const FIGURE_TOP = 0.95;

/** Fill line (0–1 of the bust's box height) for ascent progress p. */
export function bustFillLine(p: number): number {
  const v = clamp01(p);
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return FIGURE_BASE + v * (FIGURE_TOP - FIGURE_BASE);
}

/** "163 → 183 lb", "73.9 → 83.0 kg": both ends of the climb to the same precision. */
export function rangePlaque(startLb: number, goalLb: number, unit: WeightUnit): string {
  const a = round(toDisplayWeight(startLb, unit), 1);
  const b = round(toDisplayWeight(goalLb, unit), 1);
  const whole = Number.isInteger(a) && Number.isInteger(b);
  const f = (v: number) => (whole ? String(v) : v.toFixed(1));
  return `${f(a)} → ${f(b)} ${unit}`;
}
