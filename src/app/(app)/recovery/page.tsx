import type { Metadata } from "next";
import { Suspense } from "react";
import {
  RecoveryScreen,
  RecoverySkeleton,
} from "@/components/recovery/RecoveryScreen";

export const metadata: Metadata = {
  title: "Recovery & Habits",
  description:
    "Daily check-in, readiness guidance, water, habits and your weekly recovery review.",
};

export default function RecoveryPage() {
  return (
    <Suspense fallback={<RecoverySkeleton />}>
      <RecoveryScreen />
    </Suspense>
  );
}
