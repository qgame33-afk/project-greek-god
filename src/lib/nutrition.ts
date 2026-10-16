import { round } from "./units";

export type Meal = "breakfast" | "lunch" | "dinner" | "snacks";
export const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export function kcalFromMacros(m: Pick<Macros, "protein" | "carbs" | "fat">) {
  return m.protein * KCAL_PER_G.protein + m.carbs * KCAL_PER_G.carbs + m.fat * KCAL_PER_G.fat;
}

/** Carbs that make protein + fat + carbs add up to the calorie goal. */
export function carbsForGoal(calories: number, protein: number, fat: number) {
  return Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
}

/** True when stated calories and macro-derived calories agree within tolerance. */
export function macrosConsistent(m: Macros, tolerance = 0.12) {
  const derived = kcalFromMacros(m);
  if (m.calories === 0 && derived === 0) return true;
  if (m.calories === 0) return false;
  return Math.abs(derived - m.calories) / m.calories <= tolerance;
}

export function sumMacros<T extends { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }>(rows: T[]): Macros {
  const t = rows.reduce(
    (a, r) => ({
      calories: a.calories + Number(r.calories ?? 0),
      protein: a.protein + Number(r.protein_g ?? 0),
      carbs: a.carbs + Number(r.carbs_g ?? 0),
      fat: a.fat + Number(r.fat_g ?? 0),
    }),
    { ...ZERO },
  );
  return { calories: round(t.calories, 0), protein: round(t.protein, 1), carbs: round(t.carbs, 1), fat: round(t.fat, 1) };
}

/** Macros for `amount` given the macros of `baseAmount` (linear scaling). */
export function scaleMacros(base: Macros, baseAmount: number, amount: number): Macros {
  if (!(baseAmount > 0) || !(amount >= 0)) return { ...ZERO };
  const f = amount / baseAmount;
  return {
    calories: round(base.calories * f, 0),
    protein: round(base.protein * f, 1),
    carbs: round(base.carbs * f, 1),
    fat: round(base.fat * f, 1),
  };
}

export function remaining(goal: Macros, eaten: Macros): Macros {
  return {
    calories: goal.calories - eaten.calories,
    protein: round(goal.protein - eaten.protein, 1),
    carbs: round(goal.carbs - eaten.carbs, 1),
    fat: round(goal.fat - eaten.fat, 1),
  };
}

/** Protein / calorie goal "hit" rules used by the checklist and habits. */
export function proteinHit(eaten: number, goal: number) {
  return goal > 0 && eaten >= goal;
}

/** Calories count as hit within ±10% of goal — a surplus target, so both under and far over miss. */
export function caloriesHit(eaten: number, goal: number) {
  return goal > 0 && eaten >= goal * 0.9 && eaten <= goal * 1.1;
}

/** Suggest the meal slot for a time of day. */
export function mealForTime(d: Date = new Date()): Meal {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 20.5) return "dinner";
  return "snacks";
}

export const UNITS = ["serving", "g", "oz", "ml", "cup", "tbsp", "tsp", "piece", "slice", "scoop", "bowl", "plate"] as const;

/** Grams per unit where the conversion is fixed. */
export const GRAMS_PER_UNIT: Partial<Record<string, number>> = { g: 1, oz: 28.3495, ml: 1 };
