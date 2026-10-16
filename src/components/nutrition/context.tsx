"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAddFood, type FoodEntry } from "@/lib/data/nutrition";
import type { ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { MEALS, type Meal } from "@/lib/nutrition";
import { dayLabel } from "@/lib/nutrition-ui/format";
import type { FoodInsert } from "@/lib/nutrition-ui/portion";
import { formatInt } from "@/lib/units";
import { useQuietRemoveFood } from "./hooks";

export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

export interface LogRequest {
  meal?: Meal;
  tab?: "search" | "saved" | "recent" | "manual";
}

interface FuelCtx {
  date: ISODate;
  today: ISODate;
  goals: Goals | null;
  entries: FoodEntry[];
  flashIds: ReadonlySet<string>;
  /** Insert rows optimistically; toasts "Added to Lunch · Undo". Resolves false on failure. */
  log: (rows: FoodInsert[], o: { meal: Meal; what?: string }) => Promise<boolean>;
  openLog: (r?: LogRequest) => void;
  openEdit: (e: FoodEntry) => void;
  setDate: (d: ISODate) => void;
}

const Ctx = createContext<FuelCtx | null>(null);

export function useFuel(): FuelCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFuel outside FuelProvider");
  return c;
}

export const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)?.label ?? "Snacks";

export function ToastMark() {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-gold-tint text-gold-300" aria-hidden>
      <Check className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}

export function FuelProvider({
  date,
  today,
  goals,
  entries,
  openLog,
  openEdit,
  setDate,
  children,
}: Omit<FuelCtx, "log" | "flashIds"> & { children: ReactNode }) {
  const add = useAddFood();
  const quiet = useQuietRemoveFood();
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(() => new Set());
  const busy = useRef(false);

  const log = useCallback(
    async (rows: FoodInsert[], o: { meal: Meal; what?: string }) => {
      if (!rows.length || busy.current) return false;
      busy.current = true;
      const ids = rows.map((r) => r.id);
      setFlashIds((prev) => new Set([...prev, ...ids]));
      window.setTimeout(
        () =>
          setFlashIds((prev) => {
            const n = new Set(prev);
            ids.forEach((i) => n.delete(i));
            return n;
          }),
        1800,
      );
      try {
        await add.mutateAsync(rows);
      } catch {
        return false; // the shared hook already rolled back and explained
      } finally {
        busy.current = false;
      }
      haptic(10);
      const d = rows[0].local_date;
      const kcal = rows.reduce((a, r) => a + Number(r.calories ?? 0), 0);
      const where = d === date ? "" : ` · ${dayLabel(d, today)}`;
      toast(`Added to ${mealLabel(o.meal)}${where}`, {
        // a 120-character food name stays a two-line toast, not a five-line one
        description: <span className="line-clamp-2 break-words">{o.what ?? (rows.length > 1 ? `${rows.length} items · ${formatInt(kcal)} kcal` : `${rows[0].name} · ${formatInt(kcal)} kcal`)}</span>,
        icon: <ToastMark />,
        duration: 6000,
        action: { label: "Undo", onClick: () => quiet.mutate({ ids, date: d }) },
      });
      return true;
    },
    [add, quiet, date, today],
  );

  const value = useMemo(
    () => ({ date, today, goals, entries, flashIds, log, openLog, openEdit, setDate }),
    [date, today, goals, entries, flashIds, log, openLog, openEdit, setDate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
