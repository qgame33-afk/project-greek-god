"use client";

import { useRef, useState } from "react";
import { EatenCheck, eatenSpoken, useEatenChanged, type EatenMeal } from "@/components/meals/shared/EatenButton";
import { recipeHref } from "@/components/meals/shared/RecipeCard";
import { MealIcon } from "@/components/meals/shared/RecipeGlyph";
import { AiMark } from "@/components/ui/ai-chip";
import { CheckCircle } from "@/components/ui/check-circle";
import { ListItem } from "@/components/ui/list";
import { useDeleteFood, type FoodEntry } from "@/lib/data/nutrition";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import type { TimelineRow } from "@/lib/fuel/timeline";
import { fractionText } from "@/lib/meals/recipe";
import { formatAmount } from "@/lib/nutrition-ui/format";
import { formatClock } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import type { FuelPlanned } from "./useFoodDay";

type Row = TimelineRow<FoodEntry, FuelPlanned>;

/** Logged by an AI estimate (a photo scan, a sentence in Add, the coach): the row keeps the AI mark. */
export function isAiEntry(e: Pick<FoodEntry, "source" | "confidence">) {
  return e.source === "photo_ai" || e.source === "chat_ai" || (e.confidence === "estimate" && e.source !== "meal_plan" && e.source !== "manual");
}

/** "Grilled chicken breast, White rice + 2 more": a folded group is named by what is in it. */
export function groupNames(entries: readonly Pick<FoodEntry, "name">[]): string {
  const names = entries.map((e) => e.name.trim() || "Food");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
}

/** A folded group's kind (a photo scan, a coach meal, a saved meal). */
export function groupTitle(source: string) {
  if (source === "photo_ai") return "Photo meal";
  if (source === "chat_ai" || source === "assistant_handoff") return "Coach meal";
  if (source === "saved_meal") return "Saved meal";
  return "Meal";
}

const macroLine = (kcal: number, protein: number) => `${formatInt(kcal)} kcal · ${Math.round(protein)} g protein`;

function Caption({ at, ai }: { at: number; ai?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{formatClock(at)}</span>
      {ai && <AiMark />}
    </span>
  );
}

function toEaten(p: FuelPlanned, at: number): EatenMeal {
  return { id: p.id, slot: p.slot, local_date: p.local_date, servings: p.servings, recipe: p.recipe, name: p.name, kcal: p.kcal, protein: p.protein, at };
}

const EMPTY_MEAL: EatenMeal = { id: "", slot: "lunch", local_date: "", servings: 1, recipe: null, name: "", kcal: 0, protein: 0 };

/**
 * The selected day's plan and diary merged by time (docs/DESIGN-V3-SIMPLE.md §4.4.1–2):
 *   planned meal      ListItem + CheckCircle: done white, the next one gold (the screen's one gold
 *                     fill), later ones outlined; a future day has chevrons and no circles; a past
 *                     day says "Eaten" in --text-2. Tap the row → the recipe (its planned-meal ⋯).
 *   logged food       ListItem with its time and the AI mark, no circle. Tap → the edit sheet.
 *   a group           (a photo scan, a coach meal) one ListItem; tap → its items.
 */
