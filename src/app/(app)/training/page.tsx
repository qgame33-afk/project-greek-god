import type { Metadata } from "next";
import { Suspense } from "react";
import { TrainingHub } from "@/components/training/TrainingHub";
import { TrainingSkeleton } from "@/components/training/Skeletons";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return (
    <Suspense fallback={<TrainingSkeleton />}>
      <TrainingHub />
    </Suspense>
  );
}
