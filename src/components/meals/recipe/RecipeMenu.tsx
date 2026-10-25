"use client";

import { ArrowRightLeft, Bookmark, ChevronLeft, CopyPlus, Info, Lock, LockOpen, PencilLine, RefreshCw, ThumbsDown, ThumbsUp, Trash, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { PlanMeal } from "@/lib/data/meals";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import { moveMeal, repeatMeal } from "@/lib/meals/engine";
import { makeAheadOf } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { COST_WORDS, DIFFICULTY_HINT, DIFFICULTY_LABEL, SLOT_LABEL, originLabel } from "../shared/format";
import type { MealActions } from "../week/actions";

type View = "main" | "move" | "repeat" | "about";

/**
 * The recipe's ⋯ (docs/DESIGN-V3-SIMPLE.md §4.4.2–3). Opened from a planned meal it holds that
 * meal's actions — swap it for another (the planner's regenerate), log with changes, lock, move
 * or repeat on another day, remove from the plan — then the recipe's own: make it easier, save,
 * like, not this again, and about (difficulty, cost, why it was picked).
 */
export function RecipeMenu({
  open,
  onOpenChange,
  recipe,
  meal,
  actions,
  weekDays,
  logged,
  thumb,
  onThumb,
  saved,
  onSave,
  onSwap,
  onLogChanges,
  onEasier,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipe: Recipe;
  meal: PlanMeal | null;
  actions: MealActions | null;
  weekDays: ISODate[];
  logged: boolean;
  thumb: "up" | "down" | null;
  onThumb: (t: "up" | "down") => void;
  saved: boolean;
  onSave: () => void;
  onSwap: () => void;
  onLogChanges: () => void;
  onEasier: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [day, setDay] = useState<ISODate | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) {
      setView("main");
      setDay(null);
      setSlot(null);
    }
  }
  const close = () => onOpenChange(false);
  const meals = actions?.data.meals ?? [];
  const lookup = actions?.data.lookup ?? (() => undefined);

  const slotChoices: Slot[] = !meal ? [] : meal.slot === "snack" ? ["snack"] : (recipe.slots ?? [meal.slot]).filter((s): s is Slot => s !== "snack");
  const chosenSlot = slot ?? meal?.slot ?? "lunch";
  const result = !meal || !day || (view !== "move" && view !== "repeat") ? null : view === "move" ? moveMeal(meals, meal.id, { local_date: day, slot: chosenSlot }, lookup) : repeatMeal(meals, meal.id, { local_date: day, slot: chosenSlot }, lookup);
  const occupant = meal && day && chosenSlot !== "snack" ? meals.find((x) => x.id !== meal.id && x.local_date === day && x.slot === chosenSlot && x.position === 0) : undefined;
  const occName = occupant ? (lookup(occupant.recipe_key)?.name ?? "the meal there") : null;
  const hint = !day
    ? "Pick a day."
    : result && !result.ok
      ? result.message
      : view === "move"
        ? occName
          ? `Swaps places with ${occName}.`
          : `Moves to ${dayName(day)}.`
        : occName
          ? `Replaces ${occName}. Undo puts it back.`
          : `Adds a copy on ${dayName(day)}.`;

  const title = view === "move" ? "Move to another day" : view === "repeat" ? "Repeat on another day" : view === "about" ? "About this recipe" : meal ? `${SLOT_LABEL[meal.slot]} · ${dayName(meal.local_date)}` : recipe.name;
  const footer =
    view === "move" || view === "repeat" ? (
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="lg" onClick={() => setView("main")} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!day || !result || !result.ok}
          onClick={() => {
            if (!meal || !day || !actions) return;
            const ok = (view === "move" ? actions.moveTo : actions.repeatTo)(meal, { local_date: day, slot: chosenSlot });
            if (ok) close();
          }}
        >
          {day ? `${view === "move" ? "Move" : "Repeat"} to ${dayName(day, true)} ${parseISODate(day).getDate()}` : view === "move" ? "Move" : "Repeat"}
        </Button>
      </div>
    ) : undefined;

  const ahead = makeAheadOf(recipe);
  const origin = originLabel(recipe.origin);
  const why = meal?.reason ? [...meal.reason].sort((a, b) => b.weight - a.weight) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={view === "main" && meal ? recipe.name : undefined} footer={footer}>
      {view === "main" ? (
        <div className="flex flex-col gap-3 pb-2">
          {meal && actions && (
            <ListGroup ariaLabel="This planned meal">
              {actions.canSwap(meal) && <Row icon={RefreshCw} title="Swap this meal" subtitle="Another pick for the same time" chevron={false} onClick={() => (close(), onSwap())} />}
              {!logged && <Row icon={PencilLine} title="Log with changes" subtitle="Other servings, numbers or time" chevron={false} onClick={() => (close(), onLogChanges())} />}
              <Row icon={meal.locked ? LockOpen : Lock} title={meal.locked ? "Unlock" : "Lock this meal"} subtitle={meal.locked ? "Planning the week again can change it" : "Planning the week again keeps it"} chevron={false} onClick={() => (close(), actions.toggleLock(meal))} />
              <Row icon={ArrowRightLeft} title="Move to another day" onClick={() => setView("move")} />
              <Row icon={CopyPlus} title="Repeat on another day" onClick={() => setView("repeat")} />
              <Row icon={Trash} title="Remove from plan" danger chevron={false} onClick={() => (close(), actions.remove(meal))} />
            </ListGroup>
          )}
          <ListGroup ariaLabel="This recipe">
            {!meal && <Row icon={PencilLine} title="Log with changes" subtitle="Other servings, numbers or time" chevron={false} onClick={() => (close(), onLogChanges())} />}
            <Row icon={WandSparkles} title="Make it easier" subtitle="Shortcuts like microwave rice" chevron={false} onClick={() => (close(), onEasier())} />
            <Row icon={Bookmark} title={saved ? "Saved" : "Save"} subtitle={saved ? "Tap to remove it" : "Saved meals come back more often"} chevron={false} onClick={onSave} ariaLabel={saved ? "Saved. Remove from saved" : "Save"} />
            <Row icon={ThumbsUp} title={thumb === "up" ? "Liked" : "Like"} subtitle="More meals like this" chevron={false} onClick={() => onThumb("up")} ariaLabel={thumb === "up" ? "Liked. Take it back" : "Like"} />
            <Row icon={ThumbsDown} title={thumb === "down" ? "Not planned for 90 days" : "Not this again"} subtitle={thumb === "down" ? "Tap to take it back" : "The planner skips it for 90 days"} chevron={false} onClick={() => onThumb("down")} />
            <Row icon={Info} title="About this recipe" onClick={() => setView("about")} />
          </ListGroup>
        </div>
      ) : view === "about" ? (
        <div className="flex flex-col gap-3 pb-2">
          <ListGroup>
            <Row title="Difficulty" value={DIFFICULTY_LABEL[recipe.difficulty]} subtitle={DIFFICULTY_HINT[recipe.difficulty]} />
            <Row title="Cost" value={COST_WORDS[recipe.cost]} />
            <Row title="Time" value={`${recipe.minutes} min`} />
            {ahead && <Row title="Do ahead" value={ahead.label} />}
            {origin && <Row title="Where it comes from" value={origin} />}
          </ListGroup>
          {why.length > 0 && (
            <section aria-label="Why it was picked" className="mt-2">
              <h3 className="t-section">Why it was picked</h3>
              <ul className="t-body mt-2 flex flex-col gap-1.5 text-fg-2" data-program-text="">
                {why.map((r, i) => (
                  <li key={`${r.kind}-${i}`}>{r.text}</li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="secondary" size="md" onClick={() => setView("main")} className="mt-2 self-start">
            <ChevronLeft className="size-4" />
            Back
          </Button>
        </div>
      ) : (
        <div className="pb-2">
          <p className="t-label mb-2.5">Day</p>
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Day">
            {weekDays.map((d) => {
              const on = d === day;
              const here = view === "move" && meal && d === meal.local_date && chosenSlot === meal.slot;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!!here}
                  aria-label={`${dayName(d)} ${parseISODate(d).getDate()}${here ? ", where it is now" : ""}`}
                  onClick={() => setDay(d)}
                  className={cn("press flex h-[3.75rem] flex-col items-center justify-center gap-1 rounded-tile disabled:opacity-35", on ? "bg-fg text-bg" : "bg-sheet-card text-fg")}
                >
                  <span className="t-cap font-semibold text-current">{dayName(d, true)}</span>
                  <span className="t-row leading-none tabular-nums">{parseISODate(d).getDate()}</span>
                </button>
              );
            })}
          </div>
          {slotChoices.length > 1 && (
            <>
              <p className="t-label mb-2.5 mt-5">Meal</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
                {slotChoices.map((s) => (
                  <Chip key={s} selected={chosenSlot === s} onClick={() => setSlot(s)}>
                    {SLOT_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </>
          )}
          <p className="t-label mt-4 min-h-5" aria-live="polite">
            {hint}
          </p>
        </div>
      )}
    </Sheet>
  );
}
