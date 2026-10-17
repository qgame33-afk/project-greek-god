import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionScreen } from "@/components/nutrition/NutritionScreen";

export const metadata: Metadata = { title: "Fuel · Week" };

/**
 * The old meal-planner URL: Fuel → Week with the same params (?week=next, ?day=, ?generate=1).
 * Client-rendered; data comes from TanStack Query under RLS.
 */
export default function MealsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <NutritionScreen tab="week" />
    </Suspense>
  );
}
