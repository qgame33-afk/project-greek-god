import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionScreen } from "@/components/nutrition/NutritionScreen";

export const metadata: Metadata = { title: "Fuel · Market" };

/** The old grocery-list URL: Fuel → Market (?week= keeps working). Client-rendered under RLS. */
export default function GroceryPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <NutritionScreen tab="market" />
    </Suspense>
  );
}
