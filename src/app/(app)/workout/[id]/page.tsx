import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkoutRoute } from "./WorkoutRoute";
import { WorkoutSkeleton } from "@/components/workout/WorkoutScreen";

export const metadata: Metadata = { title: "Workout" };

export default function WorkoutPage({ params }: PageProps<"/workout/[id]">) {
  return (
    <Suspense fallback={<WorkoutSkeleton />}>
      <WorkoutRoute params={params} />
    </Suspense>
  );
}
