"use client";

import Link from "next/link";
import { Tick } from "@/components/now/Tick";
import { Meter } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { dayLine } from "@/lib/fuel/consequence";
import type { MacroTotals } from "@/lib/fuel/timeline";
import { formatInt } from "@/lib/units";
import type { FuelGoals } from "./useFuelDay";
import { WaterRow } from "./WaterRow";
import type { ISODate } from "@/lib/dates";

const g = (n: number) => String(Math.round(Number.isFinite(n) ? n : 0));

/**
 * The top of Fuel → Today (docs/DESIGN-V2.md §3.5.1): protein is the lever, so it is the hero —
 * the Instrument dial over a leaf meter whose hatched extension is what is still planned (PLAN);
 * kcal on the right; carbs, fat and water as compact meters; then the day line (CALC). Protein
 * stays ivory until the goal is reached, then turns leaf. A failed load shows "—", never 0.
 */
export function FuelHero({
  eaten,
  remaining,
  remainingCount,
  missedCount,
  goals,
  unknown,
  isToday,
  date,
  today,
  waterMl,
  waterUnknown,
}: {
  eaten: MacroTotals;
  remaining: MacroTotals;
  remainingCount: number;
  missedCount: number;
  goals: FuelGoals | null;
  unknown: boolean;
  isToday: boolean;
  date: ISODate;
  today: ISODate;
  waterMl: number | null;
  waterUnknown: boolean;
}) {
  const pGoal = goals?.protein ?? 0;
  const kGoal = goals?.kcal ?? 0;
  const reached = !unknown && pGoal > 0 && eaten.protein >= pGoal;
  const ahead = isToday ? remaining : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const plannedNote = ahead.protein > 0 ? `, ${g(ahead.protein)} more planned` : "";

  return (
    <section aria-labelledby="fuel-protein" className="@container">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="fuel-protein" className="t-eyebrow">
            Protein
          </h2>
          <p className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap">
            <span className={cn("t-dial", reached ? "text-leaf-300" : "text-ivory")}>
              {unknown ? "—" : <Tick value={g(eaten.protein)} label={`${g(eaten.protein)} grams of protein`} />}
            </span>
            <span className="t-callout text-stone">/ {pGoal > 0 ? `${g(pGoal)} g` : "— g"}</span>
          </p>
        </div>
        <div className="shrink-0 pb-0.5 text-right">
          <p className="whitespace-nowrap">
            <span className="t-num-m text-ivory">{unknown ? "—" : <Tick value={formatInt(eaten.kcal)} label={`${formatInt(eaten.kcal)} calories`} />}</span>
            <span className="t-meta text-stone"> / {kGoal > 0 ? formatInt(kGoal) : "—"}</span>
          </p>
          <p className="t-eyebrow mt-1">kcal</p>
        </div>
      </div>

      <Meter
        className="mt-4"
        size="lg"
        tone="earned"
        value={unknown ? 0 : eaten.protein}
        target={pGoal}
        planned={unknown ? 0 : ahead.protein}
        label={unknown ? "Protein didn't load" : `Protein, ${g(eaten.protein)} of ${pGoal > 0 ? g(pGoal) : "no goal"} grams${plannedNote}`}
      />

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
        <MacroMeter label="Carbs" tone="carbs" value={eaten.carbs} planned={ahead.carbs} target={goals?.carbs ?? 0} unknown={unknown} />
        <MacroMeter label="Fat" tone="fat" value={eaten.fat} planned={ahead.fat} target={goals?.fat ?? 0} unknown={unknown} />
      </div>

      <WaterRow className="mt-4" date={date} today={today} goalMl={goals?.waterMl ?? 0} totalMl={waterMl} unknown={waterUnknown} />

      {!unknown && goals && (
        <DayLineRow isToday={isToday} eaten={eaten} remaining={remaining} remainingCount={remainingCount} missedCount={missedCount} goals={goals} />
      )}
      {!goals?.protein && !unknown && (
        <p className="t-meta mt-3 text-stone">
          No daily targets yet.{" "}
          <Link href="/settings" className="font-semibold text-ivory underline decoration-vein-3 underline-offset-4">
            Set them in Settings
          </Link>
        </p>
      )}
    </section>
  );
}

function MacroMeter({ label, tone, value, planned, target, unknown }: { label: string; tone: "carbs" | "fat"; value: number; planned: number; target: number; unknown: boolean }) {
  return (
    <div className="min-w-0">
      <p className="t-eyebrow">{label}</p>
      <p className="mt-1 whitespace-nowrap">
        <span className="t-num-s text-ivory">{unknown ? "—" : g(value)}</span>
        <span className="t-meta text-stone">{target > 0 ? ` / ${g(target)} g` : " g"}</span>
      </p>
      <Meter
        className="mt-2"
        size="sm"
        tone={tone}
        value={unknown ? 0 : value}
        target={target}
        planned={unknown ? 0 : planned}
        label={unknown ? `${label} didn't load` : `${label}, ${g(value)} of ${target > 0 ? g(target) : "no goal"} grams${planned > 0 ? `, ${g(planned)} more planned` : ""}`}
      />
    </div>
  );
}

/**
 * "Log the rest as planned and today lands at 3,485 kcal · 219 g" (CALC, the working on tap), or
 * "64 g to go · nothing else planned today". A past day says how many planned meals were not logged.
 */
function DayLineRow({
  isToday,
  eaten,
  remaining,
  remainingCount,
  missedCount,
  goals,
}: {
  isToday: boolean;
  eaten: MacroTotals;
  remaining: MacroTotals;
  remainingCount: number;
  missedCount: number;
  goals: FuelGoals;
}) {
  if (!isToday) {
    if (!missedCount) return null;
    return (
      <p className="t-callout mt-4 border-t border-vein pt-3.5 text-stone">
        {missedCount} planned {missedCount === 1 ? "meal" : "meals"} not logged that day
      </p>
    );
  }
  // the remaining planned meals as one addend each, so the working lists them
  const line = dayLine({ kcal: eaten.kcal, protein: eaten.protein }, remainingCount ? [remaining] : [], { protein: goals.protein });
  return (
    <p className="mt-4 flex items-start gap-2.5 border-t border-vein pt-3.5">
      <Tag kind="CALC" explain={line.explain} className="mt-0.5" />
      <span className="t-callout min-w-0 text-ivory">{line.text}</span>
    </p>
  );
}

export function FuelHeroSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-14 w-40" />
      <Skeleton className="mt-4 h-3 w-full rounded-full" />
      <div className="mt-5 grid grid-cols-2 gap-5">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="mt-4 h-12" />
    </div>
  );
}
