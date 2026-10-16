// The one source of truth for "how far up the climb am I": the hero TARGET %, the Gilded
// Bust and the fluted meter all read `p` from ascentProgress().

import { weightStats, type WeighIn } from "@/lib/bodyweight";
import { daysBetween, type ISODate } from "@/lib/dates";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export interface Ascent {
  /** Latest logged weigh-in, or null when nothing has been logged. */
  latest: number | null;
  latestDate: ISODate | null;
  /** 7-day average ending today (or at the last weigh-in when it's older than a week). */
  avg7: number | null;
  /** avg7 ?? latest — the number p is computed from. */
  trend: number | null;
  /** avg7 now vs one week earlier, lb. */
  weeklyChange: number | null;
  /** goal − trend (or goal − start before any weigh-in). */
  toGo: number | null;
  start: number | null;
  goal: number | null;
  /** 0–1, clamped. 0 when there is no weigh-in. */
  p: number;
  /** True once at least one weigh-in exists. */
  hasData: boolean;
  count: number;
}

/**
 * p = clamp(((avg7 ?? latest) − start) / (goal − start), 0, 1).
 * With no weigh-ins p is 0 and the start weight is reported as the start — never as a reading.
 */
export function ascentProgress(startLb: number | null | undefined, goalLb: number | null | undefined, weights: WeighIn[], ref: ISODate): Ascent {
  const start = startLb == null || !Number.isFinite(Number(startLb)) ? null : Number(startLb);
  const goal = goalLb == null || !Number.isFinite(Number(goalLb)) ? null : Number(goalLb);
  const valid = weights.filter((w) => Number.isFinite(Number(w.weight_lb)) && w.local_date <= ref);
  const s = weightStats(valid, start ?? 0, goal ?? 0, ref);
  const trend = s.avg7 ?? s.current;
  let p = 0;
  if (trend != null && start != null && goal != null) {
    p = goal === start ? 1 : clamp01((trend - start) / (goal - start));
  }
  return {
    latest: s.current,
    latestDate: s.currentDate,
    avg7: s.avg7,
    trend,
    weeklyChange: s.weeklyChange,
    toGo: goal == null ? null : trend != null ? round1(goal - trend) : start != null ? round1(goal - start) : null,
    start,
    goal,
    p,
    hasData: valid.length > 0,
    count: s.count,
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

/**
 * Delta colour follows the plan, not the sign (DESIGN §5.3): a weekly change between 0.5r
 * and 1.6r is success, above 2r is warning ("Faster than plan"), everything else is neutral.
 * Works for cutting plans too (r < 0) by comparing in the direction of the goal.
 */
export function trendTone(weeklyChange: number | null, r: number | null): TrendTone {
  if (weeklyChange == null || r == null || r === 0) return "neutral";
  const dir = Math.sign(r);
  const c = weeklyChange * dir;
  const rr = Math.abs(r);
  if (c > 2 * rr) return "warn";
  if (c >= 0.5 * rr && c <= 1.6 * rr) return "good";
  return "neutral";
}

/** Caption under the weekly weight trend. `planLabel` is the formatted plan rate ("+0.5 lb"). */
export function trendCaption(tone: TrendTone, weeklyChange: number | null, planLabel: string | null): string {
  if (weeklyChange == null) return "Needs 2 weeks of data";
  if (tone === "warn") return "Faster than plan";
  if (tone === "good") return "On plan";
  return planLabel ? `Plan ${planLabel}/wk` : "No plan rate set";
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
