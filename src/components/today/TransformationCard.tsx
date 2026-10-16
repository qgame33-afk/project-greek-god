"use client";

import { Scale } from "lucide-react";
import { GildedBust } from "@/components/signature/GildedBust";
import { LoggedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import { trendCaption, trendTone } from "@/lib/today/ascent";
import { formatBodyweight, formatDelta, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { useDawn, useMedia, useReveal } from "./dawn";
import { WeightSpark } from "./WeightSpark";
import type { TodayModel } from "./useTodayModel";

/** "163 → 183 LB" plaque, the latest weigh-in, its trend and the Gilded Bust. */
export function TransformationCard({
  m,
  onLogWeight,
  error,
  onRetry,
  className,
}: {
  m: TodayModel;
  onLogWeight: () => void;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}) {
  const { play } = useDawn();
  const desktop = useMedia("(min-width: 1024px)");
  const { ref: revealRef, seen, delay } = useReveal<HTMLElement>(600);
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  const a = m.ascent;
  const pct = Math.round(a.p * 100);
  const tone = trendTone(a.weeklyChange, m.planRate);
  const planLabel = m.planRate != null ? formatDelta(m.planRate, unit) : null;
  const whole = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const plaque = a.start != null && a.goal != null ? `${whole(a.start)} → ${whole(a.goal)} ${unit}` : `Set start and goal in Settings`;

  const failed = m.weightsFailed;
  let when: string;
  if (failed) when = "Weigh-ins didn't load";
  else if (!a.hasData) when = "Start weight · no weigh-ins yet";
  else if (a.latestDate === m.today) {
    const at = m.latestRow?.measured_at ? new Date(m.latestRow.measured_at) : null;
    when = at && !Number.isNaN(at.getTime()) ? `Logged today ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Logged today";
  } else when = `Last confirmed ${shortDate(a.latestDate!, m.today)}`;

  const big = a.hasData ? a.latest : failed ? null : a.start;

  return (
    <section ref={revealRef} aria-label="Body transformation" className={cn("card @container flex h-full flex-col p-4 sm:p-5 lg:p-6", className)}>
      {error && (
        <ErrorNote className="mb-3" onRetry={onRetry}>
          Couldn&apos;t load weigh-ins.
        </ErrorNote>
      )}
      {/* Narrow: info | bust, footer full width. Wide: footer tucks under the info column. */}
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr] gap-x-3 @[560px]:grid-rows-[1fr_auto] @[560px]:gap-x-6">
        <div className="col-start-1 row-start-1 min-w-0">
          <p className="t-plaque">{plaque}</p>
          <p className={cn("num-xl mt-3", a.hasData ? "text-fg" : "text-fg-2")}>
            {big != null ? formatBodyweight(big, unit, false) : "—"}
            {big != null && <span className="unit">{unit}</span>}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-fg-2">
            <span>{when}</span>
            {a.hasData && <LoggedBadge />}
          </p>

          <dl className="mt-4 space-y-2.5">
            <Row
              label="7-day avg"
              value={a.avg7 != null ? formatBodyweight(a.avg7, unit) : "—"}
              caption={
                a.avg7 != null
                  ? `${a.avgCount} weigh-in${a.avgCount === 1 ? "" : "s"}${a.avgEnd !== m.today ? ` to ${shortDate(a.avgEnd, m.today)}` : ""}`
                  : a.hasData || failed
                    ? undefined
                    : "From your first weigh-in"
              }
            />
            <Row
              label="Trend"
              value={a.weeklyChange != null ? `${formatDelta(a.weeklyChange, unit)}/wk` : "—"}
              tone={tone}
              caption={failed ? undefined : trendCaption(tone, a.weeklyChange, planLabel)}
            />
          </dl>
        </div>
        <GildedBust
          p={a.hasData ? a.p : null}
          size={desktop ? 240 : 168}
          instant={!play}
          className="col-start-2 row-start-1 -mr-1 self-start @[560px]:row-span-2 @[560px]:self-center"
          caption={a.hasData ? undefined : failed ? "Didn't load" : "Begins with your first weigh-in."}
        />

        <div className="col-span-2 row-start-2 mt-5 self-end border-t border-line-hair pt-4 @[560px]:col-span-1 @[560px]:col-start-1">
          <WeightSpark weights={m.weights} today={m.today} unit={unit} height={desktop ? 88 : 56} />
          <div className="flex items-center gap-3">
            <Bar value={seen ? a.p : 0} fluted label={`${pct} percent of the way from start to goal`} className="flex-1" delay={delay} />
            <span className="num-sm w-12 shrink-0 text-right text-fg">
              {failed ? "—" : pct}
              {!failed && <span className="unit">%</span>}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[13px] font-medium text-fg-2">
              {failed ? (
                "— to go"
              ) : a.toGo == null ? (
                "Set a goal weight to track the climb"
              ) : a.hasData && a.toGo <= 0 ? (
                <span className="font-semibold text-gold-300">Goal reached</span>
              ) : (
                <>
                  <span className="num-xs text-[15px] text-fg">{formatBodyweight(a.toGo, unit, false)}</span> {unit} to go
                </>
              )}
            </p>
            <Button variant="secondary" size="md" onClick={onLogWeight} className="shrink-0">
              <Scale className="size-[18px]" aria-hidden />
              Log weight
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, tone = "neutral", caption }: { label: string; value: string; tone?: "good" | "warn" | "neutral"; caption?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="eyebrow shrink-0">{label}</dt>
        <dd className={cn("num-xs truncate text-[16px]", tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-fg")}>{value}</dd>
      </div>
      {caption && (
        <dd
          className={cn("mt-0.5 text-right text-[11.5px] font-medium leading-snug", tone === "good" ? "text-success/80" : tone === "warn" ? "text-warning" : "text-fg-3")}
        >
          {caption}
        </dd>
      )}
    </div>
  );
}
