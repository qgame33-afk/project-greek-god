"use client";

import { Ban, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { ingredientInline } from "@/lib/meals/ingredients";
import type { Recipe } from "@/lib/meals/types";
import { ingredientChoices } from "./model";

/**
 * "Don't like an ingredient": pick which one from the meal that was swapped out, then confirm
 * before it becomes a hard dislike (never planned again until removed in Preferences).
 */
export function DislikeSheet({
  recipe,
  open,
  onOpenChange,
  alreadyDisliked,
  onConfirm,
}: {
  recipe: Recipe | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  alreadyDisliked: readonly string[];
  onConfirm: (ingredientKey: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [seenFor, setSeenFor] = useState<string | null>(null);
  const k = recipe && open ? recipe.key : null;
  if (k !== seenFor) {
    setSeenFor(k);
    setPicked(null);
  }
  const choices = ingredientChoices(recipe).filter((c) => !alreadyDisliked.includes(c.key));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Which ingredient?"
      description={recipe ? `From ${recipe.name}` : undefined}
      footer={
        <div>
          <p className="t-label mb-3 min-h-[38px]" aria-live="polite">
            {picked ? (
              <>
                Meals with <span className="font-semibold text-fg">{ingredientInline(picked)}</span> won&apos;t be planned again. You can change this in Meal preferences.
              </>
            ) : (
              "Pick one. It becomes a hard rule, like an allergy."
            )}
          </p>
          <Button variant="secondary" size="lg" block disabled={!picked} onClick={() => picked && onConfirm(picked)}>
            <Ban className="size-[1.125rem]" strokeWidth={1.9} />
            Never plan it
          </Button>
        </div>
      }
    >
      {choices.length ? (
        <div className="flex flex-wrap gap-2 pb-2" role="radiogroup" aria-label="Ingredient">
          {choices.map((c) => {
            const on = picked === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(on ? null : c.key)}
                className={cn(
                  "press t-label inline-flex min-h-11 items-center gap-1.5 rounded-pill px-4 font-semibold",
                  on ? "bg-fg text-bg" : "bg-sheet-card text-fg",
                )}
              >
                {on && <Check className="size-4" aria-hidden />}
                {c.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="t-body pb-2 text-fg-2">Every ingredient in this meal is already on your dislikes.</p>
      )}
    </Sheet>
  );
}
