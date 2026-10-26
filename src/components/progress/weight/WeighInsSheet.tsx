"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToday, useUser } from "@/lib/data/core";
import { useWeightMutations, type WeightEntry } from "@/lib/data/body";
import { dayName, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { toDisplayWeight, type WeightUnit } from "@/lib/units";
import { useProgressActions } from "../context";
import { RowMenu, signed } from "../kit";

/**
 * All weigh-ins (docs/DESIGN-V3-SIMPLE.md §4.5.1 item 4): every reading, newest first, with the
 * change from the one before and the 7-day average that day. Tap a row to correct it (the
 * weigh-in sheet for that day); ⋯ edits or deletes. New weigh-ins come from "Log weight".
 */
export function WeighInsSheet({
  open,
  onOpenChange,
  weights,
  series,
  unit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  weights: WeightEntry[];
  series: { date: ISODate; lb: number }[];
  unit: WeightUnit;
}) {
  const today = useToday();
  const actions = useProgressActions();
  const { remove } = useWeightMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [all, setAll] = useState(false);
  const desc = useMemo(() => [...weights].sort((a, b) => b.local_date.localeCompare(a.local_date)), [weights]);
  const avgByDate = useMemo(() => new Map(series.map((s) => [s.date, s.lb])), [series]);
  const shown = all ? desc : desc.slice(0, 30);
  const d = (lb: number) => toDisplayWeight(lb, unit).toFixed(1);

  const edit = (date: ISODate) => {
    onOpenChange(false);
    // let this sheet close before the weigh-in sheet opens over the page
    window.setTimeout(() => actions.logWeight(date), 220);
  };
  const del = (row: WeightEntry) => {
    const key = ["weights", userId];
    const prev = qc.getQueryData<WeightEntry[]>(key);
    if (prev) qc.setQueryData(key, prev.filter((w) => w.id !== row.id));
    remove.mutate(row, { onError: () => prev && qc.setQueryData(key, prev) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="All weigh-ins" description={desc.length ? `${desc.length} ${desc.length === 1 ? "weigh-in" : "weigh-ins"}` : undefined}>
      {!desc.length ? (
        <p className="t-body pb-2 text-fg-2">No weigh-ins yet. Tap Log weight to add your first.</p>
      ) : (
        <div className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
          {shown.map((w, i) => {
            const prev = desc[i + 1];
            const diff = prev ? toDisplayWeight(Number(w.weight_lb) - Number(prev.weight_lb), unit) : null;
            const avg = avgByDate.get(w.local_date);
            const pending = w.id === "optimistic";
            const label = fmtDay(w.local_date, today);
            return (
              <div key={w.id + w.local_date} className="flex items-center pr-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => edit(w.local_date)}
                  className="press-soft flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                  aria-label={`${label}: ${d(Number(w.weight_lb))} ${unit}${avg != null ? `, 7-day average ${d(avg)}` : ""}. Edit`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="t-row block">{label}</span>
                    <span className="t-label mt-0.5 block truncate">{w.notes ? w.notes : diff == null ? "First weigh-in" : `${signed(diff, 1)} from the one before`}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="t-row block tabular-nums">
                      {d(Number(w.weight_lb))}
                      <span className="unit">{unit}</span>
                    </span>
                    <span className="t-cap block tabular-nums">{avg != null ? `Avg ${d(avg)}` : "—"}</span>
                  </span>
                </button>
                {!pending && <RowMenu label={label} onEdit={() => edit(w.local_date)} onDelete={() => del(w)} />}
              </div>
            );
          })}
        </div>
      )}
      {desc.length > 30 && (
        <Button variant="ghost" size="sm" block className="mt-2" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${desc.length}`}
        </Button>
      )}
    </Sheet>
  );
}

function fmtDay(d: ISODate, today: ISODate) {
  const rel = relativeDay(d, today);
  return rel === "Today" || rel === "Yesterday" ? rel : `${dayName(d, true)} ${shortDate(d, today)}`;
}
