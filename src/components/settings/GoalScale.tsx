"use client";

import { cn } from "@/lib/cn";
import { formatPlacardWeight } from "@/lib/onboarding/plan";
import type { WeightUnit } from "@/lib/units";

/**
 * A horizontal scale from the start weight to the goal: the goal band is the corridor fill
 * with a 3:1 edge, the goal an ivory diamond (a plan, not yet earned), the start a stone dot. Tracks the steppers live; positions
 * update instantly because nothing should move while a value is being edited.
 */
export function GoalScale({
  startLb,
  goalLb,
  rangeMinLb,
  rangeMaxLb,
  unit,
  className,
}: {
  startLb: number;
  goalLb: number;
  rangeMinLb: number;
  rangeMaxLb: number;
  unit: WeightUnit;
  className?: string;
}) {
  const lo = Math.min(startLb, rangeMinLb, goalLb) - 3;
  const hi = Math.max(startLb, rangeMaxLb, goalLb) + 3;
  const span = Math.max(1, hi - lo);
  const pct = (v: number) => ((v - lo) / span) * 100;
  const bandL = pct(Math.min(rangeMinLb, rangeMaxLb));
  const bandW = Math.max(1.5, pct(Math.max(rangeMinLb, rangeMaxLb)) - bandL);
  const goalP = pct(goalLb);
  const startP = pct(startLb);
  const bandMid = bandL + bandW / 2;
  const f = (v: number) => formatPlacardWeight(v, unit);
  // When two labels would sit on top of each other, push them apart: the left one ends at its
  // mark, the right one starts at it.
  const apart = (p: number, other: number, gap: number) => (Math.abs(p - other) >= gap ? "-translate-x-1/2" : p <= other ? "-translate-x-full -ml-1" : "ml-1");
  return (
    <div className={cn("select-none", className)} aria-hidden>
      <div className="relative h-7">
        <span className={cn("absolute bottom-0 t-cap font-semibold text-fg-2", apart(startP, goalP, 22))} style={{ left: `${startP}%` }}>
          Start
        </span>
        <span className={cn("absolute bottom-0 t-cap font-semibold text-fg", apart(goalP, startP, 22))} style={{ left: `${goalP}%` }}>
          Goal
        </span>
      </div>
      <div className="relative mt-1.5 h-3 rounded-full bg-control">
        <div className={cn("absolute inset-y-0 rounded-full border border-ui-line bg-[rgb(242_235_221/.06)]")} style={{ left: `${bandL}%`, width: `${bandW}%` }} />
        <div
          className={cn("absolute inset-y-0 rounded-full bg-fg/25")}
          style={{ left: `${Math.min(startP, goalP)}%`, width: `${Math.abs(goalP - startP)}%` }}
        />
        <span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-2")} style={{ left: `${startP}%` }} />
        <span
          className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-xs bg-fg shadow-[0_0_0_3px_var(--night)]")}
          style={{ left: `${goalP}%` }}
        />
      </div>
      <div className="relative mt-2 h-4">
        <span className={cn("tabular-nums absolute t-cap font-semibold text-fg-2", apart(startP, bandMid, 34))} style={{ left: `${startP}%` }}>
          {f(startLb)}
        </span>
        <span className={cn("tabular-nums absolute t-cap font-semibold whitespace-nowrap text-fg", apart(bandMid, startP, 34))} style={{ left: `${bandMid}%` }}>
          {f(Math.min(rangeMinLb, rangeMaxLb))}–{f(Math.max(rangeMinLb, rangeMaxLb))} {unit}
        </span>
      </div>
    </div>
  );
}
