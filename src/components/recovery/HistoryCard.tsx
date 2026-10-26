"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useMissionDays } from "@/lib/data/daily";
import { addDays, addMonths, monthEnd, monthLabel, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import { cellKind, cellLabel, monthGrid, type CellKind } from "@/lib/recovery/heatmap";
import { Switcher } from "./parts";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Quiet white steps for part-done days; a white outline when every habit was done. Never colour alone. */
const CELL: Record<CellKind, string> = {
  pre: "text-fg-3",
  future: "text-fg-3",
  empty: "bg-card-2 text-fg-2",
  low: "bg-fg/10 text-fg-2",
  mid: "bg-fg/20 text-fg",
  high: "bg-fg/30 text-fg",
  full: "bg-card-2 text-fg shadow-[inset_0_0_0_1.5px_var(--text)]",
};

/**
 * Habits by month (Check-ins › Habits, docs/DESIGN-V3-SIMPLE.md §4.6): each day's share of habits
 * done as a calendar, a dot for a finished workout, and the month as counts — "X of Y habits done"
 * and "X of Y workouts", never a percentage or a streak. A day opens its habits above.
 */
export function HistoryCard({ today, startDate, onOpenDay, className }: { today: ISODate; startDate: ISODate | null; onOpenDay: (d: ISODate) => void; className?: string }) {
  const [month, setMonth] = useState(() => monthStart(today));
  const from = monthStart(month);
  const to = monthEnd(month);
  const { days, loading } = useMissionDays(from, to);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const totals = useMemo(() => {
    const counted = days.filter((d) => d.date <= today && (!startDate || d.date >= startDate));
    return {
      kept: counted.reduce((a, d) => a + d.done, 0),
      total: counted.reduce((a, d) => a + d.total, 0),
      sessions: counted.filter((d) => d.workoutDone).length,
      planned: counted.filter((d) => d.isTrainingDay && (d.date < today || d.workoutDone)).length,
    };
  }, [days, today, startDate]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const earliest = startDate ? monthStart(startDate) : monthStart(addDays(today, -365));
  const isCurrent = from === monthStart(today);

  return (
    <section aria-labelledby="rites-month-title" className={className}>
      <h3 className="t-section mb-2 mt-7">Habits by month</h3>
      <Switcher
        label={
          <span id="rites-month-title" className="t-row block">
            {monthLabel(month)}
          </span>
        }
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        prevDisabled={month <= earliest}
        nextDisabled={isCurrent}
        prevLabel="Previous month"
        nextLabel="Next month"
      />
      <p className="t-label mt-1 text-center tabular-nums">
        {loading ? (
          "—"
        ) : totals.total ? (
          <>
            <span className="text-fg">{totals.kept}</span> of {totals.total} habits done
            {totals.planned > 0 && (
              <>
                {" · "}
                <span className="text-fg">{totals.sessions}</span> of {totals.planned} workouts
              </>
            )}
          </>
        ) : (
          "No habits counted this month yet"
        )}
      </p>

      <div className="mt-4">
        <div className="t-cap grid grid-cols-7 text-center font-semibold" aria-hidden>
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="pb-1.5">
              {w}
            </span>
          ))}
        </div>
        {loading ? (
          <div className="grid grid-cols-7" aria-hidden>
            {grid.map((d, i) => (
              <div key={i} className="p-0.5">
                {d ? <Skeleton className="aspect-square w-full rounded-sm" /> : <div className="aspect-square" />}
              </div>
            ))}
          </div>
        ) : (
          <ol className="grid grid-cols-7" aria-label={`${monthLabel(month)}: habits done each day`}>
            {grid.map((d, i) => {
              if (!d) return <li key={i} aria-hidden className="aspect-square" />;
              const md = byDate.get(d);
              const kind = cellKind(md?.ratio ?? 0, d, today, startDate);
              const disabled = kind === "future" || kind === "pre";
              const isToday = d === today;
              return (
                <li key={d}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenDay(d)}
                    aria-label={cellLabel(d, kind, md?.done ?? 0, md?.total ?? 0, !!md?.workoutDone)}
                    className="press group block w-full p-0.5 disabled:pointer-events-none"
                  >
                    <span
                      className={cn(
                        "relative grid aspect-square min-h-10 w-full place-items-center rounded-sm",
                        CELL[kind],
                        isToday && "outline-[1.5px] outline-offset-1 outline-fg outline-solid",
                        !disabled && !isToday && "group-hover:ring-1 group-hover:ring-ui-line",
                      )}
                    >
                      <span className="t-label font-bold leading-none">{parseISODate(d).getDate()}</span>
                      {md?.workoutDone && <span className={cn("absolute bottom-[14%] size-1.5 rounded-full", kind === "full" ? "bg-fg" : "bg-fg-2")} aria-hidden />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="t-cap mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-hidden data-budget-group="">
        <span className="flex items-center gap-1.5">
          None
          {(["empty", "low", "mid", "high", "full"] as CellKind[]).map((k) => (
            <span key={k} className={cn("size-3.5 rounded-xs", CELL[k])} />
          ))}
          All done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-fg-2" /> Workout
        </span>
      </div>

    </section>
  );
}
