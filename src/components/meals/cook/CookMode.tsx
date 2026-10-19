"use client";

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { useGoUp } from "@/components/shell/trail";
import { useSearchParams } from "next/navigation";
import { BellOff, BellRing, ChevronLeft, ChevronRight, ListChecks, RotateCcw, Sun, Timer, Volume2, VolumeX, X } from "lucide-react";
import { SealTick } from "@/components/art/icons";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ConflictNote, MacroLine, recipeHref, servingsLabel, useRecipeConflicts, useRecipePool } from "@/components/meals/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useQuickEaten } from "../shared/EatenButton";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useAddFeedback, useLoggedForPlannedMeal, type LogPlannedMealResult, type PlanMeal } from "@/lib/data/meals";
import { useNowSec } from "@/lib/live-clock";
import { recipeFeatures, recipeMacros, scaleIngredients, type Conflict } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { useSwapIn } from "@/lib/motion";
import { LogMealSheet } from "../log/LogMealSheet";
import { checkScope, useChecks } from "../recipe/checks";
import { usePlannedMealById } from "../recipe/hooks";
import { IngredientList } from "../recipe/IngredientList";
import { LoggedStrip, loggedText } from "../recipe/RecipeExtras";
import { clampServings } from "../recipe/servings";
import { SafetyNote, stepLabel } from "../recipe/StepList";
import { BigTimer } from "./BigTimer";
import { clampStep, dragOffset, kitchenText, resumeStep, swipeIntent } from "./cook-model";
import { clockText, isDone, timeLeft, visibleTimers } from "./timer-model";
import { readTimerSound, TimerAlarm, useTimers, writeTimerSound } from "./timers";
import { useWakeLock } from "./wake-lock";

/**
 * Cooking mode (docs/MEALS.md §6): a focus route with no tab bar. One step at a time in large
 * type, swipe or tap Next, tick steps off, run each step's timer (chime + vibration where the
 * device allows) and keep the screen awake. Ticks and the current step are shared with the
 * recipe screen and kept on this device.
 */
