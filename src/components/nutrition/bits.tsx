"use client";

import { BadgeCheck, Star } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { DatabaseBadge, SourceBadge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/misc";
import { SheetFooterBar } from "@/components/ui/sheet";
import { AiChip } from "@/components/ui/ai-chip";
import { InfoButton } from "@/components/ui/details-sheet";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useFoodEntries } from "@/lib/data/nutrition";
import { shortDate, type ISODate } from "@/lib/dates";
import { ifYouAdd, type ConsequenceVerb } from "@/lib/fuel/consequence";
import { MEALS, type Macros, type Meal } from "@/lib/nutrition";
import { formatInt } from "@/lib/units";
import { g } from "@/lib/nutrition-ui/format";
import { provenanceOf, type ProvenanceInput } from "@/lib/nutrition-ui/provenance";

const CALC_EXPLAIN = "Recipe macros: each ingredient's USDA FoodData Central values × the amounts eaten.";

/**
 * The provenance mark for a food, or nothing for plain logs: AI · ESTIMATE (aegean) for AI
 * values, CALC for planned meals logged as eaten (recipe arithmetic, never AI), a database or
 * source chip for looked-up values. `still` renders without links (inside a tappable row).
 */
export function ProvenanceBadge({ item, full, still, className }: { item: ProvenanceInput; full?: boolean; still?: boolean; className?: string }) {
  const p = provenanceOf(item);
  if (!p) return null;
  if (p.kind === "estimate") return <AiChip label="AI" className={className} />;
  if (p.kind === "calc") return still ? null : <InfoButton how={CALC_EXPLAIN} className={className} />;
  if (p.kind === "source") {
    if (!still) return <SourceBadge name={p.name} url={p.url} className={className} />;
    return (
      <span className={cn(BADGE, "max-w-full border border-ui-line text-fg", className)}>
        <BadgeCheck className="size-3 text-fg-2" aria-hidden />
        <span className="truncate">Source · {p.name}</span>
      </span>
    );
  }
  return <DatabaseBadge name={full ? p.name : p.short} url={still ? null : p.url} className={className} />;
}

const BADGE = "t-cap inline-flex h-5 shrink-0 items-center gap-1 rounded-pill px-1.5 normal-case tracking-[0.02em]";

/**
 * Row badge that fits the space: the full badge when the row is wide enough, a 20px mark with
 * the same look and an accessible name on narrow phones (so "amount · time" never gets squeezed
 * and no label is clipped mid-word). Needs an `@container` ancestor.
 */
export function RowProvenance({ item }: { item: ProvenanceInput }) {
  const p = provenanceOf(item);
  if (!p) return null;
  const label = p.kind === "estimate" ? "AI estimate" : p.kind === "calc" ? "Calculated from the recipe" : p.kind === "source" ? `Source: ${p.name}` : `Database: ${p.name}`;
  const mark =
    p.kind === "estimate" ? (
      <span className="border border-ai-line bg-ai-soft text-ai">≈</span>
    ) : p.kind === "calc" ? (
      <span className="border border-dotted border-ui-line text-fg-2">=</span>
    ) : (
      <span className="border border-ui-line text-fg-2">
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
        className="t-cap inline-flex shrink-0 @[21rem]:hidden [&>span]:grid [&>span]:size-5 [&>span]:place-items-center [&>span]:rounded-pill [&>span]:font-semibold"
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
              "press t-cap h-11 min-w-0 truncate rounded-field border px-1 font-semibold transition-colors duration-(--dur-fast)",
              on ? "border-fg bg-card-3 text-fg" : "border-line bg-control text-fg-2 hover:text-fg",
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
  protein: "bg-fg",
  carbs: "bg-fg",
  fat: "bg-fg",
} as const;

/** Live macro grid: KCAL large, then P / C / F with series dots. */
export function MacroGrid({ macros, className, dim }: { macros: Macros; className?: string; dim?: boolean }) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)} aria-live="polite">
      <div className="flex min-w-0 flex-col justify-between rounded-field bg-surface px-3 py-2.5">
        <span className="t-cap">Kcal</span>
        <span className={cn("t-num-s mt-1 truncate", dim ? "text-fg-2" : "text-fg")}>{formatInt(macros.calories)}</span>
      </div>
      {(["protein", "carbs", "fat"] as const).map((k) => (
        <div key={k} className="flex min-w-0 flex-col justify-between rounded-field bg-surface px-3 py-2.5">
          <span className="t-cap flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", SERIES[k])} aria-hidden />
            {k === "protein" ? "Prot" : k === "carbs" ? "Carb" : "Fat"}
          </span>
          <span className={cn("t-num-s mt-1 truncate", dim ? "text-fg-2" : "text-fg")}>
            {g(macros[k])}
            <span className="t-cap ml-0.5 text-fg-2">g</span>
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
  return <SheetFooterBar className={cn("mt-5", className)}>{children}</SheetFooterBar>;
}

export function StarButton({ on, onToggle, label, className }: { on: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={cn("press grid size-11 shrink-0 place-items-center rounded-field transition-colors", on ? "text-fg" : "text-fg-2 hover:text-fg-2", className)}
    >
      <Star className="size-[1.1875rem]" fill={on ? "currentColor" : "none"} strokeWidth={1.75} />
    </button>
  );
}

/** A section label row used inside sheets. */
export function SubLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex min-h-6 items-center justify-between gap-3", className)}>
      <p className="t-cap">{children}</p>
      {action}
    </div>
  );
}

/** Tiny inline note (soft warnings are text-2, never red). */
export function SoftNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("t-cap rounded-field bg-surface px-3 py-2 text-fg-2", className)}>{children}</p>;
}

/**
 * The consequence line of a confirm step (docs/DESIGN-V2.md §3.5.1): "If you eat it: 2,520 kcal ·
 * 151 g" + CALC, for the day the food goes to — that day's log plus this food. Nothing shows until
 * the day's log has loaded (never a guess), or while the numbers are invalid.
 */
export function ConsequenceLine({
  date,
  add,
  verb = "eat",
  className,
}: {
  date: ISODate;
  add: { kcal: number; protein: number } | null;
  verb?: ConsequenceVerb;
  className?: string;
}) {
  const today = useToday();
  const day = useFoodEntries(date);
  if (!add || !day.hasData || !Number.isFinite(add.kcal) || !Number.isFinite(add.protein)) return null;
  const c = ifYouAdd({ kcal: day.totals.calories, protein: day.totals.protein }, add, verb);
  const isToday = date === today;
  return (
    <p className={cn("t-cap flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-2", className)} data-testid="consequence">
      <span aria-hidden>
        {isToday ? "" : `${shortDate(date, today)} · `}
        {c.text}
      </span>
      <span className="sr-only">{isToday ? c.spoken : c.spoken.replace("today", `on ${shortDate(date, today)}`)}</span>
      <InfoButton how={`${c.explain} (${isToday ? "today's" : "that day's"} log plus this food)`} />
    </p>
  );
}
