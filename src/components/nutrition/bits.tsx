"use client";

import { BadgeCheck, Star } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { DatabaseBadge, EstimateBadge, SourceBadge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { MEALS, type Macros, type Meal } from "@/lib/nutrition";
import { formatInt } from "@/lib/units";
import { g } from "@/lib/nutrition-ui/format";
import { provenanceOf, type ProvenanceInput } from "@/lib/nutrition-ui/provenance";

/**
 * ESTIMATE / database / SOURCE badge for a food, or nothing for plain logs.
 * `still` renders without links (for use inside a tappable row).
 */
export function ProvenanceBadge({ item, full, still, className }: { item: ProvenanceInput; full?: boolean; still?: boolean; className?: string }) {
  const p = provenanceOf(item);
  if (!p) return null;
  if (p.kind === "estimate") return <EstimateBadge className={className} />;
  if (p.kind === "source") {
    if (!still) return <SourceBadge name={p.name} url={p.url} className={className} />;
    return (
      <span className={cn(BADGE, "max-w-full border border-line-gold bg-gold-tint text-gold-300", className)}>
        <BadgeCheck className="size-3" aria-hidden />
        <span className="truncate">Source · {p.name}</span>
      </span>
    );
  }
  return <DatabaseBadge name={full ? p.name : p.short} url={still ? null : p.url} className={className} />;
}

const BADGE = "inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em]";

/**
 * Row badge that fits the space: the full ESTIMATE / USDA / SOURCE badge when the card is
 * wide enough, a 20px mark with the same colour and an accessible name on narrow phones
 * (so "amount · time" never gets squeezed and no label is clipped mid-word).
 * Needs an `@container` ancestor (the meal card).
 */
export function RowProvenance({ item }: { item: ProvenanceInput }) {
  const p = provenanceOf(item);
  if (!p) return null;
  const label = p.kind === "estimate" ? "Estimate" : p.kind === "source" ? `Source: ${p.name}` : `Database: ${p.name}`;
  const mark =
    p.kind === "estimate" ? (
      <span className="border border-dashed border-[rgb(163_169_180/.5)] text-fg-2">≈</span>
    ) : p.kind === "source" ? (
      <span className="border border-line-gold bg-gold-tint text-gold-300">
        <BadgeCheck className="size-3" aria-hidden />
      </span>
    ) : (
      <span className="border border-verdigris/40 bg-verdigris/10 text-verdigris">
        <BadgeCheck className="size-3" aria-hidden />
      </span>
    );
  return (
    <>
      <ProvenanceBadge item={item} still className="hidden min-w-0 shrink overflow-hidden @[21rem]:inline-flex" />
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-flex shrink-0 @[21rem]:hidden [&>span]:grid [&>span]:size-5 [&>span]:place-items-center [&>span]:rounded-[6px] [&>span]:text-[12px] [&>span]:font-bold"
      >
        {mark}
      </span>
    </>
  );
}

/** Breakfast / Lunch / Dinner / Snacks selector (chips, 44px targets). */
export function MealChips({ value, onChange, className }: { value: Meal; onChange: (m: Meal) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Meal" className={cn("grid grid-cols-4 gap-1.5", className)}>
      {MEALS.map((m) => {
        const on = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.key)}
            className={cn(
              "press h-11 min-w-0 truncate rounded-[12px] border px-1 text-[13px] font-semibold transition-colors",
              on ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

const SERIES = {
  protein: "bg-marble",
  carbs: "bg-terracotta",
  fat: "bg-porphyry",
} as const;

/** Live macro grid: KCAL large, then P / C / F with series dots. */
export function MacroGrid({ macros, className, dim }: { macros: Macros; className?: string; dim?: boolean }) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)} aria-live="polite">
      <div className="card-inset flex flex-col justify-between px-3 py-2.5">
        <span className="eyebrow">Kcal</span>
        <span className={cn("num mt-1 text-[24px] font-semibold leading-none", dim && "text-fg-3")}>{formatInt(macros.calories)}</span>
      </div>
      {(["protein", "carbs", "fat"] as const).map((k) => (
        <div key={k} className="card-inset flex flex-col justify-between px-3 py-2.5">
          <span className="eyebrow flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", SERIES[k])} aria-hidden />
            {k === "protein" ? "Prot" : k === "carbs" ? "Carb" : "Fat"}
          </span>
          <span className={cn("num mt-1 text-[24px] font-semibold leading-none", dim && "text-fg-3")}>
            {g(macros[k])}
            <span className="unit !text-[12px]">g</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A save error inside a sheet. It scrolls itself into view, so its Retry never sits hidden
 * under the sticky footer of a long form.
 */
export function SheetError({ children, onRetry, className }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [children]);
  return (
    <div ref={ref} className={className}>
      <ErrorNote onRetry={onRetry}>{children}</ErrorNote>
    </div>
  );
}

/** Move focus (and the scroll) to the first invalid field after a rejected submit. */
export function focusFirstInvalid(root: HTMLElement | null) {
  window.requestAnimationFrame(() => root?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus({ preventScroll: false }));
}

/** Sticky action footer that lives inside a Sheet's scrolling body. */
export function StickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(var(--sheet-pb)*-1)] z-10 -mx-5 mb-[calc(var(--sheet-pb)*-1)] mt-5 border-t border-line-hair bg-s2 px-5 pt-3 pb-[calc(16px+var(--safe-bottom))] lg:pb-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StarButton({ on, onToggle, label, className }: { on: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={cn("press grid size-11 shrink-0 place-items-center rounded-[12px] transition-colors", on ? "text-gold-300" : "text-fg-3 hover:text-fg-2", className)}
    >
      <Star className="size-[19px]" fill={on ? "currentColor" : "none"} strokeWidth={1.75} />
    </button>
  );
}

/** A section label row used inside sheets. */
export function SubLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex min-h-6 items-center justify-between gap-3", className)}>
      <p className="eyebrow">{children}</p>
      {action}
    </div>
  );
}

/** Tiny inline note (soft warnings are text-2, never red). */
export function SoftNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-[10px] border border-line bg-white/[.03] px-3 py-2 text-[13px] leading-snug text-fg-2", className)}>{children}</p>;
}
