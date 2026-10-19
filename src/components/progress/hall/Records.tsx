"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Laurel } from "@/components/art/Laurel";
import { LaurelSprig } from "@/components/art/icons";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { parseISODate, type ISODate } from "@/lib/dates";
import type { RecordEntry } from "@/lib/progress/hall";
import { dayMonth } from "@/lib/progress/pace";
import { formatSet } from "@/lib/progress/strength";
import { formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";

const e1 = (lb: number, unit: WeightUnit) => String(Math.round(toDisplayWeight(lb, unit)));
const spoken = (d: ISODate) =>
  parseISODate(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

/** "190 × 6" (per hand / added load spelled out for VoiceOver elsewhere). */
function setText(r: RecordEntry, unit: WeightUnit) {
  return `${formatSet(r.set, (lb) => formatLoad(lb, unit, false), r.bodyweight)}${r.perHand ? " each" : ""}`;
}

/**
 * The latest record, as the Hall's centrepiece: a laurel around the e1RM it set, the lift in the
 * voice, the set and what it beat. Earned, so it may be leaf; it is not a control.
 */
export function FeaturedRecord({ record, unit, today, onOpen }: { record: RecordEntry; unit: WeightUnit; today: ISODate; onOpen: () => void }) {
  const gain = record.gain != null ? Math.round(toDisplayWeight(record.gain, unit)) : null;
  const words = `Latest record, ${spoken(record.date)}: ${record.name}, ${setText(record, unit)}, an estimated one-rep max of ${e1(record.e1rm, unit)} ${unit === "kg" ? "kilograms" : "pounds"}${
    record.previous != null ? `, beating ${e1(record.previous, unit)}` : ""
  }. Open the lift`;
  return (
    <button type="button" onClick={onOpen} aria-label={words} className="press-soft relative flex w-full flex-col items-center px-2 pb-6 pt-4 text-center">
      {/* the one light on this screen: a record under a spotlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-4 h-80"
        style={{
          backgroundImage: "radial-gradient(closest-side, var(--leaf-tint), transparent)",
        }}
      />
      <span className="t-eyebrow relative text-leaf-300">Latest record · {dayMonth(record.date, today)}</span>
      <span aria-hidden className="relative mt-3 grid place-items-center">
        <Laurel size={208} leaves={11} />
        <span className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span className="t-dial tnum text-ivory">{e1(record.e1rm, unit)}</span>
          <span className="t-tag mt-1 text-stone">{unit} · e1RM</span>
        </span>
      </span>
      <span aria-hidden className="t-title-1 relative mt-2 text-ivory">
        {record.name}
      </span>
      <span aria-hidden className="t-callout relative mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-stone">
        <span className="tnum font-semibold text-ivory">{setText(record, unit)}</span>
        {gain != null && record.previous != null && (
          <span className="tnum">
            · +{gain} over {e1(record.previous, unit)}
          </span>
        )}
        <Tag kind="CALC" />
      </span>
    </button>
  );
}

/**
 * The standing record of each lift as museum plaques: a laurel sprig, the lift, the set and its
 * date, the e1RM on the right. Ruled rows on night; the first (featured) one is left out.
 */
export function RecordPlaques({ records, unit, today, onOpen, limit = 5 }: { records: RecordEntry[]; unit: WeightUnit; today: ISODate; onOpen: (liftKey: string) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!records.length) return null;
  const shown = all ? records : records.slice(0, limit);
  return (
    <>
      <ul className="divide-y divide-vein border-y border-vein">
        {shown.map((r) => (
          <li key={r.liftKey}>
            <button
              type="button"
              onClick={() => onOpen(r.liftKey)}
              className="press-soft flex min-h-16 w-full items-center gap-3.5 py-2.5 text-left"
              aria-label={`${r.name} record, ${setText(r, unit)}, ${spoken(r.date)}${r.bodyweight ? "" : `, estimated one-rep max ${e1(r.e1rm, unit)}`}. Open the lift`}
            >
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--leaf-line)]">
                <LaurelSprig className="size-5 text-leaf-300" strokeWidth={1.5} />
              </span>
              <span aria-hidden className="min-w-0 flex-1">
                <span className="t-title-3 block truncate @max-[19rem]:whitespace-normal text-ivory">{r.name}</span>
                <span className="t-meta tnum block text-stone">
                  {setText(r, unit)} · {dayMonth(r.date, today)}
                </span>
              </span>
              {!r.bodyweight && (
                <span aria-hidden className="shrink-0 text-right">
                  <span className="t-num-m tnum block text-ivory">{e1(r.e1rm, unit)}</span>
                  <span className="t-tag block text-stone">e1RM</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {records.length > limit && (
        <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${records.length}`}
        </Button>
      )}
    </>
  );
}

/** The plain line under the records: how many, and how many this month. */
export function RecordsCount({ total, recent, className }: { total: number; recent: number; className?: string }) {
  return (
    <span className={cn("t-meta tnum text-stone", className)}>
      {total} in all · {recent} in 30 days
    </span>
  );
}
