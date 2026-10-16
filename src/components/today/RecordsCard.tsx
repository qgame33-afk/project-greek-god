"use client";

import { EmptyArt, LaurelBullet } from "@/components/art/Motifs";
import { CardAction } from "@/components/ui/card";
import { Empty, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/dates";
import { formatLoad, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { TodayModel } from "./useTodayModel";

/** The three latest personal records, as laurel rows. */
export function RecordsCard({ m, loading, className }: { m: TodayModel; loading: boolean; className?: string }) {
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  return (
    <section aria-label="Latest records" className={cn("card @container flex flex-col p-4 sm:p-5 lg:p-6", className)}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <h2 className="eyebrow">Latest records</h2>
        <CardAction href="/progress?tab=strength">Strength</CardAction>
      </div>
      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : m.records.length === 0 ? (
        <Empty art={<EmptyArt kind="laurel" size={56} />} title="No records yet" className="mt-1">
          A record lands when a logged set beats your previous best. Your first log sets the benchmark.
        </Empty>
      ) : (
        <ul className="divide-y divide-line-hair @[720px]:grid @[720px]:grid-cols-3 @[720px]:divide-x @[720px]:divide-y-0">
          {m.records.map((r) => {
            const gain = round(toDisplayWeight(r.gainLb, unit), 1);
            return (
              <li key={r.key} className="flex min-h-14 items-center gap-3 py-2.5 @[720px]:px-5 @[720px]:first:pl-0 @[720px]:last:pr-0">
                <LaurelBullet size={16} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-fg">{r.name}</p>
                  <p className="num-xs truncate text-fg-2">
                    {formatLoad(r.weightLb, unit, false)} × {r.reps}
                    <span className="text-fg-3"> · e1RM {formatLoad(r.e1rmLb, unit)}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {gain > 0 && (
                    <p className="num-xs font-semibold text-gold-300" aria-label={`e1RM up ${gain} ${unit}`}>
                      +{Number.isInteger(gain) ? gain : gain.toFixed(1)}
                      <span className="ml-0.5 font-sans text-[11px] font-semibold text-gold-300/80">{unit}</span>
                    </p>
                  )}
                  <p className="text-[12px] font-medium text-fg-3">{relativeDay(r.date, m.today)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
