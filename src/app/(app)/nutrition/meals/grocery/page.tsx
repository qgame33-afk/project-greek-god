import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionScreen } from "@/components/nutrition/NutritionScreen";

export const metadata: Metadata = { title: "Grocery list" };

/** The grocery list (?week= picks the week). Client-rendered under RLS. */
export default function GroceryPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <NutritionScreen tab="market" />
    </Suspense>
  );
}
