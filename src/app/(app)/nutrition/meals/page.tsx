import type { Metadata } from "next";
import { Suspense } from "react";
import { WeekPlanner } from "@/components/meals/week/WeekPlanner";

export const metadata: Metadata = { title: "Meals" };

/** Client-rendered (reads ?week / ?day / ?generate=1); data comes from TanStack Query under RLS. */
export default function MealsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
      <WeekPlanner />
    </Suspense>
  );
}
