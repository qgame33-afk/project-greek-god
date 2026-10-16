"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ListChecks, Plus, RotateCcw, Sun, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MacroLine, recipeHref, servingsLabel, useRecipePool } from "@/components/meals/shared";
import { EstimateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useAddFeedback, type LogPlannedMealResult, type PlanMeal } from "@/lib/data/meals";
import { haptic } from "@/lib/haptics";
import { useNowSec } from "@/lib/live-clock";
import { relativeDay } from "@/lib/dates";
import { recipeFeatures, recipeMacros, scaleIngredients } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { useSwapIn } from "@/lib/motion";
import { LogMealSheet } from "../log/LogMealSheet";
import { checkScope, useChecks } from "../recipe/checks";
import { usePlannedMealById } from "../recipe/hooks";
import { IngredientList } from "../recipe/IngredientList";
import { LoggedStrip } from "../recipe/RecipeExtras";
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
      <div className="grid min-h-dvh place-items-center bg-[var(--bg-deep)] px-6 text-center">
        <div>
          <p className="t-h2">Recipe not found</p>
          <p className="mt-2 text-[14px] text-fg-2">It may have been removed from your recipes.</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/nutrition/meals">Back to your week</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (mealId && planned.loading) return <CookSkeleton />;
  return <CookView key={`${recipe.key}:${meal?.id ?? ""}`} recipe={recipe} meal={meal} servings={servings} />;
}

