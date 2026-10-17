"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Stepper } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

/** "↑ from 2.3" — direction only, never red: a rising soreness is information, not a failure. */
export function TrendNote({ trend, prev, unit = "" }: { trend: "up" | "down" | "flat" | null; prev: number | null; unit?: string }) {
  if (trend == null || prev == null) return <span>No prior week</span>;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-3.5" strokeWidth={1.6} aria-hidden />
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
  const btn = "press grid size-11 shrink-0 place-items-center rounded-field text-stone transition-colors hover:text-ivory disabled:pointer-events-none disabled:text-disabled";
  return (
    <div className={cn("-mx-2 flex items-center", className)}>
      <button type="button" className={btn} onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel}>
        <ChevronLeft className="size-5" strokeWidth={1.6} />
      </button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        {label}
      </div>
      <button type="button" className={btn} onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}>
        <ChevronRight className="size-5" strokeWidth={1.6} />
      </button>
    </div>
  );
}

/**
 * A stepper for a value that may be blank. While blank, the first tap on − or + sets
 * `start` (e.g. the sleep goal) instead of inventing a default; after that it is the
 * kit Stepper (hold to repeat). The blank state is its own pair of buttons so the kit
 * Stepper always mounts with its real value and never steps from a stale one.
 */
export function OptionalStepper({
  value,
  start,
  onChange,
  label,
  step,
  min,
  max,
  children,
}: {
  value: number | null;
  start: number;
  onChange: (v: number) => void;
  label: string;
  step: number;
  min: number;
  max: number;
  children: ReactNode;
}) {
  if (value != null)
    return (
      <Stepper label={label} value={value} step={step} min={min} max={max} onChange={onChange}>
        {children}
      </Stepper>
    );
  const btn = "press grid size-13 shrink-0 place-items-center rounded-field bg-m3 text-stone hover:text-ivory active:bg-m4";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} onClick={() => onChange(start)}>
        <Minus className="size-5" strokeWidth={1.6} />
      </button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        {children}
      </div>
      <button type="button" className={btn} aria-label={`Increase ${label}`} onClick={() => onChange(start)}>
        <Plus className="size-5" strokeWidth={1.6} />
      </button>
    </div>
  );
}
