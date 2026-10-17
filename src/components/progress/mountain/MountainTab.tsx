"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Shelf } from "@/components/reviews/Shelf";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { calorieSuggestion, calorieTargetRate } from "@/lib/bodyweight";
import { useToday } from "@/lib/data/core";
import { useWeights } from "@/lib/data/body";
import { useGoalChanges, useProfile } from "@/lib/data/profile";
import { localDateOf, parseISODate, type ISODate } from "@/lib/dates";
import { useSwapIn, RISE_IN_PLACE } from "@/lib/motion";
import { mountainExplain } from "@/lib/progress/ascent-copy";
import { ZOOMS, defaultZoom, type Zoom } from "@/lib/progress/mountain";
import { dayMonth, highWater, MIN_WEIGHINS, pace as paceOf, paceCorridor, terraces as terracesOf, trendSeries } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { SrTable } from "../kit";
import { MountainChart } from "./MountainChart";
import { PaceGauge } from "./PaceGauge";
import { TerraceTiles } from "./TerraceTiles";
import { TerraceCard, useTerraceMoment } from "./TerraceMoment";
import { WeighIns } from "./WeighIns";

/**
 * Ascent → Mountain (docs/DESIGN-V2.md §3.6.1): the verdict, scale vs trend, the zoomable
 * Mountain, the pace gauge with the calorie rule, terraces, start · now · summit, the best trend,
 * the Chronicles and the weigh-in ledger. Every number is read from pace(), trendSeries(),
 * terraces() and calorieSuggestion(); nothing here recomputes a trend or a rate.
 */
