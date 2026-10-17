"use client";

import { BookmarkPlus, CalendarDays, Ellipsis, Trash, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import { useDeleteFood, type FoodEntry } from "@/lib/data/nutrition";
import { composeEatenAt, timeValue } from "@/lib/nutrition-ui/format";
import type { MealSection } from "@/lib/nutrition-ui/group";
import { cloneEntry } from "@/lib/nutrition-ui/portion";
import { formatInt } from "@/lib/units";
import { useFuel } from "../context";

/**
 * The day's ⋯ (Fuel → Today): what the old per-meal cards offered, per meal that has food —
 * save it as a reusable meal, copy it to today (a past day), or remove all of it (Undo). Kept in
 * one sheet so the timeline stays a timeline.
 */
export function DayMenu({ sections, onSaveMeal }: { sections: MealSection<FoodEntry>[]; onSaveMeal: (s: MealSection<FoodEntry>) => void }) {
  const [open, setOpen] = useState(false);
  const { date, today, log } = useFuel();
  const del = useDeleteFood();
  const withFood = sections.filter((s) => s.entries.length > 0);
  const removing = useRef(new Set<string>());

  const remove = (rows: FoodEntry[], what: string) => {
    const fresh = rows.filter((r) => !removing.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => removing.current.add(r.id));
    del
      .mutateAsync({ ids: fresh.map((r) => r.id), date, rows: fresh, label: what })
      .catch(() => {}) // the shared hook rolled back and explained
      .finally(() => fresh.forEach((r) => removing.current.delete(r.id)));
  };

  /** Same foods, same times of day, logged again today (groups stay grouped). */
  const copyToToday = (s: MealSection<FoodEntry>) => {
    const groups = new Map<string, string>();
    const rows = s.entries.map((e) => {
      let gid: string | null = null;
      if (e.meal_group_id) {
        gid = groups.get(e.meal_group_id) ?? newId();
        groups.set(e.meal_group_id, gid);
      }
      return cloneEntry(e, { id: newId(), date: today, eatenAt: composeEatenAt(today, timeValue(e.eaten_at)), groupId: gid });
    });
    void log(rows, { meal: s.meal, name: null, detail: `${rows.length} ${rows.length === 1 ? "item" : "items"} · ${formatInt(s.totals.calories)} kcal` });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!withFood.length}
        aria-label="This day's meals: save, copy or remove"
        className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory disabled:opacity-40"
      >
        <Ellipsis className="size-5" strokeWidth={1.6} />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="This day's meals" description="Save a meal to log it again in one tap, copy it, or clear it.">
        <div className="flex flex-col gap-5 pb-3 pt-1">
          {withFood.map((s) => {
            const n = s.entries.length;
            return (
              <section key={s.meal} aria-label={s.label}>
                <p className="t-eyebrow mb-1">
                  {s.label} · {n} {n === 1 ? "item" : "items"} · <span className="tnum">{formatInt(s.totals.calories)} kcal</span>
                </p>
                <div className="divide-y divide-vein border-y border-vein">
                  <Item
                    icon={BookmarkPlus}
                    onClick={() => {
                      setOpen(false);
                      onSaveMeal(s);
                    }}
                  >
                    Save as a meal
                  </Item>
                  {date < today && (
                    <Item
                      icon={CalendarDays}
                      onClick={() => {
                        setOpen(false);
                        copyToToday(s);
                      }}
                    >
                      Copy to today
                    </Item>
                  )}
                  <Item
                    icon={Trash}
                    danger
                    onClick={() => {
                      setOpen(false);
                      remove(s.entries, `Removed ${s.label} · ${n} ${n === 1 ? "item" : "items"}`);
                    }}
                  >
                    Remove all
                  </Item>
                </div>
              </section>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function Item({ icon: Icon, children, onClick, danger }: { icon: LucideIcon; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="press-soft flex min-h-14 w-full items-center gap-3.5 text-left">
      <Icon className={cn("size-5 shrink-0", danger ? "text-cinnabar" : "text-stone")} strokeWidth={1.6} aria-hidden />
      <span className={cn("t-title-3", danger ? "text-cinnabar" : "text-ivory")}>{children}</span>
    </button>
  );
}
