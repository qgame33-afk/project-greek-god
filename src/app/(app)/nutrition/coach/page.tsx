import type { Metadata } from "next";
import { Suspense } from "react";
import { FoodCoach } from "@/components/food-ai/coach/FoodCoach";

export const metadata: Metadata = { title: "Food coach" };

export default function FoodCoachPage() {
  // FoodCoach reads ?c=<conversation> with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <FoodCoach />
    </Suspense>
  );
}
