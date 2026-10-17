"use client";

import Link from "next/link";
import { ArrowRightLeft, BookOpen, ChefHat, ChevronLeft, ChevronRight, CopyPlus, Heart, Lock, LockOpen, PencilLine, RefreshCw, ThumbsDown, ThumbsUp, Trash, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { PlanMeal } from "@/lib/data/meals";
import { dayName, parseISODate, shortDate, type ISODate } from "@/lib/dates";
import { moveMeal, repeatMeal } from "@/lib/meals/engine";
import type { Recipe, Slot } from "@/lib/meals/types";
import { RecipeCardBody, recipeHref } from "../shared/RecipeCard";
import { SLOT_LABEL } from "../shared/format";
import type { Thumb } from "./model";

export interface MenuTarget {
  meal: PlanMeal;
  recipe: Recipe | undefined;
}

type View = "main" | "move" | "repeat";

/**
 * Everything else you can do with a planned meal, as an iOS-style action sheet (a centred
 * dialog on desktop): like / not for me / favourite, lock, move, repeat, remove. Move and
 * repeat pick a day (and a slot when the recipe fits more than one) right inside the sheet.
 */
export function MealMenuSheet({
  target,
  open,
  onOpenChange,
  days,
  today,
  weekMeals,
  lookup,
  thumb,
  favourite,
  onThumb,
  onFavourite,
  onToggleLock,
  onMove,
  onRepeat,
  onRemove,
  onOpenRecipe,
  onRegenerate,
  onEatenChanged,
}: {
  target: MenuTarget | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  days: ISODate[];
  today: ISODate;
  weekMeals: readonly PlanMeal[];
  lookup: (k: string) => Recipe | undefined;
  thumb: Thumb;
  favourite: boolean;
  onThumb: (t: "up" | "down") => void;
  onFavourite: () => void;
  onToggleLock: () => void;
  onMove: (to: { local_date: ISODate; slot: Slot }) => void;
  onRepeat: (to: { local_date: ISODate; slot: Slot }) => void;
  onRemove: () => void;
  onOpenRecipe: () => void;
  /** Swap it for another pick (the week view's regenerate). Absent or disabled when locked or logged. */
  onRegenerate?: (() => void) | null;
  /** "Eaten, but changed": the log sheet with servings editable. */
  onEatenChanged?: (() => void) | null;
}) {
  const [view, setView] = useState<View>("main");
  const [day, setDay] = useState<ISODate | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [lastTarget, setLastTarget] = useState<string | null>(null);
  // a new meal (or reopening) starts on the main view
  const targetId = target ? `${target.meal.id}:${open}` : null;
  if (targetId !== lastTarget) {
    setLastTarget(targetId);
    setView("main");
    setDay(null);
    setSlot(null);
  }

  if (!target) return <Sheet open={false} onOpenChange={onOpenChange} title="Meal">{null}</Sheet>;
  const { meal, recipe } = target;
  const name = recipe?.name ?? "This meal";

  const slotChoices: Slot[] = meal.slot === "snack" ? ["snack"] : (recipe?.slots ?? [meal.slot]).filter((s): s is Slot => s !== "snack");
  const chosenSlot = slot ?? meal.slot;
  const plan = view === "main" || !day ? null : view === "move" ? moveMeal(weekMeals, meal.id, { local_date: day, slot: chosenSlot }, lookup) : repeatMeal(weekMeals, meal.id, { local_date: day, slot: chosenSlot }, lookup);
  const occupant = day && chosenSlot !== "snack" ? weekMeals.find((x) => x.id !== meal.id && x.local_date === day && x.slot === chosenSlot && x.position === 0) : undefined;
  const occName = occupant ? (lookup(occupant.recipe_key)?.name ?? "the meal there") : null;
  const hint = !day
    ? "Pick a day."
    : plan && !plan.ok
      ? plan.message
      : view === "move"
        ? occName
          ? `Swaps places with ${occName}.`
          : `Moves to ${dayName(day)}.`
        : occName
          ? `Replaces ${occName} (Undo puts it back).`
          : `Adds a copy on ${dayName(day)}.`;

  const title = view === "main" ? `${SLOT_LABEL[meal.slot]} · ${dayName(meal.local_date)}` : view === "move" ? "Move to…" : "Repeat on…";
  const description = view === "main" ? shortDate(meal.local_date, today) : name;

  const footer =
    view === "main" ? undefined : (
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="md" onClick={() => setView("main")} className="px-4" aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="secondary"
          size="md"
          block
          disabled={!day || !plan || !plan.ok}
          onClick={() => {
            if (!day) return;
            (view === "move" ? onMove : onRepeat)({ local_date: day, slot: chosenSlot });
          }}
        >
          {view === "move" ? <ArrowRightLeft className="size-[18px] text-stone" strokeWidth={1.6} /> : <CopyPlus className="size-[18px] text-stone" strokeWidth={1.6} />}
          {day ? `${view === "move" ? "Move" : "Repeat"} to ${dayName(day, true)}` : view === "move" ? "Move" : "Repeat"}
        </Button>
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
      {view === "main" ? (
        <div className="swap-in pb-2">
          <div className="mb-4 rounded-card bg-m2 p-3.5 shadow-[inset_0_0_0_1px_var(--vein-2)]">
            <RecipeCardBody recipe={recipe} servings={meal.servings} macroMode="protein" />
          </div>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your opinion">
            <ToggleTile icon={ThumbsUp} label="Like" on={thumb === "up"} onClick={() => onThumb("up")} />
            <ToggleTile icon={ThumbsDown} label="Not for me" on={thumb === "down"} quiet onClick={() => onThumb("down")} />
            <ToggleTile icon={Heart} label="Favourite" on={favourite} onClick={onFavourite} fill />
          </div>

          <div className="mt-4 overflow-hidden rounded-card bg-m2 shadow-[inset_0_0_0_1px_var(--vein-2)]">
            {onEatenChanged && <Row icon={PencilLine} label="Eaten, but changed" detail="Log it with different servings or numbers" onClick={onEatenChanged} />}
            {onRegenerate && <Row icon={RefreshCw} label="Swap for another" detail="Same slot, sized to your day. Undo after" onClick={onRegenerate} />}
            {recipe && <Row icon={BookOpen} label="Open recipe" href={recipeHref(meal.recipe_key, meal.id)} onClick={onOpenRecipe} chevron />}
            {recipe && <Row icon={ChefHat} label="Cook it" detail="Step by step, screen awake" href={`/nutrition/meals/cook/${encodeURIComponent(meal.recipe_key)}?meal=${encodeURIComponent(meal.id)}`} onClick={onOpenRecipe} chevron />}
            <Row icon={meal.locked ? LockOpen : Lock} label={meal.locked ? "Unlock" : "Lock this meal"} detail={meal.locked ? "Regenerating the week will change it" : "Keeps it when you regenerate the week"} onClick={onToggleLock} />
            <Row icon={ArrowRightLeft} label="Move to another day" onClick={() => setView("move")} chevron />
            <Row icon={CopyPlus} label="Repeat on another day" onClick={() => setView("repeat")} chevron />
            <Row icon={Trash} label="Remove from plan" danger onClick={onRemove} />
          </div>
        </div>
      ) : (
        <div className="swap-in pb-2">
          <p className="t-eyebrow mb-2.5">Day</p>
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Day">
            {days.map((d) => {
              const on = d === day;
              const here = view === "move" && d === meal.local_date && chosenSlot === meal.slot;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={here}
                  aria-label={`${dayName(d)} ${parseISODate(d).getDate()}${here ? " (where it is now)" : ""}`}
                  onClick={() => setDay(d)}
                  className={cn(
                    "press flex h-[3.75rem] flex-col items-center justify-center gap-1 rounded-field transition-colors disabled:opacity-35",
                    on ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
                  )}
                >
                  <span className="t-tag">{dayName(d, true)}</span>
                  <span className="t-num-s leading-none">{parseISODate(d).getDate()}</span>
                </button>
              );
            })}
          </div>
          {slotChoices.length > 1 && (
            <>
              <p className="t-eyebrow mt-5 mb-2.5">Meal</p>
              <Segmented<Slot> value={chosenSlot} onChange={setSlot} options={slotChoices.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} ariaLabel="Meal" />
            </>
          )}
          <p className={cn("t-meta mt-4 min-h-5", plan && !plan.ok ? "text-ivory" : "text-stone")} aria-live="polite">
            {hint}
          </p>
        </div>
      )}
    </Sheet>
  );
}

