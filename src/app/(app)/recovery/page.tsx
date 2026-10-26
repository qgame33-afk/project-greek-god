import type { Metadata } from "next";
import { Suspense } from "react";
import { RecoveryScreen, RecoverySkeleton } from "@/components/recovery/RecoveryScreen";

export const metadata: Metadata = {
  title: "Check-ins",
  description: "Your check-ins, sleep, habits, water and the weekly review.",
};

export default function RecoveryPage() {
  return (
    <Suspense fallback={<RecoverySkeleton />}>
      <RecoveryScreen />
    </Suspense>
  );
}
