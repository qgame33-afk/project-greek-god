"use client";

import { useState } from "react";
import { LogMealSheet, type LogMealTarget } from "@/components/meals/log/LogMealSheet";
import { useRecipeConflicts } from "@/components/meals/shared/ConflictNote";
import { openOffering } from "@/components/offering/store";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { newId, useToday } from "@/lib/data/core";
import { slotToMeal, useLogPlannedMeal } from "@/lib/data/meals";
import type { ISODate } from "@/lib/dates";
import { recipeFeatures } from "@/lib/meals/recipe";
import { useRefuel, type Refuel } from "./data";

/** "6:30 pm" for minutes since local midnight. */
function minuteTime(m: number) {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * The refuel card (§3.3): the first uneaten planned meal after the session and how much of the
 * day's protein gap it closes (CALC). `Eaten` is an outline (Done holds the gold) and logs the
 * planned meal once through the idempotent planner path, with Undo; a recipe that breaks an
 * allergy or diet opens the log sheet instead so it can be confirmed. With no plan: the gap and
 * Log food (the Offering). Today's sessions only.
 */
export function RefuelCard({ date, endedAt, className }: { date: ISODate; endedAt: string | null; className?: string }) {
  const today = useToday();
  const r = useRefuel(date, endedAt, today);
  if (!r) return null;
  return (
    <section aria-label="Refuel" className={cn("rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--vein-2)]", className)}>
      <p className="t-eyebrow">Refuel</p>
      {r.kind === "met" ? (
        <p className="t-callout mt-2 text-stone">
          <span className="font-semibold text-ivory">Protein goal reached</span> · {r.eaten} of {r.goal} g today
        </p>
      ) : r.kind === "none" ? (
        <div className="mt-2 flex items-center gap-3">
          <p className="t-callout min-w-0 flex-1 text-stone">
            <span className="t-num-s text-ivory">{r.gap} g</span> protein to go today
          </p>
          <Button variant="outline" size="sm" onClick={() => openOffering({ mode: "log", date })}>
            Log food
          </Button>
        </div>
      ) : (
        <MealRow r={r} date={date} />
      )}
    </section>
  );
}

function MealRow({ r, date }: { r: Refuel; date: ISODate }) {
  const m = r.meal!;
  const conflicts = useRecipeConflicts(m.recipe);
  const log = useLogPlannedMeal();
  const [entryId] = useState(() => newId());
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState(false);
  const closes = Math.min(m.protein, r.gap);
  const target: LogMealTarget = { recipe: m.recipe, servings: m.planned.servings, plannedMeal: { id: m.planned.id, slot: m.planned.slot, local_date: m.planned.local_date } };
  const eat = () => {
    if (conflicts.length) return setSheet(true);
    log.mutate(
      {
        id: entryId,
        plannedMealId: m.planned.id,
        recipe: { key: m.recipe.key, name: m.recipe.name, ingredients: m.recipe.ingredients },
        servings: m.planned.servings,
        date,
        meal: slotToMeal(m.planned.slot),
        macros: { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat },
        features: recipeFeatures(m.recipe),
      },
      { onSuccess: () => setDone(true) },
    );
  };
  return (
    <>
      <div className="mt-2 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="t-title-3 truncate text-ivory">
            {m.recipe.name} <span className="font-medium text-stone">at {minuteTime(m.at)}</span>
          </p>
          <p className="t-meta mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
            {done ? (
              <span>Eaten · logged as planned</span>
            ) : (
              <>
                <span>
                  closes <span className="font-semibold text-ivory">{closes}</span> of {r.gap} g protein
                </span>
                <Tag kind="CALC" explain={`${r.gap} g to go = ${r.goal} g goal − ${r.eaten} g eaten today. This meal has ${m.protein} g (${m.kcal} kcal).`} />
              </>
            )}
          </p>
        </div>
        {!done && (
          <Button variant="outline" size="sm" className="min-w-[72px]" loading={log.isPending} onClick={eat} aria-label={`Mark ${m.recipe.name} as eaten, ${m.kcal} calories, ${m.protein} grams protein`}>
            Eaten
          </Button>
        )}
      </div>
      <LogMealSheet open={sheet} onOpenChange={setSheet} target={target} onLogged={() => setDone(true)} />
    </>
  );
}
