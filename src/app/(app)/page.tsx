import type { Metadata } from "next";
import { Suspense } from "react";
import { TodaySkeleton } from "@/components/today/TodaySkeleton";
import { TodayView } from "@/components/today/TodayView";

export const metadata: Metadata = { title: "Today" };

// Today reads the device's date and the browser's query cache, so it renders on the client
// (the shell mounts screens after hydration); the skeleton covers the first data load.
export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayView />
    </Suspense>
  );
}
