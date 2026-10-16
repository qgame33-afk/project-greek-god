import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressScreen, ProgressFallback } from "@/components/progress/ProgressScreen";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<ProgressFallback />}>
      <ProgressScreen />
    </Suspense>
  );
}
