import { Clock, Moon, WandSparkles } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { ingredientCount, makeAheadOf } from "@/lib/meals/recipe";
import type { MakeAhead, Recipe, RecipeOrigin } from "@/lib/meals/types";
import { DifficultyPips } from "./DifficultyPips";
import { costLabel, originLabel } from "./format";

/**
 * "10 min · ▂▄▆ Super Easy · 5 ingredients · $" — the facts a beginner checks before cooking.
 * `parts` picks which facts to show (cards drop cost; the recipe header shows all).
 */
export function RecipeMeta({
  recipe,
  parts = ["time", "difficulty", "ingredients"],
  className,
}: {
  recipe: Pick<Recipe, "minutes" | "difficulty" | "ingredients" | "cost">;
  parts?: ("time" | "difficulty" | "ingredients" | "cost")[];
  className?: string;
}) {
  const n = ingredientCount(recipe);
  const items = parts.map((p) => {
    switch (p) {
      case "time":
        return (
          <span key={p} className="inline-flex items-center gap-1 whitespace-nowrap">
            <Clock className="size-3.5 text-ash" strokeWidth={1.6} aria-hidden />
            <span>
              <span className="tnum font-semibold text-ivory">{recipe.minutes}</span> min
            </span>
          </span>
        );
      case "difficulty":
        return <DifficultyPips key={p} difficulty={recipe.difficulty} />;
      case "ingredients":
        return (
          <span key={p} className="whitespace-nowrap">
            {n} {n === 1 ? "ingredient" : "ingredients"}
          </span>
        );
      case "cost":
        return (
          <span key={p} className="whitespace-nowrap" aria-label={`Cost ${recipe.cost} of 3`}>
            <span className="text-ivory">{costLabel(recipe.cost)}</span>
            <span className="opacity-40" aria-hidden>
              {"$".repeat(3 - recipe.cost)}
            </span>
          </span>
        );
    }
  });
  // Every item carries its own leading "·"; the row is shifted left by one separator and
  // clipped, so whichever item starts a line (the first, or one that wrapped) shows no dot.
  return (
    <p className={cn("t-meta min-w-0 overflow-hidden text-stone", className)}>
      <span className="-ml-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((el, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            <span className="w-1 text-center text-ash" aria-hidden>
              ·
            </span>
            {el}
          </span>
        ))}
      </span>
    </p>
  );
}

const BADGE = "t-tag inline-flex h-5 shrink-0 items-center gap-1 rounded-tag px-1.5";

/**
 * Where a recipe came from. AI recipes always carry the AI tag (aegean is for AI only);
 * simplified and custom ones are quiet chips; library recipes show nothing.
 */
export function OriginBadge({ origin, className }: { origin: RecipeOrigin; className?: string }) {
  const label = originLabel(origin);
  if (!label) return null;
  if (origin === "ai") return <Tag kind="AI" detail="recipe" className={className} />;
  return (
    <span className={cn(BADGE, "text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]", className)}>
      {origin === "simplified" && <WandSparkles className="size-3" aria-hidden />}
      {label}
    </span>
  );
}

/**
 * "Make the night before": a recipe with a step done hours ahead (overnight oats, eggs boiled
 * in a batch). The planner never puts one on today; the badge is the reminder to start it.
 */
export function MakeAheadBadge({ recipe, className }: { recipe: Pick<Recipe, "steps"> & { makeAhead?: MakeAhead }; className?: string }) {
  const ahead = makeAheadOf(recipe);
  if (!ahead) return null;
  return (
    <span className={cn(BADGE, "text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]", className)} title={`Needs about ${ahead.hours < 1 ? `${Math.round(ahead.hours * 60)} min` : `${ahead.hours} h`} ahead`}>
      <Moon className="size-3" aria-hidden />
      {ahead.label}
    </span>
  );
}
