"use client";

import { Check } from "lucide-react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { dayName } from "@/lib/dates";
import { SET_ZONES, ZONE_EXPLAIN, ZONE_LABEL, ZONE_ORDER, ZONE_SCALE_MAX, zoneStatusWord, type ZoneRow } from "@/lib/training/volume-zones";
import { modeTemplate } from "@/lib/training/volume";
import { useWeekVolume, type useTrainingWeek } from "../hooks";

type Week = ReturnType<typeof useTrainingWeek>;

const pct = (n: number) => `${(Math.min(n, ZONE_SCALE_MAX) / ZONE_SCALE_MAX) * 100}%`;

/**
 * Hard sets per muscle this week against a target zone (§3.4.1 item 7, §4.7). The fill is ivory;
 * "under" adds a hatched remainder up to the zone with ▽, "in zone" a ✓, "above" a △ — words
 * every time, no amber, no red.
 */
export function VolumeZones({ week, className }: { week: Week; className?: string }) {
  const v = useWeekVolume(week);
  const empty = v.rows.every((r) => r.sets === 0);
  const plannedExplain = v.open.length
    ? v.open
        .map((o) => {
          const n = modeTemplate(o.template, week.mode).exercises.reduce((a, e) => a + e.sets, 0);
          return `${o.date === week.today ? "Today" : dayName(o.date, true)} · ${o.template.name}: ${n} sets`;
        })
        .join(". ")
    : null;

  return (
    <section aria-labelledby="vol-h" className={cn("@container", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="vol-h" className="t-eyebrow">
          Hard sets this week
        </h2>
        <Tag
          kind="RULE"
          detail="ZONES"
          explain={
            <>
              {ZONE_EXPLAIN}. Sets count once per muscle group, from each exercise&apos;s main muscles.{" "}
              {ZONE_ORDER.map((z) => `${ZONE_LABEL[z]} ${SET_ZONES[z][0]}–${SET_ZONES[z][1]}`).join(" · ")}.
            </>
          }
        />
      </div>
      <p className="t-callout text-stone">
        {v.loading ? (
          " "
        ) : v.plannedTotal > 0 ? (
          <>
            {empty ? "Bars fill as you log sets. " : ""}Planned sessions left this week add ~<span className="tnum text-ivory">{v.plannedTotal}</span> sets{" "}
            <Tag kind="CALC" explain={plannedExplain} className="ml-1" />
          </>
        ) : empty ? (
          "Bars fill as you log sets."
        ) : (
          "No more sessions planned this week."
        )}
      </p>

      {v.error ? (
        <ErrorNote className="mt-3" onRetry={v.refetch}>
          Couldn&apos;t load this week&apos;s sets.
        </ErrorNote>
      ) : (
        <ul className="mt-3 divide-y divide-vein border-y border-vein">
          {v.rows.map((r) => (v.loading ? <SkeletonRow key={r.zone} /> : <ZoneLine key={r.zone} r={r} quiet={empty} />))}
        </ul>
      )}
      {!v.loading && v.other > 0 && (
        <p className="t-meta mt-2 text-ash">
          +{v.other} {v.other === 1 ? "set" : "sets"} on muscles without a zone (forearms, grip, adductors).
        </p>
      )}
    </section>
  );
}

/** `quiet`: nothing logged this week yet — the empty bars and their zones, no "under" on every row. */
function ZoneLine({ r, quiet }: { r: ZoneRow; quiet: boolean }) {
  const [lo, hi] = r.range;
  const glyph = r.status === "in" ? <Check className="size-3.5" strokeWidth={2.2} aria-hidden /> : <span aria-hidden>{r.status === "under" ? "▽" : "△"}</span>;
  return (
    <li aria-label={r.aria} className="grid min-h-12 grid-cols-[6rem_minmax(0,1fr)_6.5rem] items-center gap-x-3 py-2 @max-[19rem]:grid-cols-[minmax(0,1fr)_auto] @max-[19rem]:gap-y-2">
      <span aria-hidden className="t-callout truncate text-ivory">
        {r.label}
      </span>
      <span aria-hidden className="relative h-5 @max-[19rem]:col-span-2 @max-[19rem]:row-start-2">
        {/* the zone: a corridor band with --ui-line edges */}
        <span className="absolute inset-y-0 bg-(--corridor) shadow-[inset_1px_0_0_var(--ui-line),inset_-1px_0_0_var(--ui-line)]" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
        {/* the track and the logged fill */}
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-vein-2">
          {r.status === "under" && !quiet && <span className="hatch absolute inset-y-0" style={{ left: pct(r.sets), width: `calc(${pct(lo)} - ${pct(r.sets)})` }} />}
          <span className="absolute inset-0 origin-left rounded-full bg-ivory transition-transform duration-(--dur-gild) ease-(--ease-gold)" style={{ transform: `scaleX(${Math.min(r.sets, ZONE_SCALE_MAX) / ZONE_SCALE_MAX})` }} />
        </span>
      </span>
      <span aria-hidden className={cn("t-meta flex items-center justify-end gap-1.5 whitespace-nowrap", r.status === "under" ? "text-stone" : "text-ivory")}>
        <span className={cn("t-num-s", quiet ? "text-stone" : "text-ivory")}>{r.sets}</span>
        {!quiet && glyph}
        {!quiet && <span>{zoneStatusWord(r.status)}</span>}
        {quiet && <span className="tnum text-ash">of {lo}–{hi}</span>}
      </span>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="grid min-h-12 grid-cols-[6rem_minmax(0,1fr)_6.5rem] items-center gap-x-3 py-2" aria-hidden>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="ml-auto h-4 w-14" />
    </li>
  );
}