function ToggleTile({ icon: Icon, label, on, quiet, fill, onClick }: { icon: LucideIcon; label: string; on: boolean; quiet?: boolean; fill?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "press t-meta flex h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-btn font-semibold transition-colors",
        // a like is an opinion, not something earned: selected is ivory, never gold
        on ? (quiet ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]" : "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]") : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
      )}
    >
      <Icon className={cn("size-5 transition-transform duration-(--dur-base) ease-spring", on && "scale-110")} strokeWidth={1.6} fill={on && fill ? "currentColor" : "none"} aria-hidden />
      {label}
    </button>
  );
}

function Row({
  icon: Icon,
  label,
  detail,
  onClick,
  href,
  danger,
  chevron,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  chevron?: boolean;
}) {
  const inner: ReactNode = (
    <>
      <Icon className={cn("size-5 shrink-0", danger ? "text-cinnabar" : "text-stone")} strokeWidth={1.6} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("t-title-3 block", danger ? "text-cinnabar" : "text-ivory")}>{label}</span>
        {detail && <span className="t-meta block text-stone">{detail}</span>}
      </span>
      {chevron && <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />}
    </>
  );
  const cls = "press-soft flex min-h-14 w-full items-center gap-3.5 border-b border-vein px-4 py-2.5 text-left last:border-b-0 active:bg-m3";
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
