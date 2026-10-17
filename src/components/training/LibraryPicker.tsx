"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Chip } from "@/components/ui/controls";
import { Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { LIBRARY, getExercise } from "@/lib/training/library";
import type { LibraryExercise } from "@/lib/training/types";
import { MUSCLE_LABEL, REGION_LABEL, regionOf, type Region } from "@/lib/training/volume";

const EQUIPMENT: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  smith: "Smith machine",
  bodyweight: "Bodyweight",
  ez_bar: "EZ bar",
  plate_loaded: "Plate-loaded",
  box: "Box",
  other: "Other",
};
export const equipmentLabel = (e: string) => EQUIPMENT[e] ?? e;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

/** Search the exercise library. `first` slugs (e.g. substitutes) are listed on top. */
export function LibraryPicker({
  open,
  onOpenChange,
  title,
  description,
  first = [],
  firstTitle = "Suggested",
  exclude = [],
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  first?: string[];
  firstTitle?: string;
  exclude?: string[];
  onPick: (e: LibraryExercise) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {open && <PickerBody first={first} firstTitle={firstTitle} exclude={exclude} onPick={onPick} />}
    </Sheet>
  );
}

function PickerBody({ first, firstTitle, exclude, onPick }: { first: string[]; firstTitle: string; exclude: string[]; onPick: (e: LibraryExercise) => void }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const dq = useDeferredValue(q);

  const { top, rest } = useMemo(() => {
    const t = norm(dq.trim());
    const ok = (e: LibraryExercise) => {
      if (exclude.includes(e.slug)) return false;
      if (region !== "all" && regionOf(e.primary) !== region) return false;
      if (!t) return true;
      const hay = norm(`${e.name} ${e.primary.map((m) => MUSCLE_LABEL[m]).join(" ")} ${e.equipment}`);
      return t.split(/\s+/).every((w) => hay.includes(w));
    };
    const top = first.map((s) => getExercise(s)).filter((e): e is LibraryExercise => !!e && ok(e));
    const rest = LIBRARY.filter((e) => !first.includes(e.slug) && ok(e)).sort((a, b) => a.name.localeCompare(b.name));
    return { top, rest };
  }, [dq, region, first, exclude]);

  return (
    <div className="pt-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ash" strokeWidth={1.6} />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, muscle or equipment"
          aria-label="Search the exercise library"
          className="pl-11 pr-11"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="press absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-ash hover:text-ivory">
            <X className="size-5" strokeWidth={1.6} />
          </button>
        )}
      </div>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter by body region">
        <Chip selected={region === "all"} onClick={() => setRegion("all")}>
          All
        </Chip>
        {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
          <Chip key={r} selected={region === r} onClick={() => setRegion(r)}>
            {REGION_LABEL[r]}
          </Chip>
        ))}
      </div>
      <div className="mt-4 space-y-5">
        {top.length > 0 && <List title={firstTitle} items={top} onPick={onPick} />}
        {rest.length > 0 && <List title={top.length ? "All exercises" : "Library"} items={rest} onPick={onPick} />}
        {!top.length && !rest.length && <p className="t-callout border-y border-vein px-4 py-6 text-center text-stone">No exercise matches “{dq}”.</p>}
      </div>
    </div>
  );
}

function List({ title, items, onPick }: { title: string; items: LibraryExercise[]; onPick: (e: LibraryExercise) => void }) {
  return (
    <section>
      <p className="t-eyebrow mb-1 flex min-h-8 items-center">{title}</p>
      <ul className="divide-y divide-vein border-y border-vein">
        {items.map((e) => (
          <li key={e.slug}>
            <button type="button" onClick={() => onPick(e)} className="press-soft flex min-h-14 w-full flex-col justify-center py-2 text-left">
              <span className="t-title-3 text-ivory">{e.name}</span>
              <span className="t-meta text-stone">
                {e.primary.map((m) => MUSCLE_LABEL[m]).join(", ")} · {equipmentLabel(e.equipment)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