export function DayList({
  rows,
  date,
  today,
  onEdit,
  onGroup,
}: {
  rows: Row[];
  date: ISODate;
  today: ISODate;
  onEdit: (e: FoodEntry) => void;
  onGroup: (entries: FoodEntry[]) => void;
}) {
  const isToday = date === today;
  const isFuture = date > today;
  const [notes, setNotes] = useState<Record<string, string | null>>({});
  const [changedMeal, setChangedMeal] = useState<EatenMeal | null>(null);
  const changed = useEatenChanged(changedMeal ?? EMPTY_MEAL);
  const del = useDeleteFood();
  const removing = useRef(new Set<string>());

  const uneat = (e: FoodEntry, name: string) => {
    if (removing.current.has(e.id)) return;
    removing.current.add(e.id);
    del
      .mutateAsync({ ids: [e.id], date: e.local_date, rows: [e], label: `${name} taken out of your food log` })
      .catch(() => {})
      .finally(() => removing.current.delete(e.id));
  };

  const items = rows.filter((r) => r.kind !== "now" && r.kind !== "session");
  return (
    <div className="@container">
      <ul className="flex flex-col gap-3" aria-label={isToday ? "Today's food, in time order" : `Food on ${dayName(date)} ${parseISODate(date).getDate()}`}>
        {items.map((r) => {
          if (r.kind === "planned") {
            const p = r.planned;
            const meal = toEaten(p, r.at);
            const servings = p.servings !== 1 ? ` ×${fractionText(p.servings)}` : "";
            const note = notes[p.id];
            return (
              <li key={r.key}>
                <ListItem
                  tile={<MealIcon recipe={p.recipe} name={p.name} />}
                  caption={formatClock(r.at)}
                  title={`${p.name}${servings}`}
                  subtitle={macroLine(p.kcal, p.protein)}
                  href={recipeHref(p.recipeKey, p.id)}
                  ariaLabel={`${eatenSpoken(meal)}, ${formatClock(r.at)}. Opens the recipe`}
                  dataName
                  chevron={isFuture}
                  trailing={
                    isFuture ? undefined : (
                      <EatenCheck
                        meal={meal}
                        next={isToday && r.due}
                        onChanged={() => {
                          setChangedMeal(meal);
                          changed.setOpen(true);
                        }}
                        onNote={(n) => setNotes((m) => ({ ...m, [p.id]: n }))}
                      />
                    )
                  }
                />
                {note && (
                  <p role="status" className="t-cap mt-1.5 px-1 text-right">
                    {note}
                  </p>
                )}
              </li>
            );
          }
          if (r.kind === "eaten") {
            const e = r.entry;
            const p = r.planned;
            const kcal = Number(e.calories);
            const protein = Number(e.protein_g);
            if (p) {
              const name = e.name;
              return (
                <li key={r.key}>
                  <ListItem
                    tile={<MealIcon recipe={p.recipe} name={name} />}
                    caption={formatClock(r.at)}
                    title={name}
                    subtitle={`${macroLine(kcal, protein)}${r.changed ? " · portion changed" : ""}`}
                    href={recipeHref(p.recipeKey, p.id)}
                    ariaLabel={`${name.replace(/&/g, "and")}, ${formatClock(r.at)}, ${formatInt(kcal)} calories, ${Math.round(protein)} grams protein, eaten. Opens the recipe`}
                    dataName
                    trailing={isToday ? <CheckCircle state="done" label={`Eaten, undo ${name.replace(/&/g, "and")}`} onClick={() => uneat(e, name)} /> : <span className="t-label shrink-0">Eaten</span>}
                  />
                </li>
              );
            }
            const amount = e.unit === "serving" ? (Number(e.amount) === 1 ? "" : ` ×${fractionText(Number(e.amount))}`) : ` · ${formatAmount(Number(e.amount), e.unit)}`;
            const ai = isAiEntry(e);
            return (
              <li key={r.key}>
                <ListItem
                  tile={<MealIcon name={e.name} />}
                  caption={<Caption at={r.at} ai={ai} />}
                  title={e.name}
                  subtitle={`${macroLine(kcal, protein)}${amount}`}
                  onClick={() => onEdit(e)}
                  ariaLabel={`${e.name}, ${formatClock(r.at)}${ai ? ", AI estimate" : ""}, ${formatInt(kcal)} calories, ${Math.round(protein)} grams protein. Edit`}
                  dataName
                />
              </li>
            );
          }
          if (r.kind === "group") {
            const src = r.entries[0].source;
            const ai = r.entries.some(isAiEntry);
            const n = r.entries.length;
            return (
              <li key={r.key}>
                <ListItem
                  tile={<MealIcon name={r.entries[0].name} />}
                  caption={<Caption at={r.at} ai={ai} />}
                  title={groupNames(r.entries)}
                  subtitle={macroLine(r.totals.kcal, r.totals.protein)}
                  onClick={() => onGroup(r.entries)}
                  dataName
                  ariaLabel={`${groupTitle(src)}: ${groupNames(r.entries)}, ${n} items, ${formatClock(r.at)}${ai ? ", AI estimate" : ""}, ${formatInt(r.totals.kcal)} calories. Shows the items`}
                />
              </li>
            );
          }
          if (r.kind === "elsewhere") {
            const p = r.planned;
            const on = r.loggedOn === today ? "today" : `${dayName(r.loggedOn, true)} ${parseISODate(r.loggedOn).getDate()}`;
            return (
              <li key={r.key}>
                <ListItem
                  tile={<MealIcon recipe={p.recipe} name={p.name} />}
                  caption={formatClock(r.at)}
                  title={p.name}
                  subtitle={`Eaten ${on === "today" ? "today" : `on ${on}`} · counted there`}
                  href={recipeHref(p.recipeKey, p.id)}
                  dataName
                />
              </li>
            );
          }
          return null;
        })}
      </ul>
      {changed.sheet}
    </div>
  );
}
