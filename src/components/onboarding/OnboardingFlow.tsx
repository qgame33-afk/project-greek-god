"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { Mark } from "@/components/art/Mark";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { useProfile, useSaveProfile, type Profile } from "@/lib/data/profile";
import { DEFAULT_HABITS } from "@/lib/data/recovery";
import { programSeedRows } from "@/lib/data/training";
import { cn } from "@/lib/cn";
import {
  STEPS,
  STEP_LABELS,
  answersFromProfile,
  planSummary,
  profileUpdateFromAnswers,
  restoreDraft,
  validateStep,
  type OnboardingAnswers,
  type StepErrors,
  type StepId,
} from "@/lib/onboarding/plan";
import { Finale, FinaleBust } from "./Finale";
import { MeanderProgress } from "./MeanderProgress";
import { BodyStep, GoalStep, NutritionStep, TrainingStep, UnitsStep, WelcomeStep } from "./steps";

const COPY: Record<StepId, { title: string; helper: string }> = {
  welcome: { title: "The ascent begins", helper: "One plan for training, food, recovery and progress, built around your numbers." },
  body: { title: "What's your starting point?", helper: "Your numbers today. Edit anything that's off." },
  goal: { title: "Where are you headed?", helper: "Pick a goal weight and a date. The weekly pace follows." },
  training: { title: "How do you train?", helper: "Six days of Push/Pull/Legs by default. Move days to fit your week." },
  nutrition: { title: "How will you fuel it?", helper: "Suggested targets for a lean gain. Change any of them." },
  units: { title: "How should numbers read?", helper: "Pick your units. Your time zone decides when a new day starts." },
  finale: { title: "Your ascent", helper: "Here's the plan. Tap any line to change it." },
};

const TOTAL = STEPS.length;

function detectTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

interface Draft {
  answers: OnboardingAnswers;
  step: number;
  touched: string[];
}

function initialState(profile: Profile, draftKey: string, today: string): { answers: OnboardingAnswers; step: number; touched: Set<string> } {
  const base = answersFromProfile(profile, today, detectTz());
  let next = base;
  let step = 0;
  let touched: string[] = [];
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      next = restoreDraft(base, d.answers);
      step = Math.min(TOTAL - 1, Math.max(0, Number(d.step) || 0));
      touched = Array.isArray(d.touched) ? d.touched.filter((x): x is string => typeof x === "string") : [];
    }
  } catch {
    /* ignore a corrupt draft */
  }
  // a draft from another day can't keep a target date that has since passed
  if (next.targetDate <= today) next = { ...next, targetDate: base.targetDate };
  if (!profile.onboarded) next = { ...next, startDate: today };
  return { answers: next, step, touched: new Set(touched) };
}

