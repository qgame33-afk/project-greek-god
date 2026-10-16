import type { Metadata } from "next";
import { Suspense } from "react";
import { GroceryScreen, GrocerySkeleton } from "@/components/meals/grocery/GroceryScreen";

export const metadata: Metadata = { title: "Grocery list" };

/** Client-rendered (reads ?week); data comes from TanStack Query under RLS. */
export default function GroceryPage() {
  return (
    <Suspense fallback={<GrocerySkeleton />}>
      <GroceryScreen />
    </Suspense>
  );
}
