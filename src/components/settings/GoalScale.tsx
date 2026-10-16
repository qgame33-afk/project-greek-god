"use client";

import { cn } from "@/lib/cn";
import { formatPlacardWeight } from "@/lib/onboarding/plan";
import type { WeightUnit } from "@/lib/units";

/**
 * A horizontal scale from the start weight to the goal: the goal range is a gold-tint band,
 * the goal a gold diamond, the start a marble dot. Tracks the steppers live; positions
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
        <span className={cn("absolute bottom-0 text-[11px] font-bold tracking-[0.14em] text-fg-3 uppercase", apart(startP, goalP, 22))} style={{ left: `${startP}%` }}>
          Start
        </span>
        <span className={cn("absolute bottom-0 text-[11px] font-bold tracking-[0.14em] text-gold-300 uppercase", apart(goalP, startP, 22))} style={{ left: `${goalP}%` }}>
          Goal
        </span>
      </div>
      <div className="relative mt-1.5 h-3 rounded-full bg-[var(--track)]">
        <div className={cn("absolute inset-y-0 rounded-full border border-line-gold bg-gold-tint")} style={{ left: `${bandL}%`, width: `${bandW}%` }} />
        <div
          className={cn("absolute inset-y-0 rounded-full bg-[image:var(--grad-progress)] opacity-35")}
          style={{ left: `${Math.min(startP, goalP)}%`, width: `${Math.abs(goalP - startP)}%` }}
        />
        <span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-marble")} style={{ left: `${startP}%` }} />
        <span
          className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-gold-400 shadow-[0_0_0_3px_var(--bg)]")}
          style={{ left: `${goalP}%` }}
        />
      </div>
      <div className="relative mt-2 h-4">
        <span className={cn("num absolute text-[13px] font-semibold text-fg-2", apart(startP, bandMid, 34))} style={{ left: `${startP}%` }}>
          {f(startLb)}
        </span>
        <span className={cn("num absolute text-[13px] font-semibold whitespace-nowrap text-gold-300", apart(bandMid, startP, 34))} style={{ left: `${bandMid}%` }}>
          {f(Math.min(rangeMinLb, rangeMaxLb))}–{f(Math.max(rangeMinLb, rangeMaxLb))} {unit}
        </span>
      </div>
    </div>
  );
}
