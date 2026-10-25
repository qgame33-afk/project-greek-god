"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { invalidateTraining } from "@/components/workout/data";
import { clearSessionStores } from "@/components/workout/stores";
import { WorkoutSkeleton } from "@/components/workout/WorkoutScreen";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { planFor, useActiveSession, useDayPlans, useTemplates } from "@/lib/data/training";
import { includeOptionalByDefault, startTarget, useStartWorkout } from "@/lib/data/workout";
import { addDays } from "@/lib/dates";
import type { Mode } from "@/lib/training/progression";

/**
 * /workout/start (docs/DESIGN-V3-SIMPLE.md §4.2.1): every plain start goes through here — create
 * or resume, then the workout with set 1 on screen. `?t=` starts that template only when it
 * belongs to the active program (`startTarget`); an old key (`?t=push_a`) starts today's plan.
 * Optional lifts never start (they are offered at the end). If another workout is live, a sheet
 * offers "Go to it" or "Discard it and start" (with its own confirm).
 */
export function StartWorkout() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { profile, loading: profileLoading } = useProfile();
  const { byKey, templates, loading: templatesLoading } = useTemplates();
  const plans = useDayPlans(addDays(today, -1), addDays(today, 1));
  const active = useActiveSession();
  const { start, startToday } = useStartWorkout();
  const fired = useRef(false);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Wait for a fresh answer on the open workout (one restored from the offline cache may be
  // stale); offline the query pauses, so this never waits on a dead connection.
  const ready = !profileLoading && !templatesLoading && !plans.isLoading && !active.isLoading && !active.isFetching;
  const key = startTarget(params.get("t"), templates.map((t) => t.key));
  const template = key ? byKey[key] : undefined;
  const planned = planFor(today, profile ?? undefined, plans.data ?? [], byKey).template ?? null;
  const wanted = template ?? planned;
  // Nobody trains before onboarding: without a finished profile there is no plan to start,
  // and an orphan "active" workout would follow the user into the app afterwards.
  const onboarded = !!profile?.onboarded;
  const open = active.data ?? null;
  // Another workout is live: ask (the same one resumes without a question).
  const conflict = ready && !!profile && onboarded && !!open && !!wanted && (open.local_date !== today || open.template_key !== wanted.key);

  const run = () => {
    if (!profile) return;
    const go = template ? start({ template, date: today, mode: (profile.training_mode ?? "standard") as Mode, includeOptional: includeOptionalByDefault() }) : startToday();
    void go.then((ok) => !ok && setFailed(true));
  };

  useEffect(() => {
    if (!ready || fired.current || conflict) return;
    fired.current = true;
    if (!profile) return; // couldn't read the profile (offline?) — never guess a plan
    if (!onboarded) {
      router.replace("/onboarding");
      return;
    }
    run();
    // run reads the same values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile, onboarded, router, template, today, conflict]);

  const discardAndStart = async () => {
    if (!open) return;
    try {
      must(await sb().from("workout_sessions").update({ status: "discarded", ended_at: new Date().toISOString() }).eq("id", open.id).select("id").single());
      clearSessionStores(open.id);
      qc.setQueryData(["sessions", "active", userId], null);
      // the open workout is gone: the start effect runs once the fresh answer is in
      invalidateTraining(qc);
    } catch (e) {
      toast.error("Couldn't discard it", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (failed || (ready && !profile))
    return (
      <div className="mx-auto grid min-h-dvh max-w-col place-items-center px-5">
        <div className="w-full space-y-4">
          <h1 className="sr-only">Start workout</h1>
          <ErrorNote
            onRetry={() => {
              if (!profile) return window.location.reload();
              fired.current = false;
              setFailed(false);
            }}
          >
            Couldn&apos;t start the workout. Nothing was saved.
          </ErrorNote>
          <Button asChild variant="secondary" size="lg" block>
            <Link href="/training">Back to Train</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <>
      <WorkoutSkeleton label={wanted ? `Starting ${wanted.name}…` : "Starting…"} />
      {open && (
        <Sheet open={conflict} onOpenChange={(o) => !o && router.back()} title={<span data-budget-name="">{`${open.name} is still going`}</span>} description="Finish it, or discard it to start this one.">
          <div className="space-y-2.5 pb-1 pt-2">
            <Button variant="primary" size="lg" block onClick={() => router.replace(`/workout/${open.id}`)}>
              Go to it
            </Button>
            <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)}>
              Discard it and start
            </Button>
          </div>
        </Sheet>
      )}
      <Confirm open={confirm} onOpenChange={setConfirm} title={`Discard ${open?.name ?? "it"}?`} body="Its logged sets are removed." confirmLabel="Discard" onConfirm={() => void discardAndStart()} />
    </>
  );
}
