"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AutoBadge, OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useMissionDays, useStreak, type MissionDay } from "@/lib/data/daily";
import {
  addDays,
  addMonths,
  longDate,
  monthEnd,
  monthLabel,
  monthStart,
  parseISODate,
  type ISODate,
} from "@/lib/dates";
import { STREAK_THRESHOLD } from "@/lib/habits";
import {
  habitDisplayLabel,
  isOptionalHabit,
} from "@/lib/recovery/habits-edit";
import {
  cellKind,
  cellLabel,
  monthGrid,
  monthSummary,
  type CellKind,
} from "@/lib/recovery/heatmap";
import { cn } from "@/lib/cn";
import { MiniStat, StatusMark, Switcher } from "./parts";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const STREAK_LOOKBACK = 180;

const CELL: Record<CellKind, string> = {
  pre: "border border-line-hair bg-transparent text-fg-dis",
  future: "border border-line-hair bg-transparent text-fg-dis",
  empty: "bg-s3 text-fg-3",
  low: "bg-[rgb(213_172_103/.18)] text-fg-2",
  mid: "bg-[rgb(213_172_103/.35)] text-fg",
  high: "bg-[rgb(213_172_103/.5)] text-fg", // .5, not .55: ivory day numbers stay at AA (5:1) on it
  full: "bg-[image:var(--grad-leaf)] text-ink",
};

