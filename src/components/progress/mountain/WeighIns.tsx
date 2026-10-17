"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToday, useUser } from "@/lib/data/core";
import { useWeightMutations, type WeightEntry } from "@/lib/data/body";
import { dayName, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { toDisplayWeight, type WeightUnit } from "@/lib/units";
import { useProgressActions } from "../context";
import { RowMenu, signed } from "../kit";

/**
 * The weigh-in ledger: every scale reading (LOG), newest first, with its 7-day trend beside it.
 * Tap a row to correct it; ⋯ edits or deletes (with Undo). New weigh-ins come from Dawn or the
 * Offering, so there is no add button here (§2.4).
 */
export function WeighIns({ weights, trendByDate, unit }: { weights: WeightEntry[]; trendByDate: Map<ISODate, number>; unit: WeightUnit }) {
  const today = useToday();
  const actions = useProgressActions();
  const { remove } = useWeightMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [all, setAll] = useState(false);
  const desc = useMemo(() => [...weights].sort((a, b) => b.local_date.localeCompare(a.local_date)), [weights]);
  const shown = all ? desc : desc.slice(0, 6);
  const d = (lb: number) => toDisplayWeight(lb, unit).toFixed(1);

  const del = (row: WeightEntry) => {
    const key = ["weights", userId];
    const prev = qc.getQueryData<WeightEntry[]>(key);
    if (prev) qc.setQueryData(key, prev.filter((w) => w.id !== row.id));
    remove.mutate(row, { onError: () => prev && qc.setQueryData(key, prev) });
  };

  if (!desc.length) return null;
  return (
    <section aria-labelledby="weighins-h">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="weighins-h" className="t-eyebrow">
          Weigh-ins · <span className="tnum">{desc.length}</span>
        </h2>
        <span className="t-meta text-stone">scale · 7-day trend</span>
      </div>
      <ul className="divide-y divide-vein border-y border-vein">
        {shown.map((w, i) => {
          const prev = desc[i + 1];
          const diff = prev ? toDisplayWeight(Number(w.weight_lb) - Number(prev.weight_lb), unit) : null;
          const trend = trendByDate.get(w.local_date);
          const pending = w.id === "optimistic";
          const label = fmtDay(w.local_date, today);
          return (
            <li key={w.id + w.local_date} className="flex items-center [content-visibility:auto]">
              <button
                type="button"
                disabled={pending}
                onClick={() => actions.logWeight(w.local_date)}
                className="press-soft flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
                aria-label={`${label}: scale ${d(Number(w.weight_lb))} ${unit}${trend != null ? `, trend ${d(trend)}` : ""}. Edit`}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-title-3 block text-ivory">{label}</span>
                  <span className="t-meta block truncate text-stone">{w.notes ? w.notes : diff == null ? "First weigh-in" : `${signed(diff, 1)} from the one before`}</span>
                </span>
                <span className="text-right">
                  <span className="t-num-s tnum block text-ivory">
                    {d(Number(w.weight_lb))}
                    <span className="t-meta ml-0.5 text-stone">{unit}</span>
                  </span>
                  <span className={cn("t-meta tnum block", trend != null ? "text-leaf-300" : "text-stone")}>{trend != null ? `trend ${d(trend)}` : "—"}</span>
                </span>
              </button>
              {!pending && <RowMenu label={label} onEdit={() => actions.logWeight(w.local_date)} onDelete={() => del(w)} />}
            </li>
          );
        })}
      </ul>
      {desc.length > 6 && (
        <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${desc.length}`}
        </Button>
      )}
    </section>
  );
}

function fmtDay(d: ISODate, today: ISODate) {
  const rel = relativeDay(d, today);
  return rel === "Today" || rel === "Yesterday" ? rel : `${dayName(d, true)} ${shortDate(d, today)}`;
}
