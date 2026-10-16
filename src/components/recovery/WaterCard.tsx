"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type CSSProperties } from "react";
import { CalendarClock, Droplets, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Ring } from "@/components/ui/ring";
import { Sheet } from "@/components/ui/sheet";
import { useUser } from "@/lib/data/core";
import {
  useWater,
  useWaterMutations,
  type WaterLog,
} from "@/lib/data/nutrition";
import {
  localDateOf,
  longDate,
  relativeDay,
  shortDate,
  type ISODate,
} from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { useRestoreWater } from "@/lib/recovery/hooks";
import { formatInt, parseNumber } from "@/lib/units";
import { cn } from "@/lib/cn";

const QUICK = [250, 500, 750] as const;
const SHOW = 4;
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export function WaterCard({
  date,
  today,
  goalMl,
  className,
  style,
}: {
  date: ISODate;
  today: ISODate;
  goalMl: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { logs, totalMl, loading } = useWater(date);
  const { addMl, remove } = useWaterMutations(date);
  const restore = useRestoreWater();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [customOpen, setCustomOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Guards a burst of taps on Undo while a removal is in flight.
  const undoing = useRef<string | null>(null);

  const p = goalMl > 0 ? totalMl / goalMl : 0;
  const met = totalMl >= goalMl;
  const left = Math.max(0, goalMl - totalMl);
  const latest = logs.at(-1);
  const when = relativeDay(date, today);
  const isToday = date === today;
  const key = ["water", date, userId];
  const toastId = `water-${date}`;
  const cached = () => qc.getQueryData<WaterLog[]>(key) ?? [];

  const add = (ml: number) => {
    const id = addMl(ml);
    haptic(8);
    // The total as it stands with this tap, read from the cache (not this render), so
    // quick taps never show a stale number.
    const total =
      cached()
        .filter((l) => l.id !== id)
        .reduce((a, l) => a + l.amount_ml, 0) + ml;
    toast(`+${formatInt(ml)} mL water`, {
      id: toastId,
      description: `${(total / 1000).toFixed(1)} of ${(goalMl / 1000).toFixed(1)} L ${isToday ? "today" : `for ${when.toLowerCase() === "yesterday" ? "yesterday" : when}`}`,
      duration: 6000,
      // Undo is bound to this tap's own row: it never removes a different entry.
      action: { label: "Undo", onClick: () => undoTap(id) },
    });
  };

  /**
   * Resolves once the insert for this tap has settled. Deleting while the insert is still
   * in flight would delete nothing, and the entry would come back when the insert lands.
   */
  const inserted = (id: string) =>
    new Promise<void>((resolve) => {
      const mc = qc.getMutationCache();
      const pending = () =>
        mc
          .findAll({ status: "pending" })
          .some((m) => (m.state.variables as { id?: string } | undefined)?.id === id);
      if (!pending()) return resolve();
      const unsub = mc.subscribe(() => {
        if (pending()) return;
        unsub();
        resolve();
      });
    });

  /** Remove one tap by id, if it still exists. Guards a burst of taps on Undo. */
  const undoTap = (id: string, onRemoved?: () => void) => {
    if (!cached().some((l) => l.id === id) || undoing.current === id) return;
    undoing.current = id;
    // hide it at once; the delete follows the insert
    qc.setQueryData<WaterLog[]>(key, (rows) => rows?.filter((l) => l.id !== id));
    void inserted(id).then(() =>
      remove.mutate(id, {
        onSuccess: onRemoved,
        onSettled: () => (undoing.current = null),
      }),
    );
  };

  /** Removes the newest entry; any open water toast is now stale, so it goes too. */
  const undoLast = () => {
    const newest = [...cached()].sort((a, b) =>
      a.logged_at.localeCompare(b.logged_at),
    ).at(-1);
    if (!newest) return;
    toast.dismiss(toastId);
    undoTap(newest.id);
  };

  const removeOne = (log: WaterLog) => {
    toast.dismiss(toastId);
    undoTap(log.id, () =>
      toast(`Removed ${formatInt(log.amount_ml)} mL`, {
        id: toastId,
        duration: 6000,
        action: { label: "Undo", onClick: () => restore.mutate(log) },
      }),
    );
  };

  /** The tap's time, or when it was added for an entry logged to a past day afterwards. */
  const stamp = (l: WaterLog) => {
    const on = localDateOf(l.logged_at);
    return on === l.local_date
      ? timeOf(l.logged_at)
      : `Added ${shortDate(on, today)}`;
  };

  const shown = showAll
    ? [...logs].reverse()
    : [...logs].reverse().slice(0, SHOW);

  return (
    <section
      className={cn("card p-4 sm:p-5", className)}
      style={style}
      aria-labelledby={`water-${date}`}
    >
      <CardHeader title={<span id={`water-${date}`}>Water · {when}</span>} />
      {!isToday && (
        <p className="-mt-1 mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-fg-2">
          <CalendarClock className="size-4 shrink-0 text-fg-3" aria-hidden />
          Adding to {longDate(date)}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-4" aria-hidden>
          <Skeleton className="size-[136px] rounded-full" />
          <div className="grid flex-1 grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="flex shrink-0 flex-col items-center">
              <Ring
                value={p}
                size="lg"
                tone="lapis"
                label={`Water ${(totalMl / 1000).toFixed(1)} of ${(goalMl / 1000).toFixed(1)} litres, ${Math.round(p * 100)} percent`}
              >
                <span className="num-md leading-none">
                  {(totalMl / 1000).toFixed(1)}
                  <span className="unit">L</span>
                </span>
                <span className="mt-1 text-[11px] font-semibold text-fg-3">
                  of {(goalMl / 1000).toFixed(1)} L
                </span>
              </Ring>
              <p
                className={cn(
                  "mt-2 text-center text-[12.5px] font-semibold",
                  met ? "text-gold-300" : "text-fg-2",
                )}
              >
                {met
                  ? totalMl > goalMl
                    ? `+${formatInt(totalMl - goalMl)} mL over`
                    : "Goal met"
                  : `${formatInt(left)} mL to go`}
              </p>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              {QUICK.map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => add(ml)}
                  className="press num h-12 rounded-[12px] border border-lapis-line bg-lapis-tint text-[17px] font-semibold text-lapis-text transition-colors hover:bg-lapis/15"
                  aria-label={`Add ${ml} millilitres`}
                >
                  +{ml}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="press h-12 rounded-[12px] border border-line bg-s3 text-[14px] font-bold text-fg-2 transition-colors hover:text-fg"
              >
                Custom
              </button>
            </div>
          </div>
          <div className="mt-4 border-t border-line-hair pt-3">
            <div className="flex items-center justify-between">
              <p className="eyebrow">
                {logs.length
                  ? `${logs.length} ${logs.length === 1 ? "entry" : "entries"}`
                  : "No water logged"}
              </p>
              {latest && (
                <button
                  type="button"
                  onClick={undoLast}
                  disabled={remove.isPending}
                  className="-my-2 -mr-2 inline-flex h-11 items-center gap-1.5 px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200 disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" /> Undo last
                </button>
              )}
            </div>
            {logs.length === 0 ? (
              <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-snug text-fg-3">
                <Droplets
                  className="mt-px size-4 shrink-0 text-lapis"
                  aria-hidden
                />
                <span>
                  Tap an amount when you drink. Each tap is its own entry.
                </span>
              </p>
            ) : (
              <ul className="mt-1">
                {shown.map((l) => (
                  <li
                    key={l.id}
                    className="flex h-11 items-center gap-3 border-b border-line-hair last:border-0"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-lapis"
                      aria-hidden
                    />
                    <span className="num-xs flex-1 text-fg">
                      {formatInt(l.amount_ml)} mL
                    </span>
                    <span className="num-xs text-fg-3">{stamp(l)}</span>
                    <button
                      type="button"
                      onClick={() => removeOne(l)}
                      className="-mr-2 grid size-11 place-items-center rounded-[12px] text-fg-3 hover:text-fg"
                      aria-label={`Remove ${l.amount_ml} millilitres, ${stamp(l)}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {logs.length > SHOW && (
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="mt-1 inline-flex h-11 items-center text-[13px] font-bold text-fg-2 hover:text-fg"
              >
                {showAll ? "Show less" : `Show all ${logs.length}`}
              </button>
            )}
          </div>
        </>
      )}
      <CustomWaterSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        onAdd={(ml) => add(ml)}
      />
    </section>
  );
}

function CustomWaterSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (ml: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Custom amount">
      {open && (
        <CustomForm
          onAdd={(ml) => {
            onAdd(ml);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}

function CustomForm({ onAdd }: { onAdd: (ml: number) => void }) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const ml = parseNumber(text);
  const valid = ml != null && Number.isInteger(ml) && ml >= 1 && ml <= 5000;
  const error =
    touched && text.trim() && !valid
      ? "Enter a whole number from 1 to 5,000 mL."
      : null;
  return (
    <form
      className="pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onAdd(ml!);
      }}
    >
      <label
        htmlFor="water-custom"
        className="mb-1.5 block text-[13px] font-semibold text-fg-2"
      >
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
        onChange={(e) =>
          setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
        }
        onBlur={() => setTouched(true)}
      />
      {error && (
        <p className="mt-1.5 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {[330, 355, 1000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setText(String(v))}
            className="press num h-9 rounded-full border border-lapis-line bg-lapis-tint px-3.5 text-[14px] font-semibold text-lapis-text"
          >
            {formatInt(v)} mL
          </button>
        ))}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        className="mt-6"
        disabled={!valid}
      >
        Add water
      </Button>
    </form>
  );
}
