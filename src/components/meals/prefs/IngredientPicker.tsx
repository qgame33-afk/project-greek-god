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
            "press-soft flex min-h-12 w-full items-center gap-3 rounded-field px-3 py-2 text-left transition-colors duration-(--dur-fast)",
            on ? "bg-control" : "hover:bg-surface",
            no && "opacity-45",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="t-label block font-semibold text-fg">{c.name}</span>
            {no && blockedNote && <span className="t-cap block text-fg-2">{blockedNote}</span>}
          </span>
          <span
            aria-hidden
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-(--dur-fast)",
              on ? "scale-100 border-fg bg-fg text-bg" : "border-ui-line text-transparent",
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
      <div className="sticky top-0 z-10 -mx-5 bg-sheet px-5 pb-3 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-fg-2" strokeWidth={1.6} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients"
            aria-label="Search ingredients"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-field border border-ui-line bg-surface pl-10 pr-11 text-[length:max(16px,1rem)] font-medium text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-2 focus:border-fg-2 focus:shadow-[0_0_0_3px_rgb(255 255 255 / 0.08)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="press absolute right-0 top-0 grid size-12 place-items-center text-fg-2 hover:text-fg">
              <X className="size-4" strokeWidth={1.6} />
            </button>
          )}
        </div>
        {selected.length > 0 && <p className="t-cap mt-2 text-fg-2">{selected.length} chosen · saved as you tap</p>}
      </div>
      {results.length === 0 ? (
        <p className="t-label py-8 text-center text-fg-2">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
      ) : groups ? (
        groups.map((g) => (
          <section key={g.category} className="mb-3" aria-label={g.label}>
            <h3 className="t-cap px-3 pb-1.5 pt-2">{g.label}</h3>
            <ul className="flex flex-col">{g.items.map(row)}</ul>
          </section>
        ))
      ) : (
        <ul className="flex flex-col">{results.map(row)}</ul>
      )}
    </Sheet>
  );
}
