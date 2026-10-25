"use client";

import Link from "next/link";
import { ChevronDown, ChevronLeft, Sparkle, X } from "lucide-react";
import type { ReactNode } from "react";
import { DatabaseBadge, LoggedBadge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/controls";
import { AiChip } from "@/components/ui/ai-chip";
import { cn } from "@/lib/cn";
import { MEALS, type Meal } from "@/lib/nutrition";
import { relativeDay, today } from "@/lib/dates";
import type { AIFoodItem } from "@/lib/ai/food-schemas";
import type { MacroSet } from "@/lib/food/types";

/* ------------------------------------------------------------ the AI mark */

/** The AI's mark (the coach's avatar / loader): the sparkle in --ai (docs/DESIGN-V3-SIMPLE.md §1.4.19). Pulses gently while `loading` (none under reduced motion). */
export function TempleMark({ size = 24, loading, className }: { size?: number; loading?: boolean; className?: string }) {
  return <Sparkle width={size} height={size} strokeWidth={1.9} className={cn("shrink-0 text-ai", loading && "motion-safe:animate-pulse", className)} aria-hidden />;
}

/** Round avatar holding the AI mark (assistant messages). */
export function CoachAvatar({ loading }: { loading?: boolean }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ai-soft" aria-hidden>
      <TempleMark size={16} loading={loading} />
    </span>
  );
}

/* ---------------------------------------------------------------- badges */

const CHIP = "t-cap inline-flex h-6 shrink-0 items-center gap-1 rounded-pill px-2 align-middle";

export function DevMockBadge({ className }: { className?: string }) {
  return (
    <span className={cn(CHIP, "border border-dashed border-ui-line text-fg-2", className)} title="Local development fixture — not a real AI answer">
      Dev mock
    </span>
  );
}

/** How sure the AI is, as 1–3 aegean pips (never colour alone: "Low" is written out, and the level is spoken). */
export function ConfidencePips({ confidence, className }: { confidence: number; className?: string }) {
  const pips = confidence >= 0.75 ? 3 : confidence >= 0.45 ? 2 : 1;
  const level = pips === 1 ? "low" : pips === 2 ? "medium" : "high";
  return (
    <span className={cn("t-cap inline-flex items-center gap-1", className)}>
      <span aria-hidden className="inline-flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2 w-[3px] rounded-xs", i <= pips ? "bg-ai" : "bg-ui-line")} />
        ))}
      </span>
      {pips === 1 && <span aria-hidden>Low</span>}
      <span className="sr-only">{level} confidence</span>
    </span>
  );
}

/** An AI estimate: `AI · ESTIMATE` with the confidence pips. */
export function AIEstimateTag({ confidence, className }: { confidence?: number | null; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 align-middle", className)}>
      <AiChip />
      {confidence != null && <ConfidencePips confidence={confidence} />}
    </span>
  );
}

/** Provenance for one AI item: database link, the user's saved food, what they typed, or an AI estimate with pips. */
export function ItemBadge({ item, className }: { item: Pick<AIFoodItem, "provenance" | "source" | "confidence">; className?: string }) {
  if (item.provenance === "database" && item.source) {
    return <DatabaseBadge name={`${item.source.name} ↗`} url={item.source.url} className={className} />;
  }
  if (item.provenance === "manual") return <LoggedBadge className={className} />;
  if (item.provenance === "saved") {
    return <span className={cn(CHIP, "bg-control text-fg", className)}>Your saved food</span>;
  }
  return <AIEstimateTag confidence={item.confidence} className={className} />;
}

/* ---------------------------------------------------------------- macros */

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtG = (n: number) => String(Math.round(n));

