"use client";

import { toast } from "sonner";
import { newId } from "@/lib/data/core";
import { useAddFeedback, useDeleteFeedback, useUpdatePlannedMeal, type PlanMeal } from "@/lib/data/meals";
import { regenerateMeal } from "@/lib/meals/engine";
import { usePlannerData } from "./hooks";

/**
 * Swap one planned meal of this week for another pick, outside the week planner (Fuel → Today's
 * meal menu). The same engine call and learning signal as Regenerate on the week view, with Undo in
 * the toast (it puts the old pick back and removes the "regenerated" signal). Returns null until
 * every input the planner needs (allergies and dislikes included) has loaded.
 */
export function useSwapMeal() {
  const data = usePlannerData(0);
  const update = useUpdatePlannedMeal();
  const addFeedback = useAddFeedback();
  const deleteFeedback = useDeleteFeedback();

  const swap = (meal: PlanMeal): boolean => {
    const ctx = data.makeContext();
    if (!ctx) {
      toast("The planner is still loading. Try again in a moment.");
      return false;
    }
    if (meal.locked) {
      toast("This meal is locked. Unlock it on the week view to swap it.");
      return false;
    }
    const res = regenerateMeal(ctx, meal, []);
    if (!res.ok) {
      toast(res.message, { description: "Loosening a preference gives the planner more to pick from." });
      return false;
    }
    const before = { recipe_key: meal.recipe_key, servings: meal.servings, reason: meal.reason, history: meal.history };
    const ws = data.week.weekStart;
    update.mutate({ id: meal.id, patch: res.patch, weekStart: ws });
    const fbId = newId();
    const pending = addFeedback.mutateAsync({ ...res.feedback, id: fbId }).catch(() => {});
    toast(`Swapped for ${res.recipe.name}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          update.mutate({ id: meal.id, patch: before, weekStart: ws });
          void pending.finally(() => deleteFeedback.mutate(fbId));
        },
      },
    });
    return true;
  };

  return { swap, ready: data.ready };
}
