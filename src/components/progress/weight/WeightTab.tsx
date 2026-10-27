"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, List, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { DetailsSheet, type DetailsRow } from "@/components/ui/details-sheet";
import { ListGroup, Row } from "@/components/ui/list";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { StatCard, StatRow } from "@/components/ui/stat-card";
import { useToday } from "@/lib/data/core";
import { useWeights } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { addDays, addMonths, monthName, monthStart } from "@/lib/dates";
import { dayMonth, MIN_WEIGHINS, pace as paceOf, paceChipLabel, terraces as milestonesOf, trendSeries } from "@/lib/progress/pace";
import { LB_PER_KG, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { useProgressActions } from "../context";
import { signed, unitsOf, weightWords } from "../kit";
import { defaultRange, type Range } from "./chart";
import { MilestonesSheet } from "./MilestonesSheet";
import { PaceSheet } from "./PaceSheet";
import { TrendChart } from "./TrendChart";
import { WeighInsSheet } from "./WeighInsSheet";

/**
 * Milestones (§2.2: round numbers on the way, then the goal range's floor): every 2.5 kg, or every
 * 5 lb for an account shown in pounds. terraces() works in lb, so the kg step is converted once.
 */
export const milestoneStep = (unit: WeightUnit) => (unit === "kg" ? 2.5 * LB_PER_KG : 5);

/**
 * Progress › Weight (docs/DESIGN-V3-SIMPLE.md §4.5.1): the 7-day average with its pace chip, the
 * bar from start to the goal range, gold "Log weight"; the Trend card; a duo (the weekly pace and
 * the change since the start); rows for Milestones, All weigh-ins and Monthly recap. Every number
 * comes from pace() and trendSeries() (lib/progress/pace) and opens "How we got this".
 * Fewer than 4 weigh-ins: the latest weigh-in, no chip, no dashed line, the duo "—".
 */
export function WeightTab() {
  const today = useToday();
  const { profile, loading: pLoading } = useProfile();
  const { weights, loading, error } = useWeights();
  const qc = useQueryClient();
  const actions = useProgressActions();
  const unit = unitsOf(profile).wu;

  const pc = useMemo(() => paceOf({ weighIns: weights, today, profile, unit }), [weights, today, profile, unit]);
  const series = useMemo(() => trendSeries(weights, undefined, today), [weights, today]);
  const raw = useMemo(() => weights.filter((w) => w.local_date <= today).map((w) => ({ date: w.local_date, lb: Number(w.weight_lb) })), [weights, today]);
  const startLb = profile?.start_weight_lb != null ? Number(profile.start_weight_lb) : null;
  const milestones = useMemo(() => (pc.band && startLb != null ? milestonesOf(pc, series, startLb, pc.band.min, milestoneStep(unit)) : []), [pc, series, startLb, unit]);

  const [rangePick, setRange] = useState<Range | null>(null);
  const range = rangePick ?? defaultRange(profile?.start_date, today);
  const [sheet, setSheet] = useState<"pace" | "avg" | "rate" | "since" | "milestones" | "weighins" | null>(null);

  if (error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["weights"] })}>Couldn&apos;t load your weigh-ins.</ErrorNote>;
  if (loading || pLoading || !profile) return <WeightSkeleton />;

  const count = raw.length;
  const ready = count >= MIN_WEIGHINS && pc.trend.lb != null;
  const latest = pc.trend.latest;
  const heroLb = ready ? pc.trend.lb! : (latest?.lb ?? null);
  const w1 = (lb: number) => toDisplayWeight(lb, unit).toFixed(1);
  const plain = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const bandText = pc.band ? (pc.band.min === pc.band.max ? plain(pc.band.min) : `${plain(pc.band.min)}–${plain(pc.band.max)}`) : "—";
  const chip = ready ? (pc.verdict === "arrived" ? "In your goal range" : paceChipLabel(pc.verdict)) : null;
  const rate = ready && pc.rate.status === "ok" ? pc.rate.lbPerWeek : null;
  const since = ready && startLb != null ? pc.trend.lb! - startLb : null;
  const left = Math.max(1, MIN_WEIGHINS - count);

  // the bar: from the start weight to the bottom of the goal range
  const frac = heroLb != null && startLb != null && pc.band && pc.band.min !== startLb ? Math.min(1, Math.max(0, (heroLb - startLb) / (pc.band.min - startLb))) : 0;
  const pct = Math.round(frac * 100);

  const reached = milestones.filter((m) => m.reachedOn);
  const next = milestones.find((m) => !m.reachedOn) ?? null;
  const milestoneLine = !milestones.length
    ? "Set your goal in Settings"
    : next
      ? reached.length
        ? `${plain(reached.at(-1)!.lb)} reached · next ${plain(next.lb)}`
        : `Next ${plain(next.lb)}`
      : "All reached";

  // the latest finished month whose recap is ready, or this month so far
  const cur = monthStart(today);
  const prev = addMonths(cur, -1);
  const recapLine = profile.start_date && profile.start_date < cur ? `${monthName(prev)} is ready` : `${monthName(cur)} so far`;

  const avgDetails: { rows: DetailsRow[]; how: string } = ready
    ? {
        rows: [
          { label: "7-day average", value: `${w1(pc.trend.lb!)} ${unit}` },
          { label: "Weigh-ins in it", value: String(pc.trend.n) },
          ...(latest ? [{ label: "Latest weigh-in", value: `${w1(latest.lb)} ${unit}`, detail: dayMonth(latest.date, today) }] : []),
        ],
        how: `The 7-day average is the mean of your ${pc.trend.n} ${pc.trend.n === 1 ? "weigh-in" : "weigh-ins"} from ${dayMonth(addDays(pc.trend.end, -6), today)} to ${dayMonth(pc.trend.end, today)}. It smooths out the day-to-day swings from water and food.`,
      }
    : {
        rows: latest ? [{ label: "Latest weigh-in", value: `${w1(latest.lb)} ${unit}`, detail: dayMonth(latest.date, today) }] : [],
        how: latest
          ? `This is your latest weigh-in, from ${dayMonth(latest.date, today)}. Your 7-day average appears after ${MIN_WEIGHINS} weigh-ins: ${left} more to go.`
          : `Log your first weigh-in to start. Your 7-day average appears after ${MIN_WEIGHINS} weigh-ins.`,
      };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {/* 1. the 7-day average */}
      <section className="@container rounded-card bg-surface p-5" aria-label="Weight">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="t-cap min-w-0">{ready ? "Weight · 7-day average" : "Latest weigh-in"}</h2>
          {chip && (
            <Chip tone={pc.verdict === "arrived" ? "win" : "default"} onClick={() => setSheet("pace")} ariaLabel={`${chip}. Shows your pace and how it is worked out`} className="h-9 px-3.5">
              {chip}
              <ChevronRight className="-mr-1 text-fg-3" strokeWidth={2.2} aria-hidden />
            </Chip>
          )}
        </div>
        <button type="button" onClick={() => setSheet("avg")} className="press-soft mt-1.5 flex items-center gap-1 text-left" aria-describedby="avg-hint">
          <span className="t-hero" data-derived="">
            {heroLb != null ? w1(heroLb) : "—"}
            {heroLb != null && <span className="unit">{unit}</span>}
          </span>
          <ChevronRight className="size-4 shrink-0 self-center text-fg-3" strokeWidth={2.2} aria-hidden />
          <span id="avg-hint" className="sr-only">
            Shows how it is worked out.
          </span>
        </button>
        {!ready && (
          <p className="t-label mt-1">
            {left} more {left === 1 ? "weigh-in" : "weigh-ins"} to see your average
          </p>
        )}
        <Bar value={frac} label={`${pct}% of the way`} className="mt-4" />
        <div className="mt-2 flex items-center justify-between gap-3 ax:flex-col ax:items-start ax:gap-0.5">
          <span className="t-cap">Start {startLb != null ? w1(startLb) : "—"}</span>
          <span className="t-cap">Goal {bandText}</span>
        </div>
        <Button variant="primary" size="lg" block className="mt-[18px]" onClick={() => actions.logWeight()}>
          Log weight
        </Button>
      </section>

      {/* 2. the trend */}
      <TrendChart range={range} onRange={setRange} today={today} start={profile.start_date} weighIns={raw} series={series} lbPerWeek={rate} unit={unit} onOpen={() => setSheet("weighins")} />

      {/* 3. the duo */}
      <StatRow cols={2}>
        <StatCard
          value={rate != null ? `${signed(toDisplayWeight(rate, unit), 1)} ${unit}` : "—"}
          label="a week, last 4 weeks"
          onDetails={() => setSheet("rate")}
          ariaLabel={rate != null ? `${signed(toDisplayWeight(rate, unit), 1).replace("−", "minus ")} ${weightWords(unit)} a week, last 4 weeks` : "Weekly pace: not yet"}
        />
        <StatCard
          value={since != null ? `${signed(toDisplayWeight(since, unit), 1)} ${unit}` : "—"}
          label="since you started"
          onDetails={() => setSheet("since")}
          ariaLabel={since != null ? `${signed(toDisplayWeight(since, unit), 1).replace("−", "minus ")} ${weightWords(unit)} since you started` : "Change since you started: not yet"}
        />
      </StatRow>

      {/* 4. rows */}
      <ListGroup>
        <Row icon={Target} title="Milestones" subtitle={milestoneLine} onClick={() => setSheet("milestones")} />
        <Row icon={List} title="All weigh-ins" onClick={() => setSheet("weighins")} ariaLabel={`All weigh-ins, ${count}`} />
        <Row icon={CalendarDays} title="Monthly recap" subtitle={recapLine} href="/reviews" />
      </ListGroup>

      <PaceSheet open={sheet === "pace"} onOpenChange={(o) => setSheet(o ? "pace" : null)} pace={pc} profile={profile} weights={weights} today={today} unit={unit} />
      <DetailsSheet open={sheet === "avg"} onOpenChange={(o) => setSheet(o ? "avg" : null)} title={ready ? "7-day average" : "Latest weigh-in"} rows={avgDetails.rows} how={avgDetails.how} />
      <DetailsSheet
        open={sheet === "rate"}
        onOpenChange={(o) => setSheet(o ? "rate" : null)}
        title="Your pace"
        rows={rate != null ? [{ label: "A week", value: `${signed(toDisplayWeight(rate, unit), 2)} ${unit}` }, { label: "Weigh-ins used", value: String(pc.rate.n), detail: `${dayMonth(pc.rate.from, today)} to ${dayMonth(pc.rate.to, today)}` }] : []}
        how={
          rate != null
            ? `Your pace is the straight-line trend of your ${pc.rate.n} weigh-ins over the last 4 weeks, as a change per week. The dashed line on the chart carries it forward. It is a guide, not a promise.`
            : `Your pace appears once you have ${MIN_WEIGHINS} weigh-ins spread over at least 10 days in the last 4 weeks. ${pc.detail}.`
        }
      />
      <DetailsSheet
        open={sheet === "since"}
        onOpenChange={(o) => setSheet(o ? "since" : null)}
        title="Since you started"
        rows={[
          { label: "Start", value: startLb != null ? `${w1(startLb)} ${unit}` : "—", detail: profile.start_date ? dayMonth(profile.start_date, today) : undefined },
          { label: "7-day average now", value: ready ? `${w1(pc.trend.lb!)} ${unit}` : "—" },
          { label: "Change", value: since != null ? `${signed(toDisplayWeight(since, unit), 1)} ${unit}` : "—" },
        ]}
        how={
          since != null
            ? "Your 7-day average now minus the start weight in Settings › Goals."
            : `The change appears with your 7-day average, after ${MIN_WEIGHINS} weigh-ins. The start weight comes from Settings › Goals.`
        }
      />
      <MilestonesSheet open={sheet === "milestones"} onOpenChange={(o) => setSheet(o ? "milestones" : null)} milestones={milestones} today={today} unit={unit} />
      <WeighInsSheet open={sheet === "weighins"} onOpenChange={(o) => setSheet(o ? "weighins" : null)} weights={weights} series={series} unit={unit} />
    </div>
  );
}



/** The Weight segment's shapes while it loads. */
export function WeightSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading your weight">
      <Skeleton className="h-[15.5rem] w-full rounded-card" />
      <Skeleton className="h-60 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-[4.5rem] rounded-tile-lg" />
        <Skeleton className="h-[4.5rem] rounded-tile-lg" />
      </div>
    </div>
  );
}
