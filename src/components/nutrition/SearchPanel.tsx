"use client";

import { Info, Search, SearchX, WifiOff, X } from "lucide-react";
import { DatabaseBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { normalizeUnit } from "@/lib/nutrition-ui/portion";
import { searchErrorFor, searchUnavailable, SearchUnavailableError, statusNotes, type SearchResult } from "@/lib/nutrition-ui/search";
import { formatInt, round } from "@/lib/units";
import { useDebounced, useDelayedFlag, useFoodSearch } from "./hooks";

const EXAMPLES = ["Chicken breast", "Greek yogurt", "Rolled oats", "Banana", "Whole milk", "Bagel"];

export function SearchPanel({ q, setQ, onPick, onManual }: { q: string; setQ: (q: string) => void; onPick: (r: SearchResult) => void; onManual: (name: string) => void }) {
  const dq = useDebounced(q, 350);
  const term = dq.trim();
  const search = useFoodSearch(dq);
  const typing = q.trim() !== term;
  const waiting = (search.isFetching || typing) && q.trim().length >= 2;
  const showSkeleton = useDelayedFlag(waiting && !search.data, 150);
  const data = search.data;
  // offline, the lookup pauses (no error, no loading): say so instead of a blank panel
  const paused = search.fetchStatus === "paused" && !data && q.trim().length >= 2;
  const err = search.error ?? (paused ? searchErrorFor("network") : null);
  const notes = data ? statusNotes(data.status) : [];
  // no database answered: an empty list would read as "no matches", which it isn't
  const down = !!data && searchUnavailable(data);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ash" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods or brands"
          aria-label="Search foods"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={80}
          className="pl-11 pr-12 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-field text-ash hover:text-ivory">
            <X className="size-[1.125rem]" />
          </button>
        )}
      </div>

      {q.trim().length < 2 ? (
        <div className="pt-5">
          <p className="t-callout leading-relaxed text-stone">Search USDA FoodData Central and Open Food Facts, then set the amount you ate.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => setQ(x)} className="press h-11 rounded-full border border-vein-2 bg-m3 px-4 t-callout font-semibold text-stone hover:text-ivory">
                {x}
              </button>
            ))}
          </div>
        </div>
      ) : err && !data ? (
        <SearchError err={err} onRetry={() => search.refetch()} onManual={() => onManual(q.trim())} />
      ) : down && !typing && !search.isPlaceholderData ? (
        <div className={cn("transition-opacity", waiting && "opacity-60")}>
          <SearchError err={new SearchUnavailableError("No food database answered.", "down")} notes={notes} onRetry={() => search.refetch()} onManual={() => onManual(q.trim())} />
        </div>
      ) : showSkeleton || down ? (
        <ul className="mt-3" aria-busy="true" aria-label="Searching">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 border-b border-vein py-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-14" />
            </li>
          ))}
        </ul>
      ) : data ? (
        <div className={cn("transition-opacity", waiting && "opacity-60")}>
          {notes.length > 0 && (
            <p className="mt-3 flex items-start gap-2 t-meta leading-snug text-ash">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{notes.join(" ")}</span>
            </p>
          )}
          {data.results.length === 0 ? (
            <div className="rounded-field bg-m2 shadow-[inset_0_0_0_1px_var(--vein-2)] mt-4 flex flex-col items-center px-5 py-7 text-center">
              <SearchX className="size-7 text-ash" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 t-callout font-bold text-ivory">No matches for “{term}”</p>
              <p className="mt-1 max-w-[32ch] t-meta text-stone">Try fewer words or a simpler name. You can always enter it by hand.</p>
              <Button variant="secondary" className="mt-4" onClick={() => onManual(q.trim())}>
                Add manually
              </Button>
            </div>
          ) : (
            <>
              <ul className="mt-2" aria-label={`${data.results.length} results`}>
                {data.results.map((r) => (
                  <li key={`${r.source}:${r.id}`} className="border-b border-vein last:border-b-0">
                    <ResultRow r={r} onPick={() => onPick(r)} />
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="t-meta text-ash">Not here?</p>
                <button type="button" onClick={() => onManual(q.trim())} className="press t-meta inline-flex h-11 items-center font-semibold text-ivory underline decoration-vein-3 underline-offset-4">
                  Add manually
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function servingText(r: SearchResult) {
  const unit = normalizeUnit(r.servingUnit);
  const amt = round(r.servingAmount, 2);
  const base = unit === "g" ? `${amt} g` : unit === "ml" ? `${amt} mL` : `${amt} ${r.servingUnit}`;
  return r.servingGrams && unit !== "g" ? `${base} (${formatInt(r.servingGrams)} g)` : base;
}

function ResultRow({ r, onPick }: { r: SearchResult; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="press-soft flex min-h-16 w-full items-center gap-3 py-2.5 text-left">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 t-callout font-semibold leading-snug text-ivory">{r.name}</p>
        <p className="mt-0.5 truncate t-meta font-medium text-ash">
          {r.brand ? `${r.brand} · ` : ""}
          {servingText(r)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="tnum t-title-3 font-semibold leading-none text-ivory">
          {formatInt(r.perServing.calories)}
          <span className="t-meta ml-0.5 text-stone">kcal</span>
        </span>
        <DatabaseBadge name={r.source === "usda" ? "USDA" : "Open Food Facts"} />
      </div>
    </button>
  );
}

function SearchError({ err, notes, onRetry, onManual }: { err: Error; notes?: string[]; onRetry: () => void; onManual: () => void }) {
  const kind = err instanceof SearchUnavailableError ? err.kind : "failed";
  const title =
    kind === "unavailable"
      ? "Food search is unavailable"
      : kind === "offline"
        ? "You're offline"
        : kind === "auth"
          ? "Your session expired"
          : kind === "down"
            ? "The food databases didn't answer"
            : "Food search didn't respond";
  const body =
    kind === "unavailable"
      ? "The food database isn't connected on this server yet. Log it by hand, or pick from Saved and Recent."
      : kind === "offline"
        ? "Search needs a connection. Your saved and recent foods still work."
        : kind === "auth"
          ? "Sign in again to search."
          : kind === "down"
            ? `${notes?.length ? notes.join(" ") : "Neither USDA nor Open Food Facts answered."} Retry in a minute, or enter it by hand.`
            : "Try again in a moment, or enter it by hand.";
  return (
    <div className="rounded-field bg-m2 shadow-[inset_0_0_0_1px_var(--vein-2)] mt-4 flex flex-col items-center px-5 py-7 text-center" role="status">
      {kind === "offline" ? <WifiOff className="size-7 text-ash" strokeWidth={1.5} aria-hidden /> : <SearchX className="size-7 text-ash" strokeWidth={1.5} aria-hidden />}
      <p className="mt-3 t-callout font-bold text-ivory">{title}</p>
      <p className="mt-1 max-w-[34ch] t-meta leading-relaxed text-stone">{body}</p>
      <div className="mt-4 flex gap-2">
        {kind !== "unavailable" && kind !== "auth" && (
          <Button variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button variant="secondary" onClick={onManual}>
          Add manually
        </Button>
      </div>
    </div>
  );
}
