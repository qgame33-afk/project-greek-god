"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Macros } from "@/lib/meals/types";
import { gramsText, kcalText } from "../shared/format";
import { MACRO_DOT } from "../shared/MacroChips";
import type { DayGoals } from "./hooks";

/**
 * A planned-total meter. Plans are not eaten food, so the fill is hatched marble (never the
 * solid gold of logged intake); the goal sits at 100% and anything past it shows as a thin
 * overflow tick, never red.
 */
function PlanMeter({ value, goal, label }: { value: number; goal: number; label: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const p = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <div
      className="relative h-[6px] overflow-hidden rounded-full bg-[var(--track)]"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(goal)}
      aria-valuenow={Math.round(value)}
    >
      <div
        className="absolute inset-0 rounded-full bg-[repeating-linear-gradient(-45deg,rgb(230_225_214/.78)_0_3px,rgb(230_225_214/.5)_3px_6px)]"
        style={{ transform: `translateX(${((ready ? p : 0) - 1) * 100}%)`, transition: "transform 600ms var(--ease-gold)" }}
      />
    </div>
  );
}

/** Planned totals for one day against the goals, labelled "Planned — not eaten". */
export function DayTotals({ planned, goals, meals, className }: { planned: Macros | undefined; goals: DayGoals | null; meals: number; className?: string }) {
  const p = planned ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const kcalGoal = goals?.kcal ?? 0;
  const proteinGoal = goals?.protein ?? 0;
  const kcalDiff = kcalGoal > 0 ? Math.round(p.kcal - kcalGoal) : null;
  return (
    <section className={cn("card-instrument p-4 sm:p-5", className)} aria-labelledby="day-totals-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="day-totals-title" className="eyebrow">
          Planned — not eaten
        </h2>
        <span className="inline-flex h-5 items-center gap-1 rounded-[6px] border border-dashed border-[rgb(163_169_180/.5)] px-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-2">
          <span aria-hidden>≈</span>Estimate
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1">
        <div className="min-w-0">
          <p className="truncate whitespace-nowrap">
            <span className="num text-[28px] font-semibold leading-none text-fg">{meals ? kcalText(p.kcal) : "—"}</span>
            <span className="ml-1 text-[13px] font-semibold text-fg-2">{kcalGoal > 0 ? `/ ${kcalText(kcalGoal)} kcal` : "kcal"}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate whitespace-nowrap">
            <span className="num text-[28px] font-semibold leading-none text-fg">{meals ? gramsText(p.protein) : "—"}</span>
            <span className="ml-1 text-[13px] font-semibold text-fg-2">{proteinGoal > 0 ? `/ ${proteinGoal} g protein` : "g protein"}</span>
          </p>
        </div>
        <div className="mt-2">
          <PlanMeter value={p.kcal} goal={kcalGoal} label={`Planned ${kcalText(p.kcal)} of ${kcalText(kcalGoal)} kilocalories`} />
        </div>
        <div className="mt-2">
          <PlanMeter value={p.protein} goal={proteinGoal} label={`Planned ${gramsText(p.protein)} of ${proteinGoal} grams protein`} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", MACRO_DOT.carbs)} aria-hidden />
          Carbs <span className="num text-[13.5px] text-fg">{meals ? gramsText(p.carbs) : "—"}</span> g
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", MACRO_DOT.fat)} aria-hidden />
          Fat <span className="num text-[13.5px] text-fg">{meals ? gramsText(p.fat) : "—"}</span> g
        </span>
        {meals > 0 && kcalDiff != null && (
          <span className="ml-auto text-fg-3">{Math.abs(kcalDiff) < 25 ? "On target" : kcalDiff > 0 ? `+${kcalText(kcalDiff)} kcal over` : `${kcalText(-kcalDiff)} kcal under`}</span>
        )}
      </div>
    </section>
  );
}
