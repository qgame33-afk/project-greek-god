"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapse } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { firstLatest, type HallLift } from "@/lib/progress/hall";
import { dayMonth } from "@/lib/progress/pace";
import type { LiftSummary } from "@/lib/progress/strength";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { Sparkline, signed } from "../kit";

/** A lift's metric in the display unit: e1RM in whole units (an estimate never reads as measured). */
function metricText(v: number, mode: "e1rm" | "load" | "reps", unit: WeightUnit) {
  if (mode === "reps") return String(v);
  if (mode === "e1rm") return String(Math.round(toDisplayWeight(v, unit)));
  const d = round(toDisplayWeight(v, unit), 1);
  return Number.isInteger(d) ? String(d) : d.toFixed(1);
}
const metricWord = (mode: "e1rm" | "load" | "reps", bodyweight: boolean) => (mode === "e1rm" ? "e1RM" : mode === "load" ? (bodyweight ? "added" : "top set") : "reps");

/**
 * Strength (docs/DESIGN-V2.md §3.6.2): the main lifts, each first → latest with a sparkline, in
 * the metric that describes it (e1RM; added load or reps for pull-ups). Other exercises fold
 * away underneath. Each row opens the lift's sheet.
 */
export function Strength({ lifts, summaries, unit, today, onOpen }: { lifts: HallLift[]; summaries: Map<string, LiftSummary>; unit: WeightUnit; today: ISODate; onOpen: (key: string) => void }) {
  const [others, setOthers] = useState(false);
  const tracked = lifts.filter((l) => l.tracked);
  const rest = lifts.filter((l) => !l.tracked);
  return (
    <div>
      <ul className="divide-y divide-vein border-y border-vein">
        {tracked.map((l) => (
          <LiftRow key={l.key} lift={l} s={summaries.get(l.key)!} unit={unit} today={today} onOpen={() => onOpen(l.key)} />
        ))}
      </ul>
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOthers(!others)}
            aria-expanded={others}
            aria-controls="hall-others"
            className="press flex min-h-12 w-full items-center justify-between gap-3 text-left"
          >
            <span className="t-callout text-stone">
              Other exercises · <span className="tnum">{rest.length}</span>
            </span>
            <ChevronDown className={cn("size-4 text-ash transition-transform duration-(--dur-fast)", others && "rotate-180")} strokeWidth={1.6} aria-hidden />
          </button>
          <Collapse open={others} id="hall-others" className="relative">
            <ul className="divide-y divide-vein border-y border-vein">
              {rest.map((l) => (
                <LiftRow key={l.key} lift={l} s={summaries.get(l.key)!} unit={unit} today={today} onOpen={() => onOpen(l.key)} />
              ))}
            </ul>
          </Collapse>
        </>
      )}
    </div>
  );
}

function LiftRow({ lift, s, unit, today, onOpen }: { lift: HallLift; s: LiftSummary; unit: WeightUnit; today: ISODate; onOpen: () => void }) {
  const fl = firstLatest(s, { bodyweight: lift.bodyweight });
  if (!fl)
    return (
      <li>
        <button type="button" onClick={onOpen} className="press-soft flex min-h-16 w-full items-center gap-3 py-2.5 text-left" aria-label={`${lift.name}: not logged yet. Open`}>
          <span className="min-w-0 flex-1">
            <span className="t-title-3 block truncate @max-[19rem]:whitespace-normal text-stone">{lift.name}</span>
            <span className="t-meta block text-stone">Not logged yet</span>
          </span>
          <span className="t-num-s text-stone">—</span>
          <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
        </button>
      </li>
    );
  const { mode } = fl;
  const word = metricWord(mode, lift.bodyweight);
  const one = fl.values.length === 1;
  const change = mode === "reps" ? fl.change : toDisplayWeight(fl.change, unit);
  const dp = mode === "load" && !Number.isInteger(round(change, 1)) ? 1 : 0;
  const changeText = one ? "first" : mode === "reps" ? `${signed(change, 0)} reps` : `${signed(change, dp)} ${unit}`;
  const up = !one && fl.change > 0;
  const words = `${lift.name}, ${word} ${metricText(fl.first.value, mode, unit)} on ${dayMonth(fl.first.date, today)}${one ? "" : `, ${metricText(fl.latest.value, mode, unit)} on ${dayMonth(fl.latest.date, today)}, ${changeText}`}. Open`;
  return (
    <li>
      <button type="button" onClick={onOpen} className="press-soft flex min-h-16 w-full items-center gap-3 py-2.5 text-left" aria-label={words}>
        <span aria-hidden className="min-w-0 flex-1">
          <span className="t-title-3 block truncate @max-[19rem]:whitespace-normal text-ivory">{lift.name}</span>
          <span className="t-meta tnum block truncate @max-[19rem]:whitespace-normal text-stone">
            {word} {one ? `· ${dayMonth(fl.first.date, today)}` : `${metricText(fl.first.value, mode, unit)} → ${metricText(fl.latest.value, mode, unit)}`}
          </span>
        </span>
        <Sparkline values={fl.values} width={52} height={24} className="@max-[19rem]:hidden" />
        <span aria-hidden className="w-16 shrink-0 text-right">
          <span className="t-num-s tnum block text-ivory">{metricText(fl.latest.value, mode, unit)}</span>
          <span className={cn("t-meta tnum block whitespace-nowrap", up ? "text-leaf-300" : "text-stone")}>{changeText}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </button>
    </li>
  );
}

/** The header note: e1RM is an estimate. */
export function StrengthNote() {
  return (
    <p className="t-meta mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
      <Tag kind="CALC" explain="Epley: load × (1 + reps ÷ 30), from sets of 1–12 reps with load. Higher-rep and bodyweight sets count for best reps and volume." />
      <span>e1RM is an estimate from your logged sets.</span>
    </p>
  );
}
