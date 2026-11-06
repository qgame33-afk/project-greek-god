"use client";

import { ChevronLeft } from "lucide-react";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { useExerciseBests } from "@/lib/data/training";
import { shortDate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import { pickableLibrary } from "@/lib/training/programs";
import { alphabetical, EQUIPMENT_FILTERS, exerciseLine, MUSCLE_FILTERS, passesFilters, searchLibrary, similarTo, type Filters } from "@/lib/training/search";
import type { Equipment, LibraryExercise } from "@/lib/training/types";
import { SearchField } from "./SearchField";

export interface PickerConfirm {
  /** The sheet's title while the picked lift is shown ("Swap for Preacher Curl?"). */
  title: (lib: LibraryExercise) => ReactNode;
  /** The confirm view under the title: what will change, the choices and the one gold action. `back` returns to the list. */
  render: (lib: LibraryExercise, back: () => void) => ReactNode;
}

export interface ExercisePickerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** The lift being replaced: "Similar" lists its swaps first, and it is never offered. */
  current?: string | null;
  /** Lifts never offered (already in the workout, for example). */
  exclude?: string[];
  /** Without `confirm`, a tap picks at once (the editor's draft, the Lifts browser). */
  onPick?: (lib: LibraryExercise) => void;
  /** With `confirm`, a tap shows the lift and its choices; nothing changes until its action runs. */
  confirm?: PickerConfirm;
}

/**
 * The exercise picker (docs/DESIGN-V3-SIMPLE.md §4.2.6, §4.2.9, §4.3.10, §4.3.12): one sheet for
 * every swap and every add. A search field (typo-tolerant word and prefix match, gym shorthand),
 * a row of muscle chips and a row of equipment chips; without a search, "Similar" (the lift's
 * swaps, then the same main muscle), "Recent" (lifts he has logged, newest first), then the
 * whole library A–Z. Each row: name, muscles and equipment, at least 68 px tall. No gold here:
 * the confirm view, when there is one, holds the sheet's one gold action.
 */
export function ExercisePicker({ open, onOpenChange, title, description, current, exclude, onPick, confirm }: ExercisePickerProps) {
  const [picked, setPicked] = useState<LibraryExercise | null>(null);
  // every opening starts at the list, however the last one closed (a confirmed swap closes it from outside)
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setPicked(null);
  }
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setPicked(null);
  };
  const showConfirm = !!(confirm && picked);
  return (
    <Sheet open={open} onOpenChange={close} title={showConfirm ? confirm!.title(picked!) : title} description={showConfirm ? undefined : description}>
      {open &&
        (showConfirm ? (
          <div data-picker-confirm="">
            <button type="button" onClick={() => setPicked(null)} className="press t-label -ml-1 mb-3 inline-flex min-h-11 items-center gap-1 pr-2 font-semibold text-fg">
              <ChevronLeft className="size-5" strokeWidth={1.9} aria-hidden />
              All exercises
            </button>
            {confirm!.render(picked!, () => setPicked(null))}
          </div>
        ) : (
          <PickerList current={current ?? null} exclude={exclude ?? []} chevron={!!confirm} onPick={(lib) => (confirm ? setPicked(lib) : onPick?.(lib))} />
        ))}
    </Sheet>
  );
}

