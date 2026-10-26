"use client";

import { useState } from "react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { addDays, monthName, parseISODate, weekStart, type ISODate } from "@/lib/dates";
import { DISCLAIMER } from "@/lib/recovery/guidance";
import { useWeeklyReview } from "@/lib/recovery/hooks";
import type { WeeklyReview } from "@/lib/recovery/weekly";
import { formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { sleepSpokenWords, sleepWords } from "@/components/now/CheckIn";
import { Switcher, TrendNote } from "./parts";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
/** A night in a narrow column: 8.18 h → "8:11". */
const clockHours = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

function rangeLabel(ws: ISODate) {
  const we = addDays(ws, 6);
  const a = parseISODate(ws);
  const b = parseISODate(we);
  return a.getMonth() === b.getMonth() ? `${monthName(ws, true)} ${a.getDate()} – ${b.getDate()}` : `${monthName(ws, true)} ${a.getDate()} – ${monthName(we, true)} ${b.getDate()}`;
}

/**
 * The weekly review (Check-ins › Weekly review, docs/DESIGN-V3-SIMPLE.md §4.6): sleep against the
 * goal night by night, workouts, total lifted, rest days and how you felt against the week before,
 * and plain suggestions for next week (never applied for you). Every number is from your logs.
 */
export function WeeklyReviewCard({ today, startDate, className }: { today: ISODate; startDate: ISODate | null; className?: string }) {
  const current = weekStart(today);
  const [ws, setWs] = useState(current);
  const { review, loading, error, refetch } = useWeeklyReview(ws, today);
  const { profile } = useProfile();
  const unit = (profile?.weight_unit as WeightUnit | null | undefined) ?? "kg";
  const earliest = startDate ? weekStart(startDate) : addDays(current, -7 * 52);
  const title = ws === current ? "This week" : ws === addDays(current, -7) ? "Last week" : rangeLabel(ws);

  return (
    <section aria-label="Weekly review" className={cn("min-w-0", className)}>
      <Switcher
        label={
          <span className="block">
            <span className="t-row block">{title}</span>
            <span className="t-label block tabular-nums">
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
        <div className="mt-3 space-y-2" aria-hidden>
          <Skeleton className="h-36 w-full rounded-tile-lg" />
          <Skeleton className="h-48 w-full rounded-tile-lg" />
        </div>
      ) : error && !review ? (
        <ErrorNote className="mt-3" onRetry={refetch} />
      ) : review?.empty ? (
        <div className="mt-3 rounded-tile-lg bg-surface px-4 py-5 text-center">
          <p className="t-row">Nothing logged this week</p>
          <p className="t-label mt-1">Check-ins and finished workouts fill this in. Nothing here is estimated.</p>
        </div>
      ) : review ? (
        <ReviewBody r={review} unit={unit} />
      ) : null}
    </section>
  );
}

function Line({ title, detail, value }: { title: string; detail: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="t-row">{title}</p>
        <p className="t-label mt-0.5">{detail}</p>
      </div>
      <p className="t-row shrink-0 text-right tabular-nums">{value}</p>
    </div>
  );
}

