import type { Metadata } from "next";
import { Suspense } from "react";
import { RecipeScreen, RecipeSkeleton } from "@/components/meals/recipe/RecipeScreen";

export const metadata: Metadata = { title: "Recipe" };

/** `lib:spaghetti-bolognese` arrives URL-encoded; a malformed escape is kept as typed. */
function decodeKey(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Client-rendered (reads ?meal / ?servings); data comes from TanStack Query under RLS. */
export default function RecipePage({ params }: { params: Promise<{ key: string }> }) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      <Recipe params={params} />
    </Suspense>
  );
}

async function Recipe({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <RecipeScreen recipeKey={decodeKey(key)} />;
}
