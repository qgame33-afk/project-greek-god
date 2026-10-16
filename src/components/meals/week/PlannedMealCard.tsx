"use client";

import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { Ellipsis, Lock, LockOpen, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { LoggedBadge } from "@/components/ui/badge";
import { Collapse } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { PlanMeal } from "@/lib/data/meals";
import { EASE } from "@/lib/motion";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { RecipeCardBody, recipeHref } from "../shared/RecipeCard";
import { SLOT_LABEL, servingsLabel, slotTitle } from "../shared/format";

const iconBtn = "press grid size-11 shrink-0 place-items-center rounded-[12px] transition-colors";

/**
 * One planned meal: tap the body for the recipe; Regenerate swaps it in place with a short
 * loading shimmer and a cross-fade; lock keeps it through "regenerate week"; ⋯ opens the rest.
 * The feedback strip (`strip`) unfolds underneath after a regenerate.
 */
export function PlannedMealCard({
  meal,
  recipe,
  snacksThatDay,
  logged,
  busy,
  conflict,
  strip,
  appear,
  onRegenerate,
  onToggleLock,
  onMenu,
  onOpen,
}: {
  meal: PlanMeal;
  recipe: Recipe | undefined;
  snacksThatDay: number;
  logged: boolean;
  busy: boolean;
  conflict?: string | null;
  strip?: ReactNode;
  /** Stagger index for the entrance right after a week is generated (null = no entrance). */
  appear?: number | null;
  onRegenerate: () => void;
  onToggleLock: () => void;
  onMenu: () => void;
  onOpen: () => void;
}) {
  const lockHint = useId();
  const title = slotTitle(meal.slot, meal.position, snacksThatDay);
  const eyebrow = meal.servings !== 1 ? `${title} · ${servingsLabel(meal.servings)}` : title;
  const macros = recipe ? recipeMacros(recipe, meal.servings) : undefined;
  return (
    <article
      className={cn("card-instrument relative overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", appear != null && "rise")}
      style={appear != null ? { animationDelay: `${Math.min(appear, 6) * 45}ms` } : undefined}
      aria-busy={busy || undefined}
      data-meal={meal.id}
      data-slot={meal.slot}
    >
      {/* old and new recipe share one grid cell, so a regenerate is a true cross-fade */}
      <div className="relative grid lg:col-start-1 lg:row-start-1">
        <AnimatePresence initial={false}>
          <m.div
            key={meal.recipe_key}
            className="min-w-0 [grid-area:1/1]"
            initial={{ opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: busy ? 0.45 : 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.16, ease: EASE.in } }}
            transition={{ duration: 0.26, ease: EASE.out }}
          >
            {recipe ? (
              <Link href={recipeHref(meal.recipe_key, meal.id)} onClick={onOpen} className="press-soft block p-4 pb-3 hover:bg-white/[.015] lg:pb-4" aria-label={`${SLOT_LABEL[meal.slot]}: ${recipe.name}. Open recipe`}>
                <RecipeCardBody recipe={recipe} eyebrow={eyebrow} macros={macros} badges={logged ? <LoggedBadge /> : null} />
              </Link>
            ) : (
              <div className="p-4 pb-3 lg:pb-4">
                <RecipeCardBody recipe={undefined} eyebrow={eyebrow} />
              </div>
            )}
          </m.div>
        </AnimatePresence>
        {busy && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.1s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/.05),transparent)]" />
          </span>
        )}
      </div>

      {conflict && (
        <p className="mx-4 mb-2 flex items-start gap-2 rounded-[10px] bg-warning-tint px-3 py-2 text-[12.5px] font-semibold leading-snug text-warning lg:col-span-2 lg:row-start-2 lg:mb-3">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {conflict}
        </p>
      )}

      <div className="flex items-center gap-1 px-3 pb-3 lg:col-start-2 lg:row-start-1 lg:pr-4 lg:pb-0 lg:pl-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy || meal.locked}
          aria-describedby={meal.locked ? lockHint : undefined}
          className="press inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-s3 pr-3.5 pl-3 text-[14px] font-bold text-fg hover:bg-s4 disabled:border-line disabled:bg-transparent disabled:text-fg-3"
        >
          <RefreshCw className={cn("size-4", busy ? "animate-spin text-fg-2" : meal.locked ? "text-fg-3" : "text-gold-300")} aria-hidden />
          {busy ? "Finding another…" : "Regenerate meal"}
        </button>
        {meal.locked && (
          <span aria-hidden className="ml-1 hidden text-[12px] font-medium text-fg-3 min-[400px]:inline lg:hidden">
            Locked
          </span>
        )}
        <span className="flex-1 lg:hidden" />
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={meal.locked}
          aria-label={meal.locked ? `Unlock ${recipe?.name ?? "this meal"}` : `Lock ${recipe?.name ?? "this meal"} so regenerating the week keeps it`}
          className={cn(iconBtn, meal.locked ? "bg-gold-tint text-gold-300" : "text-fg-3 hover:bg-white/[.04] hover:text-fg")}
        >
          {meal.locked ? <Lock className="size-[18px]" /> : <LockOpen className="size-[18px]" />}
        </button>
        <button type="button" onClick={onMenu} aria-label={`More for ${recipe?.name ?? "this meal"}`} aria-haspopup="dialog" className={cn(iconBtn, "text-fg-2 hover:bg-white/[.04] hover:text-fg")}>
          <Ellipsis className="size-5" />
        </button>
      </div>
      {meal.locked && (
        <span id={lockHint} className="sr-only">
          Locked. Unlock it to regenerate.
        </span>
      )}

      <div className="lg:col-span-2 lg:row-start-3">
        <Collapse open={!!strip}>{strip}</Collapse>
      </div>
    </article>
  );
}

/** A main meal with nothing planned (removed, or a fresh day): one tap fills it. */
export function EmptySlotCard({ slot, busy, onFill }: { slot: Slot; busy: boolean; onFill: () => void }) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-[16px] border border-dashed border-line-strong px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{SLOT_LABEL[slot]}</p>
        <p className="mt-1 text-[14px] font-semibold text-fg-3">Nothing planned</p>
      </div>
      <button type="button" onClick={onFill} disabled={busy} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border border-line-strong bg-s3 px-3.5 text-[14px] font-bold text-fg hover:bg-s4 disabled:opacity-50">
        <Plus className="size-4 text-gold-300" aria-hidden />
        Plan {SLOT_LABEL[slot].toLowerCase()}
      </button>
    </div>
  );
}
