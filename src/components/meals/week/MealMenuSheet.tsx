"use client";

import Link from "next/link";
import { ArrowRightLeft, ChefHat, ChevronLeft, ChevronRight, CopyPlus, Heart, Lock, LockOpen, ThumbsDown, ThumbsUp, Trash, type LucideIcon } from "lucide-react";
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

  const title = view === "main" ? name : view === "move" ? "Move to…" : "Repeat on…";
  const description = view === "main" ? `${SLOT_LABEL[meal.slot]} · ${dayName(meal.local_date)}, ${shortDate(meal.local_date, today)}` : name;

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
          {view === "move" ? <ArrowRightLeft className="size-[18px] text-gold-300" /> : <CopyPlus className="size-[18px] text-gold-300" />}
          {day ? `${view === "move" ? "Move" : "Repeat"} to ${dayName(day, true)}` : view === "move" ? "Move" : "Repeat"}
        </Button>
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
      {view === "main" ? (
        <div className="swap-in pb-2">
          <div className="card-inset mb-4 p-3.5">
            <RecipeCardBody recipe={recipe} eyebrow={SLOT_LABEL[meal.slot]} servings={meal.servings} macroMode="protein" />
          </div>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your opinion">
            <ToggleTile icon={ThumbsUp} label="Like" on={thumb === "up"} onClick={() => onThumb("up")} />
            <ToggleTile icon={ThumbsDown} label="Not for me" on={thumb === "down"} quiet onClick={() => onThumb("down")} />
            <ToggleTile icon={Heart} label="Favourite" on={favourite} onClick={onFavourite} fill />
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] bg-s3">
            {recipe && <Row icon={ChefHat} label="Open recipe" href={recipeHref(meal.recipe_key, meal.id)} onClick={onOpenRecipe} chevron />}
            <Row icon={meal.locked ? LockOpen : Lock} label={meal.locked ? "Unlock" : "Lock this meal"} detail={meal.locked ? "Regenerating the week will change it" : "Keeps it when you regenerate the week"} onClick={onToggleLock} />
            <Row icon={ArrowRightLeft} label="Move to another day" onClick={() => setView("move")} chevron />
            <Row icon={CopyPlus} label="Repeat on another day" onClick={() => setView("repeat")} chevron />
            <Row icon={Trash} label="Remove from plan" danger onClick={onRemove} />
          </div>
        </div>
      ) : (
        <div className="swap-in pb-2">
          <p className="eyebrow mb-2.5">Day</p>
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
                    "press flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[12px] border transition-colors disabled:opacity-35",
                    on ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
                  )}
                >
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]">{dayName(d, true)}</span>
                  <span className="num text-[19px] font-semibold leading-none">{parseISODate(d).getDate()}</span>
                </button>
              );
            })}
          </div>
          {slotChoices.length > 1 && (
            <>
              <p className="eyebrow mt-5 mb-2.5">Meal</p>
              <Segmented<Slot> value={chosenSlot} onChange={setSlot} options={slotChoices.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} ariaLabel="Meal" />
            </>
          )}
          <p className={cn("mt-4 min-h-5 text-[13px] font-medium", plan && !plan.ok ? "text-warning" : "text-fg-2")} aria-live="polite">
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
        "press flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-[14px] border text-[12.5px] font-bold transition-colors",
        on ? (quiet ? "border-line-strong bg-s5 text-fg" : "border-line-gold bg-gold-tint text-gold-300") : "border-line bg-s3 text-fg-2 hover:text-fg",
      )}
    >
      <Icon className={cn("size-5 transition-transform duration-(--dur-slow) ease-bounce", on && "scale-110")} fill={on && fill ? "currentColor" : "none"} aria-hidden />
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
      <Icon className={cn("size-[18px] shrink-0", danger ? "text-danger" : "text-gold-300")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-semibold", danger ? "text-danger" : "text-fg")}>{label}</span>
        {detail && <span className="block text-[12px] font-medium text-fg-3">{detail}</span>}
      </span>
      {chevron && <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />}
    </>
  );
  const cls = "press-soft flex min-h-[52px] w-full items-center gap-3 border-b border-line-hair px-4 py-2.5 text-left last:border-b-0 active:bg-white/[.04]";
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
