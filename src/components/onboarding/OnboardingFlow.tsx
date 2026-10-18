"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Statue } from "@/components/art/Statue";
import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/ui/hold-button";
import { ErrorNote } from "@/components/ui/misc";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { useProfile, useSaveProfile, useSavePrefs, type Profile } from "@/lib/data/profile";
import { DEFAULT_HABITS } from "@/lib/data/recovery";
import { programSeedRows } from "@/lib/data/training";
import { cn } from "@/lib/cn";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";
import { parseAppPrefs } from "@/lib/prefs";
import {
  OATH_LABELS,
  OATH_STEPS,
  answersFromProfile,
  firstInvalidOathStep,
  planSummary,
  profileUpdateFromAnswers,
  restoreDraft,
  validateOathStep,
  type OathStepId,
  type OnboardingAnswers,
  type StepErrors,
} from "@/lib/onboarding/plan";
import { SummitArt, TempleArt } from "./OathArt";
import { OathSummary } from "./OathSummary";
import { ClimberStep, FuelStep, SummitStep, TrainingStep } from "./steps";

const COPY: Record<OathStepId, { title: string; helper: string }> = {
  climber: { title: "Who is climbing?", helper: "Your numbers today. The statue starts in marble and gilds as your trend climbs." },
  summit: { title: "Where is the summit?", helper: "A goal weight, its band and a date. The weekly pace follows." },
  training: { title: "How do you train?", helper: "Six days of Push, Pull and Legs by default. Move days to fit your week." },
  fuel: { title: "How do you eat?", helper: "Targets for a lean gain, with the arithmetic shown. Change any of them." },
  oath: { title: "The Oath", helper: "This is the plan. Tap any line to change it, then hold to begin." },
};

const TOTAL = OATH_STEPS.length;
const DRAFT_VERSION = 2;

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
      // a seven-step draft keeps its answers but starts the Oath from the top
      step = d.v === DRAFT_VERSION ? Math.min(TOTAL - 1, Math.max(0, Number(d.step) || 0)) : 0;
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

