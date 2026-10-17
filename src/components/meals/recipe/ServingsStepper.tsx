"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { canStep, clampServings, servingsNumber, stepServings } from "./servings";

/**
 * Servings on the kitchen ladder (¼ steps near one serving, then 2 → 4 → 6). 44 px round
 * buttons (56 in cooking mode); the value is announced.
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
    "press grid shrink-0 place-items-center rounded-full bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-m4 active:bg-m4 disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein)]",
    size === "lg" ? "size-14" : "size-11",
  );
  const go = (dir: 1 | -1) => {
    if (!canStep(v, dir)) return;
    onChange(stepServings(v, dir));
  };
  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => go(-1)} disabled={!canStep(v, -1)} aria-label={`Fewer servings, now ${servingsNumber(v)}`}>
        <Minus className="size-5" strokeWidth={1.6} aria-hidden />
      </button>
      <div className={cn("text-center", showUnit ? "min-w-[4.5rem]" : "min-w-[3.5rem]")} aria-live="polite" aria-atomic>
        <span className={cn("block leading-none text-ivory", size === "lg" ? "t-num-l" : "t-num-m")}>{servingsNumber(v)}</span>
        <span className={cn("t-eyebrow mt-1 block", !showUnit && "sr-only")}>{v > 1 ? "servings" : "serving"}</span>
      </div>
      <button type="button" className={btn} onClick={() => go(1)} disabled={!canStep(v, 1)} aria-label={`More servings, now ${servingsNumber(v)}`}>
        <Plus className="size-5" strokeWidth={1.6} aria-hidden />
      </button>
    </div>
  );
}
