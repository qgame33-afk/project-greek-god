"use client";

import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { LoggedBadge, PRBadge } from "@/components/ui/badge";
import { Card, CardAction, CardHeader } from "@/components/ui/card";
import { useSignedUrls } from "@/lib/data/body";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import type { MonthWeightSeries, ReviewStats } from "@/lib/reviews/compute";
import {
  formatBodyweight,
  formatDelta,
  formatInt,
  formatLength,
  formatLiters,
  formatLoad,
  round,
  toDisplayWeight,
  type LengthUnit,
  type WeightUnit,
} from "@/lib/units";
import { FiveScale, Metric, Sub } from "./kit";
import { WeightChart } from "./WeightChart";

/** "1 day" / "2 days" — a review on the 1st of the month must not read "1 days". */
const days = (n: number) => (n === 1 ? "day" : "days");
const weeks = (n: number) => (n === 1 ? "week" : "weeks");

const POSE: Record<string, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
  flex_front: "Flex front",
  flex_back: "Flex back",
  other: "Other",
};
const W = (lb: number | null, unit: WeightUnit) =>
  lb == null ? "—" : formatBodyweight(lb, unit, false);

/* --------------------------------------------------------------- physical */

export function PhysicalCard({
  s,
  unit,
  lengthUnit,
  series,
  className,
}: {
  s: ReviewStats;
  unit: WeightUnit;
  lengthUnit: LengthUnit;
  series: MonthWeightSeries | null;
  className?: string;
}) {
  const p = s.physical;
  const m = p.measurements;
  const ahead =
    p.change != null &&
    p.plannedChange != null &&
    p.change >= p.plannedChange * 0.5 &&
    p.change <= p.plannedChange * 1.6 &&
    p.plannedChange > 0;
  return (
    <Card className={cn("review-card", className)}>
      <CardHeader
        title="Physical"
        action={p.weighIns > 0 ? <LoggedBadge /> : undefined}
      />
      <div className="review-metrics grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric
          label="Start of month"
          value={W(p.monthStartAvg, unit)}
          unit={unit}
          caption={
            p.monthStartDate
              ? `7-day avg from ${shortDate(p.monthStartDate, s.window.to)}`
              : "No weigh-ins yet"
          }
        />
        <Metric
          label={s.window.complete ? "End of month" : "Current"}
          value={W(p.monthEndAvg, unit)}
          unit={unit}
          caption={
            p.monthEndDate
              ? `7-day avg to ${shortDate(p.monthEndDate, s.window.to)}`
              : "Log a weigh-in to start"
          }
        />
        <Metric
          label="Monthly change"
          value={
            p.change == null
              ? "—"
              : formatDelta(p.change, unit).replace(` ${unit}`, "")
          }
          unit={unit}
          tone={ahead ? "good" : "neutral"}
          compare={
            p.plannedChange != null
              ? `${ahead ? "On track · plan" : "Plan"} ${formatDelta(p.plannedChange, unit)}`
              : undefined
          }
          caption={
            p.change == null
              ? p.weighIns
                ? "Needs weigh-ins a week apart"
                : undefined
              : // a month change, never a rate (DESIGN-V2 §3.8): the weekly pace lives on Now and Ascent
                p.earlyWater
                ? "Includes early water and glycogen. The weekly pace uses the last 4 weeks."
                : "7-day averages, start to end"
          }
        />
        <Metric
          label="Weigh-ins"
          value={p.weighIns || "—"}
          caption={
            p.weighIns
              ? `${s.window.days} ${days(s.window.days)} in this review`
              : "None this month"
          }
        />
      </div>
      {series && <WeightChart series={series} unit={unit} />}
      {p.startWeight != null && p.monthEndAvg != null && (
        <p className="review-sub mt-5 rounded-[12px] bg-s3/60 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-fg-2">
          <span className="text-fg">{formatDelta(p.fromStart, unit)}</span>{" "}
          since the start ({formatBodyweight(p.startWeight, unit)}).{" "}
          {p.toGoal != null && p.toGoal > 0 && (
            <>
              <span className="text-fg">
                {formatBodyweight(p.toGoal, unit)}
              </span>{" "}
              to the {formatBodyweight(p.goalWeight, unit)} goal.
            </>
          )}
          {p.toGoal != null && p.toGoal <= 0 && <>Goal weight reached.</>}
        </p>
      )}

      <Sub
        title="Measurements"
        aside={
          m.date
            ? m.previousDate
              ? `${shortDate(m.date, s.window.to)} vs ${shortDate(m.previousDate, s.window.to)}`
              : shortDate(m.date, s.window.to)
            : undefined
        }
      >
        {m.fields.length === 0 ? (
          <EmptyLine href="/progress?tab=body" action="Measure">
            No measurements yet. Tape the same spots each month to see change
            the scale can&apos;t show.
          </EmptyLine>
        ) : (
          <>
            {!m.updatedThisMonth && (
              <p className="mb-2 text-[12.5px] font-medium text-fg-3">
                Nothing new this month. Showing your latest entry.
              </p>
            )}
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {m.fields.map((f) => {
                const pct = f.key === "body_fat_pct";
                const val = pct
                  ? `${round(f.value, 1)}%`
                  : formatLength(f.value, lengthUnit);
                const delta =
                  f.change == null || f.change === 0
                    ? null
                    : pct
                      ? `${f.change > 0 ? "+" : "−"}${Math.abs(round(f.change, 1))}%`
                      : `${f.change > 0 ? "+" : "−"}${formatLength(Math.abs(f.change), lengthUnit)}`;
                return (
                  <div
                    key={f.key}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-line-hair last:border-0 sm:[&:nth-last-child(2)]:border-0"
                  >
                    <dt className="text-[14px] font-semibold text-fg-2">
                      {f.label}
                    </dt>
                    <dd className="flex items-baseline gap-2.5">
                      {delta && (
                        <span
                          className={cn(
                            "text-[12px] font-bold",
                            f.growthIsGood && f.change! > 0
                              ? "text-success"
                              : "text-fg-3",
                          )}
                        >
                          {delta}
                        </span>
                      )}
                      <span className="num-xs text-[16px] text-fg">{val}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </Sub>

      <Sub
        title="Progress photos"
        aside={
          p.photos.count
            ? `${p.photos.count} photo${p.photos.count === 1 ? "" : "s"}`
            : undefined
        }
      >
        <ReviewPhotos s={s} />
      </Sub>
    </Card>
  );
}

function ReviewPhotos({ s }: { s: ReviewStats }) {
  const items = s.physical.photos.items.slice(-4);
  const urls = useSignedUrls(
    "progress-photos",
    items.map((i) => i.storage_path),
  );
  if (!items.length) {
    return (
      <EmptyLine href="/progress?tab=photos" action="Add photos">
        No photos this month. Front, side and back every 2–4 weeks, same light.
      </EmptyLine>
    );
  }
  return (
    <Link
      href="/progress?tab=photos"
      className="press-soft group block"
      aria-label="Open progress photos"
    >
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => {
          const url = urls.data?.[it.storage_path];
          return (
            <figure key={it.id} className="min-w-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[10px] border border-gold-800/70 bg-s3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                  <img
                    src={url}
                    alt={`${POSE[it.pose] ?? it.pose} photo, ${shortDate(it.local_date, s.window.to)}`}
                    className="absolute inset-0 size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Camera
                    className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-fg-3"
                    aria-hidden
                  />
                )}
              </div>
              <figcaption className="mt-1.5 truncate text-[11px] font-semibold text-fg-3">
                {POSE[it.pose] ?? it.pose} ·{" "}
                {shortDate(it.local_date, s.window.to)}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </Link>
  );
}

function EmptyLine({
  children,
  href,
  action,
}: {
  children: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-s3/60 py-2 pl-3.5 pr-1.5">
      <p className="text-[13px] font-medium leading-snug text-fg-2">
        {children}
      </p>
      <Link
        href={href}
        data-print="hide"
        className="inline-flex h-11 shrink-0 items-center gap-0.5 px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200"
      >
        {action}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- training */

export function TrainingCard({
  s,
  unit,
  className,
}: {
  s: ReviewStats;
  unit: WeightUnit;
  className?: string;
}) {
  const t = s.training;
  return (
    <Card className={cn("review-card", className)}>
      <CardHeader
        title="Training"
        action={
          t.sessions > 0 ? (
            <span data-print="hide">
              <CardAction href="/training">History</CardAction>
            </span>
          ) : undefined
        }
      />
      <div className="review-metrics grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric
          label="Workouts"
          value={t.sessions || (t.planned ? "0" : "—")}
          compare={t.planned ? `of ${t.planned} planned` : undefined}
          caption={
            t.avgSessionMin ? `${t.avgSessionMin} min average` : undefined
          }
        />
        <Metric
          label="Adherence"
          value={t.adherencePct ?? "—"}
          unit={t.adherencePct != null ? "%" : undefined}
          caption={
            s.recovery.consistency.weeks
              ? `${s.recovery.consistency.weeksOnPlan} of ${s.recovery.consistency.weeks} ${weeks(s.recovery.consistency.weeks)} on plan`
              : undefined
          }
        />
        <Metric
          label="Working sets"
          value={t.workingSets ? formatInt(t.workingSets) : "—"}
          caption={t.workingSets ? "Completed, warm-ups excluded" : undefined}
        />
        <Metric
          label="Volume"
          value={
            t.volumeLb ? formatInt(toDisplayWeight(t.volumeLb, unit)) : "—"
          }
          unit={t.volumeLb ? unit : undefined}
          caption={t.volumeLb ? "Load × reps" : undefined}
        />
      </div>

      {t.weeks.some((w) => w.planned > 0 || w.done > 0) && (
        <Sub title="Week by week" aside="Gold = done">
          <ul className="space-y-2">
            {t.weeks.filter((w) => w.planned > 0 || w.done > 0 || w.extra > 0).map((w) => {
              const slots = Math.max(w.planned, w.done);
              return (
                <li
                  key={w.weekStart}
                  className="grid grid-cols-[64px_1fr_44px] items-center gap-3"
                >
                  <span className="text-[12.5px] font-semibold text-fg-3">
                    {shortDate(w.weekStart, s.window.to)}
                  </span>
                  <span
                    className="flex gap-1.5"
                    role="img"
                    aria-label={`Week of ${shortDate(w.weekStart, s.window.to)}: ${w.done} of ${w.planned} planned sessions`}
                  >
                    {Array.from({ length: Math.max(slots, 1) }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-3.5 max-w-7 flex-1 rounded-[4px]",
                          i < w.done
                            ? "bg-[image:var(--grad-progress)]"
                            : slots === 0
                              ? "border border-dashed border-line"
                              : "border border-line-strong",
                        )}
                      />
                    ))}
                  </span>
                  <span className="num-xs text-right text-fg-2">
                    {w.done}/{w.planned}
                  </span>
                </li>
              );
            })}
          </ul>
        </Sub>
      )}

      <Sub
        title="Personal records"
        aside={
          t.prs.count
            ? `${t.prs.count} record set${t.prs.count === 1 ? "" : "s"}`
            : undefined
        }
      >
        {t.prs.items.length === 0 ? (
          <p className="text-[13px] font-medium leading-relaxed text-fg-3">
            {t.sessions
              ? "No new records this month. Records need earlier history to beat, so they come in waves."
              : "Records appear here once you log sessions."}
          </p>
        ) : (
          <ul className="divide-y divide-line-hair">
            {t.prs.items.slice(0, 5).map((r) => (
              <li
                key={r.slug}
                className="flex min-h-12 items-center gap-3 py-1.5"
              >
                <PRBadge />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-fg">
                    {r.name}
                  </span>
                  <span className="block text-[12px] font-medium text-fg-3">
                    {r.weight != null && r.reps != null
                      ? `${formatLoad(r.weight, unit, false)} × ${r.reps} · `
                      : ""}
                    {shortDate(r.date, s.window.to)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num-xs block text-fg">
                    {formatLoad(r.e1rm, unit)}
                  </span>
                  {r.gain != null && (
                    <span className="block text-[11.5px] font-bold text-gold-300">
                      {formatDelta(r.gain, unit)} e1RM
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Sub>

      {t.lifts.length > 0 && (
        <Sub title="Strength" aside="e1RM, first → last session">
          <ul className="divide-y divide-line-hair">
            {t.lifts.map((l) => (
              <li
                key={l.slug}
                className="flex min-h-11 items-center gap-3 py-1.5"
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-snug text-fg-2">
                  {l.name}
                </span>
                <span className="num-xs shrink-0 text-fg-3">
                  {formatLoad(l.startE1rm, unit, false)} →{" "}
                  <span className="text-fg">
                    {formatLoad(l.endE1rm, unit, false)}
                  </span>
                </span>
                <span
                  className={cn(
                    "w-16 shrink-0 text-right text-[12px] font-bold",
                    l.change > 0 ? "text-success" : "text-fg-3",
                  )}
                >
                  {l.change === 0 ? "Flat" : formatDelta(l.change, unit)}
                </span>
              </li>
            ))}
          </ul>
        </Sub>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- nutrition */

export function NutritionCard({
  s,
  className,
}: {
  s: ReviewStats;
  className?: string;
}) {
  const n = s.nutrition;
  const max = Math.max(
    n.calorieTarget * 1.25,
    ...n.weeks.map((w) => w.avgCalories ?? 0),
  );
  const hasPartial = n.weeks.some((w) => w.days > 0 && w.days < 3);
  // name the two weeks the trend actually compares (first and last with 3+ logged days)
  const trendLabel =
    n.trend && n.trendFrom && n.trendTo
      ? `${shortDate(n.trendFrom, s.window.to)} → ${shortDate(n.trendTo, s.window.to)} · ${n.trend === "flat" ? "steady" : `${(n.trendDelta ?? 0) > 0 ? "+" : "−"}${formatInt(Math.abs(n.trendDelta ?? 0))} kcal`}`
      : undefined;
  return (
    <Card className={cn("review-card", className)}>
      <CardHeader
        title="Nutrition"
        action={
          n.daysLogged > 0 ? (
            <span className="text-[12px] font-semibold text-fg-3">
              Logged days only
            </span>
          ) : undefined
        }
      />
      <div className="review-metrics grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric
          label="Avg calories"
          value={n.avgCalories != null ? formatInt(n.avgCalories) : "—"}
          unit={n.avgCalories != null ? "kcal" : undefined}
          compare={`Target ${formatInt(n.calorieTarget)}`}
          caption={
            n.daysLogged
              ? `On target ${n.calorieHitDays} of ${n.daysLogged} ${days(n.daysLogged)}`
              : undefined
          }
        />
        <Metric
          label="Avg protein"
          value={n.avgProtein ?? "—"}
          unit={n.avgProtein != null ? "g" : undefined}
          compare={`Target ${n.proteinTarget} g`}
          caption={
            n.daysLogged
              ? `Hit ${n.proteinHitDays} of ${n.daysLogged} ${days(n.daysLogged)}`
              : undefined
          }
        />
        <Metric
          label="Days logged"
          value={n.daysLogged || "0"}
          compare={`of ${n.daysInWindow}`}
          caption={
            n.avgCarbs != null
              ? `${n.avgCarbs} g carbs · ${n.avgFat} g fat avg`
              : undefined
          }
        />
        <Metric
          label="Water"
          value={
            n.waterAvgMl != null
              ? formatLiters(n.waterAvgMl).replace(" L", "")
              : "—"
          }
          unit={n.waterAvgMl != null ? "L" : undefined}
          compare={`Goal ${formatLiters(n.waterGoalMl)}`}
          caption={
            n.waterDays
              ? `Reached on ${n.waterGoalDays} of ${n.waterDays} ${days(n.waterDays)}`
              : undefined
          }
        />
      </div>

      {n.daysLogged === 0 ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-[12px] bg-s3/60 py-2 pl-3.5 pr-1.5">
          <p className="text-[13px] font-medium text-fg-2">
            No food logged in this period.
          </p>
          <Link
            href="/nutrition?add=1"
            data-print="hide"
            className="inline-flex h-11 shrink-0 items-center px-2 text-[13px] font-bold text-gold-300"
          >
            Log food
          </Link>
        </div>
      ) : (
        <Sub title="Intake by week" aside={trendLabel}>
          <ul className="space-y-3">
            {n.weeks.map((w) => {
              const p =
                w.avgCalories != null ? Math.min(1, w.avgCalories / max) : 0;
              const target = n.calorieTarget / max;
              const partial = w.days > 0 && w.days < 3;
              return (
                <li
                  key={w.weekStart}
                  className={cn(
                    "grid grid-cols-[64px_1fr] items-center gap-3",
                    partial && "opacity-60",
                  )}
                >
                  <span className="text-[12.5px] font-semibold text-fg-3">
                    {shortDate(w.weekStart, s.window.to)}
                  </span>
                  <div className="min-w-0">
                    <div
                      className="relative h-2 overflow-hidden rounded-full bg-white/[.07]"
                      role="img"
                      aria-label={
                        w.avgCalories != null
                          ? `Week of ${shortDate(w.weekStart, s.window.to)}: ${formatInt(w.avgCalories)} kcal average over ${w.days} logged days${partial ? ", not counted in the trend" : ""}`
                          : "No food logged"
                      }
                    >
                      {w.avgCalories != null && (
                        <div
                          className="absolute inset-0 rounded-full bg-[image:var(--grad-progress)]"
                          style={{ transform: `translateX(${(p - 1) * 100}%)` }}
                        />
                      )}
                      <span
                        className="absolute inset-y-[-2px] w-[2px] bg-fg/70"
                        style={{ left: `calc(${target * 100}% - 1px)` }}
                        aria-hidden
                      />
                    </div>
                    <p className="mt-1 flex justify-between gap-2 text-[12px] font-medium text-fg-3">
                      <span className="shrink-0">
                        {w.days
                          ? `${w.days} day${w.days === 1 ? "" : "s"}${partial ? " · partial" : ""}`
                          : "Not logged"}
                      </span>
                      {w.avgCalories != null && (
                        <span className="truncate tabular-nums">
                          <span className="text-fg-2">
                            {formatInt(w.avgCalories)} kcal
                          </span>{" "}
                          · {w.avgProtein} g protein
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] font-medium leading-relaxed text-fg-3">
            The white tick is your {formatInt(n.calorieTarget)} kcal target.
            {hasPartial &&
              n.trend &&
              " The trend compares weeks with 3 or more logged days."}
          </p>
        </Sub>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- recovery */

export function RecoveryCard({
  s,
  className,
}: {
  s: ReviewStats;
  className?: string;
}) {
  const r = s.recovery;
  return (
    <Card className={cn("review-card", className)}>
      <CardHeader
        title="Recovery"
        action={
          r.checkIns > 0 ? (
            <span data-print="hide">
              <CardAction href="/recovery">Check-ins</CardAction>
            </span>
          ) : undefined
        }
      />
      <div className="review-metrics grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric
          label="Avg sleep"
          value={r.avgSleep ?? "—"}
          unit={r.avgSleep != null ? "h" : undefined}
          compare={`Goal ${r.sleepGoal} h`}
          caption={
            r.sleepNights
              ? `Goal met ${r.nightsAtGoal} of ${r.sleepNights} nights`
              : undefined
          }
        />
        <Metric
          label="Check-ins"
          value={r.checkIns || "0"}
          compare={`of ${s.window.days} ${days(s.window.days)}`}
          caption={r.painDays ? `${r.painDays} with a pain note` : undefined}
        />
        <Metric
          label="Sessions / week"
          value={r.consistency.avgSessionsPerWeek ?? "—"}
          caption={
            r.consistency.weeks
              ? `${r.consistency.weeksOnPlan} of ${r.consistency.weeks} ${weeks(r.consistency.weeks)} at 80%+ of plan`
              : undefined
          }
        />
        <Metric
          label="Volleyball"
          value={r.volleyballDays || "0"}
          unit="days"
        />
      </div>
      <Sub title="Reported, average" aside="1 low · 5 high">
        {r.checkIns === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-s3/60 py-2 pl-3.5 pr-1.5">
            <p className="text-[13px] font-medium text-fg-2">
              No check-ins in this period.
            </p>
            <Link
              href="/recovery?checkin=1"
              data-print="hide"
              className="inline-flex h-11 shrink-0 items-center px-2 text-[13px] font-bold text-gold-300"
            >
              Check in
            </Link>
          </div>
        ) : (
          <div>
            <FiveScale
              label="Sleep quality"
              value={r.avgQuality}
              low="poor"
              high="great"
            />
            <FiveScale
              label="Energy"
              value={r.avgEnergy}
              low="drained"
              high="fresh"
            />
            <FiveScale
              label="Fatigue"
              value={r.avgFatigue}
              low="fresh"
              high="drained"
            />
            <FiveScale
              label="Soreness"
              value={r.avgSoreness}
              low="none"
              high="very sore"
            />
            <FiveScale
              label="Stress"
              value={r.avgStress}
              low="calm"
              high="high"
            />
            <p className="mt-2 text-[12px] font-medium text-fg-3">
              Self-reported. A guide for planning, not a medical assessment.
            </p>
          </div>
        )}
      </Sub>
    </Card>
  );
}
