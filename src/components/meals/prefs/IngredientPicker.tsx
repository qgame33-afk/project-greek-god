"use client";

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { groupByAisle, searchIngredients, type IngredientChoice } from "./model";

/**
 * Pick ingredients from the database for one list (never plan / like more of / already have).
 * Each tap saves straight away; `blocked` keys belong to a list that wins (a hard dislike can't
 * also be a like) and show why they can't be picked.
 */
export function IngredientPicker({
  open,
  onOpenChange,
  title,
  description,
  selected,
  blocked,
  blockedNote,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  selected: readonly string[];
  blocked?: readonly string[];
  blockedNote?: string;
  onToggle: (key: string, on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }
  const results = useMemo(() => searchIngredients(query), [query]);
  const groups = useMemo(() => (query.trim() ? null : groupByAisle(results)), [query, results]);
  const chosen = new Set(selected);
  const off = new Set(blocked ?? []);

  const row = (c: IngredientChoice) => {
    const on = chosen.has(c.key);
    const no = off.has(c.key);
    return (
      <li key={c.key}>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          disabled={no}
          onClick={() => onToggle(c.key, !on)}
          className={cn(
            "press-soft flex min-h-12 w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors",
            on ? "bg-gold-tint" : "hover:bg-white/[.03]",
            no && "opacity-45",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cn("block text-[15px] font-semibold", on ? "text-gold-200" : "text-fg")}>{c.name}</span>
            {no && blockedNote && <span className="block text-[12px] font-medium text-fg-3">{blockedNote}</span>}
          </span>
          <span
            aria-hidden
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-(--dur-fast)",
              on ? "scale-100 border-gold-400 bg-gold-400 text-ink" : "border-line-strong text-transparent",
            )}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} className="min-h-[62dvh] lg:min-h-[60vh]">
      <div className="sticky top-0 z-10 -mx-5 bg-s2 px-5 pt-1 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients"
            aria-label="Search ingredients"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-[12px] border border-line-field bg-s3 pr-11 pl-10 text-[16px] font-medium text-fg outline-none placeholder:text-fg-3 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="press absolute top-0 right-0 grid size-12 place-items-center text-fg-3 hover:text-fg">
              <X className="size-4" />
            </button>
          )}
        </div>
        {selected.length > 0 && <p className="mt-2 text-[12.5px] font-semibold text-fg-2">{selected.length} chosen · saved as you tap</p>}
      </div>
      {results.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-fg-2">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
      ) : groups ? (
        groups.map((g) => (
          <section key={g.category} className="mb-3" aria-label={g.label}>
            <h3 className="eyebrow px-3 pt-2 pb-1.5">{g.label}</h3>
            <ul className="flex flex-col">{g.items.map(row)}</ul>
          </section>
        ))
      ) : (
        <ul className="flex flex-col">{results.map(row)}</ul>
      )}
    </Sheet>
  );
}