function ReviewBody({ r, unit }: { r: WeeklyReview; unit: WeightUnit }) {
  const { sleep, training } = r;
  const sleepDelta = sleep.avg != null && sleep.prevAvg != null ? Math.round((sleep.avg - sleep.prevAvg) * 4) / 4 : null;
  const vol = Math.round(toDisplayWeight(training.volumeLb, unit));
  const nights = r.daysElapsed || 7;
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-tile-lg bg-surface p-4">
        <p className="t-cap">Average sleep</p>
        <p className="t-num mt-1">{sleep.avg == null ? "—" : sleepWords(Math.round(sleep.avg * 4) / 4)}</p>
        <p className="t-label mt-1 tabular-nums">
          {sleep.nights} of {nights} {nights === 1 ? "night" : "nights"} logged · {sleep.nightsAtGoal} at the {sleepWords(sleep.goal)} goal
        </p>
        <p className="t-label tabular-nums">
          {sleepDelta == null ? "No week before to compare" : sleepDelta === 0 ? "Same as last week" : `${sleepDelta > 0 ? "+" : "−"}${sleepWords(Math.abs(sleepDelta))} vs last week`}
          {sleep.sd != null && ` · ±${sleep.sd.toFixed(1)} h, ${sleep.consistency?.toLowerCase()}`}
        </p>
        <SleepBars r={r} />
      </div>

      <div className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        <Line title="Workouts" detail={r.inProgress ? `${training.plannedSoFar} planned so far` : `${training.sets} working sets`} value={`${training.done} of ${training.planned}`} />
        <Line
          title="Total lifted"
          detail={
            training.volumeChange == null
              ? training.volumeLb
                ? `${training.sets} sets`
                : "No workouts yet"
              : `${training.volumeChange >= 0 ? "+" : "−"}${Math.abs(Math.round(training.volumeChange * 100))}% vs ${training.compareTo === "last week" ? "last week" : "the same days last week"}`
          }
          value={training.volumeLb ? `${formatInt(vol)} ${unit}` : "—"}
        />
        <Line title="Rest days" detail={r.inProgress ? "So far" : "No workout that day"} value={r.restDays} />
        <Line title="Soreness" detail={<TrendNote trend={r.soreness.trend} prev={r.soreness.prevAvg} />} value={r.soreness.avg == null ? "—" : `${r.soreness.avg.toFixed(1)} of 5`} />
        <Line title="Tiredness" detail={<TrendNote trend={r.fatigue.trend} prev={r.fatigue.prevAvg} />} value={r.fatigue.avg == null ? "—" : `${r.fatigue.avg.toFixed(1)} of 5`} />
      </div>

      {r.recommendations.length > 0 && (
        <div>
          <h3 className="t-section mb-3 mt-6">{r.inProgress ? "For the rest of the week" : "For next week"}</h3>
          <ol className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
            {r.recommendations.map((x) => (
              <li key={x.key} className="px-4 py-3" data-program-text="">
                <p className="t-row">{x.title}</p>
                <p className="t-label mt-0.5">{x.reason}</p>
              </li>
            ))}
          </ol>
          <p className="t-cap mt-2">From fixed rules over this week&apos;s logs. Never applied for you. {DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}

/** Seven nightly bars (grey; white at the goal) against a dashed goal line. Missing nights stay an empty stub. */
function SleepBars({ r }: { r: WeeklyReview }) {
  const { byDay, goal } = r.sleep;
  const max = Math.max(goal + 2, ...byDay.map((h) => h ?? 0));
  const H = 76;
  const goalY = H - (goal / max) * H;
  return (
    <figure className="mt-4" data-budget-group="">
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ top: goalY }} aria-hidden>
          <span className="t-cap absolute -top-2.5 right-0 bg-surface pl-1.5">Goal {sleepWords(goal)}</span>
        </div>
        <div className="absolute inset-0 grid grid-cols-7 items-end gap-2" aria-hidden>
          {byDay.map((h, i) => {
            const future = r.dates[i] > addDays(r.weekStart, r.daysElapsed - 1) && r.inProgress;
            return (
              <div key={i} className="flex h-full flex-col items-center justify-end">
                {h != null ? (
                  <span className={cn("w-full max-w-6.5 rounded-xs", h >= goal ? "bg-fg" : "bg-fg-2 opacity-55")} style={{ height: Math.max(4, (h / max) * H) }} />
                ) : (
                  <span className={cn("h-0.75 w-full max-w-6.5 rounded-full", future ? "bg-transparent" : "bg-track")} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 border-t border-line pt-1.5 text-center" aria-hidden>
        {LETTERS.map((l, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="t-cap font-semibold">{l}</span>
            <span className={cn("t-cap font-semibold tabular-nums", byDay[i] != null && byDay[i]! >= goal && "text-fg")}>{byDay[i] == null ? "—" : clockHours(byDay[i]!)}</span>
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>Hours slept each night this week</caption>
          <tbody>
            {byDay.map((h, i) => (
              <tr key={i}>
                <th scope="row">{r.dates[i]}</th>
                <td>{h == null ? "not logged" : sleepSpokenWords(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
