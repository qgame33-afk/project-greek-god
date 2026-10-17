"use client";

import Link from "next/link";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { DatabaseBadge, LoggedBadge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/controls";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { MEALS, type Meal } from "@/lib/nutrition";
import { relativeDay, today } from "@/lib/dates";
import type { AIFoodItem } from "@/lib/ai/food-schemas";
import type { MacroSet } from "@/lib/food/types";

/* ------------------------------------------------------------ temple mark */

/** 24×24 temple mark (the food coach's avatar / loader), in aegean: it stands for the AI. Columns rise in sequence when `loading`. */
export function TempleMark({ size = 24, loading, className }: { size?: number; loading?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0 text-aegean", className)} aria-hidden>
      <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9 12 3l10 6" />
        <path d="M3 11h18" />
        <path d="M2 21h20" />
        {[6, 12, 18].map((x, i) => (
          <path
            key={x}
            d={`M${x} 13v6`}
            className={loading ? "temple-col" : undefined}
            style={loading ? { animationDelay: `${i * 90}ms`, transformOrigin: `${x}px 19px`, transformBox: "view-box" } : undefined}
          />
        ))}
      </g>
      {loading && (
        <style>{`@keyframes temple-rise{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}.temple-col{animation:temple-rise 900ms var(--ease-out) infinite}@media (prefers-reduced-motion:reduce){.temple-col{animation:none}}`}</style>
      )}
    </svg>
  );
}

/** Round avatar holding the temple mark (assistant messages). */
export function CoachAvatar({ loading }: { loading?: boolean }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-aegean-line bg-m2" aria-hidden>
      <TempleMark size={18} loading={loading} />
    </span>
  );
}

/* ---------------------------------------------------------------- badges */

const CHIP = "t-tag inline-flex h-5 shrink-0 items-center gap-1 rounded-tag px-1.5 align-middle";

export function DevMockBadge({ className }: { className?: string }) {
  return (
    <span className={cn(CHIP, "border border-dashed border-ui-line text-stone", className)} title="Local development fixture — not a real AI answer">
      Dev mock
    </span>
  );
}

/** How sure the AI is, as 1–3 aegean pips (never colour alone: "Low" is written out, and the level is spoken). */
export function ConfidencePips({ confidence, className }: { confidence: number; className?: string }) {
  const pips = confidence >= 0.75 ? 3 : confidence >= 0.45 ? 2 : 1;
  const level = pips === 1 ? "low" : pips === 2 ? "medium" : "high";
  return (
    <span className={cn("t-tag inline-flex items-center gap-1 text-stone", className)}>
      <span aria-hidden className="inline-flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2 w-[3px] rounded-xs", i <= pips ? "bg-aegean" : "bg-vein-3")} />
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
      <Tag kind="AI" detail="estimate" />
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
    return <span className={cn(CHIP, "border border-vein-3 text-ivory", className)}>Your saved food</span>;
  }
  return <AIEstimateTag confidence={item.confidence} className={className} />;
}

/* ---------------------------------------------------------------- macros */

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtG = (n: number) => String(Math.round(n));

const DOT: Record<"protein" | "carbs" | "fat", string> = { protein: "bg-ivory", carbs: "bg-carbs", fat: "bg-fat" };

/** "P 52 · C 0 · F 6" with series dots. */
export function MacroTrio({ m, className, size = "sm" }: { m: MacroSet; className?: string; size?: "sm" | "md" }) {
  const cell = (k: "protein" | "carbs" | "fat", label: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-full", DOT[k])} aria-hidden />
      <span className="text-ash">{label}</span>
      <span className="tnum font-semibold text-ivory">{fmtG(m[k])}</span>
    </span>
  );
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1", size === "md" ? "t-callout" : "t-meta", className)}
      aria-label={`Protein ${fmtG(m.protein)} grams, carbs ${fmtG(m.carbs)} grams, fat ${fmtG(m.fat)} grams`}
    >
      {cell("protein", "P")}
      {cell("carbs", "C")}
      {cell("fat", "F")}
    </span>
  );
}

/* --------------------------------------------------------- focus screen */

/**
 * Full-screen "push" layout for the scanner and chats: on phones it covers the top bar with its
 * own back header (safe areas included); the capsule and the Offering button hide on these
 * routes (shell/nav `hidesCapsule`), so nothing floats over the bottom controls. Sheets and
 * toasts still sit above it. On tablet/desktop it sits in the page.
 */
export function FocusScreen({
  title,
  eyebrow,
  backHref = "/nutrition",
  backLabel = "Back to Fuel",
  right,
  children,
  footer,
  bodyRef,
  className,
  bodyClassName,
  style,
}: {
  title: string;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("max-md:fixed max-md:inset-0 max-md:z-(--z-deck) max-md:flex max-md:flex-col max-md:bg-night", className)} style={style}>
      {/* phone header */}
      <header className="chrome z-10 shrink-0 border-b border-vein md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex h-[3.25rem] items-center gap-1 px-1.5">
          <Link href={backHref} aria-label={backLabel} className="press grid size-11 place-items-center rounded-field text-stone hover:text-ivory">
            <ChevronLeft className="size-6" strokeWidth={1.6} />
          </Link>
          <h1 className="t-title-3 min-w-0 flex-1 truncate text-ivory">{title}</h1>
          {right && <div className="flex shrink-0 items-center gap-1 pr-1">{right}</div>}
        </div>
      </header>
      {/* tablet / desktop header */}
      <header className="mb-6 hidden items-end justify-between gap-4 md:flex">
        <div className="min-w-0">
          <Link href={backHref} className="press t-callout -ml-2 mb-1 inline-flex h-11 items-center gap-1 rounded-field pr-3 font-semibold text-stone hover:text-ivory">
            <ChevronLeft className="size-5" strokeWidth={1.6} />
            Fuel
          </Link>
          {eyebrow && <p className="t-eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="t-title-1 text-ivory">{title}</h1>
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
      <Segmented<Meal> ariaLabel="Meal" value={meal} onChange={onMeal} className={onInset ? "bg-m1" : undefined} options={MEALS.map((m) => ({ value: m.key, label: m.label }))} />
      <label
        className={cn(
          "relative flex h-11 items-center justify-between gap-3 rounded-field px-3.5 shadow-[inset_0_0_0_1px_var(--vein)] focus-within:outline-2 focus-within:outline-leaf-300",
          onInset ? "bg-m1" : "bg-m3",
        )}
      >
        <span className="t-meta font-semibold text-stone">Date</span>
        <span className="t-callout flex items-center gap-1.5 font-semibold text-ivory">
          {relativeDay(date, t)}
          <ChevronDown className="size-4 text-ash" strokeWidth={1.6} aria-hidden />
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
