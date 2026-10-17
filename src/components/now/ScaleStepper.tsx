"use client";

import { Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SealTick } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isOffline, useToday } from "@/lib/data/core";
import { useWeightMutations, useWeights } from "@/lib/data/body";
import { implausibleWeighIn, lastWeighInCaption } from "@/lib/today/now";
import { fromDisplayWeight, parseNumber, round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/**
 * The scale stepper, "Inscribe" (docs/DESIGN-V2.md §3.1.5). It starts from the last logged weigh-in,
 * in grey, captioned "Friday was 168.0"; ∓0.2 lb (0.1 kg) buttons of 56 px; a tap on the number opens
 * the decimal keypad. Nothing is saved until Inscribe (the gold control), through the existing
 * useWeightMutations, with Undo. A change of more than 10% asks first (a typo or the wrong unit).
 */
export function ScaleStepper({ unit, gold = true, onInscribed, compact }: { unit: WeightUnit; gold?: boolean; onInscribed?: () => void; compact?: boolean }) {
  const today = useToday();
  const { weights } = useWeights();
  const { save, remove } = useWeightMutations();
  const todays = weights.find((w) => w.local_date === today) ?? null;
  const last = [...weights].reverse().find((w) => w.local_date < today) ?? null;
  const step = unit === "kg" ? 0.1 : 0.2;
  const show = (lb: number) => round(toDisplayWeight(lb, unit), 1);
  const seed = todays ? show(Number(todays.weight_lb)) : last ? show(Number(last.weight_lb)) : null;
  const [value, setValue] = useState<number | null>(seed);
  const [touched, setTouched] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);
  // follow the data until he touches the stepper (the seed arrives after a cold start)
  const [seenSeed, setSeenSeed] = useState(seed);
  if (seed !== seenSeed) {
    setSeenSeed(seed);
    if (!touched) setValue(seed);
  }

  const bump = (dir: 1 | -1) => {
    setTouched(true);
    setConfirm(false);
    setValue((v) => (v == null ? v : Math.max(0, round(v + dir * step, 1))));
  };

  const inscribe = (force = false) => {
    if (value == null || busy.current) return;
    const lb = round(fromDisplayWeight(value, unit), 2);
    if (!(lb > 40 && lb < 700)) {
      setNote(`Enter a weight between ${unit === "kg" ? "20 and 300 kg" : "40 and 700 lb"}.`);
      return;
    }
    const lastLb = last ? Number(last.weight_lb) : null;
    if (!force && implausibleWeighIn(lb, lastLb)) {
      setConfirm(true);
      return;
    }
    if (isOffline()) {
      setNote("Offline · try again when you're back");
      return;
    }
    setNote(null);
    setConfirm(false);
    busy.current = true;
    const before = todays ? { weight_lb: Number(todays.weight_lb), notes: todays.notes } : null;
    save.mutate(
      { local_date: today, weight_lb: lb },
      {
        onSuccess: (row) => {
          setTouched(false);
          onInscribed?.();
          toast(`Inscribed ${value.toFixed(1)} ${unit}`, {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => {
                if (before) save.mutate({ local_date: today, ...before });
                else if (row) remove.mutate(row);
              },
            },
          });
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const done = !!todays && !touched;
  const caption = last && !todays ? lastWeighInCaption(last.local_date, today, show(Number(last.weight_lb)).toFixed(1)) : todays ? "Inscribed today" : null;
  const step56 = "press grid size-14 shrink-0 place-items-center rounded-btn bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4 active:bg-m4 disabled:text-disabled";

  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" className={step56} aria-label={`${step} ${unit} less`} onClick={() => bump(-1)} disabled={value == null}>
          <Minus className="size-6" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {typing ? (
            <input
              autoFocus
              inputMode="decimal"
              enterKeyHint="done"
              aria-label={`Today's weight in ${unit}`}
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
              onBlur={() => {
                const n = parseNumber(text.replace(",", "."));
                if (n != null && n > 0) {
                  setValue(round(n, 1));
                  setTouched(true);
                }
                setTyping(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={cn(compact ? "t-num-l" : "t-dial", "tnum w-full bg-transparent text-center text-ivory outline-none")}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setText(value == null ? "" : value.toFixed(1));
                setTyping(true);
              }}
              aria-label={value == null ? "Enter today's weight" : `${value.toFixed(1)} ${unit}. Type a weight`}
              className={cn(compact ? "t-num-l min-h-10" : "t-dial min-h-14", "tnum w-full rounded-field", value == null ? "text-[length:1.25rem] font-medium text-ash" : touched || done ? "text-ivory" : "text-stone")}
            >
              {value == null ? "Enter today's weight" : value.toFixed(1)}
            </button>
          )}
          <p className="t-meta mt-1 text-ash">
            {unit}
            {caption ? ` · ${caption}` : ""}
          </p>
        </div>
        <button type="button" className={step56} aria-label={`${step} ${unit} more`} onClick={() => bump(1)} disabled={value == null}>
          <Plus className="size-6" strokeWidth={1.8} />
        </button>
      </div>

      {confirm && value != null && last && (
        <div role="alert" className="t-meta mt-3 rounded-field bg-m1 px-3.5 py-2.5 text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]">
          That&apos;s {Math.abs(round(value - show(Number(last.weight_lb)), 1)).toFixed(1)} {unit} from your last weigh-in. Check the unit.
          <span className="mt-1 flex gap-4">
            <button type="button" className="min-h-11 font-semibold text-ivory underline decoration-ui-line underline-offset-4" onClick={() => inscribe(true)}>
              Inscribe anyway
            </button>
            <button type="button" className="min-h-11 font-semibold text-stone" onClick={() => setConfirm(false)}>
              Change it
            </button>
          </span>
        </div>
      )}
      {note && (
        <p role="status" className="t-meta mt-2 text-stone">
          {note}
        </p>
      )}

      {done ? (
        <p className="t-callout mt-3 flex min-h-14 items-center justify-center gap-2 text-leaf-300">
          <SealTick className="seal-in size-5" /> Inscribed {value?.toFixed(1)} {unit}
        </p>
      ) : (
        <Button variant={gold ? "primary" : "secondary"} size="lg" block className={compact ? "mt-2" : "mt-3"} disabled={value == null} loading={save.isPending} onClick={() => inscribe()}>
          {value == null ? "Inscribe" : `Inscribe ${value.toFixed(1)}`}
        </Button>
      )}
    </div>
  );
}
