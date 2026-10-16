"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SuggestedBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { shortDate, type ISODate } from "@/lib/dates";
import type { Priority } from "@/lib/reviews/compute";

/** "Sep 11 – Sep 30" */
export function rangeLabel(from: ISODate, to: ISODate) {
  return from === to
    ? shortDate(from, to)
    : `${shortDate(from, to)} – ${shortDate(to, to)}`;
}

/** Stable JSON (sorted keys) so a snapshot from jsonb compares equal to fresh stats. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** True after `ms` — skeletons only appear for waits long enough to notice. */
export function useDelayed(ms = 150) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return on;
}

/** Stat tile used inside review cards: eyebrow, number, optional unit, comparison and caption. */
export function Metric({
  label,
  value,
  unit,
  compare,
  caption,
  tone = "neutral",
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  compare?: ReactNode;
  caption?: ReactNode;
  tone?: "neutral" | "good";
  size?: "lg" | "md";
  className?: string;
}) {
  const missing = value == null || value === "—";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow truncate">{label}</p>
      <p
        className={cn(
          "mt-2 truncate",
          size === "lg" ? "num-lg" : "num-md",
          missing && "text-fg-3",
        )}
      >
        {missing ? "—" : value}
        {!missing && unit && <span className="unit">{unit}</span>}
      </p>
      {compare != null && (
        <p
          className={cn(
            "mt-1.5 truncate text-[12px] font-semibold",
            tone === "good" ? "text-success" : "text-fg-2",
          )}
        >
          {compare}
        </p>
      )}
      {caption != null && (
        <p className="mt-1 text-[12px] leading-snug font-medium text-fg-3">
          {caption}
        </p>
      )}
    </div>
  );
}

export function SubHead({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="review-subhead mb-2.5 mt-6 flex items-baseline justify-between gap-3 border-t border-line-hair pt-4">
      <h3 className="eyebrow shrink-0">{children}</h3>
      {aside && (
        <span className="min-w-0 truncate text-right text-[12px] font-medium text-fg-3">
          {aside}
        </span>
      )}
    </div>
  );
}

/** A titled block inside a review card. Printing keeps each block on one page. */
export function Sub({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="review-sub">
      <SubHead aside={aside}>{title}</SubHead>
      {children}
    </section>
  );
}

/** 1–5 average as five segments (neutral marble — high soreness is information, not a failure). */
export function FiveScale({
  label,
  value,
  low,
  high,
}: {
  label: string;
  value: number | null;
  low: string;
  high: string;
}) {
  const v = value ?? 0;
  return (
    <div className="grid grid-cols-[minmax(84px,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 py-1.5">
      <span className="text-[13px] font-semibold text-fg-2">{label}</span>
      <span
        className="flex gap-1"
        role="img"
        aria-label={
          value == null
            ? `${label}: not logged`
            : `${label} ${value} of 5, ${low} to ${high}`
        }
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, v - (i - 1)));
          return (
            <span
              key={i}
              className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[.07]"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-marble/80"
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </span>
      <span
        className={cn(
          "num-xs w-12 text-right",
          value == null ? "text-fg-3" : "text-fg",
        )}
      >
        {value == null ? "—" : value.toFixed(1)}
      </span>
    </div>
  );
}

export function EvidenceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-[8px] border border-line bg-s3/70 px-2 text-[12px] font-semibold text-fg-2 tabular-nums">
      {children}
    </span>
  );
}

/** A SUGGESTED next-month adjustment (lapis, never gold, never applied automatically). */
export function PriorityCard({ p, index }: { p: Priority; index: number }) {
  return (
    <article className="relative flex h-full flex-col rounded-[20px] border border-lapis-line bg-[linear-gradient(180deg,rgb(111_163_236/.07),rgb(111_163_236/.02))] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <SuggestedBadge />
        <span className="num-xs text-lapis-text/70" aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <h3 className="t-h3 mt-3">{p.title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">{p.detail}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.evidence.map((e) => (
          <EvidenceChip key={e}>{e}</EvidenceChip>
        ))}
      </div>
      {p.action && (
        <Link
          href={p.action.href}
          data-print="hide"
          className="mt-auto -mb-2 inline-flex h-11 items-center gap-1 self-start pt-3 text-[13px] font-bold text-lapis-text hover:text-[#b3cff5]"
        >
          {p.action.label}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </article>
  );
}
