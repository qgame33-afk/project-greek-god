"use client";

import { Droplets, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Ring } from "@/components/ui/ring";
import { Sheet } from "@/components/ui/sheet";
import { isOffline, newId } from "@/lib/data/core";
import { useWater, useWaterMutations } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { composeEatenAt, dayLabel, formatClock, timeValue } from "@/lib/nutrition-ui/format";
import { WATER_MAX, WATER_MIN, WATER_PRESETS, clampWater, liters, waterToGo } from "@/lib/nutrition-ui/water";
import { afterPendingMutations, keepOpenOnToast, useAddPastWater, useFocusIntoSheet } from "./hooks";
import { formatInt } from "@/lib/units";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";

/** Hydration: lapis ring, quick-add chips, the day's taps, Undo last. */
export function WaterCard({ date, today, goalMl, unknown }: { date: ISODate; today: ISODate; goalMl: number; unknown?: boolean }) {
  const { logs, totalMl, loading } = useWater(date);
  const water = useWaterMutations(date);
  const past = useAddPastWater(date);
  const qc = useQueryClient();
  const isToday = date === today;
  const [custom, setCustom] = useState({ open: false, nonce: 0 });
  // capped at full: extra water is fine, not an "over" to flag
  const ratio = goalMl > 0 && !unknown ? Math.min(1, totalMl / goalMl) : 0;
  const left = goalMl - totalMl;

  const add = (ml: number) => {
    // an offline tap would only fail: say so instead of showing water that isn't saved
    if (isOffline()) {
      toast.error("You're offline. Water wasn't logged.", { description: "Tap again once you're back online." });
      return;
    }
    let id: string;
    if (isToday) id = water.addMl(ml);
    else {
      // a past day's tap is stamped on that day, at the current clock time
      id = newId();
      past.mutate({ id, ml, loggedAt: composeEatenAt(date, timeValue(new Date())) });
    }
    haptic(8);
    toast(`+${formatInt(ml)} mL water${isToday ? "" : ` · ${dayLabel(date, today)}`}`, {
      icon: (
        <span className="grid size-6 place-items-center rounded-full bg-lapis-tint text-lapis-text" aria-hidden>
          <Droplets className="size-3.5" />
        </span>
      ),
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          void afterPendingMutations(qc, (v) => (v as { id?: string } | undefined)?.id === id).then(() => water.remove.mutate(id));
        },
      },
    });
  };

  const last = logs.length ? logs.reduce((a, b) => (b.logged_at > a.logged_at ? b : a)) : null;

  return (
    <section id="water" className="card-instrument scroll-mt-24 p-4 sm:p-5" aria-labelledby="water-title">
      <div className="flex items-center gap-4">
        <Ring size="md" tone="lapis" value={ratio} label={`Water ${liters(totalMl)} of ${liters(goalMl)} litres`}>
          <Droplets className="size-5 text-lapis-text" aria-hidden />
        </Ring>
        <div className="min-w-0 flex-1">
          <h2 id="water-title" className="eyebrow">
            Water
          </h2>
          <p className="num-md mt-1.5">
            {loading || unknown ? "—" : liters(totalMl)}
            <span className="unit !text-[12px]">/ {goalMl > 0 ? liters(goalMl) : "—"} L</span>
          </p>
          <p className={cn("mt-1 text-[12.5px] font-semibold", goalMl > 0 && left <= 0 ? "text-gold-300" : "text-fg-3")}>
            {unknown
              ? "Water didn't load for this day."
              : goalMl <= 0
                ? "Set a water goal in Settings."
                : left <= 0
                  ? "Goal met."
                  : `${waterToGo(goalMl, totalMl)} to go${isToday ? "" : " that day"}.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {WATER_PRESETS.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => add(ml)}
            aria-label={`Add ${ml} millilitres`}
            className="press num h-12 rounded-[12px] border border-lapis-line bg-lapis-tint text-[18px] font-semibold text-lapis-text hover:bg-lapis/15"
          >
            +{ml}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom((c) => ({ open: true, nonce: c.nonce + 1 }))}
          className="press h-12 rounded-[12px] border border-line bg-s3 text-[14px] font-bold text-fg-2 hover:text-fg"
        >
          Custom
        </button>
      </div>

      {logs.length > 0 && (
        <div className="mt-4 border-t border-line-hair pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">
              {logs.length} {logs.length === 1 ? "tap" : "taps"}
            </p>
            <button
              type="button"
              onClick={() => last && water.remove.mutate(last.id)}
              disabled={!last || water.remove.isPending}
              className="-my-2 -mr-2 inline-flex h-11 items-center gap-1.5 px-2 text-[13px] font-bold text-fg-2 hover:text-fg disabled:opacity-40"
            >
              <Undo2 className="size-4" /> Undo last
            </button>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Water logged">
            {logs.map((l) => (
              <li key={l.id} className="num rounded-full bg-white/[.05] px-2.5 py-1 text-[13px] text-fg-2">
                {formatInt(l.amount_ml)} <span className="text-fg-3">· {formatClock(l.logged_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet open={custom.open} onOpenChange={keepOpenOnToast((o) => setCustom((c) => ({ ...c, open: o })))} title="Add water" description="Any amount from 50 mL to 2 L.">
        <CustomWater
          key={custom.nonce}
          onAdd={(ml) => {
            add(ml);
            setCustom((c) => ({ ...c, open: false }));
          }}
        />
      </Sheet>
    </section>
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
            className="num-xl w-full bg-transparent text-center text-fg outline-none"
          />
          <span className="mt-1 block text-[13px] font-semibold tracking-[0.04em] text-fg-3">mL</span>
        </label>
      </Stepper>
      {invalid && <p className="mt-2 text-center text-[13px] text-danger">Enter 50 to 2,000 mL.</p>}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[330, 1000, 1500].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => set(v)}
            className={cn(
              "press num h-11 rounded-[12px] border text-[16px] font-semibold",
              ml === v ? "border-lapis-line bg-lapis-tint text-lapis-text" : "border-line bg-s3 text-fg-2",
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
