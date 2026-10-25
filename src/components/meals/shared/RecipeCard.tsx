import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { makeAheadOf, recipeMacros } from "@/lib/meals/recipe";
import type { Macros, Recipe } from "@/lib/meals/types";
import { MacroLine } from "./MacroChips";
import { RecipeGlyph } from "./RecipeGlyph";
import { MakeAheadBadge, OriginBadge, RecipeMeta } from "./RecipeMeta";

/**
 * The inside of a recipe card: glyph, eyebrow (slot / servings), name, facts and macros.
 * `macros` defaults to one serving computed from the ingredient database (an estimate).
 * Pass `recipe={undefined}` for a recipe that no longer exists: it renders an honest
 * "Recipe unavailable" instead of a fake.
 */
export function RecipeCardBody({
  recipe,
  eyebrow,
  servings = 1,
  macros,
  badges,
  trailing,
  macroMode = "full",
  className,
}: {
  recipe: Recipe | undefined;
  eyebrow?: ReactNode;
  servings?: number;
  macros?: Macros;
  /** Extra badges after the eyebrow (Logged, Locked…). The origin badge is added automatically. */
  badges?: ReactNode;
  trailing?: ReactNode;
  macroMode?: "full" | "protein";
  className?: string;
}) {
  const m = recipe ? (macros ?? recipeMacros(recipe, servings)) : null;
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <RecipeGlyph recipe={recipe} />
      <div className="min-w-0 flex-1">
        {(eyebrow || badges || (recipe && (recipe.origin !== "library" || makeAheadOf(recipe)))) && (
          <div className="mb-1 flex min-h-5 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {eyebrow && <span className="t-cap truncate">{eyebrow}</span>}
            {recipe && <OriginBadge origin={recipe.origin} />}
            {recipe && <MakeAheadBadge recipe={recipe} />}
            {badges}
          </div>
        )}
        <h3 className={cn("t-row text-fg [overflow-wrap:anywhere] line-clamp-2", !recipe && "text-fg-2")}>
          {recipe?.name ?? "Recipe unavailable"}
        </h3>
        {recipe ? (
          <>
            <RecipeMeta recipe={recipe} className="mt-1.5" />
            {m && <MacroLine macros={m} mode={macroMode} className="mt-2" />}
          </>
        ) : (
          <p className="t-cap mt-1 text-fg-2">It was removed or can&apos;t be read. Regenerate to replace it.</p>
        )}
      </div>
      {trailing}
    </div>
  );
}

/**
 * A tappable recipe card (a link to the recipe screen) with an optional footer for actions.
 * Actions in the footer sit outside the link, so tapping them never opens the recipe.
 */
export function RecipeCard({
  recipe,
  href,
  onOpen,
  eyebrow,
  servings,
  macros,
  badges,
  footer,
  className,
}: {
  recipe: Recipe | undefined;
  href?: string;
  onOpen?: () => void;
  eyebrow?: ReactNode;
  servings?: number;
  macros?: Macros;
  badges?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const body = (
    <RecipeCardBody
      recipe={recipe}
      eyebrow={eyebrow}
      servings={servings}
      macros={macros}
      badges={badges}
      trailing={href ? <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-2" strokeWidth={1.6} aria-hidden /> : undefined}
    />
  );
  return (
    <article className={cn("overflow-hidden rounded-card bg-surface shadow-(--e1)", className)}>
      {href && recipe ? (
        <Link href={href} onClick={onOpen} className="press-soft block p-4">
          {body}
        </Link>
      ) : (
        <div className="p-4">{body}</div>
      )}
      {footer}
    </article>
  );
}

/** Recipe screen link for a recipe, optionally tied to a planned meal (docs/MEALS.md §6). */
export function recipeHref(recipeKey: string, plannedMealId?: string | null): string {
  const base = `/nutrition/meals/recipe/${encodeURIComponent(recipeKey)}`;
  return plannedMealId ? `${base}?meal=${encodeURIComponent(plannedMealId)}` : base;
}
