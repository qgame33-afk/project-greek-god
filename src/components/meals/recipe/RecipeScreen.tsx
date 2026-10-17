"use client";

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChefHat, ChevronLeft, ChevronRight, Plus, WandSparkles } from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConflictNote, DifficultyPips, MacroChips, MakeAheadBadge, OriginBadge, RecipeGlyph, SLOT_LABEL, COST_WORDS, costLabel, kcalText, recipeHref, useRecipeConflicts, useRecipePool } from "@/components/meals/shared";
import { EstimateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useToday, useUser } from "@/lib/data/core";
import {
  mealKeys,
  useAddFeedback,
  useDeleteFeedback,
  useFavourites,
  useLoggedForPlannedMeal,
  useMealFeedback,
  useMealPrefs,
  useSaveUserRecipe,
  useToggleFavourite,
  useUpdatePlannedMeal,
  type LogPlannedMealResult,
  type PlanMeal,
} from "@/lib/data/meals";
import { useDeleteFood } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { dayName, relativeDay } from "@/lib/dates";
import { learnPrefs } from "@/lib/meals/engine";
import { ingredientCount, recipeFeatures, recipeMacros, scaleIngredients } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { LogMealSheet } from "../log/LogMealSheet";
import { TimerAlarm, readTimerSound } from "../cook/timers";
import { checkScope, useChecks } from "./checks";
import { easierSwapPatch, storedSimplified } from "./easier";
import { usePlannedMealById, useServingsWriteBack, useThumbs, useViewedSignal } from "./hooks";
import { IngredientList } from "./IngredientList";
import { MakeEasierSheet, type EasierChoice } from "./MakeEasierSheet";
import { LoggedStrip, loggedText, TasteCard, WhyThisMeal } from "./RecipeExtras";
import { clampServings, servingsNumber } from "./servings";
import { ServingsStepper } from "./ServingsStepper";
import { StepList } from "./StepList";

/** `?servings=1.5` from a link (cooking mode, the library), clamped; null when absent or junk. */
function servingsParam(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? clampServings(n) : null;
}

/** Cooking mode for this recipe, keeping the planned meal and the servings on screen. */
export function cookHref(recipeKey: string, plannedMealId: string | null | undefined, servings: number) {
  const q = new URLSearchParams();
  if (plannedMealId) q.set("meal", plannedMealId);
  if (servings !== 1) q.set("servings", String(servings));
  const s = q.toString();
  return `/nutrition/meals/cook/${encodeURIComponent(recipeKey)}${s ? `?${s}` : ""}`;
}

/**
 * The recipe screen (docs/MEALS.md §6): everything a beginner needs to cook one meal, readable
 * at arm's length in a kitchen. Opened from the plan (`?meal=<id>`) the servings are the
 * planned meal's and changes are saved back to it; "Make this easier" swaps the easier recipe
 * into that meal. Nothing here logs food: only the confirm sheet does.
 */
export function RecipeScreen({ recipeKey }: { recipeKey: string }) {
  const params = useSearchParams();
  const mealId = params.get("meal");
  const pool = useRecipePool();
  const recipe = pool.lookup(recipeKey);
  const planned = usePlannedMealById(mealId);
  // the plan link only holds while the planned meal still has this recipe
  const meal = planned.meal && planned.meal.recipe_key === recipeKey ? planned.meal : null;

  const waitingForUserRecipe = !recipe && recipeKey.startsWith("usr:") && !pool.hasData && !pool.error;
  const waitingForMeal = !!mealId && planned.loading;

  if (!recipe && waitingForUserRecipe) return <RecipeSkeleton />;
  if (!recipe) {
    return (
      <div className="mx-auto max-w-[640px]">
        <MealPlanLink />
        {pool.error ? (
          <ErrorNote className="mt-4">Couldn&apos;t load your recipes. Check your connection.</ErrorNote>
        ) : (
          <Empty title="Recipe not found" className="mt-4" action={<Button asChild variant="secondary"><Link href="/nutrition/meals">Back to your week</Link></Button>}>
            It may have been removed. Your plan can pick another.
          </Empty>
        )}
      </div>
    );
  }
  if (waitingForMeal) return <RecipeSkeleton />;
  // an old link: that planned meal has another recipe now
  const swappedTo = planned.meal && planned.meal.recipe_key !== recipeKey ? planned.meal : null;
  return (
    <RecipeView
      key={`${recipe.key}:${meal?.id ?? ""}`}
      recipe={recipe}
      meal={meal}
      weekStart={planned.weekStart}
      mealMissing={!!mealId && planned.missing}
      swappedTo={swappedTo ? { href: recipeHref(swappedTo.recipe_key, swappedTo.id), name: pool.lookup(swappedTo.recipe_key)?.name ?? "another recipe" } : null}
      initialServings={servingsParam(params.get("servings"))}
    />
  );
}

