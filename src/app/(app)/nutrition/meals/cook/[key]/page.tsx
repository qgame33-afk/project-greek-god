import type { Metadata } from "next";
import { Suspense } from "react";
import { CookMode, CookSkeleton } from "@/components/meals/cook/CookMode";

export const metadata: Metadata = { title: "Cooking" };

function decodeKey(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Focus route (no tab bar, see isFocusRoute): one step at a time, readable from across the kitchen. */
export default function CookPage({ params }: { params: Promise<{ key: string }> }) {
  return (
    <Suspense fallback={<CookSkeleton />}>
      <Cook params={params} />
    </Suspense>
  );
}

async function Cook({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <CookMode recipeKey={decodeKey(key)} />;
}
