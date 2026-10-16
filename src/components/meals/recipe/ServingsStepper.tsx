"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { canStep, clampServings, servingsNumber, stepServings } from "./servings";

/**
 * Servings on the kitchen ladder (¼ steps near one serving, then 2 → 4 → 6). 52px buttons; the
 * value is announced.
 */
export function ServingsStepper({
  value,
  onChange,
  className,
  size = "md",
  label = "Servings",
  showUnit = true,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  size?: "md" | "lg";
  label?: string;
  /** "servings" under the number (off where the label already says it). */
  showUnit?: boolean;
}) {
  const v = clampServings(value);
  const btn = cn(
    "press grid shrink-0 place-items-center rounded-[14px] border border-line-strong bg-s3 text-fg hover:bg-s4 active:bg-s4 disabled:border-line disabled:text-fg-dis",
    size === "lg" ? "size-14" : "size-[52px]",
  );
  const go = (dir: 1 | -1) => {
    if (!canStep(v, dir)) return;
    haptic(8);
    onChange(stepServings(v, dir));
  };
  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => go(-1)} disabled={!canStep(v, -1)} aria-label={`Fewer servings, now ${servingsNumber(v)}`}>
        <Minus className="size-5" aria-hidden />
      </button>
      <div className={cn("text-center", showUnit ? "min-w-[72px]" : "min-w-[60px]")} aria-live="polite" aria-atomic>
        <span className={cn("num block font-semibold leading-none text-fg", size === "lg" ? "text-[34px]" : showUnit ? "text-[28px]" : "text-[32px]")}>{servingsNumber(v)}</span>
        <span className={cn("mt-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-fg-3", !showUnit && "sr-only")}>{v > 1 ? "servings" : "serving"}</span>
      </div>
      <button type="button" className={btn} onClick={() => go(1)} disabled={!canStep(v, 1)} aria-label={`More servings, now ${servingsNumber(v)}`}>
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}
