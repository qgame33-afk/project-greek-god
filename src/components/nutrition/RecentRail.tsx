"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { FoodEntry } from "@/lib/data/nutrition";
import { newId } from "@/lib/data/core";
import { mealForTime } from "@/lib/nutrition";
import { composeEatenAt, dayLabel, formatAmount, timeValue } from "@/lib/nutrition-ui/format";
import { buildEntry, fromEntry } from "@/lib/nutrition-ui/portion";
import { formatInt } from "@/lib/units";
import { Skeleton } from "@/components/ui/misc";
import { mealLabel, useFuel } from "./context";
import { useFuelRecent } from "./hooks";

/** One tap re-logs a recent food (same amount) to the meal for the current time. */
export function RecentRail() {
  const { date, today, log } = useFuel();
  const recent = useFuelRecent();
  const [pending, setPending] = useState<string | null>(null);
  const [meal, setMeal] = useState(() => mealForTime(new Date()));
  // keep "Tap to add to Lunch" honest when the app is left open across meals
  useEffect(() => {
    const sync = () => setMeal(mealForTime(new Date()));
    const id = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const relog = async (e: FoodEntry) => {
    if (pending) return;
    setPending(e.id);
    const now = new Date();
    const m = meal;
    const c = fromEntry(e);
    const row = buildEntry(c, { id: newId(), unitIndex: 0, amount: c.defaultAmount, meal: m, date, eatenAt: composeEatenAt(date, timeValue(now)) });
    await log([row], { meal: m, what: `${e.name} · ${formatAmount(Number(e.amount), e.unit)} · ${formatInt(Number(row.calories))} kcal` });
    setPending(null);
  };

  if (recent.isLoading) {
    return (
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {[120, 96, 140].map((w) => (
          <Skeleton key={w} className="h-11 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }
  const items = (recent.data ?? []).slice(0, 12);
  if (!items.length) return null;

  return (
    <section aria-labelledby="recent-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="recent-title" className="eyebrow">
          Recent
        </h2>
        <p className="truncate text-[12px] font-medium text-fg-3">
          Tap to add to {mealLabel(meal)}
          {date !== today && ` · ${dayLabel(date, today)}`}
        </p>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:[&>li:nth-child(n+7)]:hidden">
        {items.map((e) => (
          <li key={e.id} className="shrink-0">
            <button
              type="button"
              onClick={() => relog(e)}
              disabled={pending != null}
              aria-label={`Log ${e.name}, ${formatAmount(Number(e.amount), e.unit)}, ${formatInt(Number(e.calories))} kcal, to ${mealLabel(meal)}`}
              className="press flex h-11 max-w-[240px] items-center gap-2 rounded-full border border-line bg-s2 pl-2.5 pr-3.5 text-[13.5px] font-semibold text-fg transition-colors hover:border-line-strong disabled:opacity-60"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-tint text-gold-300">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="truncate">{e.name}</span>
              <span className="num shrink-0 text-[14px] font-medium text-fg-3">{formatInt(Number(e.calories))}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