export function OnboardingFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useToday();
  const { userId } = useUser();
  const { profile, loading, error: loadError } = useProfile();
  const saveProfile = useSaveProfile();

  const [a, setA] = useState<OnboardingAnswers | null>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [returnToFinale, setReturnToFinale] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const draftKey = userId ? `pgg.onboarding.${userId}` : null;

  // Prefill from the profile once (during render, so the first frame is already filled in),
  // then layer any saved draft on top.
  if (!a && profile && draftKey) {
    const init = initialState(profile, draftKey, today);
    setA(init.answers);
    setStep(init.step);
    setTouched(init.touched);
  }

  // Persist the draft so a refresh or a closed tab never loses answers.
  useEffect(() => {
    if (!a || !draftKey) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ answers: a, step, touched: [...touched] } satisfies Draft));
      } catch {
        /* storage full / private mode */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [a, step, touched, draftKey]);

  const set = useCallback((patch: Partial<OnboardingAnswers>) => setA((prev) => (prev ? { ...prev, ...patch } : prev)), []);
  const touch = useCallback((k: string) => setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k))), []);
  const untouch = useCallback(
    (keys: string[]) =>
      setTouched((prev) => {
        if (!keys.some((k) => prev.has(k))) return prev;
        const n = new Set(prev);
        for (const k of keys) n.delete(k);
        return n;
      }),
    [],
  );

  const id = STEPS[step];
  const errors: StepErrors = useMemo(() => (a ? validateStep(id, a, today) : {}), [a, id, today]);
  const shownErrors = showErrors ? errors : {};
  const plan = useMemo(() => (a ? planSummary(a) : null), [a]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setShowErrors(false);
    setStep(to);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  };

  const next = () => {
    if (!a) return;
    if (Object.keys(errors).length) {
      setShowErrors(true);
      requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    if (id === "finale") return void finish();
    if (returnToFinale) {
      setReturnToFinale(false);
      return go(TOTAL - 1);
    }
    go(step + 1);
  };

  const back = () => {
    if (step === 0) return;
    if (returnToFinale) {
      setReturnToFinale(false);
      return go(TOTAL - 1);
    }
    go(step - 1);
  };

  const edit = (s: StepId) => {
    setReturnToFinale(true);
    go(STEPS.indexOf(s));
  };

  const finish = async () => {
    if (!a || busy.current) return;
    for (const s of STEPS) {
      const e = validateStep(s, a, today);
      if (Object.keys(e).length) {
        setShowErrors(true);
        setReturnToFinale(true);
        return go(STEPS.indexOf(s));
      }
    }
    busy.current = true;
    setFinishing(true);
    setFinishError(null);
    try {
      const client = sb();
      // 1. the user's own editable copy of the program and the default habit list (idempotent)
      must(await client.from("program_templates").upsert(programSeedRows(), { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      must(await client.from("habit_definitions").upsert(DEFAULT_HABITS, { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      // 2. today's weigh-in, only if the user typed one
      if (a.todayWeighInLb != null) {
        must(
          await client
            .from("weight_entries")
            .upsert({ local_date: today, weight_lb: Math.round(a.todayWeighInLb * 10) / 10, measured_at: new Date().toISOString() }, { onConflict: "user_id,local_date" })
            .select("id")
            .single(),
        );
      }
      // 3. the profile last, so a failure above never marks the user onboarded
      await saveProfile.mutateAsync({ values: profileUpdateFromAnswers(a), source: "onboarding", reason: "Onboarding" });
      try {
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["habit-defs"] });
      qc.invalidateQueries({ queryKey: ["weights"] });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setLeaving(true);
      window.setTimeout(() => router.replace("/"), reduce ? 0 : 560);
    } catch (e) {
      setFinishError(`Couldn't save your plan. Your answers are kept. ${e instanceof Error ? e.message : ""}`);
      busy.current = false;
      setFinishing(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    next();
  };

  if (loadError && !profile) {
    return (
      <Frame step={0} a={null}>
        <div className="px-5 pt-24">
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Couldn&apos;t load your profile. {(loadError as Error).message}</ErrorNote>
        </div>
      </Frame>
    );
  }

  if (loading || !a || !plan) {
    return (
      <Frame step={0} a={null}>
        <div className="mx-auto w-full max-w-[520px] px-5 pt-[calc(var(--safe-top)+88px)]" aria-busy>
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton mt-4 h-9 w-64 rounded-[10px]" />
          <div className="skeleton mt-3 h-4 w-72 rounded-full" />
          <div className="skeleton mt-10 h-[180px] w-full rounded-[20px]" />
        </div>
      </Frame>
    );
  }

  const isWelcome = id === "welcome";
  const isFinale = id === "finale";
  const copy = COPY[id];
  const stepProps = { a, set, errors: shownErrors, today, touched, touch, untouch };

  return (
    <Frame step={step} a={a} leaving={leaving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-dvh flex-col">
        {/* top: brand + meander progress */}
        <header className="sticky top-0 z-20 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl lg:static lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex h-14 w-full max-w-[560px] items-center gap-3 px-4 lg:h-20 lg:px-8">
            {step > 0 ? (
              <button type="button" onClick={back} className="-ml-2 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:text-fg" aria-label="Back">
                <ChevronLeft className="size-6" />
              </button>
            ) : (
              <span className="grid size-11 shrink-0 place-items-center lg:hidden" aria-hidden>
                <Mark size={26} />
              </span>
            )}
            <MeanderProgress step={step} total={TOTAL} className="min-w-0 flex-1" />
          </div>
        </header>

        <main ref={contentRef} className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-[calc(var(--safe-bottom)+132px)] lg:px-8 lg:pb-10 lg:pt-[3vh]">
          {isWelcome && <WelcomeArt />}
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <m.div
              key={id}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.14, ease: [0.55, 0, 1, 0.45] } }}
            >
              <p className={cn("eyebrow", (isWelcome || isFinale) && "text-gold-300")}>
                Step {step + 1} of {TOTAL}
              </p>
              {isWelcome || isFinale ? (
                <h1 className="t-hero mt-3 text-fg">{copy.title}</h1>
              ) : (
                <h1 className="t-title mt-3">{copy.title}</h1>
              )}
              <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-fg-2">{copy.helper}</p>

              <div className="mt-8">
                {id === "welcome" && <WelcomeStep />}
                {id === "body" && <BodyStep {...stepProps} />}
                {id === "goal" && <GoalStep {...stepProps} />}
                {id === "training" && <TrainingStep {...stepProps} />}
                {id === "nutrition" && <NutritionStep {...stepProps} />}
                {id === "units" && <UnitsStep {...stepProps} />}
                {id === "finale" && <Finale a={a} plan={plan} onEdit={edit} />}
              </div>
            </m.div>
          </AnimatePresence>
        </main>

        {/* sticky actions — bottom of the thumb zone on phones, inline on desktop */}
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line-hair bg-[rgb(8_9_12/.88)] pb-[calc(var(--safe-bottom)+14px)] pt-3 backdrop-blur-xl lg:sticky lg:border-t-0 lg:bg-[linear-gradient(to_top,var(--bg)_72%,transparent)] lg:pb-10 lg:pt-10 lg:backdrop-blur-none">
          {/* a failed finish is explained right above the button that was tapped */}
          {finishError && isFinale && (
            <div className="mx-auto w-full max-w-[560px] px-5 pb-3 lg:px-8">
              <ErrorNote onRetry={() => void finish()}>{finishError}</ErrorNote>
            </div>
          )}
          <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-5 lg:px-8">
            {step > 0 && (
              <Button type="button" variant="secondary" size="lg" className="w-[30%] shrink-0" onClick={back} disabled={finishing}>
                Back
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className={cn("min-w-0 flex-1", isFinale && "text-[16px] tracking-[0.06em]")}
              shine={isFinale}
              loading={finishing}
              key={isFinale ? "begin" : "continue"}
            >
              {isFinale ? "Begin the ascent" : returnToFinale ? "Done" : "Continue"}
            </Button>
          </div>
        </footer>
      </form>
    </Frame>
  );
}

/* ------------------------------------------------------------------ frame */

/**
 * Full-screen page. On desktop the left half is an exhibit — the statue under a spotlight with
 * the seven steps — and on the finale it becomes the Gilded Bust.
 */
function Frame({ step, a, leaving, children }: { step: number; a: OnboardingAnswers | null; leaving?: boolean; children: ReactNode }) {
  const finale = STEPS[step] === "finale";
  return (
    <div className="relative min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line-hair bg-bg-deep lg:block" aria-hidden={!finale}>
        <div className="sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-10">
          <div className="absolute inset-0 spotlight" />
          <div className="absolute inset-0 bg-[url('/art/marble-veins.svg')] bg-[length:400px_400px] opacity-60" />
          <div className="relative flex items-center gap-2.5">
            <Mark size={30} />
            <div className="leading-none">
              <p className="font-serif text-[14px] font-semibold tracking-[0.12em] text-gold">PROJECT GREEK GOD</p>
              <p className="mt-1.5 text-[10px] font-bold tracking-[0.35em] text-fg-3">THE ASCENT</p>
            </div>
          </div>

          {finale && a ? (
            <div className="relative flex flex-1 items-center justify-center py-8">
              <FinaleBust a={a} size={360} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/art/statue-hero.webp"
              alt=""
              width={900}
              height={1200}
              decoding="async"
              className="pointer-events-none absolute left-1/2 top-[4vh] h-[84vh] w-auto max-w-none -translate-x-[42%] object-contain opacity-[.55] [mask-image:radial-gradient(58%_52%_at_50%_40%,black_50%,transparent_100%)]"
            />
          )}

          <ol className="relative grid max-w-[220px] gap-1">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex h-8 items-center gap-3 text-[13px] font-semibold", i === step ? "text-fg" : i < step ? "text-fg-2" : "text-fg-3/70")}>
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border text-[10px]",
                    i < step ? "border-transparent bg-gold-tint text-gold-300" : i === step ? "border-gold-400 text-gold-300" : "border-line-strong",
                  )}
                >
                  {i < step ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <div className="relative min-w-0">{children}</div>

      {/* fade to --bg-deep, then Today plays Dawn */}
      <div
        className={cn("pointer-events-none fixed inset-0 z-[70] bg-bg-deep transition-opacity duration-500 ease-[var(--ease-out)]", leaving ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    </div>
  );
}

/** Mobile welcome: the statue under the spotlight (the desktop exhibit shows it instead). */
function WelcomeArt() {
  return (
    <div
      className="relative -mx-5 -mt-14 mb-4 h-[40vh] min-h-[250px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_62%,transparent)] lg:hidden"
      aria-hidden
    >
      <div className="absolute inset-0 spotlight" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/art/statue-hero.webp"
        alt=""
        width={900}
        height={1200}
        decoding="async"
        className="absolute left-1/2 top-[4%] h-[128%] w-auto max-w-none -translate-x-[38%] object-contain opacity-80"
      />
    </div>
  );
}
