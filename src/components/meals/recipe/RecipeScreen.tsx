"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CookingPot, Ellipsis } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConflictNote, kcalText, recipeHref, servingsLabel, useRecipeConflicts, useRecipePool } from "@/components/meals/shared";
import { useQuickEaten } from "@/components/meals/shared/EatenButton";
import { useMealActions, useSwapStrip, weekOffset, type MealActions } from "@/components/meals/week/actions";
import { DislikeSheet } from "@/components/meals/week/DislikeSheet";
import { RegenStrip } from "@/components/meals/week/RegenStrip";
import { BackHeader } from "@/components/shell/BackHeader";
import { AiChip, AiMark } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { SectionAction, SectionHead } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { StatCard, StatRow } from "@/components/ui/stat-card";
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
import { useDeleteFood, useFoodEntries } from "@/lib/data/nutrition";
import { addDays, weekStart } from "@/lib/dates";
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
import { RecipeMenu } from "./RecipeMenu";
import { clampServings } from "./servings";
import { ServingsStepper } from "./ServingsStepper";

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

/** Where "‹ Food" goes: the day the planned meal is on. */
function foodHref(meal: PlanMeal | null, today: string) {
  return meal && meal.local_date !== today ? `/nutrition?date=${meal.local_date}` : "/nutrition";
}

/**
 * The recipe (docs/DESIGN-V3-SIMPLE.md §4.4.3): the name, time and ingredient count, the calories
 * with ONE servings stepper, protein · carbs · fat, the ingredients scaled to the servings, and a
 * dock with "Cook" and the gold "Log as eaten" (idempotent; linked to the planned meal when it is
 * one; once eaten it reads "Eaten · Undo"). Opened from the plan (`?meal=<id>`) the servings are
 * the planned meal's and save back to it, and the ⋯ holds that meal's actions.
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
      <div className="mx-auto max-w-col">
        <BackHeader href="/nutrition" parent="Food" title="Recipe" />
        {pool.error ? (
          <ErrorNote className="mt-4">Couldn&apos;t load your recipes.</ErrorNote>
        ) : (
          <Empty className="mt-4" title="Recipe not found">
            It may have been removed. Your plan can pick another.
          </Empty>
        )}
      </div>
    );
  }
  if (waitingForMeal) return <RecipeSkeleton />;
  // an old link: that planned meal has another recipe now
  const swappedTo = planned.meal && planned.meal.recipe_key !== recipeKey ? planned.meal : null;
  const props = {
    recipe,
    meal,
    weekStart: planned.weekStart,
    mealMissing: !!mealId && planned.missing,
    swappedTo: swappedTo ? { href: recipeHref(swappedTo.recipe_key, swappedTo.id), name: pool.lookup(swappedTo.recipe_key)?.name ?? "another recipe" } : null,
    initialServings: servingsParam(params.get("servings")),
  };
  const key = `${recipe.key}:${meal?.id ?? ""}`;
  return meal ? <PlannedRecipe key={key} {...props} meal={meal} /> : <RecipeView key={key} {...props} actions={null} />;
}

type ViewProps = {
  recipe: Recipe;
  meal: PlanMeal | null;
  weekStart: string | null;
  mealMissing: boolean;
  swappedTo: { href: string; name: string } | null;
  initialServings: number | null;
};

/** A recipe opened from a planned meal: the planner's actions for that meal (its week). */
function PlannedRecipe(props: ViewProps & { meal: PlanMeal }) {
  const today = useToday();
  const actions = useMealActions(weekOffset(props.meal.local_date, today), props.meal.id);
  return <RecipeView {...props} actions={actions} />;
}

