import type { Metadata } from "next";
import { Suspense } from "react";
import { NowSkeleton } from "@/components/now/NowSkeleton";
import { TodayScreen } from "@/components/now/TodayScreen";

export const metadata: Metadata = { title: "Today" };

// Today reads the device's clock, date and the browser's query cache, so it renders on the client
// (the shell mounts screens after hydration); the skeleton covers the first data load.
export default function TodayPage() {
  return (
    <Suspense fallback={<NowSkeleton />}>
      <TodayScreen />
    </Suspense>
  );
}
