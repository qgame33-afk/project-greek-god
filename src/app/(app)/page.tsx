import type { Metadata } from "next";
import { Suspense } from "react";
import { TodaySkeleton } from "@/components/today/TodaySkeleton";
import { TodayView } from "@/components/today/TodayView";

export const metadata: Metadata = { title: "Today" };

// Today reads the current date and the browser's query cache, so it renders on the client
// behind Suspense (Cache Components prerenders only the skeleton).
export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayView />
    </Suspense>
  );
}