function RecipeView({
  recipe,
  meal,
  weekStart,
  mealMissing,
  swappedTo,
  initialServings,
}: {
  recipe: Recipe;
  meal: PlanMeal | null;
  weekStart: string | null;
  mealMissing: boolean;
  swappedTo: { href: string; name: string } | null;
  initialServings: number | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { prefs } = useMealPrefs();
  const { profile } = useProfile();
  const pool = useRecipePool();

  /* servings: the planned meal's, saved back after a short pause */
  const [localServings, setLocalServings] = useState<number | null>(null);
  const servings = clampServings(localServings ?? meal?.servings ?? initialServings ?? 1);
  const writeBack = useServingsWriteBack(meal, weekStart);
  const [savedNote, setSavedNote] = useState(false);
  const setServings = (v: number) => {
    setLocalServings(v);
    if (meal) {
      writeBack.schedule(v);
      setSavedNote(true);
    }
  };

  const ingredients = useMemo(() => scaleIngredients(recipe, servings), [recipe, servings]);
  const macros = useMemo(() => recipeMacros(recipe, servings), [recipe, servings]);
  const checks = useChecks(checkScope(recipe.key, meal?.id));

  /* taste signals */
  useViewedSignal(recipe);
  const thumbs = useThumbs(recipe);
  const favs = useFavourites();
  const toggleFav = useToggleFavourite();
  const isFav = favs.isFavourite(recipe.key);
  const features = useMemo(() => recipeFeatures(recipe), [recipe]);

  /* food log */
  const [logOpen, setLogOpen] = useState(false);
  const [lastLog, setLastLog] = useState<{ res: LogPlannedMealResult; servings: number } | null>(null);
  const logged = useLoggedForPlannedMeal(meal?.id);
  const deleteFood = useDeleteFood();
  const deleteFeedback = useDeleteFeedback();
  const undoLastLog = () => {
    if (!lastLog) return;
    const { entry, feedbackId } = lastLog.res;
    deleteFood.mutate({ ids: [entry.id], date: entry.local_date, rows: [entry], label: "Removed from your food log" });
    if (feedbackId) deleteFeedback.mutate(feedbackId);
    setLastLog(null);
  };

  /* make this easier */
  const [easierOpen, setEasierOpen] = useState(false);
  const [easierBusy, setEasierBusy] = useState(false);
  const saveRecipe = useSaveUserRecipe();
  const updateMeal = useUpdatePlannedMeal();
  const addFeedback = useAddFeedback();
  const constraintPrefs = useMemo(() => ({ allergies: prefs.allergies, diets: prefs.diets, dislikedIngredients: prefs.dislikedIngredients, equipment: prefs.equipment }), [prefs]);
  // reached by a link, an older plan or a day planned before a preference changed
  const conflicts = useRecipeConflicts(recipe);
  const lookup = pool.lookup;
  // a recipe the user turned down (thumbs down / "I don't like this") is never offered as the easier version
  const feedback = useMealFeedback();
  const turnedDown = useMemo(() => {
    const blocked = learnPrefs(feedback.data ?? []).blocked;
    return new Set(Object.keys(blocked).filter((k) => blocked[k].reason !== "ate_recently"));
  }, [feedback.data]);
  const easierLookup = useCallback((k: string) => (turnedDown.has(k) ? undefined : lookup(k)), [lookup, turnedDown]);

  const applyEasier = async (c: EasierChoice) => {
    setEasierBusy(true);
    try {
      let next = c.recipe;
      if (c.kind === "simplified") next = storedSimplified(pool.pool, c.recipe) ?? (await saveRecipe.mutateAsync({ recipe: c.recipe }));
      if (c.kind === "ai") {
        // the server stored it already: show it at once, then refresh the list
        qc.setQueryData<Recipe[]>(mealKeys.recipes(userId), (prev) => [next, ...(prev ?? []).filter((r) => r.key !== next.key)]);
        qc.invalidateQueries({ queryKey: ["meal-recipes"] });
      }
      const feedbackId = crypto.randomUUID();
      addFeedback.mutate({ id: feedbackId, recipe_key: recipe.key, event: "made_easier", features });
      // a meal already in the food log keeps its recipe in the plan (it's what was eaten)
      const swapIn = meal && !logged.logged ? meal : null;
      const before = swapIn ? { recipe_key: swapIn.recipe_key, servings: swapIn.servings, reason: swapIn.reason, history: swapIn.history } : null;
      if (swapIn) {
        writeBack.flush();
        await updateMeal.mutateAsync({ id: swapIn.id, patch: easierSwapPatch({ ...swapIn, servings }, next, recipe), weekStart: weekStart ?? undefined });
      }
      setEasierOpen(false);
      router.replace(swapIn ? recipeHref(next.key, swapIn.id) : `${recipeHref(next.key)}${servings !== 1 ? `?servings=${servings}` : ""}`, { scroll: true });
      toast(swapIn ? `${next.name} is in your plan` : `Showing ${next.name}`, {
        description: meal && !swapIn ? "This meal is already in your food log, so the plan keeps it." : c.kind === "easier_version" ? "The easier library version." : "Saved to your recipes.",
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            deleteFeedback.mutate(feedbackId);
            if (swapIn && before) updateMeal.mutate({ id: swapIn.id, patch: before, weekStart: weekStart ?? undefined });
            router.replace(meal ? recipeHref(recipe.key, meal.id) : recipeHref(recipe.key));
          },
        },
      });
    } catch {
      // the data hooks already rolled back and said what failed
    } finally {
      setEasierBusy(false);
    }
  };

  /* header facts */
  const n = ingredientCount(recipe);
  const eyebrow = meal ? `${SLOT_LABEL[meal.slot]} · ${meal.local_date === today ? "Today" : dayName(meal.local_date)}` : "Recipe";
  const goals = profile?.onboarded ? { kcal: profile.calorie_goal, protein: profile.protein_goal } : null;
  const savedWhere = meal ? `${meal.local_date === today ? "today's" : `${dayName(meal.local_date)}'s`} ${SLOT_LABEL[meal.slot].toLowerCase()}` : null;

  const loggedLine = lastLog
    ? { text: loggedText(lastLog.res.entry.local_date, today, Number(lastLog.res.entry.calories)), undo: undoLastLog }
    : logged.logged
      ? {
          text: logged.loggedToday
            ? `Logged today · ${kcalText(logged.entries.filter((e) => e.local_date === today).reduce((a, e) => a + Number(e.calories ?? 0), 0))} kcal`
            : `Logged ${logged.loggedOn.map((d) => relativeDay(d, today)).join(", ")}`,
          href: `/nutrition?date=${logged.loggedToday ? today : logged.loggedOn[logged.loggedOn.length - 1]}`,
        }
      : null;

  const startCooking = () => router.push(cookHref(recipe.key, meal?.id, servings));

  // rendered in the phone column and in the desktop aside: each copy gets its own heading id
  const servingsCard = (
    <WithId>
      {(titleId) => (
        <section className="card p-4 sm:p-5" aria-labelledby={titleId}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="eyebrow">
                Servings
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-snug text-fg-2">{meal ? "Saved to your plan" : "Scales every amount"}</p>
            </div>
            <ServingsStepper value={servings} onChange={setServings} showUnit={false} />
          </div>
          <div className="mt-3 flex min-h-11 items-center gap-1.5" role="group" aria-label="Quick servings">
            <span className="mr-1 text-[12px] font-semibold text-fg-3">Cook for</span>
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setServings(v)}
                aria-pressed={servings === v}
                aria-label={`${v} ${v === 1 ? "serving" : "servings"}`}
                className={cn(
                  "press relative grid h-9 min-w-11 place-items-center rounded-full border px-3 text-[14px] font-bold transition-colors",
                  "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                  servings === v ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
                )}
              >
                <span className="num text-[16px]">{v}</span>
              </button>
            ))}
            {savedNote && savedWhere && (
              <span className="ml-auto truncate pl-2 text-right text-[12px] font-medium text-fg-3 motion-safe:animate-[fade-in_var(--dur-base)_var(--ease-out)]">Saved to {savedWhere}</span>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="eyebrow">
              {servings === 1 ? "Per serving" : `For ${servingsNumber(servings)} servings`}
            </p>
            <EstimateBadge />
          </div>
          <MacroChips macros={macros} size="lg" className="mt-2.5" />
          {goals && goals.kcal > 0 && goals.protein > 0 && (
            <p className="mt-2.5 text-[12.5px] font-medium leading-snug text-fg-3">
              <span className="num text-[13.5px] text-fg-2">{Math.round((macros.kcal / goals.kcal) * 100)}%</span> of your {kcalText(goals.kcal)} kcal ·{" "}
              <span className="num text-[13.5px] text-fg-2">{Math.round((macros.protein / goals.protein) * 100)}%</span> of {Math.round(goals.protein)} g protein
            </p>
          )}

          <div className="mt-4">
            {loggedLine ? (
              <>
                <LoggedStrip text={loggedLine.text} onUndo={"undo" in loggedLine ? loggedLine.undo : undefined} href={"href" in loggedLine ? loggedLine.href : undefined} />
                <button type="button" onClick={() => setLogOpen(true)} className="press mt-2 inline-flex h-11 items-center gap-1.5 rounded-[10px] px-1 text-[13.5px] font-bold text-fg-2 hover:text-fg">
                  <Plus className="size-4" aria-hidden />
                  Log another serving
                </button>
              </>
            ) : (
              <Button variant="secondary" size="lg" block onClick={() => setLogOpen(true)}>
                <Plus className="size-[18px] text-gold-300" aria-hidden />
                Add to today&apos;s food log
              </Button>
            )}
          </div>
        </section>
      )}
    </WithId>
  );

  const easierRow = (
    <button type="button" onClick={() => setEasierOpen(true)} className="press-soft card-instrument flex w-full min-h-[68px] items-center gap-3.5 px-4 py-3 text-left hover:bg-white/[.015]">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-line-gold/60 bg-gold-tint text-gold-300">
        <WandSparkles className="size-[19px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-bold text-fg">Make this easier</span>
        <span className="block text-[12.5px] font-medium leading-snug text-fg-3">
          {recipe.difficulty === "super_easy" ? "Already Super Easy. Check for a shortcut." : "Shortcuts like microwave rice and jarred sauce"}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
    </button>
  );

  return (
    <div className="pb-6 lg:pb-10">
      <TimerAlarm sound={readTimerSound()} />
      <MealPlanLink />

      <div className="mt-1 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        {/* ---------------------------------------------------------------- main column */}
        <div className="min-w-0">
          <header className="relative">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex min-h-5 flex-wrap items-center gap-2">
                  <span className="eyebrow">{eyebrow}</span>
                  <OriginBadge origin={recipe.origin} />
                  <MakeAheadBadge recipe={recipe} />
                </div>
                <h1 className="t-title text-balance [overflow-wrap:anywhere]">{recipe.name}</h1>
              </div>
              <RecipeGlyph recipe={recipe} size="lg" className="mt-1 hidden sm:grid" />
            </div>
            {recipe.blurb && <p className="mt-2 max-w-[56ch] text-[15px] font-medium leading-relaxed text-fg-2">{recipe.blurb}</p>}
            <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] font-semibold text-fg-2">
              <DifficultyPips difficulty={recipe.difficulty} />
              <span className="text-fg-3/60" aria-hidden>
                ·
              </span>
              <span aria-label={`Cost: ${COST_WORDS[recipe.cost]}`}>
                <span className="text-fg">{costLabel(recipe.cost)}</span>
                <span className="text-fg-3/50" aria-hidden>
                  {"$".repeat(3 - recipe.cost)}
                </span>
                <span className="ml-1.5" aria-hidden>
                  {COST_WORDS[recipe.cost]}
                </span>
              </span>
            </p>
          </header>

          <ConflictNote conflicts={conflicts} className="mt-4" />

          {swappedTo && (
            <p className="mt-4 rounded-[12px] border border-line px-3.5 py-2.5 text-[13px] font-medium text-fg-2">
              Your plan has{" "}
              <Link href={swappedTo.href} className="font-bold text-gold-300 underline-offset-2 hover:underline">
                {swappedTo.name}
              </Link>{" "}
              for this meal now. Changes here stay on this screen.
            </p>
          )}
          {mealMissing && (
            <p className="mt-4 rounded-[12px] border border-line px-3.5 py-2.5 text-[13px] font-medium text-fg-2">This meal is no longer in your plan, so changes here stay on this screen.</p>
          )}

          <dl className="card-instrument mt-5 grid grid-cols-3 divide-x divide-line-hair p-0">
            <Fact value={recipe.minutes} unit="min" label="Total time" />
            <Fact value={n} label={n === 1 ? "Ingredient" : "Ingredients"} />
            <Fact value={recipe.steps.length} label={recipe.steps.length === 1 ? "Step" : "Steps"} />
          </dl>

          {/* phones: servings + nutrition right under the facts */}
          <div className="mt-4 space-y-3 lg:hidden">
            {servingsCard}
            {easierRow}
          </div>

          <section className="card mt-4 p-4 sm:p-5 lg:mt-6" aria-labelledby="ingredients-title">
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 id="ingredients-title" className="t-h2">
                  Ingredients
                </h2>
                <span className="truncate text-[13px] font-semibold text-fg-3">{servings === 1 ? "1 serving" : `${servingsNumber(servings)} servings`}</span>
              </div>
              {checks.ingredients.length > 0 ? (
                <button type="button" onClick={checks.clearIngredients} className="press -my-2 -mr-2 inline-flex h-11 shrink-0 items-center rounded-[10px] px-2 text-[13px] font-bold text-gold-300">
                  Untick all
                </button>
              ) : (
                <span className="shrink-0 text-[12.5px] font-medium text-fg-3">Tap to tick off</span>
              )}
            </div>
            <IngredientList items={ingredients} checked={checks.ingredients} onToggle={(k) => checks.toggleIngredient(k)} />
          </section>

          <section className="card mt-4 p-4 sm:p-5" aria-labelledby="steps-title">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 id="steps-title" className="t-h2">
                Steps
              </h2>
              <div className="flex items-center gap-1">
                <span className="text-[12.5px] font-semibold text-fg-3">
                  <span className="num text-[14px] text-fg-2">{checks.steps.length}</span>/{recipe.steps.length} done
                </span>
                {checks.steps.length > 0 && (
                  <button type="button" onClick={checks.clearSteps} className="press -my-2 -mr-2 inline-flex h-11 items-center rounded-[10px] px-2 text-[13px] font-bold text-gold-300">
                    Reset
                  </button>
                )}
              </div>
            </div>
            <StepList recipeKey={recipe.key} steps={recipe.steps} done={checks.steps} onToggle={(i) => checks.toggleStep(i)} />
          </section>

          <div className="mt-4 space-y-4 lg:hidden">
            {meal?.reason && meal.reason.length > 0 && <WhyThisMeal reasons={meal.reason} />}
            <TasteCard
              favourite={isFav}
              onFavourite={() => toggleFav.mutate({ recipeKey: recipe.key, on: !isFav, features })}
              thumbs={thumbs.state}
              onThumbs={thumbs.set}
            />
          </div>

          <FinePrint />
          {/* room for the cooking dock on phones and tablets */}
          <div className="h-20 lg:hidden" aria-hidden />
        </div>

        {/* ---------------------------------------------------------------- desktop column */}
        <aside className="hidden space-y-4 lg:sticky lg:top-8 lg:block">
          <Button variant="primary" size="lg" block onClick={startCooking}>
            <ChefHat className="size-5" aria-hidden />
            Start cooking
          </Button>
          {servingsCard}
          {easierRow}
          {meal?.reason && meal.reason.length > 0 && <WhyThisMeal reasons={meal.reason} />}
          <TasteCard favourite={isFav} onFavourite={() => toggleFav.mutate({ recipeKey: recipe.key, on: !isFav, features })} thumbs={thumbs.state} onThumbs={thumbs.set} />
        </aside>
      </div>

      {/* phones and tablets: the one gold action, always in reach, floating over a fade */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-[25] bg-[linear-gradient(to_top,var(--bg)_0%,rgb(8_9_12/.92)_45%,transparent)] px-4 pt-7 pb-3 md:left-[76px] md:px-6 md:pb-[calc(16px+var(--safe-bottom))] lg:hidden",
          "bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] md:bottom-0",
          "[body:has([data-live-dock])_&]:bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+var(--dock-h)+20px)] md:[body:has([data-live-dock])_&]:bottom-[84px]",
        )}
      >
        <div className="pointer-events-auto mx-auto max-w-[640px]">
          <Button variant="primary" size="lg" block onClick={startCooking}>
            <ChefHat className="size-5" aria-hidden />
            Start cooking
          </Button>
        </div>
      </div>

      <LogMealSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        target={{ recipe, servings, plannedMeal: meal ? { id: meal.id, slot: meal.slot, local_date: meal.local_date } : null }}
        onLogged={(res, s) => setLastLog({ res, servings: s })}
      />
      <MakeEasierSheet open={easierOpen} onOpenChange={(o) => !easierBusy && setEasierOpen(o)} recipe={recipe} prefs={constraintPrefs} lookup={easierLookup} onConfirm={applyEasier} pending={easierBusy} />
    </div>
  );
}