export function HistoryCard({
  today,
  startDate,
  onOpenDay,
  className,
  style,
}: {
  today: ISODate;
  startDate: ISODate | null;
  onOpenDay: (d: ISODate) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const from = monthStart(month);
  const to = monthEnd(month);
  const { days, loading } = useMissionDays(from, to);
  const streakFrom = useMemo(() => {
    const back = addDays(today, -STREAK_LOOKBACK);
    return startDate && startDate > back ? startDate : back;
  }, [today, startDate]);
  const { streak, loading: sLoading } = useStreak(today, streakFrom);
  const [open, setOpen] = useState<MissionDay | null>(null);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const summary = useMemo(
    () => monthSummary(days, today, startDate),
    [days, today, startDate],
  );
  const grid = useMemo(() => monthGrid(month), [month]);
  const earliest = startDate
    ? monthStart(startDate)
    : monthStart(addDays(today, -365));
  const isCurrent = from === monthStart(today);

  return (
    <section
      className={cn("card p-4 sm:p-5", className)}
      style={style}
      aria-labelledby="history-title"
    >
      <CardHeader
        title={<span id="history-title">Consistency</span>}
        className="mb-1"
      />
      <Switcher
        label={<span className="t-h3">{monthLabel(month)}</span>}
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        prevDisabled={month <= earliest}
        nextDisabled={isCurrent}
        prevLabel="Previous month"
        nextLabel="Next month"
      />

      <div className="mt-2 grid grid-cols-3 gap-2">
        <MiniStat
          label="Streak"
          value={sLoading ? "—" : streak}
          unit={!sLoading ? (streak === 1 ? "day" : "days") : undefined}
          caption="Days ≥ 60%"
          tone={!sLoading && streak > 0 ? "gold" : undefined}
        />
        <MiniStat
          label="Adherence"
          value={
            loading || summary.adherence == null
              ? "—"
              : Math.round(summary.adherence * 100)
          }
          unit={!loading && summary.adherence != null ? "%" : undefined}
          caption={
            summary.adherence == null
              ? "From tomorrow"
              : isCurrent
                ? "So far"
                : "Of missions"
          }
        />
        <MiniStat
          label="Workouts"
          value={loading ? "—" : summary.workoutsDone}
          unit={
            !loading && summary.workoutsPlanned
              ? `/ ${summary.workoutsPlanned}`
              : undefined
          }
          caption={summary.workoutsPlanned ? "Of planned" : "None yet"}
        />
      </div>

      <div className="mt-4">
        <div
          className="grid grid-cols-7 text-center text-[10.5px] font-bold tracking-[0.1em] text-fg-3"
          aria-hidden
        >
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="pb-1.5">
              {w}
            </span>
          ))}
        </div>
        {loading ? (
          <div className="grid grid-cols-7" aria-hidden>
            {grid.map((d, i) => (
              <div key={i} className="p-[3px]">
                {d ? (
                  <Skeleton className="aspect-square w-full rounded-[8px]" />
                ) : (
                  <div className="aspect-square" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <ol
            className="grid grid-cols-7"
            aria-label={`${monthLabel(month)} consistency calendar`}
          >
            {grid.map((d, i) => {
              if (!d)
                return <li key={i} aria-hidden className="aspect-square" />;
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
                    aria-label={cellLabel(
                      d,
                      kind,
                      md?.done ?? 0,
                      md?.total ?? 0,
                      !!md?.workoutDone,
                    )}
                    className="press group block w-full p-[3px] disabled:pointer-events-none"
                  >
                    <span
                      className={cn(
                        "relative grid aspect-square w-full place-items-center rounded-[8px]",
                        CELL[kind],
                        isToday &&
                          "outline outline-[1.5px] outline-offset-[1.5px] outline-gold-400",
                        !disabled &&
                          !isToday &&
                          "group-hover:ring-1 group-hover:ring-line-strong",
                      )}
                    >
                      <span className="num text-[13px] font-semibold leading-none">
                        {parseISODate(d).getDate()}
                      </span>
                      {md?.workoutDone && (
                        <span
                          className={cn(
                            "absolute bottom-[14%] size-[5px] rounded-full",
                            kind === "full" ? "bg-ink/70" : "bg-marble",
                          )}
                          aria-hidden
                        />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-semibold text-fg-3">
        <span className="flex items-center gap-1.5" aria-hidden>
          Less
          {(["empty", "low", "mid", "high", "full"] as CellKind[]).map((k) => (
            <span key={k} className={cn("size-3.5 rounded-[4px]", CELL[k])} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-[5px] rounded-full bg-marble" aria-hidden />{" "}
          Workout
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-3">
        A day counts toward your streak at {Math.round(STREAK_THRESHOLD * 100)}
        %+ of its missions. Today counts once it gets there.
      </p>

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

function DaySheet({
  day,
  onClose,
  onEdit,
}: {
  day: MissionDay | null;
  onClose: () => void;
  onEdit: (d: ISODate) => void;
}) {
  return (
    <Sheet
      open={!!day}
      onOpenChange={(o) => !o && onClose()}
      title={day ? longDate(day.date) : "Day"}
      description={
        day
          ? `${day.done} of ${day.total} missions · ${day.total ? Math.round(day.ratio * 100) : 0}%${day.ratio >= STREAK_THRESHOLD ? " · counts toward the streak" : ""}`
          : undefined
      }
      footer={
        day ? (
          <Button variant="secondary" block onClick={() => onEdit(day.date)}>
            Open this day
          </Button>
        ) : undefined
      }
    >
      {day && (
        <ul className="pb-2">
          {day.statuses.map((s) => (
            <li
              key={s.key}
              className="flex min-h-14 items-center gap-3 border-b border-line-hair last:border-0"
            >
              <StatusMark
                done={s.done}
                progress={s.progress}
                label={habitDisplayLabel(s.label)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-fg">
                    {habitDisplayLabel(s.label)}
                  </span>
                  {s.auto && <AutoBadge />}
                  {!s.auto && isOptionalHabit(s.key, s.label) && (
                    <OptionalBadge className="h-4 px-1 text-[9.5px]" />
                  )}
                </span>
                <span
                  className={cn(
                    "block truncate text-[12.5px]",
                    s.done ? "text-gold-300" : "text-fg-3",
                  )}
                >
                  {s.kind === "check" && !s.done ? "Not ticked" : s.caption}
                </span>
              </span>
            </li>
          ))}
          {!day.statuses.length && (
            <li className="py-6 text-center text-[13px] text-fg-3">
              No habits were switched on.
            </li>
          )}
        </ul>
      )}
    </Sheet>
  );
}
