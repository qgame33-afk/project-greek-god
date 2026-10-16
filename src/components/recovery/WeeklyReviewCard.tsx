"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { EmptyArt } from "@/components/art/Motifs";
import { SuggestedBadge } from "@/components/ui/badge";
import { CardHeader } from "@/components/ui/card";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useProfile } from "@/lib/data/profile";
import {
  addDays,
  monthName,
  parseISODate,
  weekStart,
  type ISODate,
} from "@/lib/dates";
import { formatHours } from "@/lib/recovery/checkin";
import { DISCLAIMER } from "@/lib/recovery/guidance";
import { useWeeklyReview } from "@/lib/recovery/hooks";
import type { WeeklyReview } from "@/lib/recovery/weekly";
import { formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import { MiniStat, Switcher, TrendNote } from "./parts";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function rangeLabel(ws: ISODate) {
  const we = addDays(ws, 6);
  const a = parseISODate(ws);
  const b = parseISODate(we);
  return a.getMonth() === b.getMonth()
    ? `${monthName(ws, true)} ${a.getDate()} – ${b.getDate()}`
    : `${monthName(ws, true)} ${a.getDate()} – ${monthName(we, true)} ${b.getDate()}`;
}

export function WeeklyReviewCard({
  today,
  startDate,
  className,
  style,
}: {
  today: ISODate;
  startDate: ISODate | null;
  className?: string;
  style?: CSSProperties;
}) {
  const current = weekStart(today);
  const [ws, setWs] = useState(current);
  const { review, loading, error, refetch } = useWeeklyReview(ws, today);
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const earliest = startDate ? weekStart(startDate) : addDays(current, -7 * 52);

  return (
    <section
      className={cn("card p-4 sm:p-5", className)}
      style={style}
      aria-labelledby="weekly-title"
    >
      <CardHeader
        title={<span id="weekly-title">Weekly review</span>}
        className="mb-1"
      />
      <Switcher
        label={
          <span className="block">
            <span className="t-h3 block">
              {ws === current
                ? "This week"
                : ws === addDays(current, -7)
                  ? "Last week"
                  : rangeLabel(ws)}
            </span>
            <span className="block text-[12px] font-medium text-fg-3">
              {rangeLabel(ws)}
              {review?.inProgress ? ` · day ${review.daysElapsed} of 7` : ""}
            </span>
          </span>
        }
        onPrev={() => setWs(addDays(ws, -7))}
        onNext={() => setWs(addDays(ws, 7))}
        prevDisabled={ws <= earliest}
        nextDisabled={ws >= current}
        prevLabel="Previous week"
        nextLabel="Next week"
      />

      {loading && !review ? (
        <div className="mt-3 space-y-3" aria-hidden>
          <Skeleton className="h-[148px] w-full" />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))}
          </div>
        </div>
      ) : error && !review ? (
        <ErrorNote className="mt-3" onRetry={refetch}>
          Couldn&apos;t load this week.
        </ErrorNote>
      ) : review?.empty ? (
        <Empty
          className="mt-3"
          art={<EmptyArt kind="plinth" size={56} />}
          title="Nothing logged this week"
        >
          Morning check-ins, finished sessions and volleyball fill this in.
          Nothing here is estimated.
        </Empty>
      ) : review ? (
        <ReviewBody r={review} unit={unit} />
      ) : null}
    </section>
  );
}

