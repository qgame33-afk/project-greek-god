"use client";

import { Colonnade } from "@/components/signature/Colonnade";
import { CardAction } from "@/components/ui/card";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { monthName, parseISODate } from "@/lib/dates";
import { trendCaption, trendTone, type TrendTone } from "@/lib/today/ascent";
import { fmtHours } from "@/lib/today/daily-line";
import { formatDelta, formatInt, type WeightUnit } from "@/lib/units";
import type { TodayModel } from "./useTodayModel";

/** This week: the Colonnade plus eight honest stat tiles. */
export function WeekCard({ m, loading, error, onRetry, className }: { m: TodayModel; loading: boolean; error?: Error | null; onRetry?: () => void; className?: string }) {
  const o = m.overview;
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  const a = m.ascent;
  const tone = trendTone(a.weeklyChange, m.planRate);
  const planLabel = m.planRate != null ? formatDelta(m.planRate, unit) : null;
  const s = parseISODate(m.week[0]);
  const e = parseISODate(m.week[6]);
  const range = s.getMonth() === e.getMonth() ? `${monthName(m.week[0], true)} ${s.getDate()}–${e.getDate()}` : `${monthName(m.week[0], true)} ${s.getDate()} – ${monthName(m.week[6], true)} ${e.getDate()}`;
  const left = Math.max(0, o.scheduled - o.done);
  const sleepGoal = Number(m.profile.sleep_goal_h);

  const tiles: { label: string; value: string; unit?: string; caption: string; tone?: TrendTone }[] = [
    {
      label: "Workouts",
      value: `${o.done}`,
      unit: `/ ${o.scheduled}`,
      caption: o.scheduled === 0 ? "None planned" : left === 0 ? "Week complete" : `${left} to go this week`,
      tone: o.scheduled > 0 && left === 0 ? "good" : "neutral",
    },
    {
      label: "Adherence",
      value: o.adherencePct != null ? `${o.adherencePct}` : "—",
      unit: o.adherencePct != null ? "%" : undefined,
      caption: o.adherencePct != null ? `${Math.min(o.done, o.due)} of ${o.due} due so far` : "From your first session",
    },
    {
      label: "Avg kcal",
      value: o.avgCalories != null ? formatInt(o.avgCalories) : "—",
      caption: o.avgCalories != null ? `${o.nutritionDays} ${o.nutritionDays === 1 ? "day" : "days"} · target ${formatInt(m.profile.calorie_goal)}` : "After a full logged day",
    },
    {
      label: "Avg protein",
      value: o.avgProtein != null ? formatInt(o.avgProtein) : "—",
      unit: o.avgProtein != null ? "g" : undefined,
      caption: o.avgProtein != null ? `target ${formatInt(m.profile.protein_goal)} g` : "After a full logged day",
      tone: o.avgProtein != null && o.avgProtein >= m.profile.protein_goal ? "good" : "neutral",
    },
    {
      label: "Weight trend",
      value: a.weeklyChange != null ? formatDelta(a.weeklyChange, unit).replace(` ${unit}`, "") : "—",
      unit: a.weeklyChange != null ? `${unit}/wk` : undefined,
      caption: trendCaption(tone, a.weeklyChange, planLabel),
      tone,
    },
    {
      label: "Sleep",
      value: o.avgSleep != null ? fmtHours(o.avgSleep) : "—",
      unit: o.avgSleep != null ? "h" : undefined,
      caption: o.avgSleep != null ? `avg of ${o.sleepDays} · goal ${fmtHours(sleepGoal)} h` : "Log a check-in",
      tone: o.avgSleep != null && o.avgSleep >= sleepGoal ? "good" : "neutral",
    },
    {
      label: "PRs",
      value: `${o.prs}`,
      caption: o.prs > 0 ? "Records this week" : "Beat a previous best",
    },
    {
      label: "Streak",
      value: m.streak != null ? (m.streak >= 90 ? "90+" : `${m.streak}`) : "—",
      unit: m.streak != null ? (m.streak === 1 ? "day" : "days") : undefined,
      caption: m.streak ? "60%+ of missions" : "Hit 60% of missions",
    },
  ];

  return (
    <section aria-label="This week" className={cn("card @container flex h-full flex-col p-4 sm:p-5 lg:p-6", className)}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <h2 className="eyebrow">
          This week · <span className="text-fg-2">{range}</span>
        </h2>
        <CardAction href="/training">Training</CardAction>
      </div>
      {error && (
        <ErrorNote className="mb-3" onRetry={onRetry}>
          Couldn&apos;t load this week&apos;s logs.
        </ErrorNote>
      )}
      <div className="px-1 py-1">
        <Colonnade days={o.colonnade} height={88} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 @[560px]:grid-cols-4">
        {tiles.map((t) =>
          loading && t.value === "—" ? (
            <Skeleton key={t.label} className="h-[86px] rounded-[14px]" />
          ) : (
            <div key={t.label} className="min-w-0 rounded-[14px] bg-s2 px-3 py-3 ring-1 ring-line-hair ring-inset">
              <dt className="eyebrow truncate">{t.label}</dt>
              <dd className={cn("num-md mt-1.5 truncate", t.value === "—" ? "text-fg-3" : "text-fg")}>
                {t.value}
                {t.unit && <span className="unit">{t.unit}</span>}
              </dd>
              <dd
                className={cn(
                  "mt-1 line-clamp-2 text-[12px] font-semibold leading-snug",
                  t.tone === "good" ? "text-success" : t.tone === "warn" ? "text-warning" : "text-fg-3",
                )}
              >
                {t.caption}
              </dd>
            </div>
          ),
        )}
      </dl>
    </section>
  );
}
