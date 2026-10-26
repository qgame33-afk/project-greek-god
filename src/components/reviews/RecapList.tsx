"use client";

import { BackHeader } from "@/components/shell/BackHeader";
import { ListGroup, Row } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { unitsOf } from "@/components/progress/kit";
import { useProfile } from "@/lib/data/profile";
import { monthName } from "@/lib/dates";
import { chronicleStamp } from "@/lib/reviews/chronicle";
import type { ReviewStats } from "@/lib/reviews/compute";
import { formatDelta, type WeightUnit } from "@/lib/units";
import { useRecaps } from "./useRecaps";

/**
 * /reviews (docs/DESIGN-V3-SIMPLE.md §4.5.5): BackHeader "Progress", "Monthly recap", one row per
 * month of the programme, newest first. The current month reads "Ready Sun 1 Nov · So far"; a
 * finished one names its weight change, workouts and new bests (from lib/reviews/compute).
 */
export function RecapList() {
  const { profile, error, refetch } = useProfile();
  const { recaps, error: rErr, refetch: rRefetch } = useRecaps(profile);
  const { wu } = unitsOf(profile);
  const twice = recaps ? new Set(recaps.map((r) => r.month.slice(5, 7))).size < recaps.length : false;

  return (
    <div>
      <BackHeader href="/progress" parent="Progress" title="Monthly recap" subtitle="One page per month. Each is ready on the 1st." />
      <div className="mt-5">
        {error && !profile ? (
          <ErrorNote onRetry={() => void refetch()} />
        ) : rErr ? (
          <ErrorNote onRetry={rRefetch} />
        ) : !recaps ? (
          <Skeleton className="h-52 w-full rounded-tile-lg" />
        ) : !recaps.length ? (
          <Empty title="No months yet">Your first recap starts with your first month.</Empty>
        ) : (
          <ListGroup ariaLabel="Months">
            {recaps.map((r) => {
              const name = `${monthName(r.month)}${twice ? ` ${r.month.slice(0, 4)}` : ""}`;
              const line = r.current ? chronicleStamp(r.month) : summaryLine(r.stats, wu);
              return (
                <Row
                  key={r.month}
                  title={name}
                  subtitle={line}
                  value={r.current ? "So far" : undefined}
                  href={`/reviews/${r.slug}`}
                  ariaLabel={`${name}${r.current ? `, so far. ${line}` : `. ${line}`}. Opens the recap`}
                />
              );
            })}
          </ListGroup>
        )}
      </div>
    </div>
  );
}

/** "+0.5 kg · 24 workouts · 14 bests"; parts with no data are left out. */
export function summaryLine(s: ReviewStats, wu: WeightUnit): string {
  const n = s.training.sessions;
  const b = s.training.prs.items.length;
  const parts = [
    s.physical.change != null ? formatDelta(s.physical.change, wu) : null,
    n ? `${n} ${n === 1 ? "workout" : "workouts"}` : null,
    b ? `${b} ${b === 1 ? "best" : "bests"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing logged";
}