function ReviewBody({ r, unit }: { r: WeeklyReview; unit: WeightUnit }) {
  const { sleep, training } = r;
  const sleepDelta =
    sleep.avg != null && sleep.prevAvg != null
      ? Math.round((sleep.avg - sleep.prevAvg) * 4) / 4
      : null;
  const vol = Math.round(toDisplayWeight(training.volumeLb, unit));
  return (
    <div className="mt-3">
      {/* sleep */}
      <div className="card-inset p-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-[10px]">Average sleep</p>
            <p className="num-lg mt-1.5">
              {sleep.avg == null
                ? "—"
                : formatHours(Math.round(sleep.avg * 4) / 4)}
              {sleep.avg != null && <span className="unit">h</span>}
            </p>
          </div>
          <div className="min-w-0 pb-0.5 text-right text-[12px] font-medium text-fg-3">
            <p>
              {sleep.nights} of {r.daysElapsed || 7}{" "}
              {(r.daysElapsed || 7) === 1 ? "night" : "nights"} logged
            </p>
            <p>
              {sleep.nightsAtGoal} at {formatHours(sleep.goal)} h goal
            </p>
          </div>
        </div>
        <p className="mt-1 text-[12px] font-semibold text-fg-2">
          {sleepDelta == null
            ? "No prior week to compare"
            : sleepDelta === 0
              ? "Level with last week"
              : `${sleepDelta > 0 ? "+" : "−"}${formatHours(Math.abs(sleepDelta))} h vs last week`}
          {sleep.sd != null && (
            <span className="text-fg-3">
              {" "}
              · ±{sleep.sd.toFixed(1)} h, {sleep.consistency?.toLowerCase()}
            </span>
          )}
        </p>
        <SleepBars r={r} />
      </div>

      {/* load and how you felt */}
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <MiniStat
          label="Workouts"
          value={training.done}
          unit={`/ ${training.planned}`}
          caption={
            r.inProgress
              ? `${training.plannedSoFar} planned so far`
              : `${training.sets} working sets`
          }
        />
        <MiniStat
          label="Volume"
          value={training.volumeLb ? formatInt(vol) : "—"}
          unit={training.volumeLb ? unit : undefined}
          caption={
            training.volumeChange == null
              ? training.volumeLb
                ? `${training.sets} sets`
                : "No sessions yet"
              : `${training.volumeChange >= 0 ? "+" : "−"}${Math.abs(Math.round(training.volumeChange * 100))}% vs ${training.compareTo === "last week" ? "last week" : "same days"}`
          }
        />
        <MiniStat
          label="Volleyball"
          value={r.volleyball.sessions}
          unit={r.volleyball.sessions === 1 ? "session" : "sessions"}
          caption={
            r.volleyball.minutes
              ? `${formatInt(r.volleyball.minutes)} min logged`
              : `${r.volleyball.prevSessions} last week`
          }
        />
        <MiniStat
          label="Rest days"
          value={r.restDays}
          caption={r.inProgress ? "So far" : "No training or volleyball"}
        />
        <MiniStat
          label="Soreness"
          value={r.soreness.avg == null ? "—" : r.soreness.avg.toFixed(1)}
          unit={r.soreness.avg != null ? "/ 5" : undefined}
          caption={
            <TrendNote trend={r.soreness.trend} prev={r.soreness.prevAvg} />
          }
        />
        <MiniStat
          label="Fatigue"
          value={r.fatigue.avg == null ? "—" : r.fatigue.avg.toFixed(1)}
          unit={r.fatigue.avg != null ? "/ 5" : undefined}
          caption={
            <TrendNote trend={r.fatigue.trend} prev={r.fatigue.prevAvg} />
          }
        />
      </div>

      {/* next week */}
      {r.recommendations.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <SuggestedBadge />
            <p className="eyebrow">
              {r.inProgress ? "Rest of the week" : "Next week"}
            </p>
          </div>
          <ol className="space-y-2">
            {r.recommendations.map((x) => (
              <li
                key={x.key}
                className="flex gap-3 rounded-[14px] border border-lapis-line/60 bg-lapis-tint/60 p-3.5"
              >
                <ArrowUpRight
                  className="mt-0.5 size-4 shrink-0 text-lapis-text"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold leading-snug text-fg">
                    {x.title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2">
                    {x.reason}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] font-medium text-fg-3">
            From your logs this week. {DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
}

/** Seven nightly bars against a dashed goal line. Missing nights stay an empty stub. */
function SleepBars({ r }: { r: WeeklyReview }) {
  const { byDay, goal } = r.sleep;
  const max = Math.max(goal + 2, ...byDay.map((h) => h ?? 0));
  const H = 76;
  const goalY = H - (goal / max) * H;
  return (
    <figure className="mt-4">
      <div className="relative" style={{ height: H }}>
        <div
          className="absolute inset-x-0 border-t border-dashed border-gold-700"
          style={{ top: goalY }}
          aria-hidden
        >
          <span className="absolute -top-[9px] right-0 bg-s3 pl-1.5 text-[10px] font-bold tracking-[0.08em] text-fg-3">
            {formatHours(goal)} H
          </span>
        </div>
        <div
          className="absolute inset-0 grid grid-cols-7 items-end gap-2"
          aria-hidden
        >
          {byDay.map((h, i) => {
            const future =
              r.dates[i] > addDays(r.weekStart, r.daysElapsed - 1) &&
              r.inProgress;
            return (
              <div
                key={i}
                className="flex h-full flex-col items-center justify-end"
              >
                {h != null ? (
                  <span
                    className={cn(
                      "w-full max-w-[26px] rounded-t-[6px] rounded-b-[2px]",
                      h >= goal ? "bg-lapis" : "bg-lapis/55",
                    )}
                    style={{ height: Math.max(4, (h / max) * H) }}
                  />
                ) : (
                  <span
                    className={cn(
                      "h-[3px] w-full max-w-[26px] rounded-full",
                      future ? "bg-transparent" : "bg-white/[.08]",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="mt-2 grid grid-cols-7 gap-2 border-t border-line-hair pt-1.5 text-center"
        aria-hidden
      >
        {LETTERS.map((l, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-[10.5px] font-bold tracking-[0.08em] text-fg-3">
              {l}
            </span>
            <span
              className={cn(
                "num text-[13px] font-semibold",
                byDay[i] == null
                  ? "text-fg-dis"
                  : byDay[i]! >= goal
                    ? "text-lapis-text"
                    : "text-fg-2",
              )}
            >
              {byDay[i] == null ? "—" : formatHours(byDay[i])}
            </span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Hours slept each night this week</caption>
        <tbody>
          {byDay.map((h, i) => (
            <tr key={i}>
              <th scope="row">{r.dates[i]}</th>
              <td>{h == null ? "not logged" : `${h} hours`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
