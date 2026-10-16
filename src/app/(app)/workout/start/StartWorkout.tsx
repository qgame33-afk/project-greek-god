"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const key = params.get("t") as TemplateKey | null;
  const today = useToday();
  const { profile, loading: profileLoading } = useProfile();
  const { byKey, loading: templatesLoading } = useTemplates();
  const plans = useDayPlans(addDays(today, -1), addDays(today, 1));
  const active = useActiveSession();
  const { start, startToday } = useStartWorkout();
  const fired = useRef(false);
  const [failed, setFailed] = useState(false);

  const ready = !profileLoading && !templatesLoading && !plans.isLoading && !active.isLoading;
  const template = key ? byKey[key] : undefined;

  useEffect(() => {
    if (!ready || fired.current) return;
    fired.current = true;
    const run = template && !active.data ? start({ template, date: today, mode: (profile?.training_mode ?? "standard") as Mode }) : startToday();
    void run.then((ok) => !ok && setFailed(true));
  }, [ready, template, active.data, start, startToday, today, profile?.training_mode]);

  if (failed)
    return (
      <div className="mx-auto grid min-h-dvh max-w-[440px] place-items-center px-4">
        <div className="w-full space-y-4">
          <ErrorNote
            onRetry={() => {
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
