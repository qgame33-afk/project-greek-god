import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionScreen } from "@/components/nutrition/NutritionScreen";

export const metadata: Metadata = { title: "Fuel" };

/** Client-rendered (reads ?date / ?add=1); data comes from TanStack Query under RLS. */
export default function NutritionPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <NutritionScreen />
    </Suspense>
  );
}
