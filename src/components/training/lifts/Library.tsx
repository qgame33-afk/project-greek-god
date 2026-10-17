"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Chip } from "@/components/ui/controls";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { addDays, relativeDay } from "@/lib/dates";
import { useExerciseBests } from "@/lib/data/training";
import { LIBRARY, getExercise } from "@/lib/training/library";
import { MUSCLE_LABEL, REGION_LABEL, regionOf, type Region } from "@/lib/training/volume";
import { fmtLoadValue } from "../format";
import { useCustomExercises, useRecentDaily, useUnits } from "../hooks";
import { Sparkline } from "./Sparkline";

interface Row {
  slug: string;
  name: string;
  muscles: string;
  region: Region | null;
  best: { e1rm: number | null; weight: number | null; reps: number | null } | null;
  last: string | null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ");

/**
 * Lifts → Library (§3.4.3): search, region filters, and every exercise with its best e1RM and a
 * 28-day line drawn from real sessions only. Logged lifts first, then the rest of the library.
 */
export function Library({ today }: { today: string }) {
  const q = useExerciseBests();
  const custom = useCustomExercises();
  const recent = useRecentDaily(addDays(today, -27));
  const { unit } = useUnits();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const deferred = useDeferredValue(query);

  const { logged, library } = useMemo(() => {
    const seen = new Set<string>();
    const logged: Row[] = [];
    for (const b of q.data ?? []) {
      if (!b.exercise_slug) continue;
      seen.add(b.exercise_slug);
      const lib = getExercise(b.exercise_slug);
      logged.push({
        slug: b.exercise_slug,
        name: lib?.name ?? b.exercise_name ?? b.exercise_slug,
        muscles: lib ? lib.primary.map((m) => MUSCLE_LABEL[m]).join(", ") : "Custom exercise",
        region: lib ? regionOf(lib.primary) : null,
        best: { e1rm: b.best_e1rm_lb, weight: b.best_weight_lb, reps: b.best_reps },
        last: b.last_date,
      });
    }
    const library: Row[] = [
      ...LIBRARY.filter((e) => !seen.has(e.slug)).map((e) => ({ slug: e.slug, name: e.name, muscles: e.primary.map((m) => MUSCLE_LABEL[m]).join(", "), region: regionOf(e.primary), best: null, last: null })),
      ...(custom.data ?? []).filter((c) => !seen.has(c.slug) && !getExercise(c.slug)).map((c) => ({ slug: c.slug, name: c.name, muscles: "Custom exercise", region: null, best: null, last: null })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    return { logged, library };
  }, [q.data, custom.data]);

  // 28-day lines: the same measure as the row's best (e1RM, else top weight, else reps)
  const lines = useMemo(() => {
    const by = new Map<string, { e: number[]; w: number[]; r: number[] }>();
    for (const d of recent.data ?? []) {
      if (!d.exercise_slug) continue;
      const l = by.get(d.exercise_slug) ?? { e: [], w: [], r: [] };
      if (Number(d.best_e1rm_lb) > 0) l.e.push(Number(d.best_e1rm_lb));
      if (Number(d.top_weight_lb) > 0) l.w.push(Number(d.top_weight_lb));
      if (Number(d.max_reps) > 0) l.r.push(Number(d.max_reps));
      by.set(d.exercise_slug, l);
    }
    return by;
  }, [recent.data]);

  const match = (r: Row) => {
    if (region !== "all" && r.region !== region) return false;
    const t = norm(deferred.trim());
    if (!t) return true;
    const hay = norm(`${r.name} ${r.muscles} ${r.slug}`);
    return t.split(/\s+/).every((w) => hay.includes(w));
  };
  const L = logged.filter(match);
  const B = library.filter(match);

  return (
    <div className="@container">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ash" strokeWidth={1.6} />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lifts or muscles"
          aria-label="Search exercises"
          className="pl-11 pr-11"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="press absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-ash hover:text-ivory">
            <X className="size-5" strokeWidth={1.6} />
          </button>
        )}
      </div>
      <div className="no-scrollbar -mx-(--gutter) mt-3 flex gap-2 overflow-x-auto px-(--gutter) md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filter by body region">
        <Chip selected={region === "all"} onClick={() => setRegion("all")}>
          All
        </Chip>
        {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
          <Chip key={r} selected={region === r} onClick={() => setRegion(r)}>
            {REGION_LABEL[r]}
          </Chip>
        ))}
      </div>

