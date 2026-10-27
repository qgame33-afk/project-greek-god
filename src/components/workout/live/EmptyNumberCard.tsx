"use client";

import { Minus, Plus } from "lucide-react";

/**
 * The NumberCard's shape for a value that has nothing to show yet (a first-ever lift with no
 * suggestion): instead of a giant dash, a calm "Tap to enter the weight" with the unit, the same
 * two round ± buttons (+ starts the value, − stays off), and a tap on the text opens the keypad.
 * Same height as the NumberCard, so the dock never jumps when a value arrives.
 */
export function EmptyNumberCard({ name, unit, onKeypad, onStart }: { name: string; unit: string; onKeypad: () => void; onStart: () => void }) {
  const round = "press grid size-[60px] shrink-0 place-items-center rounded-full bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-40 short:size-14";
  return (
    <div role="group" aria-label={`${name}, not set`} className="flex items-center justify-between gap-3 rounded-card bg-surface py-3.5 pl-[22px] pr-3.5 short:py-2.5 short:pl-5 short:pr-3">
      <button type="button" onClick={onKeypad} className="press-soft flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center rounded-tile text-left">
        <span className="t-row text-fg">Tap to enter the {name.toLowerCase()}</span>
        <span className="t-label">{unit}</span>
      </button>
      <div className="flex flex-col gap-2.5 short:gap-2">
        <button type="button" aria-label={`More ${name.toLowerCase()}`} onClick={onStart} className={round}>
          <Plus className="size-7" strokeWidth={1.9} aria-hidden />
        </button>
        <button type="button" aria-label={`Less ${name.toLowerCase()}`} disabled className={round}>
          <Minus className="size-7" strokeWidth={1.9} aria-hidden />
        </button>
      </div>
    </div>
  );
}