function PickerList({ current, exclude, chevron, onPick }: { current: string | null; exclude: string[]; chevron: boolean; onPick: (lib: LibraryExercise) => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const dq = useDeferredValue(q);
  const bests = useExerciseBests();

  const filters: Filters = useMemo(() => ({ muscle, equipment }), [muscle, equipment]);
  const skip = useMemo(() => [...(current ? [current] : []), ...exclude], [current, exclude]);
  const lastDone = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bests.data ?? []) if (b.exercise_slug && b.last_date && !m.has(b.exercise_slug)) m.set(b.exercise_slug, b.last_date);
    return m;
  }, [bests.data]);

  const view = useMemo(() => {
    const ok = (e: LibraryExercise) => !skip.includes(e.slug) && passesFilters(e, filters);
    if (dq.trim()) return { kind: "search" as const, results: searchLibrary(dq, filters).filter(ok) };
    const similar = current ? similarTo(current, 8, exclude).filter(ok) : [];
    const shown = new Set(similar.map((e) => e.slug));
    // exercise_bests is ordered by last_date, newest first
    const recent = [...lastDone.keys()]
      .map((s) => getExercise(s))
      .filter((e): e is LibraryExercise => !!e && !e.retired && !shown.has(e.slug) && ok(e))
      .slice(0, 8);
    return { kind: "browse" as const, similar, recent, az: alphabetical(filters, skip) };
  }, [dq, filters, skip, current, exclude, lastDone]);

  const sub = (e: LibraryExercise, withDate: boolean) => {
    const d = withDate ? lastDone.get(e.slug) : undefined;
    return withDate ? `${exerciseLine(e)} · ${d ? `Last done ${shortDate(d)}` : "Not done yet"}` : exerciseLine(e);
  };
  const row = (e: LibraryExercise, withDate = false) => <Row key={e.slug} title={e.name} subtitle={sub(e, withDate)} wrap dataName chevron={chevron} onClick={() => onPick(e)} />;
  const filtered = !!(muscle || equipment);
  const clear = () => {
    setMuscle(null);
    setEquipment(null);
  };

  return (
    <div className="@container pb-2">
      {/* the search and chips stay in reach while the list scrolls; at large text sizes they scroll away (AX layout) */}
      <div className="sticky top-0 z-10 -mx-5 bg-sheet px-5 pb-3 pt-1 ax:static" data-picker-filters="">
        <SearchField value={q} onChange={setQ} placeholder={`Search ${pickableLibrary().length} exercises`} label="Search exercises by name, muscle or equipment" />
        <ChipRow label="Muscle">
          <Chip selected={!muscle} onClick={() => setMuscle(null)}>
            Any muscle
          </Chip>
          {MUSCLE_FILTERS.map((m) => (
            <Chip key={m.id} selected={muscle === m.id} onClick={() => setMuscle(muscle === m.id ? null : m.id)}>
              {m.label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Equipment">
          <Chip selected={!equipment} onClick={() => setEquipment(null)}>
            Any equipment
          </Chip>
          {EQUIPMENT_FILTERS.map((x) => (
            <Chip key={x.id} selected={equipment === x.id} onClick={() => setEquipment(equipment === x.id ? null : x.id)}>
              {x.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="mt-2 flex flex-col gap-6" aria-live="polite">
        {view.kind === "search" ? (
          view.results.length ? (
            <Section title={`${view.results.length} ${view.results.length === 1 ? "match" : "matches"}`}>{view.results.map((e) => row(e))}</Section>
          ) : (
            <NoMatch query={dq} filtered={filtered} onClear={clear} />
          )
        ) : (
          <>
            {view.similar.length > 0 && <Section title="Similar">{view.similar.map((e) => row(e, true))}</Section>}
            {view.recent.length > 0 && <Section title="Recent">{view.recent.map((e) => row(e, true))}</Section>}
            {view.az.length ? (
              <section aria-label="All exercises A to Z" className="flex flex-col gap-2">
                <h3 className="t-section px-1">All exercises</h3>
                {view.az.map((g) => (
                  <div key={g.letter}>
                    <p className="t-cap mb-1.5 mt-2 px-1 font-semibold" aria-hidden>
                      {g.letter}
                    </p>
                    <ListGroup>{g.items.map((e) => row(e))}</ListGroup>
                  </div>
                ))}
              </section>
            ) : (
              <NoMatch query="" filtered={filtered} onClear={clear} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One row of chips that scrolls sideways inside the sheet on a phone (never the page) and wraps on a desktop. */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 py-1.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="t-section mb-2 px-1">{title}</h3>
      <ListGroup>{children}</ListGroup>
    </section>
  );
}

function NoMatch({ query, filtered, onClear }: { query: string; filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="t-body text-fg-2">{query ? <>Nothing matches &ldquo;{query}&rdquo;{filtered ? " with these filters" : ""}.</> : "No exercise has both of these."}</p>
      {filtered ? (
        <Button variant="secondary" size="md" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <p className="t-label">Try a muscle, like &ldquo;lats&rdquo;, or a word like &ldquo;curl&rdquo;.</p>
      )}
    </div>
  );
}
