"use client";

import { useState } from "react";
import { PlacardRow } from "@/components/ui/placard";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { addDays, monthName, parseISODate, weekStart, type ISODate } from "@/lib/dates";
import { sleepShort, sleepSpoken } from "@/lib/today/now";
import { DISCLAIMER } from "@/lib/recovery/guidance";
import { useWeeklyReview } from "@/lib/recovery/hooks";
import type { WeeklyReview } from "@/lib/recovery/weekly";
import { formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";
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
  return a.getMonth() === b.getMonth()
    ? `${monthName(ws, true)} ${a.getDate()} – ${b.getDate()}`
    : `${monthName(ws, true)} ${a.getDate()} – ${monthName(we, true)} ${b.getDate()}`;
}

/**
 * Week's end (docs/DESIGN-V2.md §3.7): the weekly review as a placard — sleep against the goal
 * night by night, sessions, volume, volleyball and how you felt against the week before, and the
 * rule's adjustments for next week (RULE, never applied for you). Every number is from your logs.
 */
export function WeeklyReviewCard({ today, startDate, className }: { today: ISODate; startDate: ISODate | null; className?: string }) {
  const current = weekStart(today);
  const [ws, setWs] = useState(current);
  const { review, loading, error, refetch } = useWeeklyReview(ws, today);
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const earliest = startDate ? weekStart(startDate) : addDays(current, -7 * 52);
  const title = ws === current ? "This week" : ws === addDays(current, -7) ? "Last week" : rangeLabel(ws);

  return (
    <section aria-labelledby="weekly-title" className={cn("min-w-0", className)}>
      <p className="t-eyebrow">Week&apos;s end</p>
      <Switcher
        className="mt-1"
        label={
          <span className="block">
            <h2 id="weekly-title" className="t-title-2 text-ivory">
              {title}
            </h2>
            <span className="t-meta tnum block text-stone">
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
          <Skeleton className="h-36 w-full" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error && !review ? (
        <ErrorNote className="mt-3" onRetry={refetch}>
          Couldn&apos;t load this week.
        </ErrorNote>
      ) : review?.empty ? (
        <div className="mt-3 border-y border-vein py-5">
          <p className="t-title-3 text-ivory">Nothing logged this week</p>
          <p className="t-callout mt-1 text-stone">Morning check-ins, finished sessions and volleyball fill this in. Nothing here is estimated.</p>
        </div>
      ) : review ? (
        <ReviewBody r={review} unit={unit} />
      ) : null}
    </section>
  );
}

