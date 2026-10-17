"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The one meter (docs/DESIGN-V2.md §2.4: macros use one visual language — no rings, no dot chips).
 * A horizontal track with the logged part filled and, optionally, a hatched extension for what is
 * still planned (PLAN). The fill Gilds from the left on first show (scaleX, 900 ms ease-gold) and
 * moves at once on later changes; reduced motion shows the final state.
 *
 * Tone: `earned` stays ivory until the target is reached, then turns leaf (protein, the lever);
 * `kcal` ivory; `carbs` / `fat` / `water` their series colours.
 *
 *   <Meter value={121} target={185} planned={64} tone="earned" label="Protein, 121 of 185 grams" />
 */
export type MeterTone = "earned" | "kcal" | "carbs" | "fat" | "water" | "ivory";

const FILL: Record<Exclude<MeterTone, "earned">, string> = {
  kcal: "var(--series-kcal)",
  ivory: "var(--ivory)",
  carbs: "var(--series-carbs)",
  fat: "var(--series-fat)",
  water: "var(--series-water)",
};

export interface MeterProps {
  value: number;
  target: number;
  /** Still planned (not yet logged): drawn hatched after the fill. */
  planned?: number;
  tone?: MeterTone;
  /** Accessible sentence, e.g. "Protein, 121 of 185 grams, 64 more planned". */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHT = { sm: "h-1", md: "h-2", lg: "h-3" } as const;

export function Meter({ value, target, planned = 0, tone = "earned", label, size = "md", className }: MeterProps) {
  const t = target > 0 ? target : 1;
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const p = Number.isFinite(planned) ? Math.max(0, planned) : 0;
  const filled = Math.min(1, v / t);
  const plannedFrac = Math.max(0, Math.min(1, (v + p) / t) - filled);
  const over = v > t;
  const reached = v >= t && target > 0;
  const color = tone === "earned" ? (reached ? "var(--leaf-300)" : "var(--ivory)") : FILL[tone];

  // Empty on the first frame, then Gild to the value; later changes move at once.
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(filled), first.current ? 30 : 0);
    first.current = false;
    return () => window.clearTimeout(id);
  }, [filled]);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-valuenow={Math.round(v)}
      className={cn("relative overflow-hidden rounded-full bg-vein-2", HEIGHT[size], className)}
    >
      {plannedFrac > 0 && (
        <div
          aria-hidden
          className="hatch absolute inset-y-0 rounded-r-full opacity-90"
          style={{ left: `${filled * 100}%`, width: `${plannedFrac * 100}%` }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 origin-left rounded-full"
        style={{ background: color, transform: `scaleX(${shown})`, transition: "transform var(--dur-gild) var(--ease-gold), background-color var(--dur-base) var(--ease-out)" }}
      />
      {over && <div aria-hidden className="absolute inset-y-0 right-0 w-[3px] bg-night/70" />}
    </div>
  );
}
