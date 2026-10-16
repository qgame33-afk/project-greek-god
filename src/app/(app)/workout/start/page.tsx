import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkoutSkeleton } from "@/components/workout/WorkoutScreen";
import { StartWorkout } from "./StartWorkout";

export const metadata: Metadata = { title: "Start workout" };

/** /workout/start — starts (or resumes) today's workout; ?t=push_a starts a specific template. */
export default function StartWorkoutPage() {
  return (
    <Suspense fallback={<WorkoutSkeleton label="Starting" />}>
      <StartWorkout />
    </Suspense>
  );
}