export function CookMode({ recipeKey }: { recipeKey: string }) {
  const params = useSearchParams();
  const mealId = params.get("meal");
  const pool = useRecipePool();
  const recipe = pool.lookup(recipeKey);
  const planned = usePlannedMealById(mealId);
  const meal = planned.meal && planned.meal.recipe_key === recipeKey ? planned.meal : null;
  const raw = Number(params.get("servings"));
  const servings = clampServings(Number.isFinite(raw) && raw > 0 ? raw : (meal?.servings ?? 1));

  if (!recipe && recipeKey.startsWith("usr:") && !pool.hasData && !pool.error) return <CookSkeleton />;
  if (!recipe) {
    return (
      <div className="grid min-h-dvh place-items-center bg-obsidian px-6 text-center">
        <div>
          <p className="t-title-2 text-ivory">Recipe not found</p>
          <p className="t-callout mt-2 text-stone">It may have been removed from your recipes.</p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link href="/nutrition?tab=week">Back to your week</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (mealId && planned.loading) return <CookSkeleton />;
  return <CookView key={`${recipe.key}:${meal?.id ?? ""}`} recipe={recipe} meal={meal} servings={servings} />;
}

function CookView({ recipe, meal, servings }: { recipe: Recipe; meal: PlanMeal | null; servings: number }) {
  const today = useToday();
  const n = recipe.steps.length;
  const checks = useChecks(checkScope(recipe.key, meal?.id));
  const [index, setIndex] = useState(() => resumeStep(checks.steps, n, checks.current));
  const [finished, setFinished] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [lastLog, setLastLog] = useState<LogPlannedMealResult | null>(null);
  const [sound, setSound] = useState(readTimerSound);
  const wake = useWakeLock(!finished);
  const ingredients = useMemo(() => scaleIngredients(recipe, servings), [recipe, servings]);
  const macros = useMemo(() => recipeMacros(recipe, servings), [recipe, servings]);
  const backHref = `${recipeHref(recipe.key, meal?.id)}${!meal && servings !== 1 ? `?servings=${servings}` : ""}`;
  const conflicts = useRecipeConflicts(recipe);
  const allergy = conflicts.some((c) => c.kind === "allergy");
  const close = useGoUp(backHref);
  const quick = useQuickEaten(recipe, meal ? { id: meal.id, slot: meal.slot } : null);
  const [quickLogged, setQuickLogged] = useState(false);
  // a planned meal already in the log (from Today, Now or the recipe) is not logged a second time
  const linked = useLoggedForPlannedMeal(meal?.id);
  const loggedElsewhere = linked.entries.filter((e) => e.id !== quick.entryId);
  const priorLog = !lastLog && !quickLogged && loggedElsewhere.length ? loggedElsewhere[loggedElsewhere.length - 1] : null;
  const speech = useReadAloud();

  const setCurrent = checks.setCurrent;
  useEffect(() => setCurrent(index), [index, setCurrent]);

  /* "cooked" is a learning signal: once per meal and day */
  const addFeedback = useAddFeedback();
  const cookedOnce = useRef(false);
  const markCooked = useCallback(() => {
    if (cookedOnce.current) return;
    cookedOnce.current = true;
    const k = `pgg.meals.cooked.${checkScope(recipe.key, meal?.id)}`;
    try {
      if (localStorage.getItem(k) === today) return;
      localStorage.setItem(k, today);
    } catch {
      /* private mode: record it anyway, once for this visit */
    }
    addFeedback.mutate({ recipe_key: recipe.key, event: "cooked", features: recipeFeatures(recipe) });
  }, [addFeedback, recipe, meal?.id, today]);

  const step = recipe.steps[clampStep(index, n)];
  const atStart = index === 0;
  const atEnd = index >= n - 1;
  const done = checks.steps.includes(index);

  const goto = useCallback(
    (i: number) => {
      const next = clampStep(i, n);
      if (next === index) return;
      setIndex(next);
    },
    [index, n],
  );
  const next = useCallback(() => {
    checks.toggleStep(index, true);
    if (atEnd) {
      setFinished(true);
      markCooked();
    } else goto(index + 1);
  }, [checks, index, atEnd, goto, markCooked]);
  const prev = useCallback(() => goto(index - 1), [goto, index]);
  /** The last step's gold key: one tap logs the servings on screen (Undo in the toast), then Cooked. */
  const eatAndFinish = () => {
    if (allergy) return setLogOpen(true);
    quick.eat(servings, () => {
      setQuickLogged(true);
      checks.toggleStep(index, true);
      setFinished(true);
      markCooked();
    });
  };

  /* keyboard: ← → move, Enter = next, Escape leaves */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (logOpen || ingredientsOpen || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight" && !finished) goto(index + 1);
      else if (e.key === "ArrowLeft" && !finished) goto(index - 1);
      else if (e.key === "Escape") close();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [goto, index, finished, close, logOpen, ingredientsOpen]);

  /* swipe: the step follows the finger, then moves on or springs back */
  const dragEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; horiz: boolean | null } | null>(null);
  const resetDrag = (animate: boolean) => {
    const el = dragEl.current;
    if (!el) return;
    el.style.transition = animate ? "transform var(--dur-base) var(--ease-out)" : "none";
    el.style.transform = "";
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" || finished) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), horiz: null };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const el = dragEl.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.horiz = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (!d.horiz) return;
    el.style.transition = "none";
    el.style.transform = `translate3d(${dragOffset(dx, atStart, atEnd)}px, 0, 0)`;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const intent = d.horiz ? swipeIntent({ dx: e.clientX - d.x, dy: e.clientY - d.y, ms: performance.now() - d.t, width: window.innerWidth }) : null;
    if (intent === "next" && !atEnd) {
      resetDrag(false);
      goto(index + 1);
    } else if (intent === "prev" && !atStart) {
      resetDrag(false);
      goto(index - 1);
    } else resetDrag(true);
  };
  const swapRef = useSwapIn<HTMLDivElement, number>(index, { distance: 36 });

  return (
    <div className="fixed inset-0 flex flex-col bg-obsidian text-ivory">
      <TimerAlarm sound={sound} />
      {/* ------------------------------------------------------------------ top */}
      <header className="shrink-0 px-2 pt-[calc(var(--safe-top)+4px)] lg:px-6">
        <div className="mx-auto flex min-h-14 max-w-[760px] items-center gap-1">
          <BackLink href={backHref} aria-label="Close cooking mode" className="press grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory">
            <X className="size-6" strokeWidth={1.6} aria-hidden />
          </BackLink>
          <div className="min-w-0 flex-1 px-1 text-center">
            <p className="t-title-3 line-clamp-2 text-ivory">{recipe.name}</p>
            <p className="t-meta mt-0.5 truncate text-stone">
              {servingsLabel(servings)}
              {wake === "on" && (
                <>
                  <span aria-hidden> · </span>
                  <Sun className="mr-1 inline size-3.5 align-[-0.125em]" strokeWidth={1.6} aria-hidden />
                  Screen stays on
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const on = !sound;
              setSound(on);
              writeTimerSound(on);
            }}
            aria-pressed={sound}
            aria-label={sound ? "Timer sound on" : "Timer sound off"}
            className="press grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory"
          >
            {sound ? <BellRing className="size-[22px]" strokeWidth={1.6} aria-hidden /> : <BellOff className="size-[22px]" strokeWidth={1.6} aria-hidden />}
          </button>
          <button type="button" onClick={() => setIngredientsOpen(true)} aria-label="Ingredients" className="press relative grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory">
            <ListChecks className="size-[22px]" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
        {/* one segment per step: leaf when done (earned), ivory where you are. Each is a 44px target:
            the 24px row plus 10px above (up to the icon buttons) and 10px below (down to the timers). */}
        <ol className="mx-auto mt-1 flex max-w-[760px] gap-1 px-2" aria-label={`${checks.steps.length} of ${n} steps done`}>
          {recipe.steps.map((_, i) => (
            <li key={i} className="flex-1">
              <button
                type="button"
                onClick={() => (finished ? (setFinished(false), goto(i)) : goto(i))}
                aria-label={`Go to step ${i + 1}${checks.steps.includes(i) ? ", done" : ""}`}
                className="group relative block h-6 w-full before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
              >
                <span
                  className={cn(
                    "absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-colors duration-(--dur-base)",
                    checks.steps.includes(i) ? "bg-leaf-300" : i === index && !finished ? "bg-ivory" : "bg-vein-3 group-hover:bg-ui-line",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <TimerRail recipeKey={recipe.key} current={finished ? -1 : index} onJump={(i) => (setFinished(false), goto(i))} />
      </header>

      {finished ? (
        <Finished
          recipe={recipe}
          servings={servings}
          macros={macros}
          backHref={backHref}
          lastLog={lastLog}
          quickLogged={quickLogged}
          priorLog={priorLog}
          today={today}
          conflicts={conflicts}
          onEat={() => (allergy ? setLogOpen(true) : quick.eat(servings, () => setQuickLogged(true)))}
          eatPending={quick.pending}
          eatNote={quick.note}
          onLog={() => setLogOpen(true)}
          onAgain={() => {
            checks.clearSteps();
            setFinished(false);
            setIndex(0);
          }}
        />
      ) : (
        <>
          {/* ---------------------------------------------------------------- step */}
          <main
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
              resetDrag(true);
            }}
          >
            <div ref={dragEl} className="mx-auto max-w-[760px] px-5 pt-6 pb-8 lg:px-8">
              {/* before you start: what this recipe breaks (allergies, diet, dislikes) */}
              {index === 0 && <ConflictNote conflicts={conflicts} className="mb-6" />}
              <div ref={swapRef}>
                <div className="flex items-end justify-between gap-3">
                  <p className="flex items-baseline gap-2.5" aria-hidden>
                    <span className="t-num-l text-ivory">{index + 1}</span>
                    <span className="t-eyebrow">of {n}</span>
                  </p>
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={() => (speech.speaking ? speech.stop() : speech.say(kitchenText(step.text)))}
                      aria-pressed={speech.speaking}
                      className="press t-callout -mr-2 inline-flex h-11 items-center gap-2 rounded-full px-3 font-semibold text-stone hover:text-ivory"
                    >
                      {speech.speaking ? <VolumeX className="size-5" strokeWidth={1.6} aria-hidden /> : <Volume2 className="size-5" strokeWidth={1.6} aria-hidden />}
                      {speech.speaking ? "Stop" : "Read aloud"}
                    </button>
                  )}
                </div>
                <h1 className="sr-only">
                  Step {index + 1} of {n}: {recipe.name}
                </h1>
                <p
                  className={cn("mt-5 font-medium text-pretty transition-colors duration-(--dur-fast)", done ? "text-stone" : "text-ivory")}
                  style={{ fontSize: "1.75rem", lineHeight: 1.35, letterSpacing: "-0.01em" }}
                  aria-live="polite"
                >
                  {kitchenText(step.text)}
                </p>
                {step.safety && <SafetyNote text={step.safety} large className="mt-6" />}
                {step.timerSec ? (
                  <div className="mt-6">
                    <BigTimer recipeKey={recipe.key} step={index} totalSec={step.timerSec} label={stepLabel(index, step.text)} />
                  </div>
                ) : null}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  onClick={() => checks.toggleStep(index)}
                  className={cn(
                    "press t-callout mt-6 inline-flex h-12 items-center gap-2.5 rounded-full pl-2 pr-4 font-semibold transition-colors",
                    done ? "bg-leaf-tint text-ivory shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "bg-m2 text-stone shadow-[inset_0_0_0_1px_var(--vein-3)] hover:text-ivory",
                  )}
                >
                  <span className={cn("grid size-8 place-items-center rounded-full transition-colors", done ? "text-leaf-300" : "shadow-[inset_0_0_0_1.5px_var(--ui-line)]")}>
                    {done ? <SealTick className="seal-in size-7" /> : null}
                  </span>
                  {done ? "Done" : "Mark as done"}
                </button>
              </div>
            </div>
          </main>

          {/* ---------------------------------------------------------------- bottom */}
          <footer className="@container shrink-0 border-t border-vein px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] lg:px-6 lg:pb-6">
            <div className="mx-auto flex max-w-[760px] gap-3">
              <Button variant="secondary" size="xl" className="w-16 shrink-0 rounded-btn p-0" onClick={prev} disabled={atStart} aria-label="Previous step">
                <ChevronLeft className="size-7" strokeWidth={1.6} aria-hidden />
              </Button>
              {atEnd && priorLog ? (
                <Button variant="primary" size="xl" className="flex-1 rounded-btn" onClick={next} aria-label="Finish. This meal is already in your log">
                  Finish
                </Button>
              ) : atEnd ? (
                <Button variant="primary" size="xl" className="flex-1 rounded-btn" onClick={eatAndFinish} loading={quick.pending} aria-label={`Eaten: log ${servingsLabel(servings)} and finish`}>
                  Eaten<span className="@max-[19rem]:hidden">&nbsp;· log {servingsLabel(servings)}</span>
                </Button>
              ) : (
                <Button variant="primary" size="xl" className="flex-1 rounded-btn" onClick={next}>
                  Next<span className="@max-[19rem]:hidden">&nbsp;step</span>
                  <ChevronRight className="size-6" strokeWidth={1.8} aria-hidden />
                </Button>
              )}
            </div>
            {atEnd && priorLog ? (
              <p className="t-meta mt-2 flex min-h-11 items-center justify-center text-center text-stone">{loggedText(priorLog.local_date, today, Number(priorLog.calories))} · Finish won&apos;t add it again</p>
            ) : atEnd ? (
              <div className="mt-1 flex items-center justify-center gap-1">
                {quick.note && <span className="t-meta text-stone">{quick.note} ·</span>}
                <button type="button" onClick={next} className="press t-callout inline-flex h-11 items-center rounded-field px-2 font-semibold text-stone hover:text-ivory">
                  Finish without logging
                </button>
              </div>
            ) : (
              <p className="t-meta mt-2 text-center text-stone">
                <span className="lg:hidden">Swipe for the next step. </span>
                <span className="hidden lg:inline">Arrow keys move between steps. </span>
                Next ticks this one off.
              </p>
            )}
          </footer>
        </>
      )}

      <Sheet open={ingredientsOpen} onOpenChange={setIngredientsOpen} title="Ingredients" description={`For ${servingsLabel(servings)}`}>
        <IngredientList items={ingredients} checked={checks.ingredients} onToggle={(k) => checks.toggleIngredient(k)} dense />
      </Sheet>
      <LogMealSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        target={{ recipe, servings, plannedMeal: meal ? { id: meal.id, slot: meal.slot, local_date: meal.local_date } : null }}
        onLogged={(res) => setLastLog(res)}
      />
    </div>
  );
}

/** Timers running on other steps, so nothing boils over while you read ahead. Tap to jump there. */
function TimerRail({ recipeKey, current, onJump }: { recipeKey: string; current: number; onJump: (step: number) => void }) {
  const all = useTimers();
  // the shared 1 Hz clock (client-only screens: never the server's 0)
  const now = useNowSec() * 1000;
  const others = visibleTimers(all, now).filter((t) => t.recipeKey === recipeKey && t.step !== current);
  if (!others.length) return null;
  return (
    // The rail's padding lets taps through to the step segments' hit area just above it.
    <div className="no-scrollbar pointer-events-none mx-auto flex max-w-[760px] gap-2 overflow-x-auto px-2 pt-2.5 pb-1">
      {others.map((t) => {
        const ring = isDone(t, now);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onJump(t.step)}
            className={cn(
              "press t-callout pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 font-semibold",
              ring ? "bg-m2 text-leaf-200 shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "bg-m2 text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]",
            )}
            aria-label={`Step ${t.step + 1} timer, ${ring ? "done" : `${clockText(timeLeft(t, now))} left`}. Go to step`}
          >
            <Timer className="size-4" strokeWidth={1.6} aria-hidden />
            <span>Step {t.step + 1}</span>
            <span className={cn("t-num-s", ring ? "text-leaf-200" : t.endAt ? "text-ivory" : "text-stone")}>{ring ? "Done" : clockText(timeLeft(t, now))}</span>
          </button>
        );
      })}
    </div>
  );
}