/** "52 g protein · 0 g carbs · 6 g fat": words, never colour dots. */
export function MacroTrio({ m, className, size = "sm" }: { m: MacroSet; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-1.5 tabular-nums", size === "md" ? "t-body" : "t-label", className)}
      aria-label={`Protein ${fmtG(m.protein)} grams, carbs ${fmtG(m.carbs)} grams, fat ${fmtG(m.fat)} grams`}
    >
      <span>{fmtG(m.protein)} g protein</span>
      <span aria-hidden>·</span>
      <span>{fmtG(m.carbs)} g carbs</span>
      <span aria-hidden>·</span>
      <span>{fmtG(m.fat)} g fat</span>
    </span>
  );
}

/* --------------------------------------------------------- focus screen */

/**
 * Full-screen focus layout for the scanner and chats (docs/DESIGN-V3-SIMPLE.md §3.4): on phones it
 * covers the page with its own header — a 44 px ✕ (or ‹) top-left, the title centred, one thing
 * on the right — and no tab bar (shell/nav `hidesCapsule`). Sheets and toasts still sit above it.
 * On tablet/desktop it sits in the page under a "‹ Food" header. `eyebrow` is ignored (V3 has none).
 */
export function FocusScreen({
  title,
  backHref = "/nutrition",
  backLabel = "Back to Food",
  close,
  right,
  children,
  footer,
  bodyRef,
  className,
  bodyClassName,
  style,
}: {
  title: string;
  /** @deprecated ignored */
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  /** ✕ instead of ‹ (the scanner). */
  close?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}) {
  const Icon = close ? X : ChevronLeft;
  return (
    <div className={cn("max-md:fixed max-md:inset-0 max-md:z-(--z-deck) max-md:flex max-md:flex-col max-md:bg-bg", className)} style={style}>
      {/* phone header */}
      <header className="z-10 shrink-0 bg-bg md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex h-14 items-center gap-2 px-gutter">
          <Link href={backHref} aria-label={backLabel} className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
            <Icon className="size-5" strokeWidth={1.9} />
          </Link>
          <h1 className="t-row min-w-0 flex-1 truncate text-center">{title}</h1>
          <div className="flex min-w-11 shrink-0 items-center justify-end gap-1">{right}</div>
        </div>
      </header>
      {/* tablet / desktop header */}
      <header className="mb-6 hidden items-end justify-between gap-4 md:flex">
        <div className="min-w-0">
          <Link href={backHref} className="press -ml-1.5 inline-flex h-11 items-center gap-0.5 pr-2 text-fg">
            <ChevronLeft className="size-5" strokeWidth={1.9} />
            <span className="t-body font-medium">Food</span>
          </Link>
          <h1 className="t-title mt-1">{title}</h1>
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
      <div ref={bodyRef} className={cn("max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain", bodyClassName)}>
        {children}
      </div>
      {footer}
    </div>
  );
}

/* ----------------------------------------------------- meal + date choice */

export function MealDatePicker({
  meal,
  onMeal,
  date,
  onDate,
  className,
  onInset,
}: {
  meal: Meal;
  onMeal: (m: Meal) => void;
  date: string;
  onDate: (d: string) => void;
  className?: string;
  /** Sitting on a raised (m2/m3) surface: use a darker well so the controls stay visible. */
  onInset?: boolean;
}) {
  const t = today();
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
        {MEALS.map((m) => (
          <Chip key={m.key} selected={meal === m.key} onClick={() => onMeal(m.key)}>
            {m.label}
          </Chip>
        ))}
      </div>
      <label
        className={cn(
          "relative flex h-12 items-center justify-between gap-3 rounded-field px-4 focus-within:ring-2 focus-within:ring-fg",
          onInset ? "bg-sheet-card" : "bg-control",
        )}
      >
        <span className="t-label">Date</span>
        <span className="t-body flex items-center gap-1.5 font-semibold">
          {relativeDay(date, t)}
          <ChevronDown className="size-4 text-fg-3" strokeWidth={2.2} aria-hidden />
        </span>
        <input
          type="date"
          value={date}
          max={t}
          onChange={(e) => e.target.value && onDate(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Date eaten"
        />
      </label>
    </div>
  );
}
