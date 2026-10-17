"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { daysBetween } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import { round, toDisplayWeight } from "@/lib/units";
import type { NowModel } from "./useNowData";

/**
 * The climb rule (docs/DESIGN-V2.md §3.1.1 item 3): one hairline from the start weight to the goal
 * band with a leaf diamond at the trend and the earned part in leaf, terraces as ticks. Below it the
 * climb in words. A tap opens Ascent → Mountain. Nothing gilds before 4 weigh-ins.
 */
export function ClimbRule({ m, className, thumb, dense }: { m: NowModel; className?: string; thumb?: React.ReactNode; dense?: boolean }) {
  const p = m.pace;
  const unit = m.unit;
  const start = m.profile.start_weight_lb == null ? null : Number(m.profile.start_weight_lb);
  const band = p.band;
  const plain = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  if (start == null || !band || band.max <= start) return null;

  const span = band.max - start;
  const at = (lb: number) => Math.min(1, Math.max(0, (lb - start) / span));
  const trend = p.trend.lb;
  const gilded = m.gild > 0;
  const pct = Math.round(m.gild * 100);
  const days = p.target ? Math.max(0, daysBetween(m.today, p.target)) : null;
  const next = m.terraces.find((t) => !t.reachedOn) ?? null;
  const bandText = band.min === band.max ? plain(band.min) : `${plain(band.min)}–${plain(band.max)}`;

  const spoken = [
    gilded ? `The climb: ${pct} percent, from ${plain(start)} to ${bandText} ${unit === "kg" ? "kilograms" : "pounds"}.` : `The climb from ${plain(start)} to ${bandText} ${unit === "kg" ? "kilograms" : "pounds"}.`,
    gilded && next?.eta && next.eta > m.today ? `Terrace ${next.index} about ${dayMonth(next.eta, m.today, true)}, projected.` : "",
    days != null ? `${days} days left.` : "",
    "Open Ascent.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("@container flex items-center gap-3", className)}>
      {thumb}
      <Link href="/progress" aria-label={spoken} className="press-soft group block min-h-11 min-w-0 flex-1 py-1.5">
        {/* the track */}
        <span aria-hidden className="relative block h-3">
          <span className="absolute inset-x-0 top-[5.5px] h-px bg-vein-3" />
          {m.terraces.slice(0, -1).map((t) => (
            <span
              key={t.index}
              className={cn("absolute top-[2px] h-2 w-px", t.reachedOn ? "bg-leaf-500" : "bg-ui-line")}
              style={{ left: `${at(t.lb) * 100}%` }}
            />
          ))}
          {/* the goal band */}
          <span
            className="absolute top-[3.5px] h-[5px] rounded-full border border-leaf-line"
            style={{ left: `${at(band.min) * 100}%`, right: 0 }}
          />
          {gilded && trend != null && (
            <span className="absolute left-0 top-[5px] h-[2px] origin-left rounded-full bg-(image:--leaf-h)" style={{ width: `${at(trend) * 100}%` }} />
          )}
          {trend != null && (
            <span
              className={cn(
                "absolute top-[1.5px] size-[9px] -translate-x-1/2 rotate-45",
                gilded ? "bg-leaf-200 shadow-[0_0_0_3px_var(--night),0_0_12px_rgb(255_220_150/.6)]" : "bg-ivory shadow-[0_0_0_3px_var(--night)]",
              )}
              style={{ left: `${at(trend) * 100}%` }}
            />
          )}
        </span>
        <span aria-hidden className="t-meta tnum mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-ash">
          <span>{plain(start)}</span>
          <span className="min-w-0 truncate text-center text-stone @max-[18rem]:order-last @max-[18rem]:basis-full @max-[18rem]:whitespace-normal">
            {gilded && (
              <>
                <span className="text-leaf-300">{pct}%</span> of the climb
              </>
            )}
            {gilded && days != null && " · "}
            {days != null && `${days} days`}
          </span>
          <span className="whitespace-nowrap">{bandText}</span>
        </span>
        {gilded && next?.eta && next.eta > m.today && !dense && (
          <span aria-hidden className="t-meta tnum mt-1 flex items-center justify-center gap-1.5 text-ash">
            <span>
              Next {next.final ? "Olympus" : `Terrace ${next.numeral}`} ≈ {dayMonth(next.eta, m.today)}
            </span>
            <Tag kind="PROJ" />
          </span>
        )}
      </Link>
    </div>
  );
}
