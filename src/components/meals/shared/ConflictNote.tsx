"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMealPrefs } from "@/lib/data/meals";
import { recipeConflicts, type Conflict } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { conflictLines, conflictTitle } from "../week/model";

/**
 * The user's hard constraints (allergies, diets, dislikes, equipment) that this recipe breaks,
 * as they are now. The planner never picks such a recipe, but one can still be opened from a
 * link, an older plan or a day planned before a preference changed.
 */
export function useRecipeConflicts(recipe: Pick<Recipe, "ingredients" | "equipment"> | null | undefined): Conflict[] {
  const { prefs, hasData } = useMealPrefs();
  return useMemo(() => (recipe && hasData ? recipeConflicts(recipe, prefs) : []), [recipe, hasData, prefs]);
}

/** A warning strip listing what the recipe breaks; nothing when it fits. */
export function ConflictNote({ conflicts, className, children }: { conflicts: readonly Conflict[]; className?: string; children?: ReactNode }) {
  const lines = conflictLines(conflicts);
  const title = conflictTitle(conflicts);
  if (!lines.length || !title) return null;
  return (
    <div role="note" aria-label={title} className={cn("rounded-card bg-m2 px-4 py-3 shadow-[inset_0_0_0_1px_var(--vein-3)]", className)}>
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-ivory" strokeWidth={1.6} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="t-title-3 text-ivory">{title}</p>
          <ul className="t-meta mt-0.5 space-y-0.5 text-stone">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {children}
        </div>
      </div>
    </div>
  );
}
