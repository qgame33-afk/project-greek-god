"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { useDailyNutrition } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { addDays, longDate, type ISODate } from "@/lib/dates";
import { buildWeek } from "@/lib/nutrition-ui/week";
import { formatInt } from "@/lib/units";
import type { Goals } from "./context";

const SCALE = 1.25; // bar area shows up to 125% of target; the dashed line marks 100%

/** Last 7 days of real intake vs target, ending on the viewed day. Tap a day to open it. */
export function WeekStrip({ date, today, goals, onPick }: { date: ISODate; today: ISODate; goals: Goals; onPick: (d: ISODate) => void }) {
  const q = useDailyNutrition(addDays(date, -6), date);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  if (q.isLoading) {
    return (
      <section className="card-instrument p-4 sm:p-5" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-[96px] w-full" />
      </section>
    );
  }

  const w = buildWeek(q.data ?? [], date, today, { calories: goals.calories, protein: goals.protein });
  const linePct = (1 / SCALE) * 100;

  return (
    <section className="card-instrument p-4 sm:p-5" aria-labelledby="week-title">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="week-title" className="eyebrow">
          {date === today ? "Last 7 days" : `7 days to ${longDate(date).split(", ")[1]}`}
        </h2>
        <p className="text-[12.5px] font-semibold text-fg-2">
          {w.avgKcal == null ? (
            "No food logged"
          ) : (
            <>
              Avg <span className="num text-[15px] text-fg">{formatInt(w.avgKcal)}</span> kcal
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {w.days.map((d) => {
          const fill = Math.min(d.pct / SCALE, 1);
          const selected = d.date === date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              aria-current={selected ? "date" : undefined}
              aria-label={`${longDate(d.date)}: ${d.logged ? `${formatInt(d.kcal)} kcal, protein ${formatInt(d.protein)} grams${d.proteinHit ? ", protein goal met" : ""}` : "nothing logged"}`}
              className="press group flex flex-col items-center"
            >
              <span
                className={cn(
                  "relative block h-[76px] w-full overflow-hidden rounded-[10px] bg-white/[.03] transition-colors",
                  selected ? "ring-1 ring-line-gold" : "group-hover:bg-white/[.05]",
                )}
              >
                <span className="absolute inset-x-1 border-t border-dashed border-gold-700" style={{ bottom: `${linePct}%` }} aria-hidden />
                {d.logged && (
                  <span
                    className={cn(
                      "absolute inset-x-[22%] bottom-0 h-full rounded-t-[5px]",
                      d.calorieHit ? "bg-[linear-gradient(0deg,#A97E40_0%,#D5AC67_55%,#F3DDA8_100%)]" : "bg-white/[.18]",
                    )}
                    style={{
                      transform: `translateY(${ready ? (1 - fill) * 100 : 100}%)`,
                      transition: "transform 600ms var(--ease-gold)",
                    }}
                    aria-hidden
                  />
                )}
              </span>
              <span className={cn("mt-1.5 text-[11px] font-bold tracking-[0.08em]", selected ? "text-fg" : d.isToday ? "text-gold-300" : "text-fg-3")}>{d.letter}</span>
              <span
                className={cn(
                  "mt-1 size-1.5 rounded-full",
                  d.proteinHit ? "bg-marble" : d.logged ? "ring-1 ring-inset ring-fg-3/60" : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-marble" aria-hidden />
          Protein goal hit {w.proteinHits} of 7
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-gold-600" aria-hidden />
          {formatInt(goals.calories)} kcal target
        </span>
      </div>
    </section>
  );
}
