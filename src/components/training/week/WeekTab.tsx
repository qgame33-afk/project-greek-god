"use client";

import { ErrorNote } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { splitLabel, weekRangeLabel } from "@/lib/training/week";
import type { useTrainingWeek } from "../hooks";
import { BlockStrip } from "./BlockStrip";
import { DeloadCard } from "./DeloadCard";
import { MissedRow } from "./MissedRow";
import { ReadinessStrip } from "./ReadinessStrip";
import { Temple } from "./Temple";
import { TodaySession } from "./TodaySession";
import { VolumeZones } from "./VolumeZones";
import { WeekSkeleton } from "./WeekSkeleton";

type Week = ReturnType<typeof useTrainingWeek>;

/**
 * Train → Week (docs/DESIGN-V2.md §3.4.1): the title and sessions raised, the block strip and
 * (when due) the deload card near the top, the temple, today's session with Begin, readiness and
 * volleyball, hard sets per muscle against their zones, and a quiet row for a missed workout.
 * Everything renders in its first frame once the week's data is in, so nothing shifts it.
 */
export function WeekTab({ week, onDay, onLogVolleyball }: { week: Week; onDay: (d: ISODate) => void; onLogVolleyball: () => void }) {
  if (week.error && !week.sessions.length) {
    return (
      <ErrorNote onRetry={week.refetch} className="mt-2">
        Couldn&apos;t load this week. Check your connection.
      </ErrorNote>
    );
  }
  if (!week.weekReady) return <WeekSkeleton />;

  const keys = week.dates.map((d) => week.resolve(d).key);
  const split = splitLabel(keys);
  const { done, planned } = week.sealed;
  const missed = week.missed[0];

  return (
    <div className="@container">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-title-1 text-ivory">{week.weekNo ? `Week ${week.weekNo}` : "This week"}</h1>
          <p className="t-meta mt-1.5 text-stone">
            {weekRangeLabel(week.dates)}
            {split ? ` · ${split}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-right" aria-label={planned ? `${done} of ${planned} sessions raised this week` : "No sessions planned this week"}>
          <span aria-hidden className="t-num-m block text-ivory">
            {planned ? done : "—"}
            <span className="t-num-s text-ash"> / {planned || "—"}</span>
          </span>
          <span aria-hidden className="t-eyebrow mt-1 block">
            Raised
          </span>
        </p>
      </header>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <BlockStrip block={week.block} today={week.today} />
          <DeloadCard advice={week.deload} today={week.today} className="mt-4" />
          <Temple days={week.days} onDay={onDay} className="mt-6" />
          <TodaySession week={week} onDay={onDay} className="mt-4" />
        </div>
        <div className={cn("min-w-0 space-y-8", "mt-4 lg:mt-0")}>
          <ReadinessStrip week={week} onLogVolleyball={onLogVolleyball} />
          <VolumeZones week={week} />
          {missed && <MissedRow week={week} missed={missed} />}
        </div>
      </div>
    </div>
  );
}
