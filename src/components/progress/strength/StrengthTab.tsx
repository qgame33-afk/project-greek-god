"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { WinCard } from "@/components/ui/win-card";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { allRecords, hallLifts, standingRecords } from "@/lib/progress/hall";
import { useStrengthSets } from "@/lib/progress/hooks";
import { summarizeLift } from "@/lib/progress/strength";
import { unitsOf, weightWords } from "../kit";
import { AllLiftsSheet } from "./AllLiftsSheet";
import { bestSentence, bestsThisMonth, dayLabel, isPerHand, liftLines, loadText, setText } from "./model";

const exerciseHref = (slug: string) => `/training/exercise/${encodeURIComponent(slug)}`;

/**
 * Progress › Strength (docs/DESIGN-V3-SIMPLE.md §4.5.3): the latest best as a win card, "Bests"
 * (each lift's standing best: name, date, set → the exercise detail) and "All lifts" (first and
 * latest for each lift). No athletic section; `?tab=athletic` lands here. Bests come from logged
 * sets only (lib/progress/hall); the estimated max lives in the exercise detail.
 */
export function StrengthTab() {
  const today = useToday();
  const { profile } = useProfile();
  const unit = unitsOf(profile).wu;
  const qc = useQueryClient();
  const strength = useStrengthSets();
  const sets = useMemo(() => strength.data ?? [], [strength.data]);
  const lifts = useMemo(() => hallLifts(sets), [sets]);
  const summaries = useMemo(() => new Map(lifts.map((l) => [l.key, summarizeLift(l.sets)])), [lifts]);
  const records = useMemo(() => allRecords(lifts, summaries), [lifts, summaries]);
  const standing = useMemo(() => standingRecords(records), [records]);
  const lines = useMemo(() => liftLines(lifts, summaries), [lifts, summaries]);
  const [allOpen, setAllOpen] = useState(false);
  const [more, setMore] = useState(false);

  if (strength.error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["exercise-sets"] })}>Couldn&apos;t load your lifts.</ErrorNote>;
  if (strength.isLoading) return <StrengthSkeleton />;

  const featured = records[0] ?? null;
  const rest = featured ? standing.filter((r) => r.liftKey !== featured.liftKey) : [];
  const shown = more ? rest : rest.slice(0, 6);
  const month = bestsThisMonth(records, today);

  const allLifts = (
    <>
      <SectionHead>Lifts</SectionHead>
      <ListGroup>
        <Row title="All lifts" subtitle="First and latest for each lift" value={lines.length ? String(lines.length) : undefined} onClick={() => setAllOpen(true)} />
      </ListGroup>
      <AllLiftsSheet open={allOpen} onOpenChange={setAllOpen} lines={lines} today={today} unit={unit} />
    </>
  );

  if (!featured) {
    return (
      <div>
        <Empty
          title="No bests yet. Log a workout to start."
          action={
            !sets.length && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/training">Go to Train</Link>
              </Button>
            )
          }
        >
          {sets.length ? "A best is a set that beats every one before it, so it needs a second workout of a lift." : undefined}
        </Empty>
        {lines.length > 0 && allLifts}
      </div>
    );
  }

  const fs = featured.set;
  const perHand = isPerHand(featured);
  const loaded = !featured.bodyweight && Number(fs.weight_lb ?? 0) > 0;
  const sentence = bestSentence(featured, summaries.get(featured.liftKey), unit);
  const spokenSet = loaded ? `${loadText(Number(fs.weight_lb), unit)} ${weightWords(unit)}${perHand ? " each hand" : ""} times ${fs.reps}` : setText(fs, unit, featured.bodyweight);

  return (
    <div>
      <Link href={exerciseHref(fs.exercise_slug)} className="press-soft block rounded-card" aria-label={`Latest best, ${dayLabel(featured.date, today)}: ${featured.name}, ${spokenSet}. ${sentence} Opens the lift.`}>
        <WinCard
          align="start"
          title={`Latest best · ${dayLabel(featured.date, today)}`}
          weight={loaded ? loadText(Number(fs.weight_lb), unit) : undefined}
          unit={loaded ? unit : undefined}
          reps={loaded ? fs.reps : undefined}
          hero={loaded ? undefined : setText(fs, unit, featured.bodyweight)}
          sentence={sentence}
          lift={featured.name}
        />
      </Link>

      {rest.length > 0 && (
        <>
          <SectionHead action={<span className="t-label tabular-nums">{month} this month</span>}>Bests</SectionHead>
          <ListGroup>
            {shown.map((r) => (
              <Row
                key={r.liftKey}
                title={r.name}
                subtitle={dayLabel(r.date, today)}
                value={<span className="t-row tabular-nums text-fg">{setText(r.set, unit, r.bodyweight)}</span>}
                href={exerciseHref(r.set.exercise_slug)}
                dataName
                wrap
                ariaLabel={`${r.name}, best ${setText(r.set, unit, r.bodyweight).replace("×", "times")}${isPerHand(r) ? ` ${weightWords(unit)} each hand` : ""}, ${dayLabel(r.date, today)}. Opens the lift`}
              />
            ))}
          </ListGroup>
          {rest.length > 6 && (
            <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setMore(!more)} aria-expanded={more}>
              {more ? "Show fewer" : `Show all ${rest.length}`}
            </Button>
          )}
        </>
      )}

      {allLifts}
    </div>
  );
}

function StrengthSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading your bests">
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="mt-7 h-6 w-24 rounded-pill" />
      <Skeleton className="h-72 w-full rounded-tile-lg" />
    </div>
  );
}
