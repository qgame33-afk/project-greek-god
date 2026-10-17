"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Statue } from "@/components/art/Statue";
import { TabHeader } from "@/components/shell/TabHeader";
import { ErrorNote } from "@/components/ui/misc";
import { setDayPhase } from "@/lib/appearance";
import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/now/day-engine";
import { dawnCheckinDone } from "@/lib/recovery/prefill";
import { dayEyebrow, ritesOf } from "@/lib/today/now";
import { ClimbRule } from "./ClimbRule";
import { Hero } from "./Hero";
import { keys, writeLocal } from "./local";
import { Earlier, LaterToday, LatestRecord, Rites, TodaysThree } from "./Lower";
import { NowCard } from "./NowCard";
import { NowSkeleton } from "./NowSkeleton";
import { useDayInput } from "./useDayInput";
import { useNowData, type NowData, type NowModel } from "./useNowData";
import { useUnveiling } from "./useUnveiling";

/**
 * Now (docs/DESIGN-V2.md §3.1): the Day Engine home. The statue hero answers "am I on track?", the
 * Now card answers "what do I do now?" with the one gold control, both in the first viewport; below
 * the fold Today's three, the rites, Later today, Earlier and the latest record.
 */
export function NowScreen() {
  const data = useNowData();
  // the skeleton covers the first load only; a failed background refetch never blanks the page
  const [ready, setReady] = useState(false);
  if (!ready && data.model && !data.loading) setReady(true);

  if (!data.model) {
    if (data.profileError)
      return (
        <div className="py-6">
          <ErrorNote onRetry={() => void data.refetch.all()}>Couldn&apos;t load your profile. Check the connection and retry.</ErrorNote>
        </div>
      );
    return <NowSkeleton />;
  }
  if (!ready) return <NowSkeleton />;
  return <NowContent data={data} m={data.model} />;
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
/** Under 700 px of height the hero shrinks so the Now card's gold control stays in the first viewport. */
function useShortViewport() {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight < 700,
    () => false,
  );
}

function NowContent({ data, m }: { data: NowData; m: NowModel }) {
  const { state, now, input } = useDayInput(m);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const short = useShortViewport();

  // /?dawn=1 opens the check-in on Now (Offering → Check-in, /recovery?checkin=1)
  const wantDawn = params.get("dawn") === "1";
  const [forceDawn, setForceDawn] = useState(wantDawn);
  const [seenWant, setSeenWant] = useState(wantDawn);
  if (wantDawn !== seenWant) {
    setSeenWant(wantDawn);
    if (wantDawn) setForceDawn(true);
  }
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wantDawn) return;
    const t = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
      cardRef.current?.querySelector<HTMLElement>("[role=radio], [role=spinbutton], button")?.focus({ preventScroll: true });
      router.replace(pathname, { scroll: false });
    }, 60);
    return () => window.clearTimeout(t);
  }, [wantDawn, pathname, router]);

  const dawnComplete = dawnCheckinDone(m.todayRec) && !!m.weighToday;
  if (forceDawn && dawnComplete) setForceDawn(false);
  const phase: Phase = forceDawn && !dawnComplete && state?.phase !== "live" ? "dawn" : (state?.phase ?? "fuel");

  // the Seal variant on <html> follows the Day Engine while Now is on screen
  useEffect(() => {
    setDayPhase(phase);
  }, [phase]);
  useEffect(() => () => setDayPhase(null), []);

  const unveil = useUnveiling({ today: m.today, gild: m.gild, blocked: wantDawn });

  const rites = useMemo(() => ritesOf(m.mission?.statuses ?? []), [m.mission]);
  const sealed = !!input?.sealed;
  const onSeal = () => writeLocal(keys.sealed(m.today), new Date().toISOString());
  const onLater = () => {
    setForceDawn(false);
    writeLocal(keys.dawnLater(m.today), String(now));
  };
  const openDawn = () => {
    writeLocal(keys.dawnLater(m.today), null);
    setForceDawn(true);
    window.setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };

  // what the Now card already features is left out of Later today
  const featured = new Set<string>();
  if (state) {
    if (state.next.kind === "eat") featured.add(`meal:${state.next.mealId}`);
    if (phase === "train" && m.template) featured.add(`session:${m.template.key}`);
    if (phase === "train" && m.trainAt != null) for (const x of m.meals) if (!x.eaten && x.at <= m.trainAt && x.at >= m.trainAt - 90) featured.add(`meal:${x.id}`);
  }

  const oracleLabel = m.active ? `${m.active.name} live` : m.template ? `${m.template.name} today` : m.volleyballToday ? "Volleyball today" : "Rest day";

  return (
    <div className="@container pb-2">
      <TabHeader eyebrow={dayEyebrow(m.today, m.profile.start_date)} oracle={{ kind: "now", label: oracleLabel }} />
      <h1 className="sr-only">Now</h1>

      <Hero m={m} phase={phase} unveil={unveil} compact={short}>
        <ClimbRule
          m={m}
          className={short && (phase === "dawn" || phase === "seal") ? "hidden" : undefined}
          dense={phase === "dawn" || phase === "seal" || short}
          thumb={
            <div className="hidden w-[90px] shrink-0 @max-[19rem]:block">
              <Statue p={m.gild} label={m.gild > 0 ? `Your statue, gilded to ${Math.round(m.gild * 100)} percent of the climb.` : "Your statue, in marble."} />
            </div>
          }
        />
      </Hero>

      <div ref={cardRef} className="mt-3 scroll-mt-20">
        {state ? (
          <NowCard m={m} data={data} state={state} phase={phase} now={now} sealed={sealed} onSeal={onSeal} onLater={onLater} rites={rites} compact={short} />
        ) : null}
      </div>
      {data.errors.meals && !m.meals.length && (
        <ErrorNote className="mt-3" onRetry={data.refetch.meals}>
          Couldn&apos;t load today&apos;s planned meals.
        </ErrorNote>
      )}

      <div className={cn("mt-8 space-y-8")}>
        <TodaysThree m={m} />
        <Rites m={m} rites={rites.shown} more={rites.more} />
        {state && !sealed && (
          <LaterToday m={m} state={state} now={now} exclude={featured} onBegin={() => void data.workout.startToday()} starting={data.workout.starting} />
        )}
        {state && <Earlier m={m} state={state} now={now} skippedChip={state.skippedChip} onOpenDawn={openDawn} />}
        <LatestRecord m={m} />
      </div>
    </div>
  );
}
