"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Meter } from "@/components/ui/meter";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { isOffline, newId } from "@/lib/data/core";
import { useWater, useWaterMutations } from "@/lib/data/nutrition";
import type { ISODate } from "@/lib/dates";
import { composeEatenAt, dayLabel, formatClock, timeValue } from "@/lib/nutrition-ui/format";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";
import { WATER_MAX, WATER_MIN, clampWater, liters, waterToGo } from "@/lib/nutrition-ui/water";
import { formatInt } from "@/lib/units";
import { afterPendingMutations, keepOpenOnToast, useAddPastWater, useFocusIntoSheet } from "../hooks";

const CHIP =
  "press tnum grid h-11 min-w-[3.75rem] place-items-center rounded-full bg-m3 px-3 text-[length:max(15px,0.9375rem)] font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] active:bg-m4 disabled:text-disabled";

/**
 * Water (docs/DESIGN-V2.md §2.4: the one water meter lives here): a verdigris meter with +250 and
 * +500 chips (44 px, each tap its own row, Undo in the toast). ⋯ opens any amount and the day's
 * taps with Undo last. A past day's tap is stamped on that day.
 */
export function WaterRow({ date, today, goalMl, totalMl, unknown, className }: { date: ISODate; today: ISODate; goalMl: number; totalMl: number | null; unknown: boolean; className?: string }) {
  const add = useAddWater(date, today);
  const [more, setMore] = useState({ open: false, nonce: 0 });
  const total = totalMl ?? 0;
  const left = goalMl - total;
  const caption = unknown ? "Water didn't load" : goalMl <= 0 ? "No water goal set" : left <= 0 ? "Goal met" : `${waterToGo(goalMl, total)} to go`;

  return (
    <div className={cn("flex items-end gap-3 @max-[19rem]:flex-col @max-[19rem]:items-stretch", className)}>
      <div className="min-w-0 flex-1">
        <p className="t-eyebrow">Water</p>
        <p className="mt-1 whitespace-nowrap @max-[19rem]:whitespace-normal">
          <span className="t-num-s text-ivory">{unknown || totalMl == null ? "—" : liters(total)}</span>
          <span className="t-meta text-stone">
            {" "}
            / {goalMl > 0 ? liters(goalMl) : "—"} L · {caption}
          </span>
        </p>
        <Meter
          className="mt-2"
          size="sm"
          tone="water"
          value={unknown ? 0 : total}
          target={goalMl}
          label={unknown ? "Water didn't load" : `Water, ${liters(total)} of ${goalMl > 0 ? liters(goalMl) : "no goal"} litres`}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {[250, 500].map((ml) => (
          <button key={ml} type="button" onClick={() => add(ml)} aria-label={`Add ${ml} millilitres of water`} className={CHIP}>
            +{ml}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMore((m) => ({ open: true, nonce: m.nonce + 1 }))}
          aria-label="More water: any amount, today's taps"
          className="press -mr-2 grid size-11 place-items-center rounded-full text-stone hover:text-ivory"
        >
          <Ellipsis className="size-5" strokeWidth={1.6} />
        </button>
      </div>
      <WaterSheet key={more.nonce} open={more.open} onOpenChange={(o) => setMore((m) => ({ ...m, open: o }))} date={date} today={today} onAdd={add} />
    </div>
  );
}

/** One tap of water: today's row now, a past day's stamped on that day; offline says so instead. */
function useAddWater(date: ISODate, today: ISODate) {
  const water = useWaterMutations(date);
  const past = useAddPastWater(date);
  const qc = useQueryClient();
  const isToday = date === today;
  return (ml: number) => {
    if (isOffline()) {
      toast.error("You're offline. Water wasn't logged.", { description: "Tap again once you're back online." });
      return;
    }
    let id: string;
    if (isToday) id = water.addMl(ml);
    else {
      id = newId();
      past.mutate({ id, ml, loggedAt: composeEatenAt(date, timeValue(new Date())) });
    }
    toast(`+${formatInt(ml)} mL water${isToday ? "" : ` · ${dayLabel(date, today)}`}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          void afterPendingMutations(qc, (v) => (v as { id?: string } | undefined)?.id === id).then(() => water.remove.mutate(id));
        },
      },
    });
  };
}

function WaterSheet({ open, onOpenChange, date, today, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; date: ISODate; today: ISODate; onAdd: (ml: number) => void }) {
  const { logs } = useWater(date);
  const water = useWaterMutations(date);
  const last = logs.length ? logs.reduce((a, b) => (b.logged_at > a.logged_at ? b : a)) : null;
  return (
    <Sheet
      open={open}
      onOpenChange={keepOpenOnToast(onOpenChange)}
      title="Water"
      description={date === today ? "Any amount from 50 mL to 2 L." : `${dayLabel(date, today)} · any amount from 50 mL to 2 L.`}
    >
      <CustomWater
        onAdd={(ml) => {
          onAdd(ml);
          onOpenChange(false);
        }}
      />
      {logs.length > 0 && (
        <div className="mt-6 border-t border-vein pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="t-eyebrow">
              {logs.length} {logs.length === 1 ? "tap" : "taps"}
            </p>
            <button
              type="button"
              onClick={() => last && water.remove.mutate(last.id)}
              disabled={!last || water.remove.isPending}
              className="press -my-2 -mr-2 inline-flex h-11 items-center gap-1.5 px-2 t-callout font-semibold text-stone hover:text-ivory disabled:opacity-40"
            >
              <Undo2 className="size-4" strokeWidth={1.6} aria-hidden /> Undo last
            </button>
          </div>
          <ul className="flex flex-wrap gap-1.5 pb-2" aria-label="Water logged">
            {logs.map((l) => (
              <li key={l.id} className="t-meta tnum rounded-full bg-m3 px-2.5 py-1 text-ivory">
                {formatInt(l.amount_ml)} <span className="text-stone">· {formatClock(l.logged_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

function CustomWater({ onAdd }: { onAdd: (ml: number) => void }) {
  const [ml, setMl] = useState(400);
  // the sheet stays tappable while it closes: one tap logs once, a double tap still once
  const used = useRef(false);
  const [sent, setSent] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(root);
  const [text, setText] = useState("400");
  const parsed = parseFoodNumber(text);
  const invalid = parsed == null || parsed < WATER_MIN || parsed > WATER_MAX;
  const set = (v: number) => {
    setMl(v);
    setText(String(v));
  };
  return (
    <div className="pb-1 pt-3" ref={root}>
      <Stepper label="Water amount" value={ml} step={50} min={WATER_MIN} max={WATER_MAX} onChange={set} size="lg">
        <label className="block">
          <span className="sr-only">Millilitres</span>
          <input
            value={text}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              const n = parseFoodNumber(e.target.value);
              if (n != null) setMl(n);
            }}
            onFocus={(e) => e.currentTarget.select()}
            aria-invalid={invalid}
            className="t-num-l w-full bg-transparent text-center text-ivory outline-none"
          />
          <span className="t-meta mt-1 block text-stone">mL</span>
        </label>
      </Stepper>
      {invalid && <p className="t-meta mt-2 text-center text-cinnabar">Enter 50 to 2,000 mL.</p>}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[330, 1000, 1500].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => set(v)}
            aria-pressed={ml === v}
            className={cn(
              "press tnum h-11 rounded-field t-callout font-semibold",
              ml === v ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]",
            )}
          >
            {v >= 1000 ? `${v / 1000} L` : `${v} mL`}
          </button>
        ))}
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-5"
        disabled={invalid || sent}
        onClick={() => {
          if (used.current || invalid || parsed == null) return;
          used.current = true;
          setSent(true);
          onAdd(clampWater(parsed));
        }}
      >
        Add {invalid || parsed == null ? "" : `${formatInt(clampWater(parsed))} mL`}
      </Button>
    </div>
  );
}
