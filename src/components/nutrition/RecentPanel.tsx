"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FuelAmphora } from "@/components/art/icons";
import { Input } from "@/components/ui/field";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { newId } from "@/lib/data/core";
import type { FoodEntry } from "@/lib/data/nutrition";
import { relativeDay } from "@/lib/dates";
import { composeEatenAt, formatAmount } from "@/lib/nutrition-ui/format";
import { buildEntry, fromEntry } from "@/lib/nutrition-ui/portion";
import { formatInt } from "@/lib/units";
import { RowProvenance } from "./bits";
import { mealLabel, useFuel } from "./context";
import { useFuelRecent } from "./hooks";
import type { When } from "./log-shared";

/** Distinct recently logged foods. Tap to adjust the amount; + logs it again as-is. */
export function RecentPanel({ when, onPick }: { when: When; onPick: (e: FoodEntry) => void }) {
  const { log, today } = useFuel();
  const recent = useFuelRecent();
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = recent.data ?? [];
    return t ? all.filter((e) => e.name.toLowerCase().includes(t)) : all;
  }, [recent.data, q]);

  const quickAdd = async (e: FoodEntry) => {
    if (pending) return;
    setPending(e.id);
    const c = fromEntry(e);
    const row = buildEntry(c, { id: newId(), unitIndex: 0, amount: c.defaultAmount, meal: when.meal, date: when.date, eatenAt: composeEatenAt(when.date, when.time) });
    await log([row], { meal: when.meal, name: e.name, detail: `${formatAmount(c.defaultAmount, e.unit)} · ${formatInt(row.calories)} kcal` });
    setPending(null);
  };

  if (recent.isLoading)
    return (
      <ul aria-busy="true" aria-label="Loading recent foods">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 border-b border-vein py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="size-11 rounded-field" />
          </li>
        ))}
      </ul>
    );
  if (recent.error) return <ErrorNote onRetry={() => recent.refetch()}>Couldn&apos;t load recent foods.</ErrorNote>;
  if (!recent.data?.length)
    return (
      <Empty art={<FuelAmphora className="size-10 text-ui-line" />} title="Nothing logged yet">
        Foods you log show up here, so the next time takes one tap.
      </Empty>
    );

  return (
    <div>
      {recent.data.length > 8 && (
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ash" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter recent foods" aria-label="Filter recent foods" autoComplete="off" className="pl-11" enterKeyHint="search" />
        </div>
      )}
      {!list.length ? (
        <p className="py-6 text-center t-callout text-ash">No recent foods match “{q.trim()}”.</p>
      ) : (
        <ul className="@container">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-vein last:border-b-0">
              <button type="button" onClick={() => onPick(e)} className="press-soft min-w-0 flex-1 py-2.5 text-left">
                <p className="truncate t-callout font-semibold text-ivory">{e.name}</p>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                  <span className="truncate t-meta font-medium text-ash">
                    {formatAmount(Number(e.amount), e.unit)} · <span className="tnum">{formatInt(Number(e.calories))}</span> kcal · {relativeDay(e.local_date, today)}
                  </span>
                  <RowProvenance item={e} />
                </div>
              </button>
              <button
                type="button"
                onClick={() => quickAdd(e)}
                disabled={pending != null}
                aria-label={`Add ${e.name}, ${formatAmount(Number(e.amount), e.unit)}, to ${mealLabel(when.meal)}`}
                className="press grid size-11 shrink-0 place-items-center rounded-field bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-m4 disabled:opacity-50"
              >
                <Plus className="size-5" strokeWidth={2.2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
