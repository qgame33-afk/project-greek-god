import type { Metadata } from "next";
import { Suspense } from "react";
import { NowScreen } from "@/components/now/NowScreen";
import { NowSkeleton } from "@/components/now/NowSkeleton";

export const metadata: Metadata = { title: "Now" };

// Now reads the device's clock, date and the browser's query cache, so it renders on the client
// (the shell mounts screens after hydration); the skeleton covers the first data load.
export default function NowPage() {
  return (
    <Suspense fallback={<NowSkeleton />}>
      <NowScreen />
    </Suspense>
  );
}
