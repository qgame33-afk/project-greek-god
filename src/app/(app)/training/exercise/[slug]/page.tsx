import type { Metadata } from "next";
import { Suspense } from "react";
import { ExerciseDetail } from "@/components/training/ExerciseDetail";
import { DetailSkeleton } from "@/components/training/Skeletons";

export const metadata: Metadata = { title: "Exercise" };

export default function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExerciseDetail slug={decodeURIComponent(slug)} />;
}
