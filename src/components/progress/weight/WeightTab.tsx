"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyArt } from "@/components/art/Motifs";
import { LoggedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useMediaQuery } from "@/components/ui/sheet";
import { useToday, useUser } from "@/lib/data/core";
import { useWeightMutations, useWeights, type WeightEntry } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { avgWindow, plannedWeight, requiredWeeklyGain, weightStats } from "@/lib/bodyweight";
import { dayName, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { changeTone, planFromProfile, planRatePerWeek, rateTone, type PlanInput } from "@/lib/progress/plan";
import { climbFraction } from "@/lib/progress/scale";
import { RANGES, buildWeightRows, dateToT, isRangeKey, lastWeighIns, nearestWeighInIndex, rangeFrom, xTicks, yDomain, type RangeKey, type WeightRow } from "@/lib/progress/weightSeries";
import { cn } from "@/lib/cn";
import { useProgressActions } from "../context";
import { ChartFrame, ChartSkeleton, PlanBadge, RowMenu, SectionHead, SrTable, StatTile, signed } from "../kit";
import { AscentScale } from "./AscentScale";
import { CalorieCard } from "./CalorieCard";

const WeightChart = dynamic(() => import("./WeightChart"), { ssr: false, loading: () => <ChartSkeleton /> });

const RANGE_KEY = "pgg.progress.range";
const PLAN_KEY = "pgg.progress.plan";

function readPref<T>(k: string, ok: (v: unknown) => v is T, fallback: T): T {
  try {
    const v = window.localStorage.getItem(k);
    if (v == null) return fallback;
    const parsed = JSON.parse(v);
    return ok(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function writePref(k: string, v: unknown) {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode — preference just isn't remembered */
  }
}

export function WeightTab() {
  const today = useToday();
  const { profile, loading: pLoading } = useProfile();
  const { weights, loading, error } = useWeights();
  const qc = useQueryClient();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const plan = planFromProfile(profile, today);
  const planRate = planRatePerWeek(plan);
  const actions = useProgressActions();

  const stats = useMemo(() => weightStats(weights, plan.startLb, plan.goalLb, today), [weights, plan.startLb, plan.goalLb, today]);
  const disp = useCallback((lb: number | null) => (lb == null ? null : round(toDisplayWeight(lb, unit), 2)), [unit]);
  const planToday = today >= plan.startDate && today <= plan.targetDate ? plannedWeight(today, plan.startDate, plan.targetDate, plan.startLb, plan.goalLb) : null;

  // Hero is written through this callback while scrubbing (no React state per frame).
  const scrub = useRef<(row: WeightRow | null) => void>(() => {});

  if (error)
    return (
      <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["weights"] })}>Couldn&apos;t load your weigh-ins. {String((error as Error).message ?? "")}</ErrorNote>
    );

  const busy = loading || pLoading;

  return (
    // Mobile: hero → chart → stats → calorie → weigh-ins. Desktop: two columns (history under the chart).
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div className="contents lg:grid lg:min-w-0 lg:grid-cols-1 lg:gap-5">
        {/* One card so the hero number stays in view while the chart is scrubbed. */}
        <Card className="order-1 min-w-0 overflow-hidden lg:order-none">
          <WeightHero busy={busy} weights={weights} stats={stats} plan={plan} unit={unit} planToday={planToday} scrubRef={scrub} disp={disp} today={today} />
          <ChartCard busy={busy} weights={weights} plan={plan} unit={unit} today={today} onScrub={(r) => scrub.current(r)} onLog={() => actions.logWeight()} />
        </Card>
        <div className="order-5 min-w-0 lg:order-none">
          <WeighInList busy={busy} weights={weights} unit={unit} />
        </div>
      </div>
      <div className="contents lg:sticky lg:top-[72px] lg:grid lg:min-w-0 lg:grid-cols-1 lg:gap-5">
        <div className="order-3 min-w-0 lg:order-none">
          <StatsCard busy={busy} stats={stats} plan={plan} planRate={planRate} unit={unit} disp={disp} today={today} />
        </div>
        <div className="order-4 min-w-0 empty:hidden lg:order-none">
          <CalorieCard weights={weights} plan={plan} planRate={planRate} unit={unit} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function WeightHero({
  busy,
  weights,
  stats,
  plan,
  unit,
  planToday,
  scrubRef,
  disp,
  today,
}: {
  busy: boolean;
  weights: WeightEntry[];
  stats: ReturnType<typeof weightStats>;
  plan: PlanInput;
  unit: WeightUnit;
  planToday: number | null;
  scrubRef: React.RefObject<(row: WeightRow | null) => void>;
  disp: (lb: number | null) => number | null;
  today: ISODate;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const eyebrowRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const avgRef = useRef<HTMLSpanElement>(null);
  const avgLabelRef = useRef<HTMLSpanElement>(null);

  const startDisp = disp(plan.startLb)!;
  const goalDisp = disp(plan.goalLb)!;
  const currentDisp = disp(stats.current);
  const avgDisp = disp(stats.avg7);
  const sinceLabel = `since ${shortDate(plan.startDate, today)}`;
  const latestEyebrow = stats.currentDate ? `Latest · ${relativeDay(stats.currentDate, today)}` : "Bodyweight";

  // Restore the latest values whenever the data changes (and on release).
  const restore = useCallback(() => {
    if (valueRef.current) valueRef.current.textContent = currentDisp != null ? currentDisp.toFixed(1) : "—";
    if (eyebrowRef.current) eyebrowRef.current.textContent = latestEyebrow;
    if (deltaRef.current) deltaRef.current.textContent = currentDisp != null ? signed(currentDisp - startDisp, 1) : "—";
    if (avgRef.current) avgRef.current.textContent = avgDisp != null ? avgDisp.toFixed(1) : "—";
    if (avgLabelRef.current) avgLabelRef.current.textContent = "7-day avg";
  }, [currentDisp, latestEyebrow, startDisp, avgDisp]);

  useEffect(() => {
    restore();
    scrubRef.current = (row) => {
      if (!row || row.weight == null) return restore();
      if (valueRef.current) valueRef.current.textContent = row.weight.toFixed(1);
      if (eyebrowRef.current) eyebrowRef.current.textContent = `Weigh-in · ${shortDate(row.date, today)}`;
      if (deltaRef.current) deltaRef.current.textContent = signed(row.weight - startDisp, 1);
      if (avgRef.current) avgRef.current.textContent = row.avg != null ? row.avg.toFixed(1) : "—";
      if (avgLabelRef.current) avgLabelRef.current.textContent = `Avg · ${shortDate(row.date, today)}`;
    };
  }, [restore, scrubRef, startDisp, today]);

  const p = climbFraction(stats.avg7 ?? stats.current, plan.startLb, plan.goalLb);
  const hasData = weights.length > 0;

  return (
    <section aria-label="Bodyweight">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex h-5 items-center gap-2">
            <span ref={eyebrowRef} className="eyebrow truncate">
              {latestEyebrow}
            </span>
            {hasData && <LoggedBadge />}
          </div>
          {busy ? (
            <Skeleton className="mt-2 h-[52px] w-40" />
          ) : (
            <p className="mt-2 whitespace-nowrap">
              <span ref={valueRef} className="num-xl">
                {currentDisp != null ? currentDisp.toFixed(1) : "—"}
              </span>
              {currentDisp != null && <span className="unit !text-[18px]">{unit}</span>}
            </p>
          )}
          <p className="mt-2 text-[13px] font-semibold text-fg-2">
            {hasData ? (
              <>
                <span ref={deltaRef} className="num text-[15px] text-fg">
                  {currentDisp != null ? signed(currentDisp - startDisp, 1) : "—"}
                </span>{" "}
                {sinceLabel}
              </>
            ) : (
              <span>Begins with your first weigh-in.</span>
            )}
          </p>
        </div>
        <div className="shrink-0 pt-6 text-right">
          <span ref={avgLabelRef} className="eyebrow block">
            7-day avg
          </span>
          <p className="mt-1.5">
            <span ref={avgRef} className="num-md">
              {avgDisp != null ? avgDisp.toFixed(1) : "—"}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AscentScale start={startDisp} goal={goalDisp} avg={avgDisp} plan={disp(planToday)} unit={unit} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-3">
        <span>
          Start <span className="num text-[13px] tracking-normal text-fg-2">{startDisp.toFixed(1)}</span>
        </span>
        <span className="text-center">
          {hasData ? (
            <>
              <span className="num text-[13px] tracking-normal text-gold-300">{Math.round(p * 100)}%</span> of the climb
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-px border-l border-dashed border-gold-700" aria-hidden /> Plan
            </span>
          )}
        </span>
        <span>
          Goal <span className="num text-[13px] tracking-normal text-fg-2">{goalDisp.toFixed(1)}</span>
        </span>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- chart */

function ChartCard({
  busy,
  weights,
  plan,
  unit,
  today,
  onScrub,
  onLog,
}: {
  busy: boolean;
  weights: WeightEntry[];
  plan: PlanInput;
  unit: WeightUnit;
  today: ISODate;
  onScrub: (row: WeightRow | null) => void;
  onLog: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [showPlan, setShowPlan] = useState(true);
  useEffect(() => {
    // per-viewer conveniences, restored after mount so SSR markup stays stable
    const r = readPref(RANGE_KEY, isRangeKey, "30d" as RangeKey);
    const p = readPref(PLAN_KEY, (v): v is boolean => typeof v === "boolean", true);
    const t = window.setTimeout(() => {
      setRange(r);
      setShowPlan(p);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const desktop = useMediaQuery("(hover: hover) and (pointer: fine)");

  const first = weights[0]?.local_date ?? null;
  const from = rangeFrom(range, today, first, plan.startDate);
  const rows = useMemo(() => buildWeightRows(weights, { from, to: today, unit, plan }), [weights, from, today, unit, plan]);
  const hasPoints = rows.some((r) => r.weight != null);
  const domainY = yDomain(rows, showPlan);
  const ticks = xTicks(from, today, desktop ? 6 : 4);

  const handleScrub = useCallback(
    (row: WeightRow | null) => {
      if (!row) return onScrub(null);
      if (row.weight != null) return onScrub(row);
      const i = nearestWeighInIndex(rows, rows.indexOf(row));
      onScrub(i == null ? null : rows[i]);
    },
    [rows, onScrub],
  );

  const recent = lastWeighIns(rows, 7);

  return (
    <div className="mt-5 border-t border-line-hair pt-4">
      <h2 className="sr-only">Trend</h2>
      <div className="mb-4 flex items-center gap-2">
        <Segmented
          size="md"
          ariaLabel="Chart range"
          value={range}
          onChange={(v) => {
            setRange(v);
            writePref(RANGE_KEY, v);
          }}
          options={RANGES.map((r) => ({ value: r.key, label: <span className="num text-[14px] tracking-[0.06em]">{r.label}</span> }))}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          aria-pressed={showPlan}
          aria-label="Show plan line"
          onClick={() => {
            setShowPlan(!showPlan);
            writePref(PLAN_KEY, !showPlan);
          }}
          className={cn(
            "press relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border border-dashed px-3.5 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors",
            showPlan ? "border-gold-700 text-gold-300" : "border-line-strong text-fg-3",
          )}
        >
          <svg width="14" height="2" aria-hidden className="overflow-visible">
            <line x1="0" y1="1" x2="14" y2="1" stroke={showPlan ? "var(--gold-600)" : "var(--text-3)"} strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
          Plan
        </button>
      </div>

      {busy ? (
        <ChartFrame>
          <ChartSkeleton />
        </ChartFrame>
      ) : !weights.length ? (
        <Empty
          art={<EmptyArt kind="plinth" size={56} />}
          title="No weigh-ins yet"
          action={
            <Button variant="secondary" onClick={onLog}>
              Log weight
            </Button>
          }
        >
          Weigh in each morning after the bathroom. The 7-day average smooths out water swings.
        </Empty>
      ) : (
        <>
          <ChartFrame swapKey={range}>
            {domainY && (hasPoints || showPlan) ? (
              <WeightChart rows={rows} domainX={[dateToT(from), dateToT(today)]} domainY={domainY} ticksX={ticks} showPlan={showPlan} unit={unit} onScrub={handleScrub} tooltip={desktop} />
            ) : (
              <div className="grid h-full place-items-center text-center text-[13px] text-fg-2">No weigh-ins in this range. Try 90D or ALL.</div>
            )}
          </ChartFrame>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-fg-3" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-[7px] rounded-full bg-marble/55" /> Weigh-ins
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-3.5 rounded-full bg-gold-400" /> 7-day average
            </span>
            {showPlan && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-3.5 border-t-[1.5px] border-dashed border-gold-700" /> Plan, illustrative
              </span>
            )}
          </div>
          <SrTable
            caption={`Last ${recent.length} weigh-ins in ${unit}`}
            head={["Date", "Weight", "7-day average"]}
            rows={recent.map((r) => [shortDate(r.date, today), r.weight!.toFixed(1), r.avg != null ? r.avg.toFixed(1) : "—"])}
          />
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- stats */

function StatsCard({
  busy,
  stats,
  plan,
  planRate,
  unit,
  disp,
  today,
}: {
  busy: boolean;
  stats: ReturnType<typeof weightStats>;
  plan: PlanInput;
  planRate: number | null;
  unit: WeightUnit;
  disp: (lb: number | null) => number | null;
  today: ISODate;
}) {
  const trend = stats.avg7 ?? stats.current;
  // A PLAN value: from the trend weight, or from the start weight before the first weigh-in.
  const needed = today < plan.targetDate ? requiredWeeklyGain(trend ?? plan.startLb, plan.goalLb, today < plan.startDate ? plan.startDate : today, plan.targetDate) : null;
  const d = (lb: number | null, dp = 1) => (lb == null ? "—" : disp(lb)!.toFixed(dp));
  const s = (lb: number | null, dp = 1) => (lb == null ? "—" : signed(disp(lb), dp));
  const planWk = planRate != null ? `Plan ${signed(disp(planRate), 2)}/wk` : null;
  const weeklyTone = rateTone(stats.weeklyChange, planRate);
  const monthlyTone = changeTone(stats.monthlyChange, 30, planRate);
  const rateToneV = rateTone(stats.ratePerWeek, planRate);
  const faster = "Faster than plan";
  const reached = stats.toGoal != null && stats.toGoal <= 0;

  const tiles = [
    { label: "Current", value: d(stats.current), unit, caption: stats.currentDate ? relativeDay(stats.currentDate, today) : "No weigh-ins yet" },
    { label: "7-day avg", value: d(stats.avg7), unit, caption: stats.avg7 != null ? "Trend weight" : "Needs a weigh-in this week" },
    {
      label: "Weekly",
      value: s(stats.weeklyChange, 2),
      unit,
      delta: stats.weeklyChange != null ? (weeklyTone === "warning" ? faster : weeklyTone === "success" ? "On plan" : planWk) : null,
      tone: weeklyTone,
      caption: stats.weeklyChange != null ? "vs the week before" : "Needs 2 weeks",
    },
    {
      label: "Monthly",
      value: s(stats.monthlyChange, 1),
      unit,
      delta: stats.monthlyChange != null ? (monthlyTone === "warning" ? faster : monthlyTone === "success" ? "On plan" : null) : null,
      tone: monthlyTone,
      caption: stats.monthlyChange != null ? "vs 30 days ago" : "Needs a month",
    },
    { label: "Since start", value: s(stats.fromStart, 1), unit, caption: stats.fromStart != null ? `7-day avg vs ${d(plan.startLb)} start` : `Start ${d(plan.startLb)} on ${shortDate(plan.startDate, today)}` },
    { label: reached ? "Goal" : "To go", value: reached ? "Reached" : d(stats.toGoal), unit: reached ? undefined : unit, caption: `7-day avg to ${d(plan.goalLb)} ${unit}` },
    {
      label: "Avg rate",
      value: s(stats.ratePerWeek, 2),
      unit: stats.ratePerWeek != null ? `${unit}/wk` : undefined,
      delta: stats.ratePerWeek != null ? (rateToneV === "warning" ? faster : rateToneV === "success" ? "On plan" : planWk) : null,
      tone: rateToneV,
      caption: stats.ratePerWeek != null ? "since first weigh-in" : "Needs a week of data",
    },
    {
      label: "Needed",
      badge: <PlanBadge />,
      value: needed != null ? signed(disp(needed), 2) : "—",
      unit: needed != null ? `${unit}/wk` : undefined,
      caption: `to reach ${d(plan.goalLb)} by ${shortDate(plan.targetDate, today)}`,
    },
  ];

  return (
    <Card>
      <SectionHead title="Bodyweight stats" className="mb-1 min-h-6" />
      <div className="grid grid-cols-2">
        {tiles.map((t, i) => (
          <div key={t.label} className={cn("py-3.5", i % 2 === 0 ? "pr-3" : "border-l border-line-hair pl-4", i >= 2 && "border-t border-line-hair")}>
            {busy ? (
              <>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2.5 h-7 w-20" />
              </>
            ) : (
              <StatTile label={t.label} value={t.value} unit={t.value === "—" ? undefined : t.unit} delta={t.delta} tone={t.tone} caption={t.caption} badge={t.badge} size="sm" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- weigh-ins */

function WeighInList({ busy, weights, unit }: { busy: boolean; weights: WeightEntry[]; unit: WeightUnit }) {
  const today = useToday();
  const actions = useProgressActions();
  const { remove } = useWeightMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [all, setAll] = useState(false);
  const desc = useMemo(() => [...weights].sort((a, b) => b.local_date.localeCompare(a.local_date)), [weights]);
  const shown = all ? desc : desc.slice(0, 8);

  const del = (row: WeightEntry) => {
    const key = ["weights", userId];
    const prev = qc.getQueryData<WeightEntry[]>(key);
    if (prev) qc.setQueryData(key, prev.filter((w) => w.id !== row.id));
    remove.mutate(row, { onError: () => prev && qc.setQueryData(key, prev) });
  };

  return (
    <Card>
      <SectionHead title={`Weigh-ins${weights.length ? ` · ${weights.length}` : ""}`} className="mb-1">
        <button type="button" onClick={() => actions.logWeight()} className="-mr-2 inline-flex h-11 items-center px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200">
          Log weight
        </button>
      </SectionHead>
      {busy ? (
        <div className="grid grid-cols-1 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !desc.length ? (
        <p className="py-3 text-[13px] text-fg-2">Your weigh-ins appear here, newest first. Tap one to edit it.</p>
      ) : (
        <ul className="-mx-1">
          {shown.map((w, i) => {
            const prev = desc[i + 1];
            const diff = prev ? toDisplayWeight(Number(w.weight_lb) - Number(prev.weight_lb), unit) : null;
            const avg = avgWindow(weights, w.local_date);
            const pending = w.id === "optimistic";
            return (
              <li key={w.id + w.local_date} className={cn("flex items-center border-line-hair [content-visibility:auto]", i > 0 && "border-t")}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => actions.logWeight(w.local_date)}
                  className="press-soft flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-[12px] px-1 py-2 text-left hover:bg-white/[.02]"
                  aria-label={`${relativeDay(w.local_date, today)}, ${Number(toDisplayWeight(Number(w.weight_lb), unit)).toFixed(1)} ${unit}. Edit`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-fg">{fmtDay(w.local_date, today)}</span>
                    <span className="block truncate text-[12px] font-medium text-fg-3">
                      {w.notes ? w.notes : avg != null ? `7-day avg ${toDisplayWeight(avg, unit).toFixed(1)}` : " "}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num-sm block">
                      {toDisplayWeight(Number(w.weight_lb), unit).toFixed(1)}
                      <span className="unit [font-size:max(12px,0.4em)]!">{unit}</span>
                    </span>
                    <span className="num block text-[12px] font-medium text-fg-3">{diff == null ? "First" : signed(diff, 1)}</span>
                  </span>
                </button>
                {!pending && <RowMenu label={fmtDay(w.local_date, today)} onEdit={() => actions.logWeight(w.local_date)} onDelete={() => del(w)} />}
              </li>
            );
          })}
        </ul>
      )}
      {desc.length > 8 && (
        <Button variant="ghost" block className="mt-1 h-11" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${desc.length}`}
        </Button>
      )}
    </Card>
  );
}

function fmtDay(d: ISODate, today: ISODate) {
  const rel = relativeDay(d, today);
  return rel === "Today" || rel === "Yesterday" ? rel : `${dayName(d, true)}, ${shortDate(d, today)}`;
}