/**
 * Onboarding, the Oath (docs/DESIGN-V2.md §3.11): five full-screen steps, each one question in the
 * voice with its art building as he answers — the statue in marble, the summit's mountain, the
 * temple's columns, the arithmetic of his plate — then the Oath, held for 600 ms (or confirmed with
 * a tap, VoiceOver, Switch Control or the keyboard). The answers, their validation and the profile
 * written are the seven-step flow's; the usual training time goes to prefs.day.trainAt. A draft is
 * kept on the device, so a refresh never loses an answer.
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
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [returnToOath, setReturnToOath] = useState(false);
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
        localStorage.setItem(draftKey, JSON.stringify({ v: DRAFT_VERSION, answers: a, step, touched: [...touched] } satisfies Draft));
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

  const id = OATH_STEPS[step];
  const errors: StepErrors = useMemo(() => (a ? validateOathStep(id, a, today) : {}), [a, id, today]);
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
    if (returnToOath) {
      setReturnToOath(false);
      return go(TOTAL - 1);
    }
    go(step + 1);
  };

  const back = () => {
    if (step === 0) return;
    if (returnToOath) {
      setReturnToOath(false);
      return go(TOTAL - 1);
    }
    go(step - 1);
  };

  const edit = (s: OathStepId) => {
    setReturnToOath(true);
    go(OATH_STEPS.indexOf(s));
  };

  const finish = async () => {
    if (!a || !profile || busy.current) return;
    const bad = firstInvalidOathStep(a, today);
    if (bad) {
      setShowErrors(true);
      setReturnToOath(true);
      return go(OATH_STEPS.indexOf(bad));
    }
    busy.current = true;
    setFinishing(true);
    setFinishError(null);
    try {
      const client = sb();
      // 1. his own editable copy of the program and the default habit list (idempotent)
      must(await client.from("program_templates").upsert(programSeedRows(), { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      must(await client.from("habit_definitions").upsert(DEFAULT_HABITS, { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
      // 2. today's weigh-in, only if he typed one
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
      await saveProfile.mutateAsync({ values: profileUpdateFromAnswers(a), source: "onboarding", reason: "Onboarding" });
      try {
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["habit-defs"] });
      qc.invalidateQueries({ queryKey: ["weights"] });
      setLeaving(true);
      window.setTimeout(() => router.replace("/"), prefersReducedMotion() ? 0 : 480);
    } catch (e) {
      setFinishError(`Couldn't save your plan. Your answers are kept. ${e instanceof Error ? e.message : ""}`);
      busy.current = false;
      setFinishing(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (id !== "oath") next();
  };

  if (loadError && !profile) {
    return (
      <Frame step={0} a={null}>
        <div className="px-gutter pt-24">
          <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Couldn&apos;t load your profile. {(loadError as Error).message}</ErrorNote>
        </div>
      </Frame>
    );
  }

  if (loading || !a || !plan) {
    return (
      <Frame step={0} a={null}>
        <div className="mx-auto w-full max-w-col px-gutter pt-[calc(var(--safe-top)+5.5rem)]" aria-busy>
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton mt-4 h-9 w-64 rounded-field" />
          <div className="skeleton mt-3 h-4 w-72 rounded-full" />
          <div className="skeleton mt-10 h-44 w-full rounded-card" />
        </div>
      </Frame>
    );
  }

  const copy = COPY[id];
  const stepProps = { a, set, errors: shownErrors, today, touched, touch, untouch };
  const isOath = id === "oath";

  return (
    <Frame step={step} a={a} leaving={leaving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-(--z-sticky) bg-[linear-gradient(to_bottom,var(--night)_70%,transparent)] pt-(--safe-top) lg:static lg:bg-none">
          <div className="mx-auto flex h-14 w-full max-w-col items-center gap-3 px-gutter lg:h-20 lg:px-8">
            {step > 0 ? (
              <button type="button" onClick={back} className="press -ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory" aria-label="Back">
                <ChevronLeft className="size-6" strokeWidth={1.6} />
              </button>
            ) : (
              <span className="size-11 shrink-0 -ml-2.5" aria-hidden />
            )}
            <Progress step={step} />
          </div>
        </header>

        <main ref={contentRef} className="mx-auto w-full max-w-col flex-1 px-gutter pb-[calc(var(--safe-bottom)+8.5rem)] lg:px-8 lg:pb-10">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <m.div
              key={id}
              className="@container"
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0, transition: { duration: DURATION.base / 1000, ease: EASE.out } }}
              exit={{ opacity: 0, x: dir * -16, transition: { duration: DURATION.fast / 1000, ease: EASE.out } }}
            >
              <StepHead id={id} step={step} title={copy.title} helper={copy.helper} a={a} today={today} />
              {id === "summit" && <SummitArt a={a} today={today} />}
              {id === "training" && <TempleArt a={a} today={today} />}
              <div className={cn(id === "summit" || id === "training" ? "mt-8" : "mt-7")}>
                {id === "climber" && <ClimberStep {...stepProps} />}
                {id === "summit" && <SummitStep {...stepProps} />}
                {id === "training" && <TrainingStep {...stepProps} />}
                {id === "fuel" && <FuelStep {...stepProps} />}
                {isOath && <OathSummary a={a} plan={plan} onEdit={edit} />}
              </div>
            </m.div>
          </AnimatePresence>
        </main>

        {/* the thumb zone on phones, inline on desktop */}
        <footer className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-vein bg-night pb-[calc(var(--safe-bottom)+0.875rem)] pt-3 lg:sticky lg:border-t-0 lg:bg-[linear-gradient(to_top,var(--night)_72%,transparent)] lg:pb-10 lg:pt-10">
          {finishError && isOath && (
            <div className="mx-auto w-full max-w-col px-gutter pb-3 lg:px-8">
              <ErrorNote onRetry={() => void finish()}>{finishError}</ErrorNote>
            </div>
          )}
          <div className="mx-auto flex w-full max-w-col items-center gap-3 px-gutter lg:px-8">
            {isOath ? (
              <HoldButton
                label={finishing ? "Saving your plan…" : "Hold to begin the ascent"}
                busy={finishing}
                onConfirm={() => void finish()}
                confirmTitle="Begin the ascent?"
                confirmBody="Your plan is saved and Now opens. Everything stays editable in Settings."
                confirmLabel="Begin"
                instructions="Press and hold for a moment to begin, or tap for a confirm step."
              />
            ) : (
              <>
                {step > 0 && (
                  <Button type="button" variant="secondary" size="lg" className="w-[30%] shrink-0" onClick={back}>
                    Back
                  </Button>
                )}
                <Button type="submit" variant="primary" size="lg" className="min-w-0 flex-1">
                  {returnToOath ? "Done" : "Continue"}
                </Button>
              </>
            )}
          </div>
        </footer>
      </form>
    </Frame>
  );
}

