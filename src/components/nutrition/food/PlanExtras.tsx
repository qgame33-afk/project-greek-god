"use client";

import { CookingPot, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { recipeHref } from "@/components/meals/shared/RecipeCard";
import { SLOT_LABEL } from "@/components/meals/shared/format";
import { useMealActions } from "@/components/meals/week/actions";
import { conflictsInWeek, missingMainSlots } from "@/components/meals/week/model";
import { Button } from "@/components/ui/button";
import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import type { PlanMeal } from "@/lib/data/meals";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import { makeAheadOf } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { formatClock } from "@/lib/prefs";

/**
 * A planned week's quiet extras on Food, each only when it applies: meals that break a preference
 * added after planning ("Replace them"), a day missing a main meal ("Plan a lunch"), and room for
 * another snack ("Add a snack"). Never gold: the next meal's check is the screen's one gold fill.
 */
export function DayExtras({ offset, date, today, snacksPerDay }: { offset: number; date: ISODate; today: ISODate; snacksPerDay: number }) {
  const a = useMealActions(offset);
  const { meals, lookup, prefs } = a.data;
  const conflicts = useMemo(
    () => conflictsInWeek(meals.filter((m) => !a.loggedSet.has(m.id) && m.local_date >= today), lookup, prefs),
    // loggedSet is rebuilt each render; the ids it holds are what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, lookup, prefs, today, a.data.loggedIds],
  );
  if (!a.ready || date < today) return null;
  const dayMeals = meals.filter((m) => m.local_date === date);
  const missing = dayMeals.length ? missingMainSlots(dayMeals) : [];
  const snacks = dayMeals.filter((m) => m.slot === "snack").length;
  const replaceable = conflicts.filter((c) => !c.meal.locked);
  const rows = [
    ...missing.map((slot) => ({ key: slot, title: `Plan a ${SLOT_LABEL[slot].toLowerCase()}`, onClick: () => a.fill(date, slot) })),
    ...(dayMeals.length && snacks < snacksPerDay ? [{ key: "snack", title: "Add a snack", onClick: () => a.fill(date, "snack") }] : []),
  ];
  if (!conflicts.length && !rows.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {conflicts.length > 0 && (
        <section className="rounded-card bg-surface p-5" role="status" aria-labelledby="conflict-title">
          <h3 id="conflict-title" className="t-row">
            {conflicts.length === 1 ? "1 planned meal doesn't fit your preferences now" : `${conflicts.length} planned meals don't fit your preferences now`}
          </h3>
          <ul className="t-label mt-1">
            {conflicts.slice(0, 2).map((c) => (
              <li key={c.meal.id}>
                <span data-food="">{c.recipe.name}</span>: {c.text}
              </li>
            ))}
          </ul>
          {replaceable.length < conflicts.length && <p className="t-label mt-1">Locked meals stay until you unlock them.</p>}
          {replaceable.length > 0 && (
            <Button variant="secondary" size="md" block className="mt-4" onClick={() => a.replaceConflicts(replaceable.map((c) => c.meal))}>
              {replaceable.length === 1 ? "Replace it" : `Replace ${replaceable.length} meals`}
            </Button>
          )}
        </section>
      )}
      {rows.length > 0 && (
        <ListGroup>
          {rows.map((r) => (
            <Row key={r.key} icon={Plus} title={r.title} onClick={r.onClick} chevron={false} />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

export interface AheadMeal {
  id: string;
  date: ISODate;
  at: number | null;
  recipeKey: string;
  name: string;
  label: string;
}

/** Meals from today on that need doing ahead (overnight oats, eggs boiled ahead): the planner's make-ahead flag. */
export function aheadMeals(meals: readonly PlanMeal[], lookup: (k: string) => Recipe | undefined, logged: Record<string, unknown[]>, today: ISODate, timeOf: (m: PlanMeal) => number | null): AheadMeal[] {
  const out: AheadMeal[] = [];
  for (const m of meals) {
    if (m.local_date < today || (logged[m.id] ?? []).length) continue;
    const r = lookup(m.recipe_key);
    const ahead = r ? makeAheadOf(r) : null;
    if (!r || !ahead) continue;
    out.push({ id: m.id, date: m.local_date, at: timeOf(m), recipeKey: m.recipe_key, name: r.name, label: ahead.label });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || (x.at ?? 0) - (y.at ?? 0));
}

/** The "Cook ahead" row and its sheet. */
export function CookAheadRow({ meals, today }: { meals: AheadMeal[]; today: ISODate }) {
  const [open, setOpen] = useState(false);
  const first = meals[0];
  if (!first) return null;
  return (
    <>
      <Row
        icon={CookingPot}
        title="Cook ahead"
        subtitle={`${meals.length} ${meals.length === 1 ? "meal" : "meals"} · next ${first.date === today ? "today" : dayName(first.date, true)}`}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title="Cook ahead" description="Meals this week that need something done before the day.">
        <div className="pb-2">
          <ListGroup>
            {meals.map((m) => (
              <Row
                key={m.id}
                title={m.name}
                subtitle={`${dayName(m.date, true)} ${parseISODate(m.date).getDate()}${m.at != null ? ` · ${formatClock(m.at)}` : ""} · ${m.label}`}
                href={recipeHref(m.recipeKey, m.id)}
                dataName
              />
            ))}
          </ListGroup>
        </div>
      </Sheet>
    </>
  );
}
