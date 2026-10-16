"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const TONE: Record<string, string> = {
  gold: "var(--grad-progress)",
  marble: "var(--s-marble)",
  terracotta: "var(--s-terracotta)",
  porphyry: "var(--s-porphyry)",
  lapis: "var(--s-lapis)",
  verdigris: "var(--s-verdigris)",
  success: "var(--success)",
};

/** Linear progress. `fluted` = monument style with column fluting and a leading notch. */
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
      className={cn("relative overflow-hidden rounded-full bg-white/[.07]", fluted ? "h-2.5" : "h-1.5", className)}
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
          transition: "transform 600ms var(--ease-gold)",
        }}
      />
      {fluted && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "repeating-linear-gradient(90deg, transparent 0 7px, rgb(0 0 0 / .2) 7px 8px)" }}
          />
          {shown > 0.01 && shown < 0.995 && (
            <div
              className="absolute inset-y-0 w-1 rounded-full bg-gold-50"
              style={{ left: `calc(${shown * 100}% - 4px)`, transition: "left 700ms var(--ease-gold)" }}
            />
          )}
        </>
      )}
    </div>
  );
}
