"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { WorkoutSkeleton } from "@/components/workout/WorkoutScreen";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useActiveSession, useDayPlans, useTemplates } from "@/lib/data/training";
import { useStartWorkout } from "@/lib/data/workout";
import { addDays } from "@/lib/dates";
import type { Mode } from "@/lib/training/progression";
import type { TemplateKey } from "@/lib/training/types";

export function StartWorkout() {
  const params = useSearchParams();
  const router = useRouter();
  const key = params.get("t") as TemplateKey | null;
  const today = useToday();
  const { profile, loading: profileLoading } = useProfile();
  const { byKey, loading: templatesLoading } = useTemplates();
  const plans = useDayPlans(addDays(today, -1), addDays(today, 1));
  const active = useActiveSession();
  const { start, startToday } = useStartWorkout();
  const fired = useRef(false);
  const [failed, setFailed] = useState(false);

  // Wait for a fresh answer on the open session (one restored from the offline cache may be
  // stale); offline the query pauses, so this never waits on a dead connection.
  const ready = !profileLoading && !templatesLoading && !plans.isLoading && !active.isLoading && !active.isFetching;
  const template = key ? byKey[key] : undefined;
  // Nobody trains before onboarding: without a finished profile there is no plan to start,
  // and an orphan "active" session would follow the user into the app afterwards.
  const onboarded = !!profile?.onboarded;

  useEffect(() => {
    if (!ready || fired.current) return;
    fired.current = true;
    if (!profile) return; // couldn't read the profile (offline?) — never guess a plan
    if (!onboarded) {
      router.replace("/onboarding");
      return;
    }
    // start() and startToday() both ask the server what is open first (and resume it).
    const run = template ? start({ template, date: today, mode: (profile.training_mode ?? "standard") as Mode }) : startToday();
    void run.then((ok) => !ok && setFailed(true));
  }, [ready, profile, onboarded, router, template, start, startToday, today]);

  if (failed || (ready && !profile))
    return (
      <div className="mx-auto grid min-h-dvh max-w-[440px] place-items-center px-4">
        <div className="w-full space-y-4">
          <ErrorNote
            onRetry={() => {
              if (!profile) return window.location.reload();
              fired.current = false;
              setFailed(false);
            }}
          >
            Couldn&apos;t start the workout. Nothing was saved.
          </ErrorNote>
          <Button asChild variant="secondary" block>
            <Link href="/training">Go to Training</Link>
          </Button>
        </div>
      </div>
    );
  return <WorkoutSkeleton label={template ? `Starting ${template.name}` : "Starting"} />;
}
