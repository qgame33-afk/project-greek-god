"use client";

import Link from "next/link";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { DatabaseBadge, EstimateBadge, LoggedBadge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { MEALS, type Meal } from "@/lib/nutrition";
import { relativeDay, today } from "@/lib/dates";
import type { AIFoodItem } from "@/lib/ai/food-schemas";
import type { MacroSet } from "@/lib/food/types";

/* ------------------------------------------------------------ temple mark */

/** 24×24 temple mark (coach avatar / loader). Columns rise in sequence when `loading`. */
export function TempleMark({ size = 24, loading, className }: { size?: number; loading?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0 text-gold-400", className)} aria-hidden>
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
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-gold bg-s2" aria-hidden>
      <TempleMark size={18} loading={loading} />
    </span>
  );
}

/* ---------------------------------------------------------------- badges */

const badgeBase = "inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em]";

export function DevMockBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(badgeBase, "border border-dashed border-terracotta/60 text-terracotta", className)}
      title="Local development fixture — not a real AI answer"
    >
      Dev mock
    </span>
  );
}

/** Provenance for one AI item: database link, the user's saved food, or an estimate with pips. */
export function ItemBadge({ item, className }: { item: Pick<AIFoodItem, "provenance" | "source" | "confidence">; className?: string }) {
  if (item.provenance === "database" && item.source) {
    return <DatabaseBadge name={`${item.source.name} ↗`} url={item.source.url} className={className} />;
  }
  if (item.provenance === "manual") return <LoggedBadge className={className} />;
  if (item.provenance === "saved") {
    return (
      <span className={cn(badgeBase, "bg-white/8 text-fg", className)}>
        <span className="size-1.5 rounded-full bg-marble" aria-hidden />
        Your saved food
      </span>
    );
  }
  return <EstimateBadge confidence={item.confidence} className={className} />;
}

/* ---------------------------------------------------------------- macros */

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtG = (n: number) => String(Math.round(n));

const DOT: Record<"protein" | "carbs" | "fat", string> = { protein: "bg-marble", carbs: "bg-terracotta", fat: "bg-porphyry" };

/** "P 52 · C 0 · F 6" with series dots. */
export function MacroTrio({ m, className, size = "sm" }: { m: MacroSet; className?: string; size?: "sm" | "md" }) {
  const cell = (k: "protein" | "carbs" | "fat", label: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-full", DOT[k])} aria-hidden />
      <span className="text-fg-3">{label}</span>
      <span className={cn("num text-fg", size === "md" ? "text-[16px]" : "text-[14px]")}>{fmtG(m[k])}</span>
    </span>
  );
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-semibold", className)}
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
 * Full-screen "push" layout for the scanner and chats: on phones it covers the tab bar
 * with its own back header (safe areas included); on tablet/desktop it sits in the page.
 */
export function FocusScreen({
  title,
  eyebrow,
  backHref = "/nutrition",
  backLabel = "Back to Nutrition",
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
    <div className={cn("max-md:fixed max-md:inset-0 max-md:z-[32] max-md:flex max-md:flex-col max-md:bg-bg", className)} style={style}>
      {/* phone header */}
      <header className="chrome z-10 shrink-0 border-b border-line-hair md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex h-[52px] items-center gap-1 px-1.5">
          <Link href={backHref} aria-label={backLabel} className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
            <ChevronLeft className="size-6" />
          </Link>
          <h1 className="t-h2 min-w-0 flex-1 truncate text-[17px]">{title}</h1>
          {right && <div className="flex shrink-0 items-center gap-1 pr-1">{right}</div>}
        </div>
      </header>
      {/* tablet / desktop header */}
      <header className="mb-6 hidden items-end justify-between gap-4 md:flex">
        <div className="min-w-0">
          <Link href={backHref} className="-ml-1 mb-2 inline-flex h-8 items-center gap-1 text-[13px] font-bold text-fg-3 hover:text-fg-2">
            <ChevronLeft className="size-4" />
            Nutrition
          </Link>
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="t-title">{title}</h1>
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
  /** Sitting on a surface-3 inset card: use a darker well so the controls stay visible. */
  onInset?: boolean;
}) {
  const t = today();
  return (
    <div className={cn("space-y-3", className)}>
      <Segmented<Meal>
        ariaLabel="Meal"
        value={meal}
        onChange={onMeal}
        className={onInset ? "bg-s1" : undefined}
        options={MEALS.map((m) => ({ value: m.key, label: m.label }))}
      />
      <label
        className={cn(
          "relative flex h-11 items-center justify-between gap-3 rounded-[12px] px-3.5 focus-within:outline-2 focus-within:outline-gold-400",
          onInset ? "bg-s1" : "bg-s3",
        )}
      >
        <span className="text-[13px] font-semibold text-fg-2">Date</span>
        <span className="flex items-center gap-1.5 text-[15px] font-bold text-fg">
          {relativeDay(date, t)}
          <ChevronDown className="size-4 text-fg-3" aria-hidden />
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
