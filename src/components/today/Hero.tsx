"use client";

import { AscentFrieze } from "@/components/signature/AscentFrieze";
import { cn } from "@/lib/cn";
import { dayName, monthName, parseISODate, relativeDay } from "@/lib/dates";
import { DAWN } from "@/lib/today/dawn";
import { greeting } from "@/lib/today/greeting";
import { formatBodyweight, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { CountTo, useDawn, useHour } from "./dawn";
import type { TodayModel } from "./useTodayModel";

/** Today hero — the one Monument on the screen. */
export function Hero({ m, line, className }: { m: TodayModel; line: string; className?: string }) {
  const { play } = useDawn();
  const hour = useHour();
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  const t = m.timeline;
  const a = m.ascent;
  const d = parseISODate(m.today);
  const dateLine = `${dayName(m.today)} · ${monthName(m.today)} ${d.getDate()}`;
  const pct = Math.round(a.p * 100);
  const rangeMin = m.profile.goal_range_min_lb;
  const rangeMax = m.profile.goal_range_max_lb;
  const range =
    rangeMin != null && rangeMax != null
      ? `${fmtWhole(Number(rangeMin), unit)}–${fmtWhole(Number(rangeMax), unit)} ${unit}`
      : a.goal != null
        ? "Goal weight"
        : "Set in Settings";

  return (
    <section
      aria-labelledby="today-greeting"
      className={cn("card-monument relative flex flex-col overflow-hidden px-5 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-7 lg:pb-6 lg:pt-7", className)}
      style={play ? { animation: `rise 700ms var(--ease-out) ${DAWN.heroFade}ms both` } : undefined}
    >
      <p className="eyebrow !text-gold-300">{dateLine}</p>
      <h1 id="today-greeting" className="t-hero mt-2.5 text-fg [text-wrap:balance]">
        {greeting(hour, m.profile.display_name)}
      </h1>
      <p className="mt-2.5 line-clamp-2 max-w-[44ch] text-[15px] font-medium leading-[1.45] text-fg-2 [text-wrap:pretty]">{line}</p>

      {/* Countdown + week + frieze — centred in any extra height when a grid row stretches the hero */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="num-xl text-gold">
              <CountTo from={t.totalDays} to={t.daysLeft} play={play} delay={DAWN.countdownStart} duration={DAWN.countdownDuration} />
            </p>
            <p className="eyebrow mt-2 truncate">{t.countdownLabel}</p>
          </div>
          <div className="shrink-0 text-right">
            {t.started ? (
              <p className="num-md text-fg">
                <span className="sr-only">Training week </span>
                {t.week}
                <span className="text-fg-3"> / {t.weeks}</span>
              </p>
            ) : (
              <p className="num-md text-fg-2">—</p>
            )}
            <p className="eyebrow mt-2">{t.started ? "Training week" : "Starts soon"}</p>
          </div>
        </div>

        <AscentFrieze className="mt-5" elapsed={t.elapsed} startLabel={t.startLabel} endLabel={t.endLabel} caption={t.caption} draw={play} delay={DAWN.friezeStart} />
      </div>

      {/* Hairline strip: current · goal · target */}
      <dl className="mt-5 grid grid-cols-3 border-t border-line-hair pt-4">
        <div className="min-w-0 pr-3">
          <dt className="eyebrow">{a.hasData || m.weightsFailed ? "Current" : "Start"}</dt>
          <dd className={cn("num-md mt-1.5 truncate", a.hasData ? "text-fg" : "text-fg-2")}>
            {a.hasData ? formatBodyweight(a.latest, unit, false) : a.start != null && !m.weightsFailed ? formatBodyweight(a.start, unit, false) : "—"}
            {(a.hasData || (a.start != null && !m.weightsFailed)) && <span className="unit">{unit}</span>}
          </dd>
          <dd className="mt-1 truncate text-[12px] font-medium text-fg-3">{a.hasData && a.latestDate ? loggedWhen(a.latestDate, m.today) : m.weightsFailed ? "Couldn't load" : "Log a weigh-in"}</dd>
        </div>
        <div className="min-w-0 border-l border-line-hair px-3">
          <dt className="eyebrow">Goal</dt>
          <dd className="num-md mt-1.5 truncate text-fg">
            {a.goal != null ? fmtWhole(a.goal, unit) : "—"}
            {a.goal != null && <span className="unit">{unit}</span>}
          </dd>
          <dd className="mt-1 truncate text-[12px] font-medium text-fg-3">{range}</dd>
        </div>
        <div className="min-w-0 border-l border-line-hair pl-3">
          <dt className="eyebrow">Target</dt>
          <dd className="num-md mt-1.5 truncate text-fg">
            <CountTo from={0} to={pct} play={play && pct > 0} delay={DAWN.friezeStart} duration={DAWN.friezeDuration} />
            <span className="unit">%</span>
          </dd>
          <dd className="mt-1 truncate text-[12px] font-medium text-fg-3">of the climb</dd>
        </div>
      </dl>
    </section>
  );
}

/** "Logged today" / "Logged yesterday" / "Logged Oct 12" */
function loggedWhen(date: string, today: string) {
  const rel = relativeDay(date, today);
  return `Logged ${rel === "Today" || rel === "Yesterday" ? rel.toLowerCase() : rel}`;
}

/** Whole numbers stay whole ("183"), otherwise one decimal. */
function fmtWhole(lb: number, unit: WeightUnit) {
  const v = round(toDisplayWeight(lb, unit), 1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
