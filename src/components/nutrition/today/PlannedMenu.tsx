"use client";

import Link from "next/link";
import { BookOpen, ChefHat, ChevronRight, PencilLine, RefreshCw, Trash, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { recipeHref } from "@/components/meals/shared/RecipeCard";
import { useSwapMeal } from "@/components/meals/week/useSwapMeal";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useDeletePlannedMeal } from "@/lib/data/meals";
import { formatClock } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import type { FuelPlanned } from "./useFuelDay";

/**
 * ⋯ on a planned meal (docs/DESIGN-V2.md §3.5.1): Eaten but changed (servings), Swap for another
 * pick (today only; the week view holds the full regenerate with reasons), the recipe, cooking
 * mode and Remove from plan. Every row is 56 px.
 */
export function PlannedMenu({
  meal,
  at,
  open,
  onOpenChange,
  canSwap,
  onChanged,
}: {
  meal: FuelPlanned | null;
  at: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canSwap: boolean;
  onChanged: () => void;
}) {
  return (
    <Sheet
      open={open && !!meal}
      onOpenChange={onOpenChange}
      title={meal?.name ?? "Planned meal"}
      description={meal ? `${at != null ? `${formatClock(at)} · ` : ""}${formatInt(meal.kcal)} kcal · ${Math.round(meal.protein)} g protein · planned` : undefined}
    >
      {meal && <MenuBody meal={meal} canSwap={canSwap} onChanged={onChanged} close={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function MenuBody({ meal, canSwap, onChanged, close }: { meal: FuelPlanned; canSwap: boolean; onChanged: () => void; close: () => void }) {
  const del = useDeletePlannedMeal();
  return (
    <nav aria-label={`${meal.name} options`} className="-mx-1 divide-y divide-vein pb-2 pt-1">
      <Item
        icon={PencilLine}
        label="Eaten, but changed"
        detail="Log it with different servings or numbers"
        disabled={!meal.recipe}
        onClick={() => {
          close();
          onChanged();
        }}
      />
      {canSwap && <SwapItem meal={meal} close={close} />}
      {meal.recipe && <Item icon={BookOpen} label="Open the recipe" href={recipeHref(meal.recipeKey, meal.id)} onClick={close} />}
      {meal.recipe && <Item icon={ChefHat} label="Cook it" detail="Step by step, screen awake" href={`/nutrition/meals/cook/${encodeURIComponent(meal.recipeKey)}?meal=${encodeURIComponent(meal.id)}`} onClick={close} />}
      <Item
        icon={Trash}
        label="Remove from plan"
        detail="Undo for a few seconds after"
        tone="danger"
        onClick={() => {
          close();
          del.mutate({ meal: meal.row, label: `${meal.name} removed from the plan` });
        }}
      />
    </nav>
  );
}

/** Mounted only while the menu is open: it loads the planner's inputs (prefs, history, feedback). */
function SwapItem({ meal, close }: { meal: FuelPlanned; close: () => void }) {
  const { swap, ready } = useSwapMeal();
  return (
    <Item
      icon={RefreshCw}
      label="Swap for another"
      detail={meal.locked ? "Locked on the week view" : ready ? "Same slot, sized to your day" : "Loading the planner…"}
      disabled={!ready || meal.locked}
      onClick={() => {
        if (swap(meal.row)) close();
      }}
    />
  );
}

function Item({
  icon: Icon,
  label,
  detail,
  href,
  onClick,
  disabled,
  tone,
}: {
  icon: LucideIcon;
  label: ReactNode;
  detail?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  const inner = (
    <>
      <Icon className={cn("size-5 shrink-0", tone === "danger" ? "text-cinnabar" : "text-stone")} strokeWidth={1.6} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("t-title-3 block", tone === "danger" ? "text-cinnabar" : "text-ivory")}>{label}</span>
        {detail && <span className="t-meta block text-stone">{detail}</span>}
      </span>
      {href && <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />}
    </>
  );
  const cls = "press-soft flex min-h-14 w-full items-center gap-3.5 px-1 py-2 text-left disabled:opacity-45";
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