function RecipeView({ recipe, meal, weekStart: ws, mealMissing, swappedTo, initialServings, actions }: ViewProps & { actions: MealActions | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { prefs } = useMealPrefs();
  const pool = useRecipePool();
  const hintId = useId();

  /* servings: the planned meal's, saved back after a short pause */
  const [localServings, setLocalServings] = useState<number | null>(null);
  const servings = clampServings(localServings ?? meal?.servings ?? initialServings ?? 1);
  const writeBack = useServingsWriteBack(meal, ws);
  const setServings = (v: number) => {
    setLocalServings(v);
    if (meal) writeBack.schedule(v);
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
  const [lastLog, setLastLog] = useState<LogPlannedMealResult | null>(null);
  const logged = useLoggedForPlannedMeal(meal?.id);
  const deleteFood = useDeleteFood();
  const deleteFeedback = useDeleteFeedback();
  const quick = useQuickEaten(recipe, meal ? { id: meal.id, slot: meal.slot } : null);
  // the entry "Eaten · Undo" takes back: this screen's own, else the planned meal's latest
  const linked = logged.entries[logged.entries.length - 1] ?? null;
  const eatenDate = lastLog?.entry.local_date ?? linked?.local_date ?? today;
  const dayFood = useFoodEntries(eatenDate);
  const eatenEntry = lastLog?.entry ?? (linked ? (dayFood.entries.find((e) => e.id === linked.id) ?? null) : null);
  const eaten = !!lastLog || logged.logged;
  const undoEaten = () => {
    const entry = eatenEntry;
    if (!entry) return;
    deleteFood.mutate({ ids: [entry.id], date: entry.local_date, rows: [entry], label: `${recipe.name} taken out of your food log` });
    if (lastLog?.feedbackId) deleteFeedback.mutate(lastLog.feedbackId);
    setLastLog(null);
  };

  /* make it easier */
  const [easierOpen, setEasierOpen] = useState(false);
  const [easierBusy, setEasierBusy] = useState(false);
  const saveRecipe = useSaveUserRecipe();
  const updateMeal = useUpdatePlannedMeal();
  const addFeedback = useAddFeedback();
  const constraintPrefs = useMemo(() => ({ allergies: prefs.allergies, diets: prefs.diets, dislikedIngredients: prefs.dislikedIngredients, equipment: prefs.equipment }), [prefs]);
  const conflicts = useRecipeConflicts(recipe);
  const lookup = pool.lookup;
  // a recipe he turned down is never offered as the easier version
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
        await updateMeal.mutateAsync({ id: swapIn.id, patch: easierSwapPatch({ ...swapIn, servings }, next, recipe), weekStart: ws ?? undefined });
      }
      setEasierOpen(false);
      router.replace(swapIn ? recipeHref(next.key, swapIn.id) : `${recipeHref(next.key)}${servings !== 1 ? `?servings=${servings}` : ""}`, { scroll: true });
      toast(swapIn ? `${next.name} is in your plan` : `Showing ${next.name}`, {
        description: meal && !swapIn ? "This meal is already in your food log, so the plan keeps it." : c.kind === "easier_version" ? "The easier version." : "Saved to your recipes.",
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            deleteFeedback.mutate(feedbackId);
            if (swapIn && before) updateMeal.mutate({ id: swapIn.id, patch: before, weekStart: ws ?? undefined });
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

  /* the swap strip (after "Swap this meal") */
  const strip = useSwapStrip();
  const myStrip = strip && meal && strip.mealId === meal.id ? strip : null;
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const go = (key: string | null) => {
    if (key && meal && key !== recipe.key) router.replace(recipeHref(key, meal.id), { scroll: false });
  };
  const swap = () => {
    if (!meal || !actions) return;
    writeBack.flush();
    go(actions.swap(meal));
  };
  useEffect(() => {
    if (myStrip?.phase !== "noted" || !actions) return;
    const t = window.setTimeout(() => actions.closeStrip("kept"), 3600);
    return () => window.clearTimeout(t);
  }, [myStrip?.phase, myStrip?.chosen, actions]);

  /* the rest */
  const [menuOpen, setMenuOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const n = ingredientCount(recipe);
  const ai = recipe.origin === "ai";
  const weekDays = meal ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(meal.local_date), i)) : [];

  return (
    <div className="mx-auto max-w-col pb-28">
      <TimerAlarm sound={readTimerSound()} />
      <BackHeader
        href={foodHref(meal, today)}
        parent="Food"
        right={
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="More for this recipe" aria-haspopup="dialog" className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
            <Ellipsis className="size-5" strokeWidth={1.9} />
          </button>
        }
        title={
          <span data-food="" className="[overflow-wrap:anywhere]">
            {recipe.name}
          </span>
        }
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>
              {recipe.minutes} min · {n} {n === 1 ? "ingredient" : "ingredients"}
            </span>
            {ai && <AiMark />}
          </span>
        }
      />

      <ConflictNote conflicts={conflicts} className="mt-4" />
      {swappedTo && (
        <p className="t-label mt-4 rounded-tile-lg bg-surface px-4 py-3">
          Your plan has{" "}
          <a href={swappedTo.href} className="font-semibold text-fg underline underline-offset-4" data-food="">
            {swappedTo.name}
          </a>{" "}
          for this meal now.
        </p>
      )}
      {mealMissing && <p className="t-label mt-4 rounded-tile-lg bg-surface px-4 py-3">This meal is no longer in your plan. Changes here stay on this screen.</p>}
      {myStrip && actions && (
        <RegenStrip
          className="mt-4"
          fromName={lookup(myStrip.from.recipe_key)?.name ?? "the last pick"}
          phase={myStrip.phase}
          noted={myStrip.noted}
          chosen={myStrip.chosen}
          onUndo={() => go(actions.closeStrip("undo"))}
          onReason={(r) => (r === "dislike_ingredient" ? setDislikeOpen(true) : go(actions.applyReason(r)))}
          onClose={() => actions.closeStrip("kept")}
          onAgain={swap}
        />
      )}

      <section className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-4 rounded-card bg-surface py-6 pl-6 pr-4" aria-label="Calories">
        <button type="button" onClick={() => setDetails(true)} aria-describedby={hintId} className="press-soft min-w-0 flex-1 text-left" aria-label={`${kcalText(macros.kcal)} calories, ${servingsLabel(servings)}`}>
          <span className="t-hero block" data-derived="">
            {kcalText(macros.kcal)}
          </span>
          <span className="t-label mt-2 flex items-center gap-1">
            <span className="min-w-0">Calories · {servingsLabel(servings)}</span>
            <ChevronRight className="size-4 shrink-0 text-fg-3" strokeWidth={2.2} aria-hidden />
          </span>
          <span id={hintId} className="sr-only">
            Shows how it is worked out.
          </span>
        </button>
        <ServingsStepper value={servings} onChange={setServings} showUnit={false} />
      </section>
      <StatRow className="mt-3">
        <StatCard value={Math.round(macros.protein)} unit="g" label="Protein" />
        <StatCard value={Math.round(macros.carbs)} unit="g" label="Carbs" />
        <StatCard value={Math.round(macros.fat)} unit="g" label="Fat" />
      </StatRow>

      <section aria-labelledby="ingredients-title">
        <SectionHead id="ingredients-title" action={checks.ingredients.length > 0 ? <SectionAction onClick={checks.clearIngredients}>Untick all</SectionAction> : undefined}>
          Ingredients
        </SectionHead>
        <IngredientList items={ingredients} checked={checks.ingredients} onToggle={(k) => checks.toggleIngredient(k)} />
      </section>

      {/* the dock: Cook and the one gold action, just above the tab bar (and the workout bar) */}
      <div className="fixed inset-x-0 bottom-[calc(var(--chrome-clear)-24px)] z-(--z-sticky) bg-bg px-gutter pb-6 pt-3 lg:bottom-0 lg:left-[248px] lg:pb-[calc(16px+var(--safe-bottom))]">
        <div className="@container mx-auto max-w-col"><div className="flex gap-3 ax:flex-col">
          <Button variant="secondary" size="lg" className="shrink-0 basis-[42%] ax:basis-auto" onClick={() => router.push(cookHref(recipe.key, meal?.id, servings))}>
            <CookingPot className="size-5" strokeWidth={1.9} aria-hidden />
            Cook
          </Button>
          {eaten ? (
            <Button variant="secondary" size="lg" block onClick={undoEaten} disabled={!eatenEntry} aria-label={`Eaten. Undo: take ${recipe.name} out of your food log`}>
              Eaten · Undo
            </Button>
          ) : (
            <Button variant="primary" size="lg" block loading={quick.pending} onClick={() => quick.eat(servings, (res) => setLastLog(res))} aria-label={`Log ${servingsLabel(servings)} of ${recipe.name} as eaten`}>
              Log as eaten
            </Button>
          )}
        </div></div>
        {quick.note && (
          <p role="status" className="t-cap mx-auto mt-2 max-w-col text-center">
            {quick.note}
          </p>
        )}
      </div>

      <DetailsSheet
        open={details}
        onOpenChange={setDetails}
        title={`${recipe.name}`}
        rows={[
          { label: "Calories", value: `${kcalText(macros.kcal)} kcal`, detail: servingsLabel(servings) },
          { label: "Protein", value: `${Math.round(macros.protein)} g` },
          { label: "Carbs", value: `${Math.round(macros.carbs)} g` },
          { label: "Fat", value: `${Math.round(macros.fat)} g` },
        ]}
        how={
          ai
            ? "An AI wrote this recipe, so its numbers are an AI estimate from its ingredients. Brands and portions will differ a little."
            : "Each ingredient's USDA FoodData Central values times its amount, added up for the servings shown. Brands and portions will differ a little. Cooking temperatures follow Health Canada's safe internal temperatures."
        }
      >
        {ai && <AiChip label="AI" />}
      </DetailsSheet>
      <RecipeMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        recipe={recipe}
        meal={meal}
        actions={actions}
        weekDays={weekDays}
        logged={eaten}
        thumb={thumbs.state}
        onThumb={thumbs.set}
        saved={isFav}
        onSave={() => toggleFav.mutate({ recipeKey: recipe.key, on: !isFav, features })}
        onSwap={swap}
        onLogChanges={() => setLogOpen(true)}
        onEasier={() => setEasierOpen(true)}
      />
      <LogMealSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        target={{ recipe, servings, plannedMeal: meal ? { id: meal.id, slot: meal.slot, local_date: meal.local_date } : null }}
        onLogged={(res) => setLastLog(res)}
      />
      <MakeEasierSheet open={easierOpen} onOpenChange={(o) => !easierBusy && setEasierOpen(o)} recipe={recipe} prefs={constraintPrefs} lookup={easierLookup} onConfirm={applyEasier} pending={easierBusy} />
      {actions && myStrip && (
        <DislikeSheet
          recipe={lookup(myStrip.from.recipe_key)}
          open={dislikeOpen}
          onOpenChange={setDislikeOpen}
          alreadyDisliked={prefs.dislikedIngredients}
          onConfirm={(k) => {
            setDislikeOpen(false);
            go(actions.dislikeIngredient(k));
          }}
        />
      )}
    </div>
  );
}

export function RecipeSkeleton() {
  return (
    <div className="mx-auto max-w-col" aria-busy="true" aria-label="Loading recipe">
      <Skeleton className="h-11 w-24" />
      <Skeleton className="mt-3 h-9 w-4/5" />
      <Skeleton className="mt-2 h-5 w-1/3" />
      <Skeleton className="mt-6 h-36 w-full rounded-card" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Skeleton className="h-20 rounded-tile-lg" />
        <Skeleton className="h-20 rounded-tile-lg" />
        <Skeleton className="h-20 rounded-tile-lg" />
      </div>
      <Skeleton className="mt-7 h-80 w-full rounded-tile-lg" />
    </div>
  );
}
