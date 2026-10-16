"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
} from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { Ring } from "@/components/ui/ring";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ entrance */

let playedOnce = false;

/**
 * Route-mount choreography plays once per app session (DESIGN §4): the first time the
 * screen mounts the cards rise in with a 40ms stagger; later visits render in place.
 */
export function useEntrance() {
  const [animate] = useState(() => !playedOnce);
  useEffect(() => {
    playedOnce = true;
  }, []);
  return (i: number): { className?: string; style?: CSSProperties } =>
    animate
      ? {
          className: "rise",
          style: { animationDelay: `${Math.min(i, 5) * 40}ms` },
        }
      : {};
}

/* ------------------------------------------------------------- widgets */

/** Small stat used inside cards: eyebrow, number, optional unit and caption. */
export function MiniStat({
  label,
  value,
  unit,
  caption,
  className,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  className?: string;
  tone?: "gold";
}) {
  return (
    <div className={cn("card-inset min-w-0 px-3 py-3", className)}>
      <p className="eyebrow truncate text-[10px]">{label}</p>
      <p
        className={cn(
          "num-md mt-1.5 truncate",
          tone === "gold" && "text-gold-300",
        )}
      >
        {value}
        {unit && <span className="unit">{unit}</span>}
      </p>
      {caption && (
        <div className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug text-fg-3">
          {caption}
        </div>
      )}
    </div>
  );
}

/** "↑ from 2.3" — direction only, never red: a rising soreness is information, not a failure. */
export function TrendNote({
  trend,
  prev,
  unit = "",
}: {
  trend: "up" | "down" | "flat" | null;
  prev: number | null;
  unit?: string;
}) {
  if (trend == null || prev == null) return <span>No prior week</span>;
  const Icon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-3.5" aria-hidden />
      <span>
        {trend === "flat"
          ? "Level with"
          : trend === "up"
            ? "Up from"
            : "Down from"}{" "}
        {prev}
        {unit}
      </span>
    </span>
  );
}

/** XS progress ring that becomes a gold check once complete. */
export function StatusMark({
  done,
  progress,
  label,
}: {
  done: boolean;
  progress: number;
  label: string;
}) {
  if (done)
    return (
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full border border-line-gold bg-gold-tint text-gold-300"
        role="img"
        aria-label={`${label}: done`}
      >
        <Check className="size-4" strokeWidth={2.5} />
      </span>
    );
  return (
    <Ring
      value={progress}
      size="xs"
      label={`${label}: ${Math.round(progress * 100)} percent`}
      plain
    />
  );
}

export function CardSkeleton({
  className,
  lines = 3,
  tall,
}: {
  className?: string;
  lines?: number;
  tall?: boolean;
}) {
  return (
    <div className={cn("card p-4 sm:p-5", className)} aria-hidden>
      <Skeleton className="h-3 w-28" />
      {tall && <Skeleton className="mt-4 h-24 w-full" />}
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className={cn("h-11", i % 2 ? "w-4/5" : "w-full")}
          />
        ))}
      </div>
    </div>
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
  const btn =
    "grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 transition-colors hover:text-fg disabled:text-fg-dis disabled:pointer-events-none press";
  return (
    <div className={cn("-mx-2 flex items-center", className)}>
      <button
        type="button"
        className={btn}
        onClick={onPrev}
        disabled={prevDisabled}
        aria-label={prevLabel}
      >
        <ChevronLeft className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        {label}
      </div>
      <button
        type="button"
        className={btn}
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
