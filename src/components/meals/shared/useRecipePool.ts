"use client";

import { useCallback, useMemo } from "react";
import { useUserRecipes } from "@/lib/data/meals";
import { buildPool } from "@/lib/meals/engine";
import { getLibraryRecipe } from "@/lib/meals/library";
import type { Recipe } from "@/lib/meals/types";

/**
 * Every recipe the planner may use (library + the user's own recipes that still validate) and
 * a lookup by key. The lookup also finds a stored user recipe that no longer validates, so a
 * planned meal still shows its name instead of disappearing.
 */
export function useRecipePool() {
  const user = useUserRecipes();
  const pool = useMemo(() => buildPool(user.recipes), [user.recipes]);
  const byKey = useMemo(() => new Map(pool.map((r) => [r.key, r])), [pool]);
  const userByKey = user.byKey;
  const lookup = useCallback((key: string): Recipe | undefined => byKey.get(key) ?? getLibraryRecipe(key) ?? userByKey.get(key), [byKey, userByKey]);
  return { pool, lookup, loading: user.loading, hasData: user.hasData, error: user.error };
}
