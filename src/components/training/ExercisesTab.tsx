"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Chip } from "@/components/ui/controls";
import { Input } from "@/components/ui/field";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { relativeDay } from "@/lib/dates";
import { useExerciseBests } from "@/lib/data/training";
import { LIBRARY, getExercise } from "@/lib/training/library";
import { MUSCLE_LABEL, REGION_LABEL, regionOf, type Region } from "@/lib/training/volume";
import { fmtLoadValue } from "./format";
import { useCustomExercises, useUnits } from "./hooks";

interface Row {
  slug: string;
  name: string;
  muscles: string;
  region: Region | null;
  custom: boolean;
  best: { e1rm: number | null; weight: number | null; reps: number | null; durationSec: number | null } | null;
  last: string | null;
  sessions: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ");

export function ExercisesTab({ today }: { today: string }) {
  const q = useExerciseBests();
  const custom = useCustomExercises();
  const { unit } = useUnits();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const deferred = useDeferredValue(query);

  const { logged, library } = useMemo(() => {
    const bests = q.data ?? [];
    const seen = new Set<string>();
    const logged: Row[] = [];
    for (const b of bests) {
      if (!b.exercise_slug) continue;
      seen.add(b.exercise_slug);
      const lib = getExercise(b.exercise_slug);
      logged.push({
        slug: b.exercise_slug,
        name: lib?.name ?? b.exercise_name ?? b.exercise_slug,
        muscles: lib ? lib.primary.map((m) => MUSCLE_LABEL[m]).join(", ") : "Custom exercise",
        region: lib ? regionOf(lib.primary) : null,
        custom: !lib,
        best: { e1rm: b.best_e1rm_lb, weight: b.best_weight_lb, reps: b.best_reps, durationSec: b.best_duration_sec },
        last: b.last_date,
        sessions: b.sessions ?? 0,
      });
    }
    const library: Row[] = [
      ...LIBRARY.filter((e) => !seen.has(e.slug)).map((e) => ({
        slug: e.slug,
        name: e.name,
        muscles: e.primary.map((m) => MUSCLE_LABEL[m]).join(", "),
        region: regionOf(e.primary),
        custom: false,
        best: null,
        last: null,
        sessions: 0,
      })),
      ...(custom.data ?? [])
        .filter((c) => !seen.has(c.slug) && !getExercise(c.slug))
        .map((c) => ({ slug: c.slug, name: c.name, muscles: "Custom exercise", region: null, custom: true, best: null, last: null, sessions: 0 })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    return { logged, library };
  }, [q.data, custom.data]);

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
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-3" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises or muscles"
          aria-label="Search exercises"
          className="pl-11 pr-11"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-fg-3 hover:text-fg">
            <X className="size-[18px]" />
          </button>
        )}
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Filter by body region">
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
          Couldn&apos;t load your records. The library still works.
        </ErrorNote>
      )}

      <div className="mt-5 space-y-6">
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[14px]" />
            ))}
          </div>
        ) : (
          <Group title="Your exercises" count={L.length} empty={logged.length === 0 ? "Exercises you log appear here with your best estimated 1RM and when you last did them." : null}>
            {L.map((r) => (
              <ExerciseRow key={r.slug} r={r} unit={unit} today={today} />
            ))}
          </Group>
        )}
        <Group title="Library" count={B.length}>
          {B.map((r) => (
            <ExerciseRow key={r.slug} r={r} unit={unit} today={today} />
          ))}
        </Group>
        {!L.length && !B.length && <p className="rounded-[14px] bg-s3 px-4 py-6 text-center text-[13px] text-fg-2">Nothing matches “{deferred}”. Try a muscle like “lats” or a shorter name.</p>}
      </div>
    </div>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty?: string | null; children: React.ReactNode }) {
  if (!count && !empty) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="eyebrow">{title}</h3>
        {count > 0 && <span className="num text-[13px] text-fg-3">{count}</span>}
      </div>
      {count ? <ul className="card divide-y divide-line-hair overflow-hidden p-0">{children}</ul> : <p className="rounded-[14px] bg-s3 px-4 py-4 text-[13px] text-fg-2">{empty}</p>}
    </section>
  );
}

function ExerciseRow({ r, unit, today }: { r: Row; unit: "lb" | "kg"; today: string }) {
  const best = r.best;
  let value: React.ReactNode = null;
  let label = "";
  if (best?.e1rm) {
    value = (
      <>
        {fmtLoadValue(best.e1rm, unit)}
        <span className="unit">{unit}</span>
      </>
    );
    label = "e1RM";
  } else if (best?.weight) {
    value = (
      <>
        {fmtLoadValue(best.weight, unit)}
        <span className="unit">{unit}</span>
      </>
    );
    label = "Top";
  } else if (best?.reps) {
    value = (
      <>
        {best.reps}
        <span className="unit">reps</span>
      </>
    );
    label = "Best";
  }
  return (
    <li style={{ contentVisibility: "auto", containIntrinsicSize: "auto 64px" }}>
      <Link href={`/training/exercise/${encodeURIComponent(r.slug)}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[.02] active:bg-white/[.04]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{r.name}</p>
          <p className="truncate text-[12px] text-fg-3">
            {r.muscles}
            {r.last ? ` · ${relativeDay(r.last, today)}` : ""}
          </p>
        </div>
        {value && (
          <div className="shrink-0 text-right">
            <p className="num text-[20px] font-semibold leading-none">{value}</p>
            <p className={`mt-1 text-[10.5px] font-bold tracking-[.12em] text-fg-3 ${label === "e1RM" ? "" : "uppercase"}`}>{label}</p>
          </div>
        )}
        <ChevronRight className="size-4 shrink-0 text-fg-3" />
      </Link>
    </li>
  );
}