export function MountainTab() {
  const today = useToday();
  const { profile, loading: pLoading } = useProfile();
  const { weights, loading, error } = useWeights();
  const changes = useGoalChanges();
  const qc = useQueryClient();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;

  const pc = useMemo(() => paceOf({ weighIns: weights, today, profile, unit }), [weights, today, profile, unit]);
  const series = useMemo(() => trendSeries(weights, undefined, today), [weights, today]);
  const startLb = Number(profile?.start_weight_lb ?? 163);
  const startDate = profile?.start_date ?? today;
  const ts = useMemo(() => (pc.band ? terracesOf(pc, series, startLb, pc.band.min) : []), [pc, series, startLb]);
  const best = useMemo(() => highWater(series), [series]);
  const raw = useMemo(() => weights.filter((w) => w.local_date <= today).map((w) => ({ date: w.local_date, lb: Number(w.weight_lb) })), [weights, today]);
  const trendByDate = useMemo(() => new Map(series.map((s) => [s.date, s.lb])), [series]);

  const lastCalChange = useMemo(() => {
    const c = changes.data?.find((x) => x.field === "calorie_goal");
    return c ? localDateOf(c.changed_at) : null;
  }, [changes.data]);
  const calorie = useMemo(() => {
    if (!profile || changes.isLoading) return null;
    const target = calorieTargetRate(pc.trend.lb, startLb, Number(profile.goal_weight_lb), startDate, profile.target_date, today);
    return calorieSuggestion(weights, today, target, lastCalChange, startDate);
  }, [profile, changes.isLoading, pc.trend.lb, startLb, startDate, today, weights, lastCalChange]);

  const [zoomPick, setZoom] = useState<Zoom | null>(null);
  const zoom = zoomPick ?? defaultZoom(profile?.start_date ?? null, today);
  const chartRef = useSwapIn<HTMLDivElement, string>(zoom, { direction: RISE_IN_PLACE });

  const ready = !loading && !pLoading && !!profile;
  const { moment, dismiss } = useTerraceMoment(ts, ready);

  if (error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["weights"] })}>Couldn&apos;t load your weigh-ins. {String((error as Error).message ?? "")}</ErrorNote>;
  if (!ready) return <MountainSkeleton />;

  const explain = mountainExplain(pc, unit);
  const w1 = (lb: number) => toDisplayWeight(lb, unit).toFixed(1);
  const latest = pc.trend.latest;
  const latestRow = latest ? weights.find((w) => w.local_date === latest.date) : null;
  const trendLb = pc.trend.lb;
  const target = pc.target;
  const fresh = weights.length === 0;
  const gild = weights.length < MIN_WEIGHINS ? `${MIN_WEIGHINS - weights.length} more weigh-in${MIN_WEIGHINS - weights.length === 1 ? "" : "s"}` : null;

  return (
    <div className="grid grid-cols-1 gap-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-x-10">
      <div className="@container min-w-0">
        {/* 1. the verdict and its explanation */}
        <section aria-label="Pace" aria-describedby="mtn-aria">
          <h2 className="t-verdict text-ivory">{pc.sentence}</h2>
          <p className="t-callout mt-2.5 text-stone">
            {explain.text} {explain.proj && <Tag kind="PROJ" className="ml-0.5" />}
          </p>
          <p id="mtn-aria" className="sr-only">
            {pc.ariaLabel}
          </p>
        </section>

        {/* 2. scale vs trend */}
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2 border-y border-vein py-3">
          <p className="min-w-0">
            <span className="t-eyebrow block">7-day trend</span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="t-num-m tnum text-ivory">{trendLb != null ? w1(trendLb) : "—"}</span>
              {trendLb != null && <span className="t-meta text-stone">{unit}</span>}
              {trendLb != null && (
                <Tag kind="CALC" explain={`Mean of the ${pc.trend.n} weigh-in${pc.trend.n === 1 ? "" : "s"} in the 7 days ending ${dayMonth(pc.trend.end, today)}.`} className="ml-1" />
              )}
            </span>
          </p>
          <p className="min-w-0">
            <span className="t-eyebrow block">Scale</span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="t-num-s tnum text-ivory">{latest ? w1(latest.lb) : "—"}</span>
              <span className="t-meta text-stone">{latest ? scaleWhen(latest.date, latestRow?.measured_at ?? null, today) : "Weigh in to begin"}</span>
              {latest && <Tag kind="LOG" className="ml-0.5" />}
            </span>
          </p>
          {pc.trend.end !== today && trendLb != null && <p className="t-meta w-full text-stone">Trend as of {dayMonth(pc.trend.end, today)} · weigh in to update</p>}
        </div>

        {/* 3. zoom + 4. the Mountain */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="t-eyebrow">The mountain</h2>
          <Segmented size="sm" ariaLabel="Chart range" value={zoom} onChange={setZoom} options={ZOOMS.map((z) => ({ value: z.key, label: z.label }))} className="w-48 max-w-full @max-[19rem]:w-full" />
        </div>
        <figure className="relative -mx-(--gutter) mt-2 md:mx-0">
          <div ref={chartRef} role="img" aria-label={pc.ariaLabel}>
            <MountainChart
              zoom={zoom}
              today={today}
              start={{ date: startDate, lb: startLb }}
              target={target}
              weighIns={raw}
              series={series}
              pace={pc}
              terraces={ts}
              unit={unit}
              celebrate={moment ? { lb: moment.terrace.lb, fromLb: moment.fromLb } : null}
            />
          </div>
          {moment && <TerraceCard terrace={moment.terrace} unit={unit} today={today} onDismiss={dismiss} />}
          <figcaption className="t-meta mt-2 px-(--gutter) text-stone md:px-0">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-3.5 rounded-full bg-leaf-300" /> 7-day trend
            </span>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-ash" /> weigh-ins
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-3.5 border-t-[1.5px] border-dashed border-ivory/70" /> projection
            </span>
            <span className="mt-1 block">The ridge is decoration. The line is your trend.</span>
          </figcaption>
          <SrTable
            caption={`Weigh-ins and 7-day trend in ${unit}`}
            head={["Date", "Scale", "7-day trend"]}
            rows={[...raw]
              .reverse()
              .slice(0, 28)
              .map((w) => [dayMonth(w.date, today), w1(w.lb), trendByDate.has(w.date) ? w1(trendByDate.get(w.date)!) : "—"])}
          />
        </figure>

        {fresh && <p className="t-callout mt-4 text-stone">Weigh in each morning, after the bathroom and before food. Your trend, pace and terraces build from there.</p>}
      </div>

      <div className="grid min-w-0 grid-cols-1 content-start gap-9">
        {/* 5. pace gauge + the calorie rule */}
        <PaceGauge
          pace={pc}
          calorie={calorie}
          calories={profile.calorie_goal ?? null}
          unit={unit}
          today={today}
          startWindow={!pc.corridor && pc.trend.lb == null && pc.band && target ? paceCorridor(startLb, today, target, pc.band.min, pc.band.max) : null}
        />

        {/* 6. terraces */}
        {ts.length > 0 && <TerraceTiles terraces={ts} today={today} unit={unit} needs={gild ? `needs ${gild}` : "needs a steady rate"} />}

        {/* 7. start · now · summit, 9. the best trend */}
        <section aria-label="Start, now and summit" className="@container">
          <dl className="grid grid-cols-3 border-y border-vein @max-[19rem]:grid-cols-1">
            <Stat label="Start" value={w1(startLb)} sub={dayMonth(startDate, today)} />
            <Stat label="Now" value={trendLb != null ? w1(trendLb) : "—"} sub={trendLb != null ? `${signed1(toDisplayWeight(trendLb - startLb, unit))} · trend` : "no trend yet"} divider />
            <Stat label="Summit" value={pc.band ? bandShort(pc.band, unit) : "—"} sub={target ? `by ${dayMonth(target, today)} ${target.slice(0, 4)}` : "set a target date"} divider />
          </dl>
          {best && trendLb != null && trendLb < best.lb - 0.05 && (
            <p className="t-meta mt-2 text-stone">
              Best trend {w1(best.lb)} · {dayMonth(best.date, today)}
            </p>
          )}
        </section>

        {/* 8. the Chronicles */}
        <Shelf unit={unit} />

        {/* the weigh-in ledger */}
        <WeighIns weights={weights} trendByDate={trendByDate} unit={unit} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, divider }: { label: string; value: string; sub: string; divider?: boolean }) {
  return (
    <div className={cn("min-w-0", divider ? "border-l border-vein pl-3.5 @max-[19rem]:border-l-0 @max-[19rem]:border-t @max-[19rem]:pl-0" : "pr-3")}>
      <dt className="t-eyebrow pt-3">{label}</dt>
      <dd className="t-num-m tnum mt-1.5 whitespace-nowrap text-ivory">{value}</dd>
      <dd className="t-meta pb-3 text-stone">{sub}</dd>
    </div>
  );
}

const signed1 = (v: number) => {
  const r = round(v, 1);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
};
const bandShort = (b: { min: number; max: number }, unit: WeightUnit) => {
  const f = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  return b.min === b.max ? f(b.min) : `${f(b.min)}–${f(b.max)}`;
};

/** "today 7:04 am", "yesterday", "Fri 16 Oct". */
function scaleWhen(date: ISODate, measuredAt: string | null, today: ISODate) {
  if (date === today) {
    if (!measuredAt) return "today";
    const t = new Date(measuredAt);
    return Number.isNaN(t.getTime()) ? "today" : `today ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
  }
  const d = parseISODate(date);
  const diff = Math.round((parseISODate(today).getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return "yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function MountainSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the Mountain">
      <Skeleton className="h-8 w-4/5 rounded-tag" />
      <Skeleton className="mt-2 h-8 w-3/5 rounded-tag" />
      <Skeleton className="mt-4 h-4 w-full rounded-tag" />
      <Skeleton className="mt-6 h-14 w-full rounded-field" />
      <Skeleton className="mt-6 h-80 w-full rounded-card" />
    </div>
  );
}
