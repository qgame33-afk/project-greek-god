import type { Metadata } from "next";
import { CoachScreen } from "@/components/coach/CoachScreen";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return <CoachScreen />;
}
