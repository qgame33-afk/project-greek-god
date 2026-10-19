"use client";

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChefHat, ChevronLeft, ChevronRight, Plus, WandSparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { SealTick } from "@/components/art/icons";
import { ConflictNote, DifficultyPips, MakeAheadBadge, OriginBadge, RecipeGlyph, SLOT_LABEL, COST_WORDS, costLabel, kcalText, recipeHref, servingsLabel, useRecipeConflicts, useRecipePool } from "@/components/meals/shared";
import { useQuickEaten } from "@/components/meals/shared/EatenButton";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
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
      <div>
        <MealPlanLink />
        {pool.error ? (
          <ErrorNote className="mt-4">Couldn&apos;t load your recipes. Check your connection.</ErrorNote>
        ) : (
          <div className="mt-4 border-y border-vein py-9 text-center">
            <p className="t-title-2 text-ivory">Recipe not found</p>
            <p className="t-callout mt-1 text-stone">It may have been removed. Your plan can pick another.</p>
            <Button asChild variant="outline" size="md" className="mt-5 rounded-full">
              <Link href="/nutrition?tab=week">Back to your week</Link>
            </Button>
          </div>
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
  const goals = profile?.onboarded ? { kcal: Number(profile.calorie_goal) || 0, protein: Number(profile.protein_goal) || 0, carbs: Number(profile.carb_goal) || 0, fat: Number(profile.fat_goal) || 0 } : null;
  const savedWhere = meal ? `${meal.local_date === today ? "today's" : `${dayName(meal.local_date)}'s`} ${SLOT_LABEL[meal.slot].toLowerCase()}` : null;
  const quick = useQuickEaten(recipe, meal ? { id: meal.id, slot: meal.slot } : null);

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
  const macroTag = recipe.origin === "ai" ? <Tag kind="AI" detail="estimate" /> : <Tag kind="CALC" explain="Each ingredient's USDA FoodData Central values × the amounts, for the servings shown." />;

  return (
    <div className="@container pb-6">
      <TimerAlarm sound={readTimerSound()} />
      <MealPlanLink />

      <header className="mt-2">
        <RecipeGlyph recipe={recipe} size="lg" />
        <div className="mt-4 flex min-h-5 flex-wrap items-center gap-2">
          <span className="t-eyebrow">{eyebrow}</span>
          <OriginBadge origin={recipe.origin} />
          <MakeAheadBadge recipe={recipe} />
        </div>
        <h1 className="t-title-1 mt-1.5 text-balance text-ivory [overflow-wrap:anywhere]">{recipe.name}</h1>
        {recipe.blurb && <p className="t-callout mt-2 max-w-[56ch] text-stone">{recipe.blurb}</p>}
        <p className="t-meta mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-stone">
          <span className="tnum text-ivory">{recipe.minutes} min</span>
          <span aria-hidden>·</span>
          <DifficultyPips difficulty={recipe.difficulty} />
          <span aria-hidden>·</span>
          <span aria-label={`Cost: ${COST_WORDS[recipe.cost]}`}>
            <span className="text-ivory">{costLabel(recipe.cost)}</span>
            <span className="opacity-40" aria-hidden>
              {"$".repeat(3 - recipe.cost)}
            </span>
            <span className="ml-1.5" aria-hidden>
              {COST_WORDS[recipe.cost]}
            </span>
          </span>
          <span aria-hidden>·</span>
          <span>
            {n} {n === 1 ? "ingredient" : "ingredients"} · {recipe.steps.length} {recipe.steps.length === 1 ? "step" : "steps"}
          </span>
        </p>
      </header>

      <ConflictNote conflicts={conflicts} className="mt-5" />

      {swappedTo && (
        <p className="t-meta mt-4 rounded-field bg-m2 px-3.5 py-2.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]">
          Your plan has{" "}
          <Link href={swappedTo.href} className="font-semibold text-ivory underline decoration-vein-3 underline-offset-4">
            {swappedTo.name}
          </Link>{" "}
          for this meal now. Changes here stay on this screen.
        </p>
      )}
      {mealMissing && <p className="t-meta mt-4 rounded-field bg-m2 px-3.5 py-2.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]">This meal is no longer in your plan, so changes here stay on this screen.</p>}

      {/* servings, macros and the food log */}
      <section className="mt-6 border-y border-vein py-4" aria-labelledby="servings-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="servings-title" className="t-eyebrow">
              Servings
            </h2>
            <p className="t-meta mt-1 text-stone">{savedNote && savedWhere ? `Saved to ${savedWhere}` : meal ? "Saved to your plan" : "Scales every amount"}</p>
          </div>
          <ServingsStepper value={servings} onChange={setServings} showUnit={false} />
        </div>
        <div className="mt-3 flex min-h-11 items-center gap-1.5" role="group" aria-label="Quick servings">
          <span className="t-meta mr-1 text-stone">Cook for</span>
          {[1, 2, 4].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setServings(v)}
              aria-pressed={servings === v}
              aria-label={`${v} ${v === 1 ? "serving" : "servings"}`}
              className={cn(
                "press t-num-s grid size-11 place-items-center rounded-full transition-colors",
                servings === v ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="t-eyebrow">{servings === 1 ? "Per serving" : `For ${servingsNumber(servings)} servings`}</p>
          {macroTag}
        </div>
        <MacroMeters macros={macros} goals={goals} className="mt-3" />

        <div className="mt-5">
          {loggedLine ? (
            <>
              <LoggedStrip text={loggedLine.text} onUndo={"undo" in loggedLine ? loggedLine.undo : undefined} href={"href" in loggedLine ? loggedLine.href : undefined} />
              <button type="button" onClick={() => setLogOpen(true)} className="press t-callout mt-2 inline-flex h-11 items-center gap-1.5 rounded-field px-1 font-semibold text-stone hover:text-ivory">
                <Plus className="size-4" strokeWidth={1.6} aria-hidden />
                Log another serving
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button variant="outline" size="md" className="h-auto min-h-12 max-w-full whitespace-normal rounded-full py-2" onClick={() => quick.eat(servings)} loading={quick.pending} aria-label={`Eaten: log ${servingsLabel(servings)} of ${recipe.name}`}>
                <SealTick className="size-5" />
                Eaten · log {servingsLabel(servings)}
              </Button>
              <button type="button" onClick={() => setLogOpen(true)} className="press t-callout inline-flex h-11 items-center rounded-field px-1 font-semibold text-stone hover:text-ivory">
                Log with changes
              </button>
              {quick.note && (
                <p role="status" className="t-meta w-full text-stone">
                  {quick.note}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="ingredients-title">
        <div className="mb-1 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id="ingredients-title" className="t-title-2 text-ivory">
              Ingredients
            </h2>
            <span className="t-meta truncate text-stone">{servings === 1 ? "1 serving" : `${servingsNumber(servings)} servings`}</span>
          </div>
          {checks.ingredients.length > 0 ? (
            <button type="button" onClick={checks.clearIngredients} className="press t-callout -my-2 -mr-2 inline-flex h-11 shrink-0 items-center rounded-field px-2 font-semibold text-ivory">
              Untick all
            </button>
          ) : (
            <span className="t-meta shrink-0 text-stone">Tap to tick off</span>
          )}
        </div>
        <IngredientList items={ingredients} checked={checks.ingredients} onToggle={(k) => checks.toggleIngredient(k)} />
      </section>

      <section className="mt-8" aria-labelledby="steps-title">
        <div className="mb-1 flex items-end justify-between gap-3">
          <h2 id="steps-title" className="t-title-2 text-ivory">
            Steps
          </h2>
          <div className="flex items-center gap-1">
            <span className="t-meta tnum text-stone">
              {checks.steps.length}/{recipe.steps.length} done
            </span>
            {checks.steps.length > 0 && (
              <button type="button" onClick={checks.clearSteps} className="press t-callout -my-2 -mr-2 inline-flex h-11 items-center rounded-field px-2 font-semibold text-ivory">
                Reset
              </button>
            )}
          </div>
        </div>
        <StepList recipeKey={recipe.key} steps={recipe.steps} done={checks.steps} onToggle={(i) => checks.toggleStep(i)} />
      </section>

      <div className="mt-8 space-y-6">
        <button type="button" onClick={() => setEasierOpen(true)} className="press-soft flex w-full min-h-16 items-center gap-3.5 border-y border-vein py-3 text-left">
          <WandSparkles className="size-5 shrink-0 text-stone" strokeWidth={1.6} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="t-title-3 block text-ivory">Make this easier</span>
            <span className="t-meta block text-stone">{recipe.difficulty === "super_easy" ? "Already Super Easy. Check for a shortcut." : "Shortcuts like microwave rice and jarred sauce"}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
        </button>
        {meal?.reason && meal.reason.length > 0 && <WhyThisMeal reasons={meal.reason} />}
        <TasteCard favourite={isFav} onFavourite={() => toggleFav.mutate({ recipeKey: recipe.key, on: !isFav, features })} thumbs={thumbs.state} onThumbs={thumbs.set} />
      </div>

      <FinePrint />
      {/* room for the floating Start cooking key */}
      <div className="h-20" aria-hidden />

      {/* the one gold action, always in reach, over a fade just above the capsule */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[var(--chrome-clear)] z-(--z-sticky) bg-[linear-gradient(to_top,var(--night)_0%,rgb(9_9_11/.92)_45%,transparent)] px-gutter pb-3 pt-7 md:bottom-0 md:left-[76px] md:px-6 md:pb-[calc(16px+var(--safe-bottom))] lg:left-[248px]">
        <div className="pointer-events-auto mx-auto max-w-col">
          <Button variant="primary" size="lg" block onClick={startCooking}>
            <ChefHat className="size-5" strokeWidth={1.8} aria-hidden />
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

/**
 * The macro meter row (docs/DESIGN-V2.md §3.5.4): kcal and the three macros for the servings
 * shown, each with a small meter of its share of the day's target.
 */
function MacroMeters({ macros, goals, className }: { macros: { kcal: number; protein: number; carbs: number; fat: number }; goals: { kcal: number; protein: number; carbs: number; fat: number } | null; className?: string }) {
  const cells = [
    { k: "kcal", label: "kcal", v: macros.kcal, goal: goals?.kcal ?? 0, tone: "kcal" as const, unit: "" },
    { k: "protein", label: "Protein", v: macros.protein, goal: goals?.protein ?? 0, tone: "ivory" as const, unit: "g" },
    { k: "carbs", label: "Carbs", v: macros.carbs, goal: goals?.carbs ?? 0, tone: "carbs" as const, unit: "g" },
    { k: "fat", label: "Fat", v: macros.fat, goal: goals?.fat ?? 0, tone: "fat" as const, unit: "g" },
  ];
  return (
    <div className={cn("grid grid-cols-4 gap-3 @max-[19rem]:grid-cols-2", className)}>
      {cells.map((c) => (
        <div key={c.k} className="min-w-0">
          <p className="whitespace-nowrap">
            <span className="t-num-m text-ivory">{c.k === "kcal" ? kcalText(c.v) : Math.round(c.v)}</span>
            {c.unit && <span className="t-meta text-stone"> {c.unit}</span>}
          </p>
          <p className="t-eyebrow mt-0.5">{c.label}</p>
          {c.goal > 0 && (
            <>
              <Meter className="mt-2" size="sm" tone={c.tone} value={c.v} target={c.goal} label={`${c.label} ${Math.round(c.v)}, ${Math.round((c.v / c.goal) * 100)} percent of your day`} />
              <p className="t-meta tnum mt-1 text-stone">{Math.round((c.v / c.goal) * 100)}% of day</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function MealPlanLink() {
  return (
    <BackLink href="/nutrition?tab=week" className="press t-callout -ml-2 inline-flex h-11 items-center gap-1 rounded-field pr-3 font-semibold text-stone hover:text-ivory">
      <ChevronLeft className="size-5" strokeWidth={1.6} aria-hidden />
      Week
    </BackLink>
  );
}

function FinePrint() {
  return (
    <p className="t-meta mt-6 max-w-[60ch] text-stone">
      Nutrition is worked out from USDA FoodData Central values for each ingredient (CALC), so brands and portions will differ a little. Cooking temperatures follow Health Canada&apos;s safe
      internal temperatures.
    </p>
  );
}

export function RecipeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recipe">
      <Skeleton className="h-11 w-28" />
      <Skeleton className="mt-3 size-14 rounded-full" />
      <Skeleton className="mt-4 h-9 w-4/5" />
      <Skeleton className="mt-2 h-9 w-1/2" />
      <Skeleton className="mt-6 h-64 w-full rounded-card" />
      <Skeleton className="mt-6 h-80 w-full rounded-card" />
    </div>
  );
}