function Fact({ value, unit, label }: { value: number; unit?: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center px-2 py-3.5 text-center">
      <dd className="num-md leading-none text-fg">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </dd>
      <dt className="mt-1.5 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</dt>
    </div>
  );
}

function MealPlanLink() {
  return (
    <BackLink href="/nutrition/meals" className="press -ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
      <ChevronLeft className="size-5" aria-hidden />
      Meal plan
    </BackLink>
  );
}

function FinePrint() {
  return (
    <p className="mt-6 max-w-[60ch] text-[12px] font-medium leading-relaxed text-fg-3">
      Nutrition is an estimate from USDA FoodData Central values for each ingredient, so brands and portions will differ a little. Cooking temperatures follow Health Canada&apos;s safe
      internal temperatures.
    </p>
  );
}

export function RecipeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recipe">
      <Skeleton className="h-11 w-28" />
      <Skeleton className="mt-3 h-4 w-32" />
      <Skeleton className="mt-3 h-9 w-[80%]" />
      <Skeleton className="mt-2 h-9 w-[55%]" />
      <Skeleton className="mt-4 h-[76px] w-full rounded-[16px]" />
      <Skeleton className="mt-4 h-[260px] w-full rounded-[20px]" />
      <Skeleton className="mt-4 h-[320px] w-full rounded-[20px]" />
    </div>
  );
}

/** A fresh id per rendered instance, for markup that appears more than once on the page. */
function WithId({ children }: { children: (id: string) => ReactNode }) {
  const id = useId();
  return children(id);
}