function CookView({ recipe, meal, servings }: { recipe: Recipe; meal: PlanMeal | null; servings: number }) {
  const router = useRouter();
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
      haptic(6);
      setIndex(next);
    },
    [index, n],
  );
  const next = useCallback(() => {
    checks.toggleStep(index, true);
    if (atEnd) {
      haptic([12, 60, 12]);
      setFinished(true);
      markCooked();
    } else goto(index + 1);
  }, [checks, index, atEnd, goto, markCooked]);
  const prev = useCallback(() => goto(index - 1), [goto, index]);

  /* keyboard: ← → move, Enter = next, Escape leaves */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (logOpen || ingredientsOpen || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight" && !finished) goto(index + 1);
      else if (e.key === "ArrowLeft" && !finished) goto(index - 1);
      else if (e.key === "Escape") router.push(backHref);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [goto, index, finished, router, backHref, logOpen, ingredientsOpen]);

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
    <div className="fixed inset-0 flex flex-col bg-[var(--bg-deep)] text-fg">
      <TimerAlarm sound={sound} />
      {/* ------------------------------------------------------------------ top */}
      <header className="shrink-0 px-2 pt-[calc(var(--safe-top)+4px)] lg:px-6">
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-1">
          <Link href={backHref} aria-label="Close cooking mode" className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg">
            <X className="size-6" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1 px-1 text-center">
            <p className="truncate text-[15px] font-bold leading-tight text-fg">{recipe.name}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5 truncate text-[12px] font-semibold text-fg-3">
              {servingsLabel(servings)}
              {wake === "on" && (
                <>
                  <span aria-hidden>·</span>
                  <Sun className="size-3.5 text-gold-300" aria-hidden />
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
            className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg"
          >
            {sound ? <Volume2 className="size-[22px]" aria-hidden /> : <VolumeX className="size-[22px]" aria-hidden />}
          </button>
          <button type="button" onClick={() => setIngredientsOpen(true)} aria-label="Ingredients" className="press relative grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg">
            <ListChecks className="size-[22px]" aria-hidden />
          </button>
        </div>
        {/* one segment per step: gold when done, outlined where you are */}
        <ol className="mx-auto mt-1 flex max-w-[760px] gap-1 px-2" aria-label={`${checks.steps.length} of ${n} steps done`}>
          {recipe.steps.map((_, i) => (
            <li key={i} className="flex-1">
              <button type="button" onClick={() => (finished ? (setFinished(false), goto(i)) : goto(i))} aria-label={`Go to step ${i + 1}${checks.steps.includes(i) ? ", done" : ""}`} className="group relative block h-6 w-full">
                <span
                  className={cn(
                    "absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full transition-colors duration-(--dur-base)",
                    checks.steps.includes(i) ? "bg-gold-400" : i === index && !finished ? "bg-fg/70" : "bg-white/12 group-hover:bg-white/20",
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
          today={today}
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
              <div ref={swapRef}>
                <div className="flex items-end gap-3">
                  <span className="num text-[92px] font-semibold leading-[0.8] text-gold-300" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="pb-1 text-[13px] font-bold uppercase tracking-[0.16em] text-fg-3">
                    Step {index + 1} of {n}
                  </span>
                </div>
                <h1 className="sr-only">
                  Step {index + 1} of {n}: {recipe.name}
                </h1>
                <p className={cn("mt-6 text-[27px] font-semibold leading-[1.34] tracking-[-0.01em] text-pretty transition-colors duration-(--dur-fast) sm:text-[32px]", done ? "text-fg-2" : "text-fg")} aria-live="polite">
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
                  onClick={() => {
                    haptic(8);
                    checks.toggleStep(index);
                  }}
                  className={cn(
                    "press mt-6 inline-flex h-12 items-center gap-2.5 rounded-full border pl-2 pr-4 text-[15px] font-bold transition-colors",
                    done ? "border-success/35 bg-success-tint text-fg" : "border-line-strong bg-s2 text-fg-2 hover:text-fg",
                  )}
                >
                  <span className={cn("grid size-8 place-items-center rounded-full border-[1.5px] transition-colors", done ? "border-transparent bg-success text-ink" : "border-line-field")}>
                    <Check className={cn("size-4 transition-[scale,opacity] duration-(--dur-base) ease-bounce", done ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} aria-hidden />
                  </span>
                  {done ? "Done" : "Mark as done"}
                </button>
              </div>
            </div>
          </main>

          {/* ---------------------------------------------------------------- bottom */}
          <footer className="shrink-0 border-t border-line-hair px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] lg:px-6 lg:pb-6">
            <div className="mx-auto flex max-w-[760px] gap-3">
              <Button variant="secondary" size="lg" className="h-16 w-16 shrink-0 rounded-[18px] p-0" onClick={prev} disabled={atStart} aria-label="Previous step">
                <ChevronLeft className="size-7" aria-hidden />
              </Button>
              <Button variant="primary" size="lg" className="h-16 flex-1 rounded-[18px] text-[19px]" onClick={next}>
                {atEnd ? "Finish" : "Next step"}
                {!atEnd && <ChevronRight className="size-6" aria-hidden />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[12px] font-medium text-fg-3">
              <span className="lg:hidden">Swipe for the next step. </span>
              <span className="hidden lg:inline">Arrow keys move between steps. </span>
              Next ticks this one off.
            </p>
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
    <div className="no-scrollbar mx-auto flex max-w-[760px] gap-2 overflow-x-auto px-2 pt-2 pb-1">
      {others.map((t) => {
        const ring = isDone(t, now);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onJump(t.step)}
            className={cn(
              "press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-bold",
              ring ? "border-line-gold bg-gold-tint text-gold-200" : "border-line bg-s2 text-fg-2",
            )}
            aria-label={`Step ${t.step + 1} timer, ${ring ? "done" : `${clockText(timeLeft(t, now))} left`}. Go to step`}
          >
            <Timer className={cn("size-4", ring ? "text-gold-200" : "text-gold-300")} aria-hidden />
            <span>Step {t.step + 1}</span>
            <span className={cn("num text-[16px] tabular-nums", ring ? "text-gold-200" : t.endAt ? "text-fg" : "text-fg-3")}>{ring ? "Done" : clockText(timeLeft(t, now))}</span>
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
  today,
  onLog,
  onAgain,
}: {
  recipe: Recipe;
  servings: number;
  macros: ReturnType<typeof recipeMacros>;
  backHref: string;
  lastLog: LogPlannedMealResult | null;
  today: string;
  onLog: () => void;
  onAgain: () => void;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col px-5 pt-10 pb-[calc(24px+var(--safe-bottom))]">
        <div className="flex-1">
          <span className="grid size-16 place-items-center rounded-full bg-success text-ink motion-safe:animate-[dialog-in_var(--dur-slow)_var(--ease-spring)_both]">
            <Check className="size-8" strokeWidth={3} aria-hidden />
          </span>
          <h1 className="t-title mt-6">Cooked</h1>
          <p className="mt-2 text-[16px] font-medium leading-relaxed text-fg-2">
            All {recipe.steps.length} steps done. {servingsLabel(servings)} of {recipe.name}.
          </p>
          <div className="card mt-6 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="eyebrow">This meal</p>
              <EstimateBadge />
            </div>
            <MacroLine macros={macros} />
          </div>
          {lastLog && <LoggedStrip className="mt-4" text={`Logged ${relativeDay(lastLog.entry.local_date, today).toLowerCase()} · ${Math.round(Number(lastLog.entry.calories)).toLocaleString("en-US")} kcal`} href={`/nutrition?date=${lastLog.entry.local_date}`} />}
        </div>
        <div className="mt-8 space-y-3">
          {lastLog ? (
            <Button asChild variant="primary" size="lg" block>
              <Link href={backHref}>Back to recipe</Link>
            </Button>
          ) : (
            <>
              <Button variant="primary" size="lg" block onClick={onLog}>
                <Plus className="size-5" aria-hidden />
                Add to today&apos;s food log
              </Button>
              <Button asChild variant="secondary" size="lg" block>
                <Link href={backHref}>Back to recipe</Link>
              </Button>
            </>
          )}
          <button type="button" onClick={onAgain} className="press mx-auto flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-bold text-fg-2 hover:text-fg">
            <RotateCcw className="size-4" aria-hidden />
            Cook it again
          </button>
          <p className="text-center text-[12px] font-medium text-fg-3">Nothing is logged until you add it.</p>
        </div>
      </div>
    </main>
  );
}

export function CookSkeleton() {
  return (
    <div className="fixed inset-0 bg-[var(--bg-deep)] px-5 pt-[calc(var(--safe-top)+16px)]" aria-busy="true" aria-label="Loading">
      <Skeleton className="mx-auto h-5 w-48" />
      <Skeleton className="mt-6 h-1 w-full" />
      <Skeleton className="mt-10 h-20 w-16" />
      <Skeleton className="mt-6 h-8 w-full" />
      <Skeleton className="mt-3 h-8 w-[85%]" />
      <Skeleton className="mt-3 h-8 w-[60%]" />
    </div>
  );
}
