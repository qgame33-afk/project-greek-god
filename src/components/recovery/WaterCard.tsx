"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/field";
import { Bar } from "@/components/ui/progress";
import { Chip } from "@/components/ui/controls";
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
 * Water history (Check-ins › Water, docs/DESIGN-V3-SIMPLE.md §4.6): the last 7 days as thin bars (the
 * quick +250 ml lives on Today), and the chosen day's entries — each removable with
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
        onSuccess: () => toast(`Removed ${formatInt(log.amount_ml)} ml`, { id: toastId, duration: 6000, action: { label: "Undo", onClick: () => restore.mutate(log) } }),
        onSettled: () => (undoing.current = null),
      }),
    );
  };

  const add = (ml: number) => {
    const id = addMl(ml);
    const total = cached().filter((l) => l.id !== id).reduce((a, l) => a + l.amount_ml, 0) + ml;
    toast(`Water +${formatInt(ml)} ml`, {
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
    <section aria-label="Water by day" className={className}>
      <p className="t-label mb-3">
        {loading ? "—" : litres(selectedTotal)} of {litres(goalMl)} L {date === today ? "today" : relativeDay(date, today).toLowerCase()} · {from === weekAgo ? "last 7 days" : "since day 1"}
      </p>
      {days.isLoading ? (
        <Skeleton className="h-48 w-full rounded-tile-lg" />
      ) : days.error && !days.data ? (
        <ErrorNote onRetry={() => void days.refetch()} />
      ) : (
        <ul className="overflow-hidden rounded-tile-lg bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
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
                    className="press-soft flex min-h-12 w-full items-center gap-3 text-left"
                  >
                    <span className={cn("t-label w-16 shrink-0 tabular-nums", on && "font-semibold text-fg")}>
                      {d === today ? "Today" : `${dayName(d, true)} ${parseISODate(d).getDate()}`}
                    </span>
                    <Bar value={goalMl > 0 ? ml / goalMl : 0} thin className="flex-1" />
                    <span className="t-label w-14 shrink-0 text-right tabular-nums text-fg">{litres(ml)} L</span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      {/* the chosen day's entries */}
      <div className="mt-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="t-row">
            {logs.length ? `${logs.length} ${logs.length === 1 ? "entry" : "entries"}` : "No water logged"} · {relativeDay(date, today)}
          </p>
          <button type="button" onClick={() => setCustomOpen(true)} className="press t-label inline-flex min-h-11 items-center gap-1 font-semibold">
            <Plus className="size-3.5" strokeWidth={1.8} aria-hidden /> Add an amount
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-11 w-full rounded-tile-lg" />
        ) : (
          logs.length > 0 && (
            <ul className="overflow-hidden rounded-tile-lg bg-surface pl-4 pr-2 [&>*+*]:border-t [&>*+*]:border-line">
              {[...logs].reverse().map((l) => (
                <li key={l.id} className="flex min-h-11 items-center gap-3">
                                    <span className="t-row flex-1 tabular-nums">{formatInt(l.amount_ml)} ml</span>
                  <span className="t-label tabular-nums">{stamp(l)}</span>
                  <button
                    type="button"
                    onClick={() => removeOne(l)}
                    className="press grid size-11 place-items-center rounded-full text-fg-2 hover:text-fg"
                    aria-label={`Remove ${l.amount_ml} millilitres, ${stamp(l)}`}
                  >
                    <X className="size-5" strokeWidth={1.9} />
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
  const error = touched && text.trim() && !valid ? "Enter a whole number from 1 to 5,000 ml." : null;
  return (
    <form
      className="pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onAdd(ml!);
      }}
    >
      <label htmlFor="water-custom" className="t-label mb-1.5 block font-semibold">
        Amount
      </label>
      <NumberInput
        id="water-custom"
        autoFocus
        decimal={false}
        enterKeyHint="done"
        placeholder="330"
        suffix="ml"
        value={text}
        aria-invalid={!!error || undefined}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        onBlur={() => setTouched(true)}
      />
      {error && (
        <p className="t-label mt-1.5 text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {[250, 330, 500, 1000].map((v) => (
          <Chip key={v} selected={text === String(v)} onClick={() => setText(String(v))}>
            {formatInt(v)} ml
          </Chip>
        ))}
      </div>
      <Button type="submit" variant="primary" size="lg" block className="mt-6" disabled={!valid}>
        Add water
      </Button>
    </form>
  );
}
