"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The old Olympus meter (docs/DESIGN-V3-SIMPLE.md §1.7), drawn as the V3 Bar: --text fill on
 * --track, the still-planned part as a --band segment after it. No macro colours, no hatching.
 * Screens move to <Bar>; this file goes at integration (§6.7).
 */
export type MeterTone = "earned" | "kcal" | "carbs" | "fat" | "water" | "ivory";

export interface MeterProps {
  value: number;
  target: number;
  /** Still planned (not yet logged): drawn after the fill. */
  planned?: number;
  /** @deprecated ignored */
  tone?: MeterTone;
  /** Accessible sentence, e.g. "Protein, 121 of 185 grams, 64 more planned". */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHT = { sm: "h-1", md: "h-2", lg: "h-2" } as const;

export function Meter({ value, target, planned = 0, label, size = "md", className }: MeterProps) {
  const t = target > 0 ? target : 1;
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const p = Number.isFinite(planned) ? Math.max(0, planned) : 0;
  const filled = Math.min(1, v / t);
  const plannedFrac = Math.max(0, Math.min(1, (v + p) / t) - filled);
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(filled), first.current ? 30 : 0);
    first.current = false;
    return () => window.clearTimeout(id);
  }, [filled]);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(target)} aria-valuenow={Math.round(v)} className={cn("relative overflow-hidden rounded-full bg-track", HEIGHT[size], className)}>
      {plannedFrac > 0 && <div aria-hidden className="absolute inset-y-0 bg-band" style={{ left: `${filled * 100}%`, width: `${plannedFrac * 100}%` }} />}
      <div aria-hidden className="absolute inset-0 origin-left rounded-full bg-fg" style={{ transform: `scaleX(${shown})`, transition: "transform var(--dur-ring) var(--ease-out)" }} />
    </div>
  );
}
