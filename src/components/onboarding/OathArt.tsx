"use client";

import { useMemo } from "react";
import { Ridge } from "@/components/art/Ridge";
import { Colonnade } from "@/components/signature/Colonnade";
import { Tag } from "@/components/ui/tag";
import { addDays, daysBetween, monthName, parseISODate, weekDates, type ISODate } from "@/lib/dates";
import { balancedCarbs, macroLine } from "@/lib/onboarding/macros";
import { SCHEDULE_OPTIONS, WEEK_ORDER, formatPlacardWeight, paceVerdict, planSummary, type OnboardingAnswers } from "@/lib/onboarding/plan";
import { cn } from "@/lib/cn";
import { formatInt, toDisplayWeight } from "@/lib/units";

/* ---------------------------------------------------------- the summit */

const W = 320;
const H = 150;

/**
 * Where is the summit? (docs/DESIGN-V2.md §3.11 step 2): a small mountain that draws as he sets
 * the goal — the start, the band at the top, the corridor between them and the steady line he
 * would climb. It is the plan, drawn in ivory: nothing here is earned yet.
 */
export function SummitArt({ a, today }: { a: OnboardingAnswers; today: ISODate }) {
  const plan = planSummary(a);
  const u = a.weightUnit;
  const lo = Math.min(a.startWeightLb, a.goalRangeMinLb, a.goalWeightLb) - 2;
  const hi = Math.max(a.startWeightLb, a.goalRangeMaxLb, a.goalWeightLb) + 2;
  const y = (lb: number) => 128 - ((lb - lo) / Math.max(1, hi - lo)) * 108;
  const x0 = 22;
  const x1 = 286;
  const sy = y(a.startWeightLb);
  const bandTop = y(Math.max(a.goalRangeMinLb, a.goalRangeMaxLb));
  const bandBot = y(Math.min(a.goalRangeMinLb, a.goalRangeMaxLb));
  const gy = y(a.goalWeightLb);
  const valid = a.targetDate > today && a.targetDate > a.startDate && plan.weeklyRateLb != null;
  const key = `${a.startWeightLb}|${a.goalWeightLb}|${a.targetDate}`;
  const verdict = paceVerdict(plan.weeklyRateLb);
  const rate = plan.weeklyRateLb != null ? toDisplayWeight(Math.abs(plan.weeklyRateLb), u) : null;
  const rateText = rate == null ? "—" : `~${rate >= 1 ? rate.toFixed(1) : rate.toFixed(2).replace(/0$/, "")} ${u}`;
  const target = parseISODate(a.targetDate);
  const spoken = valid
    ? `From ${formatPlacardWeight(a.startWeightLb, u)} to ${formatPlacardWeight(a.goalWeightLb, u)} ${u} by ${monthName(a.targetDate)} ${target.getFullYear()}: about ${rateText} a week.`
    : "Pick a target date after today to draw the climb.";

  return (
    <figure className="relative" aria-label={spoken} role="img">
      <div className="relative overflow-hidden rounded-card bg-m1 shadow-(--e1)">
        <Ridge className="absolute inset-x-0 bottom-0 h-1/2 w-full" opacity={0.05} />
        <svg viewBox={`0 0 ${W} ${H}`} className="relative block w-full" aria-hidden>
          {/* the band at the summit */}
          <rect x={x1 - 6} y={bandTop} width={W - x1 + 6 - 8} height={Math.max(2, bandBot - bandTop)} rx={3} style={{ fill: "rgb(242 235 221 / .06)", stroke: "var(--ui-line)" }} strokeWidth={1} />
          {valid && (
            <g key={key} className="oath-draw">
              {/* the corridor: from the start to either edge of the band */}
              <path d={`M${x0} ${sy} L${x1} ${bandTop} L${x1} ${bandBot} Z`} style={{ fill: "rgb(242 235 221 / .06)" }} />
              <path d={`M${x0} ${sy} L${x1} ${bandTop} M${x0} ${sy} L${x1} ${bandBot}`} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} fill="none" />
              {/* the steady climb (PLAN: dashed ivory) */}
              <path d={`M${x0} ${sy} L${x1} ${gy}`} pathLength={1} style={{ stroke: "var(--ivory)" }} strokeWidth={1.75} strokeDasharray="0.02 0.015" strokeLinecap="round" fill="none" />
              <circle cx={x1} cy={gy} r={4} style={{ fill: "var(--night)", stroke: "var(--ivory)" }} strokeWidth={1.5} />
            </g>
          )}
          <circle cx={x0} cy={sy} r={4.5} style={{ fill: "var(--stone)" }} />
          <text x={x0} y={sy + 18} className="t-meta" style={{ fill: "var(--stone)" }} fontSize="11">
            {formatPlacardWeight(a.startWeightLb, u)}
          </text>
          <text x={x1 + 2} y={Math.max(12, bandTop - 6)} textAnchor="end" style={{ fill: "var(--ivory)" }} fontSize="11" fontWeight={600}>
            {formatPlacardWeight(Math.min(a.goalRangeMinLb, a.goalRangeMaxLb), u)}–{formatPlacardWeight(Math.max(a.goalRangeMinLb, a.goalRangeMaxLb), u)}
          </text>
        </svg>
        <div className="flex items-center justify-between px-4 pb-3">
          <span className="t-meta text-ash">Today</span>
          <span className="t-meta text-ash">{valid ? `${monthName(a.targetDate, true)} ${target.getFullYear()}` : "—"}</span>
        </div>
      </div>
      <figcaption className="mt-4">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="t-num-l text-ivory">{valid ? rateText : "—"}</span>
          <span className="t-callout text-stone">{plan.weeklyRateLb != null && plan.weeklyRateLb < 0 ? "lost a week" : "a week"}</span>
          {valid && (
            <Tag
              kind="CALC"
              explain={`(${formatPlacardWeight(a.goalWeightLb, u)} − ${formatPlacardWeight(a.startWeightLb, u)}) ${u} over ${formatInt(daysBetween(a.startDate, a.targetDate))} days`}
            />
          )}
        </p>
        <p className="t-callout mt-1 text-stone">
          {!valid
            ? "Pick a date after today to see the weekly pace."
            : verdict === "achievable"
              ? `Achievable for a lean gain: ${plan.weeks} weeks to the band.`
              : verdict === "fast"
                ? "Fast for a lean gain. A later date keeps more of it muscle."
                : verdict === "too_fast"
                  ? "Faster than this mostly adds fat. Try a later date."
                  : verdict === "hold"
                    ? "Holding your weight."
                    : `A loss of about ${rateText} a week.`}
        </p>
      </figcaption>
      <style>{`
        .oath-draw { animation: oath-rise 600ms var(--ease-out) both; }
        @keyframes oath-rise { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </figure>
  );
}

/* ----------------------------------------------------------- the temple */

/** How do you train? — the week's temple builds column by column as days get a session. */
export function TempleArt({ a, today }: { a: OnboardingAnswers; today: ISODate }) {
  const days = useMemo(() => {
    const week = weekDates(today);
    // weekDates is Monday-first; WEEK_ORDER keys are JS weekdays ("1" = Monday … "0" = Sunday)
    return WEEK_ORDER.map((d, i) => {
      const key = a.schedule[d] ?? "rest";
      const label = SCHEDULE_OPTIONS.find((o) => o.value === key)?.label ?? "Rest";
      return { date: week[i] ?? addDays(today, i), kind: key === "rest" ? ("rest" as const) : ("train" as const), label, done: false, today: false, volleyball: false };
    });
  }, [a.schedule, today]);
  return <Colonnade days={days} height={96} />;
}

/* -------------------------------------------------------------- the fuel */

/** How do you eat? — the arithmetic behind the calorie target, every line CALC. */
export function FuelArithmetic({ a, className }: { a: OnboardingAnswers; className?: string }) {
  const carbs = balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal);
  const line = macroLine({ calories: a.calorieGoal, protein: a.proteinGoal, carbs, fat: a.fatGoal });
  const rows: { label: string; g: number; per: number; tone: string }[] = [
    { label: "Protein", g: a.proteinGoal, per: 4, tone: "bg-leaf-300" },
    { label: "Carbs", g: carbs, per: 4, tone: "bg-carbs" },
    { label: "Fat", g: a.fatGoal, per: 9, tone: "bg-fat" },
  ];
  const total = rows.reduce((s, r) => s + r.g * r.per, 0);
  return (
    <section className={cn("rounded-card bg-m2 p-4 shadow-(--e1)", className)} aria-label="How the calories add up">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-m3" aria-hidden>
        {rows.map((r) => (
          <span key={r.label} className={cn("h-full", r.tone)} style={{ width: `${total > 0 ? (r.g * r.per * 100) / total : 0}%` }} />
        ))}
      </div>
      <dl className="mt-3 divide-y divide-vein">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="t-callout flex items-center gap-2 text-stone">
              <span className={cn("size-2 rounded-full", r.tone)} aria-hidden />
              {r.label}
            </dt>
            <dd className="t-num-s tnum text-ivory">
              {formatInt(r.g)} g × {r.per} = {formatInt(r.g * r.per)} kcal
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-2.5">
          <dt className="t-callout flex items-center gap-2 font-semibold text-ivory">
            Adds up to <Tag kind="CALC" />
          </dt>
          <dd className={cn("t-num-s tnum", line.ok ? "text-ivory" : "text-cinnabar")}>{formatInt(total)} kcal</dd>
        </div>
      </dl>
      <p className="t-meta mt-1 text-ash">Carbs fill what protein and fat leave, so the three always add up to your calories.</p>
    </section>
  );
}
