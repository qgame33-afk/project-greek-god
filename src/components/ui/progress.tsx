"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const TONE: Record<string, string> = {
  gold: "var(--leaf-h)",
  marble: "var(--ivory)",
  terracotta: "var(--series-carbs)",
  porphyry: "var(--series-fat)",
  lapis: "var(--series-water)",
  verdigris: "var(--series-water)",
  success: "var(--leaf-300)",
};

/**
 * Linear progress (legacy). `fluted` = monument style with column fluting and a leading notch.
 * New screens use <Meter> (ui/meter.tsx), which adds the hatched planned extension.
 */
export function Bar({
  value,
  tone = "gold",
  fluted,
  className,
  label,
  delay = 0,
}: {
  value: number;
  tone?: keyof typeof TONE;
  fluted?: boolean;
  className?: string;
  label?: string;
  delay?: number;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [shown, setShown] = useState(0);
  const filled = useRef(false);
  useEffect(() => {
    // the stagger delay is for the first fill only; later changes (a new log) move at once
    const t = window.setTimeout(() => setShown(v), (filled.current ? 0 : delay) + 30);
    filled.current = true;
    return () => window.clearTimeout(t);
  }, [v, delay]);
  return (
    <div
      className={cn("relative overflow-hidden rounded-full bg-vein-2", fluted ? "h-2.5" : "h-1.5", className)}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: TONE[tone],
          transform: `translateX(${(shown - 1) * 100}%)`,
          transition: "transform var(--dur-gild) var(--ease-gold)",
        }}
      />
      {fluted && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "repeating-linear-gradient(90deg, transparent 0 7px, rgb(0 0 0 / .22) 7px 8px)" }}
          />
          {/* the gold-50 leading edge rides on the same translate as the fill (no `left` animation) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              transform: `translateX(${(shown - 1) * 100}%)`,
              transition: "transform var(--dur-gild) var(--ease-gold), opacity 200ms var(--ease-out)",
              opacity: shown > 0.01 && shown < 0.995 ? 1 : 0,
            }}
          >
            <div className="absolute inset-y-0 right-0 w-1 rounded-full bg-leaf-100" />
          </div>
        </>
      )}
    </div>
  );
}
