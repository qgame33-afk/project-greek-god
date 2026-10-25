import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionScreen } from "@/components/nutrition/NutritionScreen";

export const metadata: Metadata = { title: "Food" };

/**
 * The old meal-planner URL: Food with the same params (?week=next, ?day=, ?generate=1 opens the
 * plan-week confirm). Client-rendered; data comes from TanStack Query under RLS.
 */
export default function MealsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <NutritionScreen />
    </Suspense>
  );
}
