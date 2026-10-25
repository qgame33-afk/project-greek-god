"use client";

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useStepper } from "./repeat";

/**
 * The gym number card (docs/DESIGN-V3-SIMPLE.md §1.4.16, §4.2.3): a --card radius-24 card with the
 * number in `t-gym` and its unit beside it ("25" "lb each hand"; the unit wraps under the number
 * only when it cannot fit), an optional note under it ("17 beats your best"), and two 60 px round
 * buttons stacked on the right (+ on top, − below; 56 px in the short layout) that repeat while
 * held. It is a `group` named "Weight, 25 pounds each hand"; the number is a `spinbutton` (arrow
 * keys and VoiceOver swipes step it) and tapping it opens the keypad (`onKeypad`).
 *
 *   <NumberCard name="Weight" value={25} unit="lb each hand" spokenUnit="pounds each hand"
 *     step={2.5} min={0} max={2000} onChange={setWeight} onKeypad={openKeypad} />
 */
export interface NumberCardProps {
  /** The quantity's name for VoiceOver: "Weight", "Reps". */
  name: string;
  value: number;
  onChange: (v: number) => void;
  /** Shown beside the number: "lb each hand", "reps", "sec". */
  unit: string;
  /** Spoken unit: "pounds each hand". Defaults to `unit`. */
  spokenUnit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Display text for the value (defaults to the number as is). */
  format?: (v: number) => string;
  note?: ReactNode;
  onKeypad?: () => void;
  className?: string;
}

export function NumberCard({ name, value, onChange, unit, spokenUnit, step = 1, min = 0, max = 9999, format, note, onKeypad, className }: NumberCardProps) {
  const s = useStepper({ value, onChange, step, min, max, onKeypad });
  const shown = format ? format(value) : String(value);
  const spoken = `${shown} ${spokenUnit ?? unit}`;
  const round = "press grid size-[60px] shrink-0 place-items-center rounded-full bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-40 short:size-14";
  return (
    <div role="group" aria-label={`${name}, ${spoken}`} className={cn("flex items-center justify-between gap-3 rounded-card bg-surface py-3.5 pl-[22px] pr-3.5 short:py-2.5 short:pl-5 short:pr-3", className)}>
      <div className="min-w-0">
        <div
          role="spinbutton"
          tabIndex={0}
          aria-label={name}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={spoken}
          onKeyDown={s.onKeyDown}
          onClick={onKeypad}
          className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 rounded-tile outline-offset-4", onKeypad && "cursor-pointer")}
        >
          <span className="t-gym" aria-hidden>
            {shown}
          </span>
          <span className="t-row whitespace-nowrap font-bold text-fg-2" aria-hidden>
            {unit}
          </span>
        </div>
        {note != null && <p className="t-label mt-1">{note}</p>}
      </div>
      <div className="flex flex-col gap-2.5 short:gap-2">
        <button type="button" aria-label={`More ${name.toLowerCase()}`} disabled={s.atMax} className={round} {...s.hold(1)}>
          <Plus className="size-7" strokeWidth={1.9} aria-hidden />
        </button>
        <button type="button" aria-label={`Less ${name.toLowerCase()}`} disabled={s.atMin} className={round} {...s.hold(-1)}>
          <Minus className="size-7" strokeWidth={1.9} aria-hidden />
        </button>
      </div>
    </div>
  );
}
