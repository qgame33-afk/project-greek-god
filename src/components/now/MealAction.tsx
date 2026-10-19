"use client";

import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";
import { SealTick } from "@/components/art/icons";
import { LogMealSheet, type LogMealTarget } from "@/components/meals/log/LogMealSheet";
import { estimateFor } from "@/components/meals/log/draft";
import { useRecipeConflicts } from "@/components/meals/shared/ConflictNote";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isOffline, newId, useToday } from "@/lib/data/core";
import { slotToMeal, useLogPlannedMeal } from "@/lib/data/meals";
import { recipeFeatures, recipeMacrosExact } from "@/lib/meals/recipe";
import { plannedEntryId } from "@/lib/today/now";
import { formatInt } from "@/lib/units";
import type { NowMeal } from "./useNowData";

const LONG_PRESS_MS = 500;

/** "rice cakes, honey and whey, 380 calories, 30 grams protein" */
export function mealSpoken(m: Pick<NowMeal, "name" | "kcal" | "protein">) {
  return `${m.name.replace(/&/g, "and")}, ${formatInt(m.kcal)} calories, ${Math.round(m.protein)} grams protein`;
}

/**
 * Eaten for one planned meal (docs/DESIGN-V2.md §3.1.2): one tap logs it as planned through the
 * idempotent useLogPlannedMeal (one entry id per row instance, so a repeat tap never logs twice)
 * with an Undo toast. Long-press, or the visible ⋯, opens the log sheet with servings editable
 * ("Eaten, but changed"). A meal that breaks an allergy always goes through the sheet.
 * `gold` makes Eaten the viewport's one gold control.
 */
export function MealAction({
  meal,
  gold,
  compact,
  blocked,
  className,
}: {
  meal: NowMeal;
  gold?: boolean;
  compact?: boolean;
  /** Today's food log didn't load: whether this meal is already logged is unknown, so Eaten waits. */
  blocked?: boolean;
  className?: string;
}) {
  const today = useToday();
  const log = useLogPlannedMeal();
  // one entry id per planned meal (a repeat tap on the same meal never logs twice); the Now card
  // reuses this control for the next meal once one is eaten, so the id follows the meal
  const entry = useRef<{ mealId: string; id: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState(meal.id);
  if (noteFor !== meal.id) {
    setNoteFor(meal.id);
    setNote(null);
  }
  const conflicts = useRecipeConflicts(meal.recipe);
  const allergy = conflicts.some((c) => c.kind === "allergy");
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const target: LogMealTarget | null = meal.recipe
    ? { recipe: meal.recipe, servings: meal.servings, plannedMeal: { id: meal.id, slot: meal.slot, local_date: meal.local_date } }
    : null;

  const eat = () => {
    if (!meal.recipe || log.isPending || blocked) return;
    if (allergy) {
      setSheet(true);
      return;
    }
    if (isOffline()) {
      setNote("Offline · try again when you're back");
      return;
    }
    setNote(null);
    entry.current = plannedEntryId(entry.current, meal.id, newId);
    const macros = estimateFor(recipeMacrosExact(meal.recipe, 1), meal.servings);
    log.mutate({
      id: entry.current.id,
      plannedMealId: meal.id,
      recipe: { key: meal.recipe.key, name: meal.recipe.name, ingredients: meal.recipe.ingredients },
      servings: meal.servings,
      date: today,
      meal: slotToMeal(meal.slot),
      macros,
      features: recipeFeatures(meal.recipe),
    });
  };

  const startPress = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      if (target) setSheet(true);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  if (meal.eaten) {
    return (
      <span className={cn("t-callout inline-flex h-11 shrink-0 items-center gap-1.5 px-1 font-semibold text-leaf-300", className)}>
        <SealTick className="seal-in size-5" />
        Eaten
      </span>
    );
  }

  return (
    <div className={cn("flex shrink-0 flex-col items-end", className)}>
      <div className={cn("flex items-center", gold ? "w-full gap-2" : "gap-1")}>
        <Button
          variant={gold ? "primary" : "outline"}
          size={gold ? "lg" : "sm"}
          className={cn(gold ? "flex-1" : "min-w-[72px] rounded-full px-4")}
          disabled={!meal.recipe || blocked}
          loading={log.isPending}
          aria-label={`Mark ${meal.name.replace(/&/g, "and")} as eaten, ${formatInt(meal.kcal)} calories, ${Math.round(meal.protein)} grams protein`}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            eat();
          }}
        >
          Eaten
        </Button>
        {/* "Eaten, but changed": the visible, non-gesture path beside the long-press (§3.1.2) */}
        <button
          type="button"
          aria-label={`Eaten, but changed: edit servings for ${meal.name}`}
          disabled={!target || blocked}
          onClick={() => setSheet(true)}
          className={cn(
            "press grid shrink-0 place-items-center rounded-full text-stone hover:text-ivory disabled:opacity-40",
            gold ? "size-14 bg-m3 shadow-[inset_0_0_0_1px_var(--vein-2)]" : compact ? "-mr-2 size-11" : "size-11",
          )}
        >
          <Ellipsis className="size-5" strokeWidth={1.6} />
        </button>
      </div>
      {note && (
        <p role="status" className="t-meta mt-1 text-stone">
          {note}
        </p>
      )}
      <LogMealSheet open={sheet} onOpenChange={setSheet} target={target} />
    </div>
  );
}
