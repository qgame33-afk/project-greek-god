"use client";

import { BackLink } from "@/components/shell/BackLink";
import { useGoUp } from "@/components/shell/trail";
import { useSearchParams } from "next/navigation";
import { BellOff, BellRing, Check, Ellipsis, RotateCcw, Sun, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ConflictNote, recipeHref, servingsLabel, useRecipeConflicts, useRecipePool } from "@/components/meals/shared";
import { BackHeader } from "@/components/shell/BackHeader";
import { AiMark } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { ListGroup, Row } from "@/components/ui/list";
import { Empty, Skeleton } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { formatInt } from "@/lib/units";
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
import { loggedText } from "../recipe/RecipeExtras";
import { clampServings } from "../recipe/servings";
import { SafetyNote, stepLabel } from "../recipe/StepList";
import { BigTimer } from "./BigTimer";
import { clampStep, dragOffset, kitchenText, resumeStep, swipeIntent } from "./cook-model";
import { clockText, isDone, timeLeft, visibleTimers } from "./timer-model";
import { readTimerSound, TimerAlarm, useTimers, writeTimerSound } from "./timers";
import { useWakeLock } from "./wake-lock";

/**
 * Cooking mode (docs/DESIGN-V3-SIMPLE.md §4.4.4): a focus route with no tab bar. ✕, "Step 2 of
 * 6" and a progress bar; the step in large type (readable from the counter); a timer card when the
 * step has one, with running timers of other steps as chips. Dock: "Back" and the gold "Next step";
 * on the last step the gold "Log as eaten" (never logs twice: one entry id per screen, and a
 * planned meal already in the log is not logged again) and "Done". The screen stays on (wake
 * lock). The ⋯ holds read aloud, the timer sound, every step and the ingredients.
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
      <div className="mx-auto max-w-col px-gutter pt-[calc(var(--safe-top)+4px)]">
        <BackHeader href="/nutrition" parent="Food" title="Cooking" />
        <Empty className="mt-4" title="Recipe not found">
          It may have been removed from your recipes.
        </Empty>
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
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      if (logOpen || menuOpen || e.defaultPrevented) return;
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
  }, [goto, index, finished, close, logOpen, menuOpen]);

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

  const alreadyLogged = !!priorLog || !!lastLog || quickLogged;

  return (
    <div className="fixed inset-0 flex flex-col bg-bg text-fg">
      <TimerAlarm sound={sound} />
      {/* ------------------------------------------------------------------ top */}
      <header className="shrink-0 px-gutter pt-[calc(var(--safe-top)+4px)]">
        <div className="mx-auto flex min-h-14 max-w-col items-center gap-3">
          <BackLink href={backHref} aria-label="Close cooking mode" className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
            <X className="size-5" strokeWidth={1.9} aria-hidden />
          </BackLink>
          <p className="t-label min-w-0 flex-1 text-center font-semibold" aria-live="polite">
            {finished ? "All steps done" : `Step ${index + 1} of ${n}`}
          </p>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Ingredients, steps and timer sound" aria-haspopup="dialog" className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
            <Ellipsis className="size-5" strokeWidth={1.9} aria-hidden />
          </button>
        </div>
        <Bar thin className="mx-auto mt-2 max-w-col" value={finished ? 1 : (index + 1) / Math.max(1, n)} label={`Step ${Math.min(index + 1, n)} of ${n}`} />
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
            <div ref={dragEl} className="mx-auto max-w-col px-gutter pb-8 pt-6">
              {/* before you start: what this recipe breaks (allergies, diet, dislikes) */}
              {index === 0 && <ConflictNote conflicts={conflicts} className="mb-6" />}
              <div ref={swapRef}>
                <p className="t-label" data-food="">
                  {recipe.name}
                </p>
                <h1 className="sr-only">
                  Step {index + 1} of {n}: {recipe.name}
                </h1>
                <p className={cn("t-title mt-3 text-pretty font-bold", done && "text-fg-2")} aria-live="polite" data-food="">
                  {kitchenText(step.text)}
                </p>
                {step.safety && <SafetyNote text={step.safety} large className="mt-6" />}
                {step.timerSec ? (
                  <div className="mt-6">
                    <BigTimer recipeKey={recipe.key} step={index} totalSec={step.timerSec} label={stepLabel(index, step.text)} />
                  </div>
                ) : null}
              </div>
            </div>
          </main>

          {/* ---------------------------------------------------------------- bottom */}
          <footer className="@container shrink-0 bg-bg px-gutter pb-[calc(12px+var(--safe-bottom))] pt-3 lg:pb-6">
            <div className="mx-auto flex max-w-col gap-3">
              {atEnd ? (
                <Button variant="secondary" size="xl" className="shrink-0 basis-[38%]" onClick={next} aria-label={alreadyLogged ? "Done" : "Done without logging"}>
                  Done
                </Button>
              ) : (
                <Button variant="secondary" size="xl" className="shrink-0 basis-[38%]" onClick={prev} disabled={atStart}>
                  Back
                </Button>
              )}
              {atEnd && alreadyLogged ? (
                <Button variant="secondary" size="xl" className="flex-1" disabled aria-label="Already in your food log">
                  Eaten
                </Button>
              ) : atEnd ? (
                <Button variant="primary" size="xl" className="flex-1" onClick={eatAndFinish} loading={quick.pending} aria-label={`Log ${servingsLabel(servings)} as eaten and finish`}>
                  Log as eaten
                </Button>
              ) : (
                <Button variant="primary" size="xl" className="flex-1" onClick={next}>
                  Next step
                </Button>
              )}
            </div>
            {atEnd && (quick.note || priorLog) && (
              <p role="status" className="t-cap mx-auto mt-2 max-w-col text-center">
                {quick.note ?? (priorLog ? `${loggedText(priorLog.local_date, today, Number(priorLog.calories))} · it won't be added again` : null)}
              </p>
            )}
          </footer>
        </>
      )}

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Cooking" description={`${recipe.name} · ${servingsLabel(servings)}`}>
        <div className="flex flex-col gap-5 pb-2">
          <ListGroup>
            {speech.supported && !finished && (
              <Row icon={speech.speaking ? VolumeX : Volume2} title={speech.speaking ? "Stop reading" : "Read this step aloud"} chevron={false} onClick={() => (speech.speaking ? speech.stop() : speech.say(kitchenText(step.text)))} />
            )}
            <Row
              icon={sound ? BellRing : BellOff}
              title="Timer sound"
              value={sound ? "On" : "Off"}
              chevron={false}
              ariaLabel={`Timer sound, ${sound ? "on" : "off"}. Tap to turn ${sound ? "off" : "on"}`}
              onClick={() => {
                const on = !sound;
                setSound(on);
                writeTimerSound(on);
              }}
            />
            <Row icon={Sun} title="Screen stays on" value={wake === "on" ? "On" : "Not available"} />
          </ListGroup>
          <section aria-label="Steps">
            <h3 className="t-section mb-3">Steps</h3>
            <ListGroup>
              {recipe.steps.map((st, i) => (
                <Row
                  key={i}
                  title={`${i + 1}. ${kitchenText(st.text)}`}
                  wrap
                  value={checks.steps.includes(i) ? "Done" : i === index && !finished ? "Now" : undefined}
                  chevron={false}
                  onClick={() => {
                    setMenuOpen(false);
                    setFinished(false);
                    goto(i);
                  }}
                />
              ))}
            </ListGroup>
          </section>
          <section aria-label="Ingredients">
            <h3 className="t-section mb-3">Ingredients</h3>
            <IngredientList items={ingredients} checked={checks.ingredients} onToggle={(k) => checks.toggleIngredient(k)} dense />
          </section>
        </div>
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
    <div className="no-scrollbar mx-auto flex max-w-col gap-2 overflow-x-auto pb-1 pt-3">
      {others.map((t) => {
        const ring = isDone(t, now);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onJump(t.step)}
            className="press t-label inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-control px-3.5 font-semibold text-fg"
            aria-label={`Step ${t.step + 1} timer, ${ring ? "done" : `${clockText(timeLeft(t, now))} left`}. Go to step`}
          >
            {ring ? <BellRing className="size-4" strokeWidth={1.9} aria-hidden /> : <Timer className="size-4" strokeWidth={1.9} aria-hidden />}
            <span>Step {t.step + 1}</span>
            <span className="tabular-nums">{ring ? "Done" : clockText(timeLeft(t, now))}</span>
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
  const loggedLine = lastLog
    ? loggedText(lastLog.entry.local_date, today, Number(lastLog.entry.calories))
    : quickLogged
      ? `Logged today · ${servingsLabel(servings)}`
      : priorLog
        ? loggedText(priorLog.local_date, today, Number(priorLog.calories))
        : null;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-col flex-col px-gutter pb-[calc(24px+var(--safe-bottom))] pt-8">
        <div className="flex-1">
          <h1 className="t-title">Done cooking</h1>
          <p className="t-label mt-2">
            {recipe.steps.length} steps · {servingsLabel(servings)} of <span data-food="">{recipe.name}</span>
          </p>
          {!logged && <ConflictNote conflicts={conflicts} className="mt-6" />}
          <div className="mt-6 rounded-card bg-surface px-5 py-4">
            <p className="t-cap flex items-center gap-2">This meal {recipe.origin === "ai" && <AiMark />}</p>
            <p className="t-row mt-1 tabular-nums">
              {formatInt(macros.kcal)} kcal · {Math.round(macros.protein)} g protein · {Math.round(macros.carbs)} g carbs · {Math.round(macros.fat)} g fat
            </p>
          </div>
          {loggedLine && (
            <p role="status" className="t-row mt-3 flex items-center gap-2 px-1">
              <Check className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
              {loggedLine}
            </p>
          )}
        </div>
        <div className="mt-8 flex flex-col gap-3">
          {logged ? (
            <Button asChild variant="secondary" size="lg" block>
              <BackLink href={backHref}>Back to the recipe</BackLink>
            </Button>
          ) : (
            <>
              <Button variant="primary" size="lg" block onClick={onEat} loading={eatPending}>
                Log as eaten
              </Button>
              {eatNote && <p className="t-cap text-center">{eatNote}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="lg" onClick={onLog}>
                  Log with changes
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <BackLink href={backHref}>Back to the recipe</BackLink>
                </Button>
              </div>
            </>
          )}
          <Button variant="ghost" size="md" onClick={onAgain}>
            <RotateCcw className="size-4" strokeWidth={1.9} aria-hidden />
            Cook it again
          </Button>
          {!logged && <p className="t-cap text-center">Nothing is logged until you tap Log as eaten.</p>}
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
    <div className="fixed inset-0 bg-bg px-gutter pt-[calc(var(--safe-top)+16px)]" aria-busy="true" aria-label="Loading">
      <Skeleton className="mx-auto h-5 w-48" />
      <Skeleton className="mt-6 h-1 w-full" />
      <Skeleton className="mt-10 h-20 w-16" />
      <Skeleton className="mt-6 h-8 w-full" />
      <Skeleton className="mt-3 h-8 w-4/5" />
      <Skeleton className="mt-3 h-8 w-3/5" />
    </div>
  );
}
