"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/** "↑ from 2.3" — direction only, never red: a rising soreness is information, not a failure. */
export function TrendNote({ trend, prev, unit = "" }: { trend: "up" | "down" | "flat" | null; prev: number | null; unit?: string }) {
  if (trend == null || prev == null) return <span>No prior week</span>;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-4" strokeWidth={2.2} aria-hidden />
      <span>
        {trend === "flat" ? "Level with" : trend === "up" ? "Up from" : "Down from"} {prev}
        {unit}
      </span>
    </span>
  );
}

/** Previous / next arrows with 44px targets around a centred label. */
export function Switcher({
  label,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  prevLabel,
  nextLabel,
  className,
}: {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const btn = "press grid size-11 shrink-0 place-items-center rounded-full text-fg transition-colors disabled:pointer-events-none disabled:text-fg-3";
  return (
    <div className={cn("-mx-2 flex items-center", className)}>
      <button type="button" className={btn} onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel}>
        <ChevronLeft className="size-5" strokeWidth={1.9} />
      </button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        {label}
      </div>
      <button type="button" className={btn} onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}>
        <ChevronRight className="size-5" strokeWidth={1.9} />
      </button>
    </div>
  );
}
