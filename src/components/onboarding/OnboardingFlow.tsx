"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { useProfile, useSaveProfile, useSavePrefs, type Profile } from "@/lib/data/profile";
import { DEFAULT_HABITS } from "@/lib/data/recovery";
import { programSeedRows } from "@/lib/data/training";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";
import { parseAppPrefs } from "@/lib/prefs";
import { answersFromProfile, profileUpdateFromAnswers, restoreDraft, validateStep, type OnboardingAnswers, type StepErrors } from "@/lib/onboarding/plan";
import { DEFAULT_PROGRAM } from "@/lib/training/programs";
import { DateStep, GoalStep, HeightStep, NameStep, TargetsStep, TimeStep, WeekStep, WeightStep, dayMonthYear, weekIntro } from "./steps";

type StepId = "name" | "weight" | "height" | "goal" | "date" | "week" | "time" | "targets" | "done";
const STEPS: StepId[] = ["name", "weight", "height", "goal", "date", "week", "time", "targets", "done"];
const TOTAL = STEPS.length;
const DRAFT_VERSION = 3;

/** Which answers each screen checks, through the existing per-topic validation (lib/onboarding/plan). */
const CHECKS: Record<Exclude<StepId, "done">, { topic: Parameters<typeof validateStep>[0]; fields: (keyof StepErrors)[] }[]> = {
  name: [{ topic: "body", fields: ["displayName"] }],
  weight: [{ topic: "body", fields: ["startWeightLb", "todayWeighInLb"] }],
  height: [
    { topic: "body", fields: ["heightCm"] },
    { topic: "units", fields: ["timezone"] },
  ],
  goal: [{ topic: "goal", fields: ["goalWeightLb", "goalRangeMinLb"] }],
  date: [{ topic: "goal", fields: ["targetDate"] }],
  week: [],
  time: [{ topic: "training", fields: ["trainAt"] }],
  targets: [{ topic: "nutrition", fields: ["calorieGoal", "proteinGoal", "fatGoal", "macros", "waterGoalMl", "sleepGoalH"] }],
};

function errorsFor(step: StepId, a: OnboardingAnswers, today: string): StepErrors {
  if (step === "done") return {};
  const out: StepErrors = {};
  for (const c of CHECKS[step]) {
    const e = validateStep(c.topic, a, today);
    for (const f of c.fields) if (e[f]) out[f] = e[f];
  }
  return out;
}

function firstInvalid(a: OnboardingAnswers, today: string): StepId | null {
  return STEPS.find((s) => Object.keys(errorsFor(s, a, today)).length > 0) ?? null;
}

function detectTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

interface Draft {
  v?: number;
  answers: OnboardingAnswers;
  step: number;
}

function initialState(profile: Profile, draftKey: string, today: string): { answers: OnboardingAnswers; step: number } {
  const base = answersFromProfile(profile, today, detectTz());
  // "Also save as today's weigh-in" starts on (§4.10)
  let next: OnboardingAnswers = { ...base, todayWeighInLb: base.startWeightLb };
  let step = 0;
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      next = restoreDraft(next, d.answers);
      // an older draft keeps its answers but starts from the top
      step = d.v === DRAFT_VERSION ? Math.min(TOTAL - 1, Math.max(0, Number(d.step) || 0)) : 0;
    }
  } catch {
    /* ignore a corrupt draft */
  }
  // a draft from another day can't keep a target date that has since passed
  if (next.targetDate <= today) next = { ...next, targetDate: base.targetDate };
  if (!profile.onboarded) next = { ...next, startDate: today };
  return { answers: next, step };
}

const QUESTION: Record<StepId, string> = {
  name: "What should we call you?",
  weight: "What do you weigh today?",
  height: "How tall are you?",
  goal: "What's your goal weight?",
  date: "By when?",
  week: "Your training week",
  time: "When do you usually train?",
  targets: "Your daily targets",
  done: "You're set",
};

