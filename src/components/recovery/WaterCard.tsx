"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useUser } from "@/lib/data/core";
import { useDailyWater, useWater, useWaterMutations, type WaterLog } from "@/lib/data/nutrition";
import { addDays, dateRange, dayName, localDateOf, parseISODate, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { useRestoreWater } from "@/lib/recovery/hooks";
import { formatInt, parseNumber } from "@/lib/units";

const DAYS = 7;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const litres = (ml: number) => (ml / 1000).toFixed(1);

/**
 * Water history (docs/DESIGN-V2.md §3.7, §2.4): the last 7 days as meters in the water series (the
 * one quick control lives on Now and Fuel), and the chosen day's entries — each removable with
 * Undo, and a custom amount for a day that was missed.
 */
export function WaterCard({
  date,
  today,
  goalMl,
  startDate,
  onPickDay,
  className,
}: {
  date: ISODate;
  today: ISODate;
  goalMl: number;
  /** Days before the programme started aren't shown as empty days. */
  startDate?: ISODate | null;
  onPickDay?: (d: ISODate) => void;
  className?: string;
}) {
  const weekAgo = addDays(today, -(DAYS - 1));
  const from = startDate && startDate > weekAgo && startDate <= today ? startDate : weekAgo;
  const days = useDailyWater(from, today);
  const { logs, loading } = useWater(date);
  const { addMl, remove } = useWaterMutations(date);
  const restore = useRestoreWater();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [customOpen, setCustomOpen] = useState(false);
  const undoing = useRef<string | null>(null);
  const key = ["water", date, userId];
  const toastId = `water-${date}`;
  const cached = () => qc.getQueryData<WaterLog[]>(key) ?? [];
  const byDate = new Map((days.data ?? []).map((r) => [r.local_date, Number(r.total_ml ?? 0)]));
  const selectedTotal = logs.reduce((a, l) => a + l.amount_ml, 0);

  /** Resolves once the insert for this tap has settled (deleting before it lands would delete nothing). */
  const inserted = (id: string) =>
    new Promise<void>((resolve) => {
      const mc = qc.getMutationCache();
      const pending = () => mc.findAll({ status: "pending" }).some((m) => (m.state.variables as { id?: string } | undefined)?.id === id);
      if (!pending()) return resolve();
      const unsub = mc.subscribe(() => {
        if (pending()) return;
        unsub();
        resolve();
      });
    });

  const removeOne = (log: WaterLog) => {
    if (undoing.current === log.id) return;
    undoing.current = log.id;
    toast.dismiss(toastId);
    qc.setQueryData<WaterLog[]>(key, (rows) => rows?.filter((l) => l.id !== log.id));
    void inserted(log.id).then(() =>
      remove.mutate(log.id, {
        onSuccess: () => toast(`Removed ${formatInt(log.amount_ml)} mL`, { id: toastId, duration: 6000, action: { label: "Undo", onClick: () => restore.mutate(log) } }),
        onSettled: () => (undoing.current = null),
      }),
    );
  };

  const add = (ml: number) => {
    const id = addMl(ml);
    const total = cached().filter((l) => l.id !== id).reduce((a, l) => a + l.amount_ml, 0) + ml;
    toast(`+${formatInt(ml)} mL water`, {
      id: toastId,
      description: `${litres(total)} of ${litres(goalMl)} L ${date === today ? "today" : `for ${relativeDay(date, today).toLowerCase()}`}`,
      duration: 6000,
      action: { label: "Undo", onClick: () => removeOne({ id, amount_ml: ml, local_date: date, logged_at: new Date().toISOString(), user_id: userId ?? "" } as WaterLog) },
    });
  };

  const stamp = (l: WaterLog) => {
    const on = localDateOf(l.logged_at);
    return on === l.local_date ? timeOf(l.logged_at) : `added ${shortDate(on, today)}`;
  };

  return (
    <section aria-labelledby="water-title" className={className}>
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">Water · {relativeDay(date, today)}</p>
          <h2 id="water-title" className="t-title-2 tnum mt-1 text-ivory">
            {loading ? "—" : litres(selectedTotal)} of {litres(goalMl)} L
          </h2>
        </div>
        <span className="t-meta pb-1 text-stone">{from === weekAgo ? "Last 7 days" : "Since day 1"}</span>
      </div>
      {days.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : days.error && !days.data ? (
        <ErrorNote onRetry={() => void days.refetch()}>Couldn&apos;t load your water history.</ErrorNote>
      ) : (
        <ul className="divide-y divide-vein border-y border-vein">
          {dateRange(from, today)
            .reverse()
            .map((d) => {
              const ml = d === date ? selectedTotal : (byDate.get(d) ?? 0);
              const on = d === date;
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => onPickDay?.(d)}
                    aria-pressed={on}
                    aria-label={`${relativeDay(d, today)}: ${litres(ml)} of ${litres(goalMl)} litres`}
                    className={cn("press-soft flex min-h-12 w-full items-center gap-3 text-left", on && "text-ivory")}
                  >
                    <span className={cn("t-meta tnum w-14 shrink-0", on ? "font-semibold text-ivory" : "text-stone")}>
                      {d === today ? "Today" : `${dayName(d, true)} ${parseISODate(d).getDate()}`}
                    </span>
                    <Meter value={ml} target={goalMl} tone="water" size="sm" label={`${litres(ml)} of ${litres(goalMl)} litres`} className="flex-1" />
                    <span className={cn("t-meta tnum w-16 shrink-0 text-right", ml >= goalMl ? "text-ivory" : "text-ash")}>{litres(ml)} L</span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      {/* the chosen day's entries */}
      <div className="mt-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="t-eyebrow">
            {logs.length ? `${logs.length} ${logs.length === 1 ? "entry" : "entries"}` : "No water logged"} · {relativeDay(date, today)}
          </p>
          <button type="button" onClick={() => setCustomOpen(true)} className="t-meta inline-flex min-h-11 items-center gap-1 font-semibold text-stone hover:text-ivory">
            <Plus className="size-3.5" strokeWidth={1.8} aria-hidden /> Add an amount
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          logs.length > 0 && (
            <ul className="divide-y divide-vein border-y border-vein">
              {[...logs].reverse().map((l) => (
                <li key={l.id} className="flex min-h-11 items-center gap-3">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-water" />
                  <span className="t-callout tnum flex-1 text-ivory">{formatInt(l.amount_ml)} mL</span>
                  <span className="t-meta tnum text-ash">{stamp(l)}</span>
                  <button
                    type="button"
                    onClick={() => removeOne(l)}
                    className="press -mr-2 grid size-11 place-items-center rounded-field text-ash hover:text-ivory"
                    aria-label={`Remove ${l.amount_ml} millilitres, ${stamp(l)}`}
                  >
                    <X className="size-4" strokeWidth={1.6} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <Sheet open={customOpen} onOpenChange={setCustomOpen} title="Add water" description={relativeDay(date, today)}>
        {customOpen && (
          <CustomForm
            onAdd={(ml) => {
              add(ml);
              setCustomOpen(false);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

function CustomForm({ onAdd }: { onAdd: (ml: number) => void }) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const ml = parseNumber(text);
  const valid = ml != null && Number.isInteger(ml) && ml >= 1 && ml <= 5000;
  const error = touched && text.trim() && !valid ? "Enter a whole number from 1 to 5,000 mL." : null;
  return (
    <form
      className="pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onAdd(ml!);
      }}
    >
      <label htmlFor="water-custom" className="t-meta mb-1.5 block font-semibold text-stone">
        Amount
      </label>
      <NumberInput
        id="water-custom"
        autoFocus
        decimal={false}
        enterKeyHint="done"
        placeholder="330"
        suffix="mL"
        value={text}
        aria-invalid={!!error || undefined}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        onBlur={() => setTouched(true)}
      />
      {error && (
        <p className="t-meta mt-1.5 text-cinnabar" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {[250, 330, 500, 1000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setText(String(v))}
            className="press t-callout tnum h-11 rounded-full bg-m3 px-4 font-semibold text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory"
          >
            {formatInt(v)} mL
          </button>
        ))}
      </div>
      <Button type="submit" variant="primary" size="lg" block className="mt-6" disabled={!valid}>
        Add water
      </Button>
    </form>
  );
}