/* ------------------------------------------------------------- pieces */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Sunday 18 October 2026" from the local ISO date. */
function swornOn(iso: string) {
  const [y, mo, d] = iso.split("-").map(Number);
  const wd = new Date(y, mo - 1, d).getDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[mo - 1]} ${y}`;
}

/** Five segments: done ivory, current half, ahead a hairline. Never gold — the oath isn't sworn yet. */
function Progress({ step }: { step: number }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${TOTAL}`}>
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {OATH_STEPS.map((s, i) => (
          <span key={s} className={cn("h-[3px] flex-1 rounded-full transition-colors duration-(--dur-base)", i < step ? "bg-ivory" : i === step ? "bg-ivory/55" : "bg-vein-3")} />
        ))}
      </div>
      <span className="t-eyebrow tnum shrink-0" aria-hidden>
        {step + 1} of {TOTAL}
      </span>
    </div>
  );
}

/** The step's question in the voice. The climber and the oath stand beside the statue. */
function StepHead({ id, step, title, helper, a, today }: { id: OathStepId; step: number; title: string; helper: string; a: OnboardingAnswers; today: string }) {
  const withStatue = id === "climber" || id === "oath";
  // an oath carries the day it was sworn
  const eyebrow = id === "oath" ? swornOn(today) : OATH_LABELS[id];
  return (
    <div className={cn("relative", withStatue ? "min-h-[13.5rem] lg:min-h-0 @max-[19rem]:min-h-0" : "mb-6")}>
      {withStatue && (
        // beside the question on a phone; above it at accessibility sizes, so the text keeps the full width
        <div
          className="pointer-events-none absolute -right-[18%] -top-3 w-[62%] max-w-[17rem] lg:hidden @max-[19rem]:relative @max-[19rem]:right-auto @max-[19rem]:top-auto @max-[19rem]:mx-auto @max-[19rem]:mb-2 @max-[19rem]:w-[58%]"
          aria-hidden={id !== "oath"}
        >
          <Statue p={0} mode="oath" spotlight label={id === "oath" ? "The statue, in marble. It gilds as your 7-day trend climbs." : "The statue, in marble."} />
        </div>
      )}
      <div className={cn("relative", withStatue && "max-w-[62%] pt-8 lg:max-w-none lg:pt-0 @max-[19rem]:max-w-none @max-[19rem]:pt-0")}>
        <p className="t-eyebrow">{eyebrow}</p>
        <h1 className={cn("mt-2 text-ivory", id === "oath" ? "t-film text-[length:2rem]" : "t-title-1")}>{title}</h1>
        <p className="t-callout mt-3 text-stone">{id === "climber" && a.displayName.trim() ? `${a.displayName.trim()}, your numbers today. The statue starts in marble.` : helper}</p>
        <span className="sr-only">
          Step {step + 1} of {TOTAL}
        </span>
      </div>
    </div>
  );
}

/**
 * The whole screen. From 1024 px the left half is the exhibit: the statue in marble under the
 * spotlight and the five steps. Leaving fades to obsidian, then Now plays its first Unveiling.
 */
function Frame({ step, a, leaving, children }: { step: number; a: OnboardingAnswers | null; leaving?: boolean; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-night lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      <aside className="relative hidden overflow-hidden border-r border-vein bg-obsidian lg:block" aria-hidden>
        <div className="sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-10">
          <div className="monument absolute inset-0" />
          <p className="t-film relative text-[length:1.5rem] text-ivory">Project Greek God</p>
          <div className="relative mx-auto w-full max-w-[26rem]">
            <Statue p={0} mode="oath" spotlight label="The statue, in marble." />
          </div>
          <ol className="relative grid max-w-[15rem] gap-1">
            {OATH_STEPS.map((s, i) => (
              <li key={s} className={cn("t-callout flex h-9 items-center gap-3 font-semibold", i === step ? "text-ivory" : i < step ? "text-stone" : "text-ash")}>
                <span className={cn("size-2 rounded-full", i < step ? "bg-ivory" : i === step ? "bg-ivory/55" : "shadow-[inset_0_0_0_1px_var(--ui-line)]")} />
                {OATH_LABELS[s]}
              </li>
            ))}
          </ol>
          {a?.displayName && <p className="t-meta relative text-ash">For {a.displayName.trim()}</p>}
        </div>
      </aside>

      {/* clip, not hidden: the statue leans past the right edge, and the sticky header still sticks */}
      <div className="relative min-w-0 overflow-x-clip">{children}</div>

      <div className={cn("pointer-events-none fixed inset-0 z-(--z-toast) bg-obsidian transition-opacity duration-(--dur-lift) ease-out", leaving ? "opacity-100" : "opacity-0")} aria-hidden />
    </div>
  );
}