      {q.error && (
        <ErrorNote className="mt-4" onRetry={() => q.refetch()}>
          Couldn&apos;t load your bests. The library still works.
        </ErrorNote>
      )}

      <div className="mt-6 space-y-8">
        {q.isLoading ? (
          <Group title="Your lifts" count={4}>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex min-h-16 items-center gap-3 py-2.5" aria-hidden>
                <span className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </span>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-12" />
              </li>
            ))}
          </Group>
        ) : (
          <Group title="Your lifts" count={L.length} empty={logged.length === 0 ? "Lifts you log appear here with your best estimated 1RM and a 28-day line." : null}>
            {L.map((r) => {
              const l = lines.get(r.slug);
              const values = r.best?.e1rm ? (l?.e ?? []) : r.best?.weight ? (l?.w ?? []) : (l?.r ?? []);
              return <LiftRow key={r.slug} r={r} unit={unit} today={today} values={values} />;
            })}
          </Group>
        )}
        <Group title="Library" count={B.length}>
          {B.map((r) => (
            <LiftRow key={r.slug} r={r} unit={unit} today={today} values={null} />
          ))}
        </Group>
        {!L.length && !B.length && (
          <p className="t-callout border-y border-vein py-6 text-center text-stone">
            Nothing matches &ldquo;{deferred}&rdquo;. Try a muscle like &ldquo;lats&rdquo; or a shorter name.
          </p>
        )}
      </div>
    </div>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty?: string | null; children: ReactNode }) {
  if (!count && !empty) return null;
  return (
    <section aria-label={title}>
      <div className="mb-1 flex min-h-8 items-baseline justify-between">
        <h2 className="t-eyebrow">{title}</h2>
        {count > 0 && <span className="t-meta tnum text-ash">{count}</span>}
      </div>
      {count ? <ul className="divide-y divide-vein border-y border-vein">{children}</ul> : <p className="t-callout border-y border-vein py-4 text-stone">{empty}</p>}
    </section>
  );
}

function LiftRow({ r, unit, today, values }: { r: Row; unit: "lb" | "kg"; today: string; values: number[] | null }) {
  const b = r.best;
  const value = b?.e1rm ? fmtLoadValue(b.e1rm, unit) : b?.weight ? fmtLoadValue(b.weight, unit) : b?.reps ? String(b.reps) : null;
  const what = b?.e1rm ? "e1RM" : b?.weight ? "top" : b?.reps ? "reps" : null;
  const valueUnit = b?.e1rm || b?.weight ? unit : null;
  const spoken = value ? `, best ${what === "e1RM" ? "estimated 1 rep max" : what === "top" ? "top weight" : "reps"} ${value}${valueUnit ? ` ${valueUnit === "lb" ? "pounds" : "kilograms"}` : ""}` : "";
  return (
    <li style={{ contentVisibility: "auto", containIntrinsicSize: "auto 64px" }}>
      <Link href={`/training/exercise/${encodeURIComponent(r.slug)}`} className="press-soft flex min-h-16 items-center gap-3 py-2.5" aria-label={`${r.name}${spoken}${r.last ? `, last ${relativeDay(r.last, today)}` : ""}`}>
        <span className="min-w-0 flex-1">
          <span className="t-title-3 line-clamp-2 block text-ivory">{r.name}</span>
          <span className="t-meta block truncate text-stone">
            {r.muscles}
            {r.last ? ` · ${relativeDay(r.last, today)}` : ""}
          </span>
        </span>
        {values && <Sparkline values={values} className="shrink-0 @max-[19rem]:hidden" />}
        {value && (
          <span className="min-w-16 shrink-0 text-right">
            <span className="t-num-s block text-ivory">
              {value}
              {valueUnit && <span className="t-meta text-stone"> {valueUnit}</span>}
            </span>
            <span className={cn("t-tag block text-ash", what === "e1RM" && "normal-case")}>{what}</span>
          </span>
        )}
        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </Link>
    </li>
  );
}
