// Fuel card numbers: calories left (or over), ring ratios and captions.

import { formatInt } from "@/lib/units";

export interface KcalSummary {
  /** goal − eaten, never negative */
  left: number;
  /** eaten − goal when above target, else 0 */
  over: number;
  /** eaten ÷ goal (can exceed 1 — the ring draws the overflow arc) */
  ratio: number;
  /** Big centre number: "1,460" or "+120" */
  value: string;
  /** "KCAL LEFT" / "KCAL OVER" */
  label: string;
}

export function kcalSummary(eaten: number, goal: number): KcalSummary {
  const e = Math.max(0, Math.round(eaten));
  const g = Math.max(0, Math.round(goal));
  const over = Math.max(0, e - g);
  const left = Math.max(0, g - e);
  return {
    left,
    over,
    ratio: g > 0 ? e / g : 0,
    value: over > 0 ? `+${formatInt(over)}` : formatInt(left),
    label: over > 0 ? "KCAL OVER" : "KCAL LEFT",
  };
}

/** Ring ratio guarded against a zero goal. */
export function ratio(eaten: number, goal: number): number {
  return goal > 0 ? Math.max(0, eaten) / goal : 0;
}

/** "142 / 185 g" */
export function ofGoal(eaten: number, goal: number, unit: string): string {
  return `${formatInt(eaten)} / ${formatInt(goal)}${unit ? ` ${unit}` : ""}`;
}
