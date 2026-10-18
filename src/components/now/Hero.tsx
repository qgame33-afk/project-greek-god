"use client";

import { useState } from "react";
import { Statue } from "@/components/art/Statue";
import { useOnline } from "@/components/workout/stores";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { dayMonth, MIN_WEIGHINS } from "@/lib/progress/pace";
import { clockOf, keepTail, programWeekLabel, scaleLine } from "@/lib/today/now";
import { round, toDisplayWeight } from "@/lib/units";
import { Tick } from "./Tick";
import type { NowModel } from "./useNowData";

export interface UnveilState {
  /** The gild the statue shows right now (yesterday's for the first 300 ms of the Unveiling). */
  p: number;
  fromP?: number;
  playing: boolean;
  skip: boolean;
}

/** "by 1 Aug" never breaks between the day and the month. */
const keepDates = (s: string) => s.replace(/(\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, "$1\u00A0$2");

/**
 * The statue hero (docs/DESIGN-V2.md §3.1.1): the bust gilded to the trend on the right; on the
 * left the trend (CALC), the scale reading, the verdict and the pace line (PROJ). "Am I on track?"
 * is answered here without a tap. On phones the hero runs up under the transparent header row, as
 * one lit surface. Dawn dims the statue under a rose light; Seal settles it.
 */
export function Hero({ m, phase, unveil, compact, children }: { m: NowModel; phase: string; unveil: UnveilState; compact?: boolean; children?: React.ReactNode }) {
  const online = useOnline();
  const p = m.pace;
  const unit = m.unit;
  const show = (lb: number) => round(toDisplayWeight(lb, unit), 1).toFixed(1);
  const trend = p.trend.lb;
  const week = programWeekLabel(m.today, m.profile.start_date, m.profile.target_date);
  const left = Math.max(0, MIN_WEIGHINS - m.weighInCount);
  const stale = trend != null && p.trend.end !== m.today;
  const latest = p.trend.latest;
  // "last 165.9 Sat" (or "7:04 am") never breaks inside itself
  const scale = keepTail(scaleLine(latest ? { lb: show(latest.lb), date: latest.date, time: latest.date === m.today ? clockOf(m.weighToday?.measured_at) : null } : null, m.today));
  const dawn = phase === "dawn";
  // Dawn and Seal carry taller cards: the hero keeps the trend, the verdict and the pace only
  const dense = dawn || phase === "seal";
  const pct = Math.round(m.gild * 100);
  const pounds = unit === "kg" ? "kilograms" : "pounds";
  const statueLabel =
    trend == null
      ? "Your statue, in marble. No weigh-ins yet."
      : m.gild > 0
        ? `Your statue, gilded to ${pct} percent of the climb. Trend ${show(trend)} ${pounds}.`
        : `Your statue, still in marble.${left > 0 ? ` ${left} more ${left === 1 ? "weigh-in begins" : "weigh-ins begin"} the gilding.` : ""}`;
  // under the header row on phones (not while the offline strip sits above the page)
  const under = online;

  return (
    <section
      aria-label="Am I on track"
      className={cn(
        "relative -mx-(--gutter) flex flex-col overflow-hidden",
        // tall enough that the bottom-anchored statue's crown clears the header row
        compact && dense ? "min-h-[176px]" : compact ? "min-h-[228px]" : dense ? "min-h-[268px]" : "min-h-[342px]",
        under && "max-md:-mt-[calc(var(--topbar-h)+var(--safe-top)+8px)] max-md:pt-[calc(var(--topbar-h)+var(--safe-top))]",
        under &&
          (compact && dense
            ? "max-md:min-h-[calc(var(--topbar-h)+var(--safe-top)+176px)]"
            : compact
            ? "max-md:min-h-[calc(var(--topbar-h)+var(--safe-top)+228px)]"
            : dense
              ? "max-md:min-h-[calc(var(--topbar-h)+var(--safe-top)+268px)]"
              : "max-md:min-h-[calc(var(--topbar-h)+var(--safe-top)+342px)]"),
      )}
    >
      {/* the one warm light from 10 o'clock and the marble veins (a monument surface) */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 opacity-(--spot-opacity)", dawn ? "bg-(image:--spot-dawn)" : "bg-(image:--spot)")} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/art/marble-veins.svg')] bg-size-[400px_400px] opacity-[0.04]" />

      {/* the statue: the right 60%, the face clear of the text column; its base (where the gold
          starts) sits just above the climb rule, so the gilding always shows */}
      <div
        className={cn(
          "pointer-events-none absolute transition-opacity duration-(--dur-lift) @max-[19rem]:hidden",
          compact && dense ? "-right-8 bottom-2 w-[150px]" : compact ? "-right-9 bottom-[26px] w-[172px]" : dense ? "-right-11 bottom-[30px] w-[196px]" : "-right-[64px] bottom-[34px] w-[250px]",
          dawn && "opacity-55",
          phase === "seal" && "opacity-80",
        )}
      >
        <Statue p={unveil.p} fromP={unveil.fromP} mode={unveil.playing ? "unveil" : "now"} spotlight priority skip={unveil.skip} label={statueLabel} />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-b from-transparent via-night/70 to-night" />

      <div className={cn("relative px-(--gutter)", compact ? "pt-1" : "pt-3")}>
        <div className={cn(compact ? "w-[min(204px,58%)]" : "w-[min(208px,58%)]", "@max-[19rem]:w-full")}>
          {week && !compact && !dense && <p className="t-eyebrow mb-2 text-stone">{week}</p>}

          {/* the trend */}
          <p className="text-ivory">
            {trend == null ? <span className="t-dial text-ash">—</span> : <Tick value={show(trend)} className="t-dial" label={`Trend ${show(trend)} ${unit}`} />}
          </p>
          <p className="t-meta mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
            {trend == null ? (
              <span>Weigh in to begin the gilding</span>
            ) : (
              <>
                <span>{unit} · 7-day trend</span>
                <Tag kind="CALC" explain={`The average of ${p.trend.n} ${p.trend.n === 1 ? "weigh-in" : "weigh-ins"} in the 7 days to ${dayMonth(p.trend.end, m.today)}.`} />
              </>
            )}
          </p>
          {trend != null && (stale || left > 0 || (!compact && !dense)) && (
            <p className="t-meta mt-1 text-ash">
              {stale ? `trend as of ${dayMonth(p.trend.end, m.today)} · weigh in to update` : left > 0 ? `${left} more ${left === 1 ? "weigh-in" : "weigh-ins"} to begin the gilding` : scale}
            </p>
          )}

          {/* the verdict and the pace */}
          <Verdict text={p.sentence} small={compact || dense || p.sentence.length > 30} />
          <p className="t-callout mt-1.5 text-stone">
            <span className="tnum">{keepDates(p.detail)}</span>
            {p.projection && <Tag kind="PROJ" className="ml-1.5 align-[1px]" />}
          </p>
        </div>
      </div>
      <div className="relative mt-auto px-(--gutter) pb-1 pt-3">{children}</div>
    </section>
  );
}

/** The verdict sentence; when it changes (after an Inscribe) it crossfades in, never on first show. */
function Verdict({ text, small }: { text: string; small: boolean }) {
  const [first] = useState(text);
  const changed = first !== text;
  return (
    <p key={text} className={cn("t-verdict mt-3 text-balance text-ivory", changed && "turn-in", small && "text-[length:1.5rem]")}>
      {text}
    </p>
  );
}
