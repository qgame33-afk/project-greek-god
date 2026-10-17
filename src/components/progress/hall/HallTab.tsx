"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Laurel } from "@/components/art/Laurel";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useAthleticTests, useWeights } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { useVolleyball } from "@/lib/data/training";
import { addDays } from "@/lib/dates";
import { squatToBodyweight, volleyballFrequency, type TestType } from "@/lib/progress/athletic";
import { allRecords, hallLifts, recentRecords, standingRecords } from "@/lib/progress/hall";
import { useStrengthSets } from "@/lib/progress/hooks";
import { trendAt } from "@/lib/progress/pace";
import { summarizeLift } from "@/lib/progress/strength";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import type { LengthUnit, WeightUnit } from "@/lib/units";
import { useProgressActions } from "../context";
import { SectionTitle } from "../kit";
import { Athletic } from "./Athletic";
import { FeaturedRecord, RecordPlaques, RecordsCount } from "./Records";
import { LiftSheet } from "./LiftSheet";
import { Strength, StrengthNote } from "./Strength";
import { TestSheet } from "./TestSheet";

/**
 * Ascent → Hall (docs/DESIGN-V2.md §3.6.2): the records as plaques (the latest under a
 * laurel), the main lifts first → latest, and the athletic tests as a first-class section.
 * Everything comes from logged sets and tests; e1RM is labelled CALC, nothing is projected.
 */
export function HallTab() {
  const today = useToday();
  const { profile } = useProfile();
  const wu = (profile?.weight_unit ?? "lb") as WeightUnit;
  const lu = (profile?.length_unit ?? "in") as LengthUnit;
  const actions = useProgressActions();
  const qc = useQueryClient();

  const strength = useStrengthSets();
  const sets = useMemo(() => strength.data ?? [], [strength.data]);
  const lifts = useMemo(() => hallLifts(sets), [sets]);
  const summaries = useMemo(() => new Map(lifts.map((l) => [l.key, summarizeLift(l.sets)])), [lifts]);
  const records = useMemo(() => allRecords(lifts, summaries), [lifts, summaries]);
  const standing = useMemo(() => standingRecords(records), [records]);

  const tq = useAthleticTests();
  const tests = useMemo(() => tq.data ?? [], [tq.data]);
  const { weights } = useWeights();
  const vb = useVolleyball(addDays(today, -27), today);
  // check-in "Volleyball this day" switches count too, as on Train and the Recovery ledger
  const vbRec = useRecovery(addDays(today, -27), today);
  const trendBw = useMemo(() => trendAt(weights, today).lb, [weights, today]);
  const squat = summaries.get("squat");
  const freq = volleyballFrequency(volleyballEntries(vb.data ?? [], vbRec.data ?? []), today);

  const [lift, setLift] = useState<string | null>(null);
  const [test, setTest] = useState<TestType | null>(null);
  const openLift = lifts.find((l) => l.key === lift) ?? null;

  const logTest = (t?: TestType) => {
    setTest(null);
    actions.logAthletic(t);
  };

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-x-10">
      {/* Records */}
      <section aria-labelledby="hall-records" className="min-w-0 lg:col-span-2">
        {strength.error ? (
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["exercise-sets"] })}>Couldn&apos;t load your lifts. {(strength.error as Error).message}</ErrorNote>
        ) : strength.isLoading ? (
          <div aria-busy="true" aria-label="Loading records">
            <Skeleton className="mx-auto h-64 w-full rounded-card" />
          </div>
        ) : records.length ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center lg:gap-10">
            <div>
              <h2 id="hall-records" className="sr-only">
                Records
              </h2>
              <FeaturedRecord record={records[0]} unit={wu} today={today} onOpen={() => setLift(records[0].liftKey)} />
            </div>
            {standing.length > 1 && (
              <div>
                <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
                  <h3 className="t-eyebrow">Standing records</h3>
                  <RecordsCount total={records.length} recent={recentRecords(records, today).length} />
                </div>
                <RecordPlaques records={standing.filter((r) => r.liftKey !== records[0].liftKey)} unit={wu} today={today} onOpen={setLift} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center px-4 pb-2 pt-4 text-center">
            <h2 id="hall-records" className="sr-only">
              Records
            </h2>
            <Laurel size={112} leaves={9} tone="ivory" />
            <p className="t-title-2 mt-3 text-ivory">The Hall is waiting</p>
            <p className="t-callout mt-1.5 max-w-xs text-stone">
              {sets.length
                ? "Records appear after your second session of a lift: a set that beats every one before it."
                : "Records appear after your second session of a lift. Finish a workout and your lifts build here."}
            </p>
            {!sets.length && (
              <Link
                href="/training"
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "mt-4",
                })}
              >
                Go to Train
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Strength */}
      <section id="ascent-strength" aria-labelledby="hall-strength" className="min-w-0 scroll-mt-24">
        <SectionTitle id="hall-strength" eyebrow="e1RM · first → latest" title="Strength" />
        {strength.isLoading ? (
          <div className="grid gap-2" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-field" />
            ))}
          </div>
        ) : (
          <>
            <Strength lifts={lifts} summaries={summaries} unit={wu} today={today} onOpen={setLift} />
            <StrengthNote />
          </>
        )}
      </section>

      {/* Athletic */}
      <section id="ascent-athletic" aria-labelledby="hall-athletic" className="@container min-w-0 scroll-mt-24">
        <SectionTitle id="hall-athletic" eyebrow="Volleyball first" title="Athletic" className="mb-5">
          <Button variant="secondary" size="sm" onClick={() => logTest()} className="shrink-0 px-3.5">
            <Plus className="size-4" strokeWidth={1.8} /> Log test
          </Button>
        </SectionTitle>
        {tq.error ? (
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["athletic"] })}>Couldn&apos;t load your tests. {(tq.error as Error).message}</ErrorNote>
        ) : (
          <Athletic
            tests={tests}
            lu={lu}
            wu={wu}
            today={today}
            loading={tq.isLoading}
            squat={{
              ratio: squatToBodyweight(squat?.bestE1rm, trendBw),
              e1rm: squat?.bestE1rm ?? null,
              bodyweight: trendBw,
            }}
            volleyball={{
              ...freq,
              target: profile?.volleyball_per_week ?? null,
              loading: vb.isLoading || vbRec.isLoading,
            }}
            onLog={logTest}
            onOpen={setTest}
          />
        )}
      </section>

      <LiftSheet lift={openLift} s={openLift ? summaries.get(openLift.key)! : null} unit={wu} onClose={() => setLift(null)} />
      <TestSheet type={test} tests={tests} unit={lu} onClose={() => setTest(null)} onLog={logTest} />
    </div>
  );
}
