// Geometry for the Ascent Scale: a horizontal ruler from the start weight to the goal
// (DESIGN §7.8). Values are in the display unit (lb or kg). Pure and unit-tested.

import { round } from "@/lib/units";

export interface ScaleInput {
  /** Drawable width in px. */
  width: number;
  start: number;
  goal: number;
  /** 7-day average (needle + gold fill). */
  avg: number | null;
  /** Planned weight for today (dashed needle). */
  plan: number | null;
  /** Horizontal padding so edge labels never clip. */
  pad?: number;
}

export interface ScaleTick {
  v: number;
  x: number;
  major: boolean;
  label: string | null;
}

export interface ScaleGeometry {
  lo: number;
  hi: number;
  /** True when the goal is below the start (left side is always the start). */
  reversed: boolean;
  /** Units between minor ticks. */
  step: number;
  /** Units between labelled ticks. */
  labelEvery: number;
  ticks: ScaleTick[];
  startX: number;
  goalX: number;
  avgX: number | null;
  planX: number | null;
  /** True when the average sits outside the start→goal span (needle pinned to an end). */
  avgOutside: boolean;
  x: (v: number) => number;
}

const MIN_TICK_PX = 6;
const MIN_LABEL_PX = 30;

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function scaleGeometry({ width, start, goal, avg, plan, pad = 14 }: ScaleInput): ScaleGeometry {
  const reversed = goal < start;
  const vals = [start, goal, avg, plan].filter(fin);
  let lo = Math.floor(Math.min(...vals));
  let hi = Math.ceil(Math.max(...vals));
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const inner = Math.max(1, width - pad * 2);
  const span = hi - lo;
  const x = (v: number) => {
    const t = (Math.min(hi, Math.max(lo, v)) - lo) / span;
    return round(pad + (reversed ? 1 - t : t) * inner, 2);
  };

  const pxPerUnit = inner / span;
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => s * pxPerUnit >= MIN_TICK_PX) ?? 100;
  let labelEvery = step === 1 ? 5 : step * 5;
  while (labelEvery * pxPerUnit < MIN_LABEL_PX) labelEvery *= 2;

  const ticks: ScaleTick[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const major = Math.abs(v % labelEvery) < 1e-9;
    ticks.push({ v, x: x(v), major, label: major ? String(v) : null });
  }

  const avgOutside = fin(avg) && (avg < Math.min(start, goal) || avg > Math.max(start, goal));
  return {
    lo,
    hi,
    reversed,
    step,
    labelEvery,
    ticks,
    startX: x(start),
    goalX: x(goal),
    avgX: fin(avg) ? x(avg) : null,
    planX: fin(plan) ? x(plan) : null,
    avgOutside,
    x,
  };
}

/** Fraction of the climb (0–1) for the gold fill — start → goal, clamped. */
export function climbFraction(value: number | null, start: number, goal: number) {
  if (value == null || goal === start) return 0;
  return Math.min(1, Math.max(0, (value - start) / (goal - start)));
}