/**
 * Get started (docs/DESIGN-V3-SIMPLE.md §4.10): one question per screen with a back chevron, a
 * thin progress bar and "4 of 9", the gold Continue pinned at the bottom with the content
 * scrolling above it. Weight and height are entered in his units (kg and cm by default); the
 * week is the default program's, from PROGRAM's data. Finishing seeds the program's templates and
 * the habits (idempotent), saves today's weigh-in when the switch is on, the usual training time
 * through useSavePrefs, then the profile (profileUpdateFromAnswers, so the values equal the old
 * flow's for the same answers). A draft is kept on the device, so a refresh never loses an answer.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useToday();
  const { userId } = useUser();
  const { profile, loading, error: loadError } = useProfile();
  const saveProfile = useSaveProfile();
  const savePrefs = useSavePrefs({ quiet: true });

  const [a, setA] = useState<OnboardingAnswers | null>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const busy = useRef(false);

  const draftKey = userId ? `pgg.onboarding.${userId}` : null;

  // Prefill from the profile once (during render, so the first frame is already filled in),
  // then layer any saved draft on top.
  if (!a && profile && draftKey) {
    const init = initialState(profile, draftKey, today);
    setA(init.answers);
    setStep(init.step);
  }

  // Persist the draft so a refresh or a closed tab never loses answers.
  useEffect(() => {
    if (!a || !draftKey) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ v: DRAFT_VERSION, answers: a, step } satisfies Draft));
      } catch {
        /* storage full / private mode */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [a, step, draftKey]);

  const set = useCallback((patch: Partial<OnboardingAnswers>) => setA((prev) => (prev ? { ...prev, ...patch } : prev)), []);

  const id = STEPS[step];
  const errors: StepErrors = useMemo(() => (a ? errorsFor(id, a, today) : {}), [a, id, today]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setShowErrors(false);
    setStep(to);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  };

  const next = () => {
    if (!a) return;
    if (Object.keys(errors).length) return setShowErrors(true);
    if (step < TOTAL - 1) go(step + 1);
  };
  const back = () => step > 0 && go(step - 1);

  const finish = async () => {
    if (!a || !profile || busy.current) return;
    const bad = firstInvalid(a, today);
    if (bad) {
      go(STEPS.indexOf(bad));
      setShowErrors(true);
      return;
    }
    busy.current = true;
    setFinishing(true);
    setFinishError(null);
    try {
      const client = sb();
      // 1. his own editable copy of the default program and the default habit list (idempotent)
      must(await client.from("program_templates").upsert(programSeedRows(DEFAULT_PROGRAM), { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      must(await client.from("habit_definitions").upsert(DEFAULT_HABITS, { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      // 2. today's weigh-in, when the switch is on (stored in pounds, as every weight is)
      if (a.todayWeighInLb != null) {
        must(
          await client
            .from("weight_entries")
            .upsert({ local_date: today, weight_lb: Math.round(a.todayWeighInLb * 10) / 10, measured_at: new Date().toISOString() }, { onConflict: "user_id,local_date" })
            .select("id")
            .single(),
        );
      }
      // 3. the usual training time, merged into prefs (every other key survives)
      if (a.trainAt !== parseAppPrefs(profile.prefs).day.trainAt) await savePrefs.mutateAsync({ day: { trainAt: a.trainAt } });
      // 4. the profile last, so a failure above never marks him onboarded
      await saveProfile.mutateAsync({ values: profileUpdateFromAnswers(a), source: "onboarding", reason: "Get started" });
      try {
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["habit-defs"] });
      qc.invalidateQueries({ queryKey: ["weights"] });
      window.setTimeout(() => router.replace("/"), prefersReducedMotion() ? 0 : 150);
    } catch (e) {
      setFinishError(`Couldn't save your plan. Your answers are kept. ${e instanceof Error ? e.message : ""}`);
      busy.current = false;
      setFinishing(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (id === "done") void finish();
    else next();
  };

  if (loadError && !profile) {
    return (
      <Frame>
        <div className="px-gutter pt-24">
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Couldn&apos;t load your profile.</ErrorNote>
        </div>
      </Frame>
    );
  }

  if (loading || !a) {
    return (
      <Frame>
        <div className="mx-auto w-full max-w-col px-gutter pt-[calc(var(--safe-top)+5.5rem)]" aria-busy>
          <div className="skeleton h-9 w-64 rounded-field" />
          <div className="skeleton mt-3 h-4 w-48 rounded-full" />
          <div className="skeleton mt-10 h-44 w-full rounded-card" />
        </div>
      </Frame>
    );
  }

  const stepProps = { a, set, errors: showErrors ? errors : {}, today };
  const sub: Partial<Record<StepId, ReactNode>> = {
    name: "Used on your screens. Optional.",
    weight: "Before food is best. You can change it later.",
    height: "Used for your targets.",
    goal: "You can change it later.",
    date: "A date gives the plan a pace.",
    week: weekIntro(a),
    time: "So Today can offer your workout at the right time.",
    targets: "Worked out for a lean gain. Change them any time.",
    done: `Your plan starts today and runs to ${dayMonthYear(a.targetDate)}. Everything stays editable in Settings.`,
  };

  return (
    <Frame>
      <form onSubmit={onSubmit} noValidate className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-(--z-sticky) bg-bg pt-(--safe-top)">
          <div className="mx-auto flex h-14 w-full max-w-col items-center gap-3 px-gutter">
            {step > 0 ? (
              <button type="button" onClick={back} className="press -ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-fg" aria-label="Back">
                <ChevronLeft className="size-6" strokeWidth={1.9} />
              </button>
            ) : (
              <span className="-ml-2.5 size-11 shrink-0" aria-hidden />
            )}
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${TOTAL}`}>
              <div className="h-full w-full origin-left rounded-full bg-fg transition-transform duration-(--dur-base)" style={{ transform: `scaleX(${(step + 1) / TOTAL})` }} />
            </div>
            <span className="t-label shrink-0 tabular-nums" aria-hidden>
              {step + 1} of {TOTAL}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-col flex-1 px-gutter pb-[calc(var(--safe-bottom)+7.5rem)] pt-6">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <m.div
              key={id}
              className="@container"
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0, transition: { duration: DURATION.base / 1000, ease: EASE.out } }}
              exit={{ opacity: 0, x: dir * -16, transition: { duration: DURATION.fast / 1000, ease: EASE.out } }}
            >
              <h1 className="t-title">{QUESTION[id]}</h1>
              {sub[id] && <p className="t-label mt-2">{sub[id]}</p>}
              <div className="mt-8">
                {id === "name" && <NameStep {...stepProps} />}
                {id === "weight" && <WeightStep {...stepProps} />}
                {id === "height" && <HeightStep {...stepProps} />}
                {id === "goal" && <GoalStep {...stepProps} />}
                {id === "date" && <DateStep {...stepProps} />}
                {id === "week" && <WeekStep {...stepProps} />}
                {id === "time" && <TimeStep {...stepProps} />}
                {id === "targets" && <TargetsStep {...stepProps} />}
              </div>
            </m.div>
          </AnimatePresence>
        </main>

        {/* pinned at the bottom; the content scrolls above it and never sits under it */}
        <footer className="fixed inset-x-0 bottom-0 z-(--z-sticky) bg-bg pb-[calc(var(--safe-bottom)+0.75rem)] pt-3">
          {finishError && id === "done" && (
            <div className="mx-auto w-full max-w-col px-gutter pb-3">
              <ErrorNote onRetry={() => void finish()}>{finishError}</ErrorNote>
            </div>
          )}
          <div className="mx-auto flex w-full max-w-col flex-col items-stretch gap-1 px-gutter">
            <Button type="submit" variant="primary" size="lg" block loading={finishing}>
              {id === "done" ? "Start" : "Continue"}
            </Button>
            {id === "time" && !a.trainAt && (
              <Button type="button" variant="ghost" size="sm" onClick={() => go(step + 1)}>
                Not sure
              </Button>
            )}
          </div>
        </footer>
      </form>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
