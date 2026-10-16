// What applying a coach suggestion would change, computed before the confirm sheet opens.
// Pure so it's unit-tested; the write goes through useApplyProfileChange (which records
// goal_changes with source "suggestion") and Undo through useRevertProfileChange.

import { carbsForGoal } from "@/lib/nutrition";
import { formatInt, formatLiters } from "@/lib/units";
import type { CoachSuggestion } from "./types";

export interface ApplyProfile {
  calorie_goal: number;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
  water_goal_ml: number;
  training_mode: string;
}

export interface ApplyPlan {
  /** Fields to write. */
  values: Partial<ApplyProfile>;
  /** The same fields' current values (for Undo). */
  previous: Partial<ApplyProfile>;
  /** Plain-language side effects shown in the confirm sheet. */
  effects: string[];
}

const MIN_CARBS = 50;

export function planApply(s: CoachSuggestion, p: ApplyProfile): ApplyPlan | null {
  if (!s.field || s.proposed == null) return null;
  if (s.field === "calorie_goal") {
    const kcal = Number(s.proposed);
    const carbs = carbsForGoal(kcal, p.protein_goal, p.fat_goal);
    const values: Partial<ApplyProfile> = { calorie_goal: kcal };
    const previous: Partial<ApplyProfile> = { calorie_goal: p.calorie_goal };
    const effects: string[] = [];
    if (carbs >= MIN_CARBS && carbs !== p.carb_goal) {
      values.carb_goal = carbs;
      previous.carb_goal = p.carb_goal;
      effects.push(`Carbs move from ${p.carb_goal} g to ${carbs} g, so protein ${p.protein_goal} g and fat ${p.fat_goal} g still add up to ${formatInt(kcal)} kcal.`);
    }
    return { values, previous, effects };
  }
  if (s.field === "protein_goal") {
    const protein = Number(s.proposed);
    const carbs = carbsForGoal(p.calorie_goal, protein, p.fat_goal);
    const values: Partial<ApplyProfile> = { protein_goal: protein };
    const previous: Partial<ApplyProfile> = { protein_goal: p.protein_goal };
    const effects: string[] = [];
    if (carbs >= MIN_CARBS && carbs !== p.carb_goal) {
      values.carb_goal = carbs;
      previous.carb_goal = p.carb_goal;
      effects.push(`Carbs move from ${p.carb_goal} g to ${carbs} g, so your calorie target stays at ${formatInt(p.calorie_goal)} kcal.`);
    }
    return { values, previous, effects };
  }
  if (s.field === "water_goal_ml") {
    const ml = Number(s.proposed);
    return { values: { water_goal_ml: ml }, previous: { water_goal_ml: p.water_goal_ml }, effects: [`The water ring on Today and Nutrition fills to ${formatLiters(ml)}.`] };
  }
  if (s.field === "training_mode") {
    const mode = String(s.proposed);
    const effects =
      s.kind === "deload_week"
        ? ["New workouts start about 10% lighter with roughly half the sets and 3+ reps in reserve.", "Switch back to Standard in Training after about 7 days."]
        : mode === "intro"
          ? ["New workouts use the lower-volume introductory mode: one fewer set on most lifts."]
          : mode === "standard"
            ? ["New workouts use the full program again."]
            : ["New workouts start about 10% lighter with roughly half the sets."];
    return { values: { training_mode: mode }, previous: { training_mode: p.training_mode }, effects: [...effects, "Workouts already in progress keep their sets."] };
  }
  return null;
}

/** "Calorie target" etc. for confirm sheets and toasts. */
export function fieldLabel(s: CoachSuggestion): string {
  switch (s.field) {
    case "calorie_goal":
      return "Calorie target";
    case "protein_goal":
      return "Protein target";
    case "water_goal_ml":
      return "Water target";
    case "training_mode":
      return s.kind === "deload_week" ? "Deload week" : "Training mode";
    default:
      return "Note";
  }
}
