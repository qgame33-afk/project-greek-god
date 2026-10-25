"use client";

import { ChevronLeft } from "lucide-react";
import { useId } from "react";
import { Switch } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import type { ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import { clampDay, isTime } from "@/lib/nutrition-ui/format";
import { MealChips, StarButton, SubLabel } from "./bits";

export interface When {
  meal: Meal;
  date: ISODate;
  time: string;
}

/** Meal chips + date + time — shared by every way of logging. */
export function WhenFields({ when, setWhen, today, className }: { when: When; setWhen: (w: When) => void; today: ISODate; className?: string }) {
  return (
    <div className={className}>
      <SubLabel>Meal</SubLabel>
      <MealChips value={when.meal} onChange={(meal) => setWhen({ ...when, meal })} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Date">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={when.date}
              max={today}
              onChange={(e) => setWhen({ ...when, date: clampDay(e.target.value, today) })}
              className="[color-scheme:dark]"
            />
          )}
        </Field>
        <Field label="Time">
          {(id) => (
            <Input
              id={id}
              type="time"
              value={when.time}
              onChange={(e) => setWhen({ ...when, time: isTime(e.target.value) ? e.target.value : when.time })}
              className="[color-scheme:dark]"
            />
          )}
        </Field>
      </div>
    </div>
  );
}

/** "Save to my foods" + favourite toggle. */
export function SaveToFoods({
  save,
  setSave,
  fav,
  setFav,
  className,
}: {
  save: boolean;
  setSave: (v: boolean) => void;
  fav: boolean;
  setFav: (v: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 rounded-field bg-control py-2 pl-4 pr-3 ${className ?? ""}`}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className="block t-label font-semibold text-fg">Save to my foods</span>
        <span className="block t-cap font-medium text-fg-2">{save ? "Star it to keep it at the top." : "Reuse it from Saved next time."}</span>
      </label>
      {save && <StarButton on={fav} onToggle={() => setFav(!fav)} label={fav ? "Remove from favourites" : "Mark as favourite"} />}
      <Switch id={id} checked={save} onCheckedChange={setSave} label="Save to my foods" />
    </div>
  );
}

export function BackButton({ onClick, children = "Back" }: { onClick: () => void; children?: string }) {
  return (
    <button type="button" onClick={onClick} className="press -ml-2 inline-flex h-11 items-center gap-0.5 rounded-field px-2 t-label font-bold text-fg-2 hover:text-fg">
      <ChevronLeft className="size-5" />
      {children}
    </button>
  );
}

/** Scroll the sheet body back to the top when switching steps. */
export function scrollSheetTop(el: Element | null) {
  const scroller = el?.closest(".overflow-y-auto");
  scroller?.scrollTo({ top: 0 });
}
