"use client";

import { useRef, useState } from "react";
import { LogMealSheet, type LogMealTarget } from "@/components/meals/log/LogMealSheet";
import { estimateFor } from "@/components/meals/log/draft";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isOffline, newId, useToday } from "@/lib/data/core";
import { slotToMeal, useLogPlannedMeal } from "@/lib/data/meals";
import type { ISODate } from "@/lib/dates";
import { recipeFeatures, recipeMacrosExact } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { composeEatenAt } from "@/lib/nutrition-ui/format";
import { fromMinutes, type Min } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import { useRecipeConflicts } from "./ConflictNote";

const LONG_PRESS_MS = 500;
/**
 * After one Eaten, the row turns eaten and the next meal's Eaten (often the gold one) slides under
 * the finger: a quick second tap must not log that one too. Any Eaten tap within this window of
 * another is ignored.
 */
const MOVED_GUARD_MS = 900;
let lastEatenTap = 0;

export interface EatenMeal {
  id: string;
  slot: Slot;
  local_date: ISODate;
  servings: number;
  recipe: Recipe | null | undefined;
  name: string;
  kcal: number;
  protein: number;
  /** His planned time for it: a meal of another day is stamped at this time. */
  at?: Min | null;
}

/** "rice cakes, honey and whey, 380 calories, 30 grams protein" */
export function eatenSpoken(m: Pick<EatenMeal, "name" | "kcal" | "protein">) {
  return `${m.name.replace(/&/g, "and")}, ${formatInt(m.kcal)} calories, ${Math.round(m.protein)} grams protein`;
}

/**
 * The open-sheet state for "Eaten, but changed" (servings editable), shared by a row's ⋯ menu and
 * the long-press on its Eaten button.
 */
export function useEatenChanged(meal: EatenMeal) {
  const [open, setOpen] = useState(false);
  const target: LogMealTarget | null = meal.recipe
    ? { recipe: meal.recipe, servings: meal.servings, plannedMeal: { id: meal.id, slot: meal.slot, local_date: meal.local_date } }
    : null;
  return { open, setOpen, target, sheet: <LogMealSheet open={open} onOpenChange={setOpen} target={target} /> };
}

/**
 * Eaten for one planned meal (docs/DESIGN-V2.md §3.5.1): ONE tap logs it as planned through the
 * idempotent useLogPlannedMeal — one entry id per row instance, linked by planned_meal_id — so a
 * double tap or a retry never logs twice, with a 6 s Undo toast. Long-press opens the log sheet
 * with servings editable ("Eaten, but changed"); `onChanged` is the visible ⋯ path to the same.
 * A meal that breaks an allergy always goes through the sheet. Offline it says so inline (food
 * writes are not queued). `gold` makes it the viewport's one gold control.
 */
export function EatenButton({
  meal,
  gold,
  className,
  onChanged,
}: {
  meal: EatenMeal;
  gold?: boolean;
  className?: string;
  /** Opens "Eaten, but changed" (the caller owns the sheet so ⋯ can open it too). */
  onChanged: () => void;
}) {
  const today = useToday();
  const log = useLogPlannedMeal();
  const entryId = useRef<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const conflicts = useRecipeConflicts(meal.recipe);
  const allergy = conflicts.some((c) => c.kind === "allergy");
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const eat = () => {
    if (!meal.recipe || log.isPending) return;
    const t = performance.now();
    if (t - lastEatenTap < MOVED_GUARD_MS) return;
    lastEatenTap = t;
    if (allergy) return onChanged();
    if (isOffline()) {
      setNote("Offline · try again when you're back");
      return;
    }
    setNote(null);
    entryId.current ??= newId();
    const macros = estimateFor(recipeMacrosExact(meal.recipe, 1), meal.servings);
    log.mutate({
      id: entryId.current,
      plannedMealId: meal.id,
      recipe: { key: meal.recipe.key, name: meal.recipe.name, ingredients: meal.recipe.ingredients },
      servings: meal.servings,
      date: meal.local_date,
      meal: slotToMeal(meal.slot),
      macros,
      features: recipeFeatures(meal.recipe),
      // today it is "now"; a meal of another day is stamped at his time for it
      eatenAt: plannedEatenAt(meal.local_date, today, meal.at),
    });
  };

  const startPress = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onChanged();
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div className={cn("flex shrink-0 flex-col items-end", className)}>
      <Button
        variant={gold ? "primary" : "outline"}
        size="sm"
        className={cn("min-w-[72px] rounded-full px-4", gold && "min-w-[88px] text-[length:max(13px,0.8125rem)]")}
        disabled={!meal.recipe}
        loading={log.isPending}
        aria-label={`Mark ${eatenSpoken(meal)} as eaten`}
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
      {note && (
        <p role="status" className="t-meta mt-1 max-w-[12rem] text-right text-stone">
          {note}
        </p>
      )}
    </div>
  );
}

/** The ISO timestamp for a meal of another day at his planned minute (today: undefined = now). */
export function plannedEatenAt(date: ISODate, today: ISODate, at: Min | null | undefined): string | undefined {
  if (date === today || at == null || !Number.isFinite(at)) return undefined;
  return composeEatenAt(date, fromMinutes(at));
}
