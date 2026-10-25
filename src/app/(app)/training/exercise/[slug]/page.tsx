import type { Metadata } from "next";
import { Suspense } from "react";
import { ExerciseDetail } from "@/components/training/ExerciseDetail";
import { DetailSkeleton } from "@/components/training/Skeletons";
import { getExercise } from "@/lib/training/library";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: getExercise(decodeURIComponent(slug))?.name ?? "Lift" };
}

export default function ExercisePage({ params }: Params) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Params) {
  const { slug } = await params;
  return <ExerciseDetail slug={decodeURIComponent(slug)} />;
}
