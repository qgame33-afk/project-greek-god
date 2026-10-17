"use client";

import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { Lock, Plus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { SealTick } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Coin } from "@/components/ui/coin";
import { Collapse } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { PlanMeal } from "@/lib/data/meals";
import type { CoinStatus } from "@/lib/fuel/mosaic";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";
import { fractionText, makeAheadOf, recipeMacros } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { formatClock, type Min } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import { EatenButton, type EatenMeal } from "../shared/EatenButton";
import { SLOT_LABEL } from "../shared/format";
import { recipeHref } from "../shared/RecipeCard";
import { MealIcon } from "../shared/RecipeGlyph";

/**
 * One planned meal in the week's selected-day list (docs/DESIGN-V2.md §3.5.2): the coin, "4:00 PM ·
 * PRE-WORKOUT", the name (a link to the recipe), macros + time + CALC (recipe macros come from the
 * ingredient database), and on the right Eaten (today and past days) or Cook (days ahead); ⋯ holds
 * the rest (swap, lock, move, repeat, like, favourite, remove). A swap's Undo-and-why strip unfolds
 * underneath.
 */
export function MealRow({
  meal,
  recipe,
  title,
  at,
  role,
  status,
  isPast,
  isFuture,
  busy,
  conflict,
  strip,
  appear,
  onMenu,
  onEatenChanged,
  onOpen,
}: {
  meal: PlanMeal;
  recipe: Recipe | undefined;
  title: string;
  at: Min;
  role: string | null;
  status: CoinStatus;
  isPast: boolean;
  isFuture: boolean;
  busy: boolean;
  conflict?: string | null;
  strip?: ReactNode;
  appear?: number | null;
  onMenu: () => void;
  onEatenChanged: () => void;
  onOpen: () => void;
}) {
  const macros = recipe ? recipeMacros(recipe, meal.servings) : null;
  const eaten = status === "eaten" || status === "changed";
  const next = status === "next";
  const eyebrow = [formatClock(at), role ?? title, next ? "next" : null].filter(Boolean).join(" · ");
  const ahead = recipe ? makeAheadOf(recipe) : null;
  const eatenMeal: EatenMeal = { id: meal.id, slot: meal.slot, local_date: meal.local_date, servings: meal.servings, recipe, name: recipe?.name ?? "Planned meal", kcal: macros?.kcal ?? 0, protein: macros?.protein ?? 0, at };

  // a row low on the screen unfolds its strip under the capsule: bring it above the chrome
  const stripRef = useRef<HTMLDivElement>(null);
  const stripOpen = !!strip;
  useEffect(() => {
    if (!stripOpen) return;
    const reduce = prefersReducedMotion();
    const t = window.setTimeout(
      () => {
        const el = stripRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const clear = parseFloat(getComputedStyle(el).scrollMarginBottom) || 0;
        const by = Math.min(r.bottom - (window.innerHeight - clear), r.top - 120);
        if (by > 0) window.scrollBy({ top: by, behavior: reduce ? "auto" : "smooth" });
      },
      reduce ? 0 : DURATION.base + 40,
    );
    return () => window.clearTimeout(t);
  }, [stripOpen]);

  return (
    <li className={cn("relative", appear != null && "rise")} style={appear != null ? { animationDelay: `${Math.min(appear, 6) * 45}ms` } : undefined} data-meal={meal.id} data-slot={meal.slot} aria-busy={busy || undefined}>
      <div className="flex items-start gap-3 py-3">
        <span className="pt-0.5">
          <Coin state={status} glyph={<MealIcon recipe={recipe} name={recipe?.name} />} size={40} past={isPast && eaten} />
        </span>
        <div className="relative min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            <m.div
              key={meal.recipe_key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: busy ? 0.45 : 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.14, ease: EASE.in } }}
              transition={{ duration: 0.22, ease: EASE.out }}
            >
              <p className={cn("t-eyebrow", next && "text-leaf-300")}>{busy ? "Finding another…" : eyebrow}</p>
              {recipe ? (
                <Link href={recipeHref(meal.recipe_key, meal.id)} onClick={onOpen} className="press-soft hit-44 mt-0.5 block t-title-3 text-ivory [overflow-wrap:anywhere]">
                  {recipe.name}
                  {meal.servings !== 1 && <span className="t-callout ml-1.5 whitespace-nowrap text-stone">×{fractionText(meal.servings)}</span>}
                  {meal.locked && <Lock className="ml-1.5 inline size-3.5 align-[-1px] text-stone" strokeWidth={1.6} aria-label="locked" />}
                </Link>
              ) : (
                <p className="t-title-3 mt-0.5 text-stone">Recipe unavailable · swap it from ⋯</p>
              )}
              <div className="t-meta flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 pr-[7.5rem] text-stone @max-[19rem]:min-h-0 @max-[19rem]:pr-0 @max-[19rem]:pt-1">
                {macros && (
                  <span className="tnum">
                    {formatInt(macros.kcal)} kcal · {Math.round(macros.protein)} g{recipe ? ` · ${recipe.minutes} min` : ""}
                    {eaten ? ` · ${status === "changed" ? "portion changed" : "eaten"}` : status === "missed" ? " · not logged" : ""}
                  </span>
                )}
                {macros && <Tag kind="CALC" />}
              </div>
            </m.div>
          </AnimatePresence>
          <div className="absolute bottom-0 right-0 flex items-center gap-1 @max-[19rem]:static @max-[19rem]:mt-1 @max-[19rem]:justify-end">
            {eaten ? (
              <span className="t-callout inline-flex h-11 items-center gap-1.5 px-1 font-semibold text-leaf-300">
                <SealTick className="seal-in size-5" />
                Eaten
              </span>
            ) : isFuture ? (
              <Button asChild variant="outline" size="sm" className="min-w-[72px] rounded-full px-4">
                <Link href={recipe ? `/nutrition/meals/cook/${encodeURIComponent(meal.recipe_key)}?meal=${encodeURIComponent(meal.id)}` : "#"} aria-label={`Cook ${recipe?.name ?? "this meal"}`}>
                  Cook
                </Link>
              </Button>
            ) : (
              <EatenButton meal={eatenMeal} onChanged={onEatenChanged} />
            )}
            <button
              type="button"
              onClick={onMenu}
              aria-haspopup="dialog"
              aria-label={`More for ${recipe?.name ?? "this meal"}: swap, lock, move, repeat, remove`}
              className="press -mr-2 grid size-11 place-items-center rounded-full text-stone hover:text-ivory"
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </div>
          {busy && (
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-field">
              <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.1s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_244_220/.05),transparent)]" />
            </span>
          )}
        </div>
      </div>
      {(conflict || ahead) && (
        <div className="-mt-1 mb-2 ml-[3.25rem] flex flex-col gap-1">
          {conflict && <p className="t-meta text-ivory">Doesn&apos;t fit your preferences now: {conflict}</p>}
          {ahead && !eaten && <p className="t-meta text-stone">{ahead.label}</p>}
        </div>
      )}
      <div ref={stripRef} className="scroll-mb-[calc(var(--chrome-clear)+24px)] md:scroll-mb-6">
        <Collapse open={!!strip}>{strip}</Collapse>
      </div>
    </li>
  );
}

/** A main meal with nothing planned (removed, or a fresh day): one tap fills it. */
export function EmptySlotRow({ slot, busy, onFill }: { slot: Slot; busy: boolean; onFill: () => void }) {
  return (
    <li className="flex min-h-16 items-center gap-3 py-3">
      <span aria-hidden className="size-10 shrink-0 rounded-full border border-dashed border-vein-3" />
      <div className="min-w-0 flex-1">
        <p className="t-eyebrow">{SLOT_LABEL[slot]}</p>
        <p className="t-callout text-stone">Nothing planned</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={onFill} disabled={busy}>
        <Plus className="size-4" strokeWidth={1.6} />
        Plan {SLOT_LABEL[slot].toLowerCase()}
      </Button>
    </li>
  );
}
