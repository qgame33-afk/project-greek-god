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
    <div role="note" aria-label={title} className={cn("rounded-[14px] border border-warning/30 bg-warning-tint px-4 py-3", className)}>
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-fg">{title}</p>
          <ul className="mt-0.5 space-y-0.5 text-[13px] font-semibold leading-snug text-warning">
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
