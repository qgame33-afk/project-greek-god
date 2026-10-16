"use client";

import { use } from "react";
import { WorkoutScreen } from "@/components/workout/WorkoutScreen";

export function WorkoutRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <WorkoutScreen id={id} />;
}