function Finished({
  recipe,
  servings,
  macros,
  backHref,
  lastLog,
  quickLogged,
  priorLog,
  today,
  conflicts,
  onEat,
  eatPending,
  eatNote,
  onLog,
  onAgain,
}: {
  recipe: Recipe;
  servings: number;
  macros: ReturnType<typeof recipeMacros>;
  backHref: string;
  lastLog: LogPlannedMealResult | null;
  quickLogged: boolean;
  /** This planned meal's entry logged before cooking mode opened (shown, never logged twice). */
  priorLog: { local_date: string; calories: number | string } | null;
  today: string;
  conflicts: Conflict[];
  onEat: () => void;
  eatPending: boolean;
  eatNote: string | null;
  onLog: () => void;
  onAgain: () => void;
}) {
  const logged = !!lastLog || quickLogged || !!priorLog;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-col flex-col px-5 pt-10 pb-[calc(24px+var(--safe-bottom))]">
        <div className="flex-1">
          <SealTick className="seal-in size-16 text-leaf-300" />
          <h1 className="t-title-1 mt-5 text-ivory">Cooked.</h1>
          <p className="t-callout mt-2 text-stone">
            All {recipe.steps.length} steps done · {servingsLabel(servings)} of {recipe.name}.
          </p>
          {!logged && <ConflictNote conflicts={conflicts} className="mt-6" />}
          <div className="mt-6 border-y border-vein py-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="t-eyebrow">This meal</p>
              {recipe.origin === "ai" ? <Tag kind="AI" detail="estimate" /> : <Tag kind="CALC" explain="Each ingredient's USDA values × the amounts, for the servings cooked." />}
            </div>
            <MacroLine macros={macros} />
          </div>
          {lastLog ? (
            <LoggedStrip className="mt-4" text={loggedText(lastLog.entry.local_date, today, Number(lastLog.entry.calories))} href={`/nutrition?date=${lastLog.entry.local_date}`} />
          ) : quickLogged ? (
            <LoggedStrip className="mt-4" text={`Logged today · ${servingsLabel(servings)}`} href="/nutrition" />
          ) : priorLog ? (
            <LoggedStrip className="mt-4" text={loggedText(priorLog.local_date, today, Number(priorLog.calories))} href={`/nutrition?date=${priorLog.local_date}`} />
          ) : null}
        </div>
        <div className="mt-8 space-y-3">
          {logged ? (
            <Button asChild variant="primary" size="lg" block>
              <BackLink href={backHref}>Back to recipe</BackLink>
            </Button>
          ) : (
            <>
              <Button variant="primary" size="lg" block onClick={onEat} loading={eatPending}>
                <SealTick className="size-5" />
                Eaten · log {servingsLabel(servings)}
              </Button>
              {eatNote && <p className="t-meta text-center text-stone">{eatNote}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={onLog}>
                  Log with changes
                </Button>
                <Button asChild variant="outline" size="lg">
                  <BackLink href={backHref}>Back to recipe</BackLink>
                </Button>
              </div>
            </>
          )}
          <button type="button" onClick={onAgain} className="press t-callout mx-auto flex h-11 items-center gap-1.5 rounded-field px-3 font-semibold text-stone hover:text-ivory">
            <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden />
            Cook it again
          </button>
          {!logged && <p className="t-meta text-center text-stone">Nothing is logged until you tap Eaten.</p>}
        </div>
      </div>
    </main>
  );
}

/** Read the step aloud with the device's own voice (Web Speech; nothing leaves the phone). */
function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);
  const say = (text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-CA";
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  };
  return { supported, speaking, say, stop };
}

export function CookSkeleton() {
  return (
    <div className="fixed inset-0 bg-obsidian px-5 pt-[calc(var(--safe-top)+16px)]" aria-busy="true" aria-label="Loading">
      <Skeleton className="mx-auto h-5 w-48" />
      <Skeleton className="mt-6 h-1 w-full" />
      <Skeleton className="mt-10 h-20 w-16" />
      <Skeleton className="mt-6 h-8 w-full" />
      <Skeleton className="mt-3 h-8 w-4/5" />
      <Skeleton className="mt-3 h-8 w-3/5" />
    </div>
  );
}
