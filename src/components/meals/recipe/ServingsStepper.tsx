"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { canStep, clampServings, servingsNumber, stepServings } from "./servings";

/**
 * Servings on the kitchen ladder (¼ steps near one serving, then 2 → 4 → 6): − 1 + on one
 * --card-2 pill (docs/DESIGN-V3-SIMPLE.md §4.4.3), 44 px buttons (56 in cooking mode). The value
 * is announced.
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
  const btn = cn("press grid shrink-0 place-items-center rounded-full text-fg disabled:text-fg-3", size === "lg" ? "size-14" : "size-11");
  const go = (dir: 1 | -1) => {
    if (!canStep(v, dir)) return;
    onChange(stepServings(v, dir));
  };
  return (
    <div className={cn("flex shrink-0 items-center rounded-pill bg-control p-1", className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => go(-1)} disabled={!canStep(v, -1)} aria-label={`Fewer servings, now ${servingsNumber(v)}`}>
        <Minus className="size-5" strokeWidth={1.9} aria-hidden />
      </button>
      <div className="min-w-10 text-center" aria-live="polite" aria-atomic>
        <span className={cn("block leading-none tabular-nums", size === "lg" ? "t-num" : "t-row")}>{servingsNumber(v)}</span>
        <span className={cn("t-cap mt-1 block", !showUnit && "sr-only")}>{v > 1 ? "servings" : "serving"}</span>
      </div>
      <button type="button" className={btn} onClick={() => go(1)} disabled={!canStep(v, 1)} aria-label={`More servings, now ${servingsNumber(v)}`}>
        <Plus className="size-5" strokeWidth={1.9} aria-hidden />
      </button>
    </div>
  );
}
