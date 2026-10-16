import type { Metadata } from "next";
import { PreferencesScreen } from "@/components/meals/prefs/PreferencesScreen";

export const metadata: Metadata = { title: "Meal preferences" };

/** Client-rendered; preferences come from TanStack Query under RLS and save as they change. */
export default function MealPreferencesPage() {
  return <PreferencesScreen />;
}
