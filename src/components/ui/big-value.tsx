"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useStepper } from "./repeat";

/**
 * BigValue (docs/DESIGN-V3-SIMPLE.md §1.4.15): a centred `t-big` number with its unit and a
 * caption, and a StepperPair of two 64 px secondary buttons ("−0.1" / "+0.1", "−15 min" /
 * "+15 min"). The number is a `spinbutton` (arrow keys and VoiceOver step it, `aria-valuetext`
 * carries the unit); tapping it opens the keypad (`onKeypad`). Used by the weigh-in and
 * check-in sheets and onboarding.
 *
 *   <BigValue name="Weight" value={164.8} unit="lb" spokenUnit="pounds" step={0.1} min={50} max={600}
 *     format={(v) => v.toFixed(1)} caption="Last time 164.7 lb · tap the number to type it"
 *     onChange={setW} onKeypad={openKeypad} />
 */
export interface BigValueProps {
  name: string;
  value: number;
  onChange: (v: number) => void;
  unit?: ReactNode;
  /** Spoken unit ("pounds"); defaults to `unit` when it is a string. */
  spokenUnit?: string;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** A spoken value when the shown one needs words ("7 hours 15 minutes"). */
  valueText?: string;
  caption?: ReactNode;
  /** The stepper labels; default "−{step}" / "+{step}". */
  minusLabel?: string;
  plusLabel?: string;
  onKeypad?: () => void;
  className?: string;
}

export function BigValue({ name, value, onChange, unit, spokenUnit, step = 1, min = 0, max = 9999, format, valueText, caption, minusLabel, plusLabel, onKeypad, className }: BigValueProps) {
  const s = useStepper({ value, onChange, step, min, max, onKeypad });
  const shown = format ? format(value) : String(value);
  const spokenU = spokenUnit ?? (typeof unit === "string" ? unit : "");
  const spoken = valueText ?? (spokenU ? `${shown} ${spokenU}` : shown);
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
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
        className={cn("rounded-tile px-2 outline-offset-4", onKeypad && "cursor-pointer")}
      >
        <span aria-hidden className="t-big">
          {shown}
          {unit != null && <span className="unit">{unit}</span>}
        </span>
      </div>
      {caption != null && <p className="t-label mt-3 max-w-[32ch]">{caption}</p>}
      <StepperPair
        className="mt-6 w-full"
        minus={{ label: minusLabel ?? `−${step}`, ariaLabel: `Less, ${minusLabel ?? `minus ${step}`}`, disabled: s.atMin, hold: s.hold(-1) }}
        plus={{ label: plusLabel ?? `+${step}`, ariaLabel: `More, ${plusLabel ?? `plus ${step}`}`, disabled: s.atMax, hold: s.hold(1) }}
      />
    </div>
  );
}

type Hold = ReturnType<ReturnType<typeof useStepper>["hold"]>;

/** Two 64 px secondary buttons side by side. Pass `onClick`, or `hold` (from useStepper) to repeat. */
export function StepperPair({
  minus,
  plus,
  className,
}: {
  minus: { label: string; ariaLabel?: string; onClick?: () => void; disabled?: boolean; hold?: Hold };
  plus: { label: string; ariaLabel?: string; onClick?: () => void; disabled?: boolean; hold?: Hold };
  className?: string;
}) {
  const btn = "press t-button-gym h-16 flex-1 rounded-pill bg-control text-fg tabular-nums hover:bg-card-3 active:bg-card-3 disabled:opacity-40";
  return (
    <div className={cn("flex gap-3", className)}>
      {[minus, plus].map((b, i) => (
        <button key={i} type="button" aria-label={b.ariaLabel} disabled={b.disabled} onClick={b.hold ? undefined : b.onClick} className={btn} {...(b.hold ?? {})}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
