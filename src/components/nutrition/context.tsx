"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { friendlyError, isOffline, saveErrorKind, type SaveErrorKind } from "@/lib/data/core";
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

export type LogResult = { ok: true } | { ok: false; kind: SaveErrorKind; message: string };

export interface LogOptions {
  meal: Meal;
  /** Toast lines: the food's name (clamped) and "250 g · 412 kcal" (always shown). */
  name?: string | null;
  detail?: string;
  /** The caller explains a failure in place (a sheet's inline error), so no error toast. */
  quiet?: boolean;
}

interface FuelCtx {
  date: ISODate;
  today: ISODate;
  goals: Goals | null;
  entries: FoodEntry[];
  flashIds: ReadonlySet<string>;
  /** Insert rows optimistically; toasts "Added to Lunch · Undo". Resolves `ok: false` with the reason on failure. */
  log: (rows: FoodInsert[], o: LogOptions) => Promise<LogResult>;
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
    <span className="grid size-6 place-items-center rounded-full bg-control text-fg" aria-hidden>
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
  const addQuiet = useAddFood({ quiet: true });
  const quiet = useQuietRemoveFood();
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(() => new Set());

  // No global busy flag: each caller guards its own double-submit, so one slow add never
  // turns a different add into a false "Couldn't save".
  const log = useCallback(
    async (rows: FoodInsert[], o: LogOptions): Promise<LogResult> => {
      if (!rows.length) return { ok: false, kind: "other", message: "Nothing to add." };
      if (isOffline()) {
        const message = friendlyError("Failed to fetch");
        if (!o.quiet) toast.error("You're offline. Nothing was added.", { description: "Try again once you're back online." });
        return { ok: false, kind: "offline", message };
      }
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
        await (o.quiet ? addQuiet : add).mutateAsync(rows);
      } catch (e) {
        // the shared hook already rolled back (and, unless quiet, explained)
        return { ok: false, kind: saveErrorKind(e), message: (e as Error).message };
      }
      haptic(10);
      const d = rows[0].local_date;
      const kcal = rows.reduce((a, r) => a + Number(r.calories ?? 0), 0);
      const where = d === date ? "" : ` · ${dayLabel(d, today)}`;
      const name = o.name !== undefined ? o.name : rows.length > 1 ? null : rows[0].name;
      const detail = o.detail ?? (rows.length > 1 ? `${rows.length} items · ${formatInt(kcal)} kcal` : `${formatInt(kcal)} kcal`);
      toast(`Added to ${mealLabel(o.meal)}${where}`, {
        // a 120-character name is clamped on its own line, so the kcal figure always shows
        description: (
          <span className="block">
            {name && <span className="block truncate">{name}</span>}
            <span className="block">{detail}</span>
          </span>
        ),
        icon: <ToastMark />,
        duration: 6000,
        action: { label: "Undo", onClick: () => quiet.mutate({ ids, date: d }) },
      });
      return { ok: true };
    },
    [add, addQuiet, quiet, date, today],
  );

  const value = useMemo(
    () => ({ date, today, goals, entries, flashIds, log, openLog, openEdit, setDate }),
    [date, today, goals, entries, flashIds, log, openLog, openEdit, setDate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
