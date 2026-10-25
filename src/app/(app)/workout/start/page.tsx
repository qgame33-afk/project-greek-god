import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkoutSkeleton } from "@/components/workout/WorkoutScreen";
import { StartWorkout } from "./StartWorkout";

export const metadata: Metadata = { title: "Workout" };

/** /workout/start — starts (or resumes) today's workout; ?t=<key> starts that workout of the active program. */
export default function StartWorkoutPage() {
  return (
    <Suspense fallback={<WorkoutSkeleton label="Starting…" />}>
      <StartWorkout />
    </Suspense>
  );
}