function ReviewBody({ r, unit }: { r: WeeklyReview; unit: WeightUnit }) {
  const { sleep, training } = r;
  const sleepDelta = sleep.avg != null && sleep.prevAvg != null ? Math.round((sleep.avg - sleep.prevAvg) * 4) / 4 : null;
  const vol = Math.round(toDisplayWeight(training.volumeLb, unit));
  const nights = r.daysElapsed || 7;
  return (
    <div className="mt-3">
      {/* sleep */}
      <div className="border-t border-vein pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="t-eyebrow">Average sleep</p>
            <p className="t-num-l mt-1 text-ivory">
              {sleep.avg == null ? "—" : sleepShort(Math.round(sleep.avg * 4) / 4)}
            </p>
          </div>
          <div className="t-meta tnum min-w-0 pb-1 text-right text-stone">
            <p>
              {sleep.nights} of {nights} {nights === 1 ? "night" : "nights"} logged
            </p>
            <p>
              {sleep.nightsAtGoal} at the {sleepShort(sleep.goal)} goal
            </p>
          </div>
        </div>
        <p className="t-meta tnum mt-1 text-stone">
          {sleepDelta == null
            ? "No prior week to compare"
            : sleepDelta === 0
              ? "Level with last week"
              : `${sleepDelta > 0 ? "+" : "−"}${sleepShort(Math.abs(sleepDelta))} vs last week`}
          {sleep.sd != null && (
            <span className="text-ash">
              {" "}
              · ±{sleep.sd.toFixed(1)} h, {sleep.consistency?.toLowerCase()}
            </span>
          )}
        </p>
        <SleepBars r={r} />
      </div>

      {/* load and how you felt */}
      <div className="mt-4 divide-y divide-vein border-y border-vein">
        <PlacardRow
          title="Sessions"
          detail={r.inProgress ? `${training.plannedSoFar} planned so far` : `${training.sets} working sets`}
          value={
            <>
              {training.done} <span className="t-meta text-stone">of {training.planned}</span>
            </>
          }
        />
        <PlacardRow
          title="Volume"
          detail={
            training.volumeChange == null
              ? training.volumeLb
                ? `${training.sets} sets`
                : "No sessions yet"
              : `${training.volumeChange >= 0 ? "+" : "−"}${Math.abs(Math.round(training.volumeChange * 100))}% vs ${training.compareTo === "last week" ? "last week" : "the same days last week"}`
          }
          value={
            training.volumeLb ? (
              <>
                {formatInt(vol)} <span className="t-meta text-stone">{unit}</span>
              </>
            ) : (
              "—"
            )
          }
        />
        <PlacardRow
          title="Volleyball"
          detail={r.volleyball.minutes ? `${formatInt(r.volleyball.minutes)} min logged` : `${r.volleyball.prevSessions} last week`}
          value={
            <>
              {r.volleyball.sessions} <span className="t-meta text-stone">{r.volleyball.sessions === 1 ? "session" : "sessions"}</span>
            </>
          }
        />
        <PlacardRow title="Rest days" detail={r.inProgress ? "So far" : "No training or volleyball"} value={r.restDays} />
        <PlacardRow
          title="Soreness"
          detail={<TrendNote trend={r.soreness.trend} prev={r.soreness.prevAvg} />}
          value={
            r.soreness.avg == null ? (
              "—"
            ) : (
              <>
                {r.soreness.avg.toFixed(1)} <span className="t-meta text-stone">/ 5</span>
              </>
            )
          }
        />
        <PlacardRow
          title="Fatigue"
          detail={<TrendNote trend={r.fatigue.trend} prev={r.fatigue.prevAvg} />}
          value={
            r.fatigue.avg == null ? (
              "—"
            ) : (
              <>
                {r.fatigue.avg.toFixed(1)} <span className="t-meta text-stone">/ 5</span>
              </>
            )
          }
        />
      </div>

      {/* next week */}
      {r.recommendations.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex min-h-6 items-center gap-2">
            <p className="t-eyebrow">{r.inProgress ? "Rest of the week" : "Next week"}</p>
            <Tag kind="RULE" explain="Fixed rules over this week's logged sleep, soreness, fatigue, sessions and volleyball. Never applied for you. No AI." />
          </div>
          <ol className="divide-y divide-vein border-y border-vein">
            {r.recommendations.map((x) => (
              <li key={x.key} className="py-3">
                <p className="t-title-3 text-ivory">{x.title}</p>
                <p className="t-callout mt-0.5 text-stone">{x.reason}</p>
              </li>
            ))}
          </ol>
          <p className="t-meta mt-2 text-ash">From your logs this week. {DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}

/** Seven nightly bars (stone; ivory at goal) against a dashed goal line. Missing nights stay an empty stub. */
function SleepBars({ r }: { r: WeeklyReview }) {
  const { byDay, goal } = r.sleep;
  const max = Math.max(goal + 2, ...byDay.map((h) => h ?? 0));
  const H = 76;
  const goalY = H - (goal / max) * H;
  return (
    <figure className="mt-4">
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ top: goalY }} aria-hidden>
          <span className="t-tag absolute -top-2.5 right-0 bg-night pl-1.5 text-ash">Goal {sleepShort(goal)}</span>
        </div>
        <div className="absolute inset-0 grid grid-cols-7 items-end gap-2" aria-hidden>
          {byDay.map((h, i) => {
            const future = r.dates[i] > addDays(r.weekStart, r.daysElapsed - 1) && r.inProgress;
            return (
              <div key={i} className="flex h-full flex-col items-center justify-end">
                {h != null ? (
                  <span className={cn("w-full max-w-6.5 rounded-xs", h >= goal ? "bg-ivory/80" : "bg-stone/55")} style={{ height: Math.max(4, (h / max) * H) }} />
                ) : (
                  <span className={cn("h-0.75 w-full max-w-6.5 rounded-full", future ? "bg-transparent" : "bg-vein-2")} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 border-t border-vein pt-1.5 text-center" aria-hidden>
        {LETTERS.map((l, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="t-eyebrow">{l}</span>
            <span className={cn("t-meta tnum font-semibold", byDay[i] == null ? "text-disabled" : byDay[i]! >= goal ? "text-ivory" : "text-stone")}>
              {byDay[i] == null ? "—" : clockHours(byDay[i]!)}
            </span>
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
                <td>{h == null ? "not logged" : sleepSpoken(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
