"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { ErrorNote } from "@/components/ui/misc";
import { dailyLine } from "@/lib/today/daily-line";
import { DawnProvider, Reveal, useDawn } from "./dawn";
import { FuelCard } from "./FuelCard";
import { Hero } from "./Hero";
import { MissionCard } from "./MissionCard";
import { RecordsCard } from "./RecordsCard";
import { RecoveryRow } from "./RecoveryRow";
import { TodaySkeleton } from "./TodaySkeleton";
import { TransformationCard } from "./TransformationCard";
import { useTodayModel, type TodayModel } from "./useTodayModel";
import { WeekCard } from "./WeekCard";
import { WorkoutCard } from "./WorkoutCard";

/**
 * Today — the daily command center. Card order follows DESIGN §7.1; on wide containers the
 * cards sit on a 12-column grid (Hero 7 · Workout 5 / Transformation · Fuel · Mission / Week ·
 * Records + Recovery). Every number comes from the shared data hooks.
 */
export function TodayView() {
  const t = useTodayModel();
  const qc = useQueryClient();
  // The skeleton covers the first load only. Once the content has shown it stays mounted: an
  // errored query refetches when a new observer mounts (TanStack v5 puts it back to pending),
  // so swapping back to the skeleton would loop skeleton ↔ content forever. Card-level notes
  // report those errors instead.
  const [ready, setReady] = useState(false);
  if (!ready && t.model && !t.loading) setReady(true);

  if (!t.model) {
    // Only when there's no profile at all — a failed background refetch never blanks the page.
    if (t.profileError) {
      return (
        <div className="py-6">
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Couldn&apos;t load your profile. Check the connection and retry.</ErrorNote>
        </div>
      );
    }
    return <TodaySkeleton />;
  }
  if (!ready) return <TodaySkeleton />;

  return (
    <DawnProvider>
      <TodayContent t={t} m={t.model} />
    </DawnProvider>
  );
}

function TodayContent({ t, m }: { t: ReturnType<typeof useTodayModel>; m: TodayModel }) {
  const { play } = useDawn();
  const [weightOpen, setWeightOpen] = useState(false);
  const { startToday, starting } = t.workout;

  const line = dailyLine({
    plan: m.facts,
    session: m.active && m.active.local_date === m.today ? "active" : m.doneToday ? "done" : "none",
    sessionName: m.active?.name ?? m.doneToday?.name ?? null,
    volleyballToday: m.volleyballToday,
    volleyballDays7: m.volleyballDays7,
    checkin: m.checkin,
    protein: { eaten: m.food.protein, goal: m.profile.protein_goal },
    calories: { eaten: m.food.calories, goal: m.profile.calorie_goal },
    sleepGoalH: Number(m.profile.sleep_goal_h),
  });

  return (
    <div className="@container pb-2">
      <div className="grid grid-cols-1 gap-3 @min-[760px]:grid-cols-12 @min-[760px]:gap-4">
        <Hero m={m} line={line} className="@min-[760px]:col-span-7" />

        <Reveal index={0} className="@min-[760px]:col-span-5">
          <WorkoutCard
            m={m}
            starting={starting}
            onStart={() => void startToday()}
            shine={play}
            error={t.errors.sessions}
            onRetry={() => t.refetch.sessions()}
          />
        </Reveal>

        <Reveal index={1} className="@min-[760px]:col-span-7 @min-[1100px]:col-span-5">
          <TransformationCard m={m} onLogWeight={() => setWeightOpen(true)} error={t.errors.weights} onRetry={t.refetch.weights} />
        </Reveal>

        <Reveal index={2} className="@min-[760px]:col-span-5 @min-[1100px]:col-span-4">
          <FuelCard m={m} error={t.errors.food} onRetry={() => t.refetch.food()} />
        </Reveal>

        <Reveal index={3} className="@min-[760px]:col-span-5 @min-[1100px]:col-span-3">
          <MissionCard m={m} loading={t.pending.mission} onLogWeight={() => setWeightOpen(true)} />
        </Reveal>

        <Reveal index={4} className="@min-[760px]:col-span-7 @min-[1100px]:col-span-8">
          <WeekCard m={m} loading={t.pending.week} error={t.errors.week} onRetry={t.refetch.week} />
        </Reveal>

        <Reveal index={5} className="grid content-start gap-3 @min-[760px]:col-span-12 @min-[760px]:gap-4 @min-[1100px]:col-span-4">
          <RecordsCard m={m} loading={t.pending.records} />
          <RecoveryRow m={m} />
        </Reveal>
      </div>

      <WeightLogSheet open={weightOpen} onOpenChange={setWeightOpen} />
    </div>
  );
}
