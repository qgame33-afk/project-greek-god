"use client";

import { useMemo, useState } from "react";
import { SealTick } from "@/components/art/icons";
import { cleanLabel, riteGlyph } from "@/components/now/Lower";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useMissionDays, type MissionDay } from "@/lib/data/daily";
import { addDays, addMonths, longDate, monthEnd, monthLabel, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import { cellKind, cellLabel, monthGrid, type CellKind } from "@/lib/recovery/heatmap";
import { Switcher } from "./parts";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Quiet ivory steps for part-kept days; leaf (outline, never a fill) only when every rite was kept. */
const CELL: Record<CellKind, string> = {
  pre: "text-disabled shadow-[inset_0_0_0_1px_var(--vein)]",
  future: "text-disabled shadow-[inset_0_0_0_1px_var(--vein)]",
  empty: "bg-m1 text-ash",
  low: "bg-ivory/10 text-stone",
  mid: "bg-ivory/20 text-ivory",
  high: "bg-ivory/30 text-ivory",
  full: "bg-m2 text-leaf-200 shadow-[inset_0_0_0_1.5px_var(--leaf-300)]",
};

/**
 * Rites by month (docs/DESIGN-V2.md §3.7, §4.6): each day's share of rites kept as a calendar,
 * a dot for a finished session, and the month as counts — "X of Y rites kept" and "X of Y
 * sessions", never a percentage or a streak. A day opens its rites and then that day's ledger.
 */
export function HistoryCard({ today, startDate, onOpenDay, className }: { today: ISODate; startDate: ISODate | null; onOpenDay: (d: ISODate) => void; className?: string }) {
  const [month, setMonth] = useState(() => monthStart(today));
  const from = monthStart(month);
  const to = monthEnd(month);
  const { days, loading } = useMissionDays(from, to);
  const [open, setOpen] = useState<MissionDay | null>(null);

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
      <p className="t-eyebrow">Rites by month</p>
      <Switcher
        className="mt-1"
        label={
          <h2 id="rites-month-title" className="t-title-2 text-ivory">
            {monthLabel(month)}
          </h2>
        }
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        prevDisabled={month <= earliest}
        nextDisabled={isCurrent}
        prevLabel="Previous month"
        nextLabel="Next month"
      />
      <p className="t-callout tnum mt-1 text-center text-stone">
        {loading ? (
          "—"
        ) : totals.total ? (
          <>
            <span className="text-ivory">{totals.kept}</span> of {totals.total} rites kept
            {totals.planned > 0 && (
              <>
                {" · "}
                <span className="text-ivory">{totals.sessions}</span> of {totals.planned} sessions
              </>
            )}
          </>
        ) : (
          "No rites counted this month yet"
        )}
      </p>

      <div className="mt-4">
        <div className="t-eyebrow grid grid-cols-7 text-center" aria-hidden>
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
          <ol className="grid grid-cols-7" aria-label={`${monthLabel(month)}: rites kept each day`}>
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
                    onClick={() => md && setOpen(md)}
                    aria-label={cellLabel(d, kind, md?.done ?? 0, md?.total ?? 0, !!md?.workoutDone)}
                    className="press group block w-full p-0.5 disabled:pointer-events-none"
                  >
                    <span
                      className={cn(
                        "relative grid aspect-square min-h-10 w-full place-items-center rounded-sm",
                        CELL[kind],
                        isToday && "outline-[1.5px] outline-offset-1 outline-ivory outline-solid",
                        !disabled && !isToday && "group-hover:ring-1 group-hover:ring-ui-line",
                      )}
                    >
                      <span className="t-num-s leading-none">{parseISODate(d).getDate()}</span>
                      {md?.workoutDone && <span className={cn("absolute bottom-[14%] size-1.5 rounded-full", kind === "full" ? "bg-leaf-300" : "bg-stone")} aria-hidden />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="t-meta mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-stone" aria-hidden>
        <span className="flex items-center gap-1.5">
          None
          {(["empty", "low", "mid", "high", "full"] as CellKind[]).map((k) => (
            <span key={k} className={cn("size-3.5 rounded-xs", CELL[k])} />
          ))}
          All kept
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-stone" /> Session
        </span>
      </div>

      <DaySheet
        day={open}
        onClose={() => setOpen(null)}
        onEdit={(d) => {
          setOpen(null);
          onOpenDay(d);
        }}
      />
    </section>
  );
}

function DaySheet({ day, onClose, onEdit }: { day: MissionDay | null; onClose: () => void; onEdit: (d: ISODate) => void }) {
  return (
    <Sheet
      open={!!day}
      onOpenChange={(o) => !o && onClose()}
      title={day ? longDate(day.date) : "Day"}
      description={day ? (day.total ? `${day.done} of ${day.total} rites kept` : "No rites were switched on") : undefined}
      footer={
        day ? (
          <Button variant="secondary" block onClick={() => onEdit(day.date)}>
            Open this day
          </Button>
        ) : undefined
      }
    >
      {day && day.statuses.length > 0 && (
        <ul className="divide-y divide-vein pb-2">
          {day.statuses.map((s) => (
            <li key={s.key} className="flex min-h-14 items-center gap-3">
              <span
                aria-hidden
                className={cn("grid size-9 shrink-0 place-items-center rounded-full", s.done ? "bg-(image:--leaf-v) text-ink" : "bg-m1 text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]")}
              >
                {s.done ? <SealTick className="size-4" /> : riteGlyph(s.key)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title-3 block truncate text-ivory">{cleanLabel(s.label)}</span>
                <span className={cn("t-meta block truncate", s.done ? "text-leaf-300" : "text-ash")}>
                  {s.kind === "check" && !s.done ? "Not kept" : s.caption}
                  <span className="sr-only">{s.done ? ", kept" : ", not kept"}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
