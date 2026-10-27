"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Chip } from "@/components/ui/controls";
import { Input } from "@/components/ui/field";
import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { getExercise } from "@/lib/training/library";
import { pickableLibrary } from "@/lib/training/programs";
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

/**
 * The exercise library in a sheet (docs/DESIGN-V3-SIMPLE.md §4.3.10 "All exercises", §4.3.12
 * "Add exercise", the swap search): a search field, region chips and every pickable lift
 * (`pickableLibrary()`: retired entries never show). `first` slugs (substitutes) are listed on top.
 */
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
    const pickable = pickableLibrary();
    const ok = (e: LibraryExercise) => {
      if (e.retired || exclude.includes(e.slug)) return false;
      if (region !== "all" && regionOf(e.primary) !== region) return false;
      if (!t) return true;
      const hay = norm(`${e.name} ${e.primary.map((m) => MUSCLE_LABEL[m]).join(" ")} ${e.equipment}`);
      return t.split(/\s+/).every((w) => hay.includes(w));
    };
    const top = first.map((s) => getExercise(s)).filter((e): e is LibraryExercise => !!e && ok(e));
    const rest = pickable.filter((e) => !first.includes(e.slug) && ok(e)).sort((a, b) => a.name.localeCompare(b.name));
    return { top, rest };
  }, [dq, region, first, exclude]);

  return (
    <div className="pb-2">
      <SearchField value={q} onChange={setQ} placeholder="Search by name, muscle or equipment" label="Search the exercise library" />
      <div className="mt-3 flex flex-wrap gap-2 py-1" role="group" aria-label="Filter by body region">
        <Chip selected={region === "all"} onClick={() => setRegion("all")}>
          All
        </Chip>
        {(Object.keys(REGION_LABEL) as Region[]).map((r) => (
          <Chip key={r} selected={region === r} onClick={() => setRegion(r)}>
            {REGION_LABEL[r]}
          </Chip>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-5">
        {top.length > 0 && <List title={firstTitle} items={top} onPick={onPick} />}
        {rest.length > 0 && <List title={top.length ? "All exercises" : "Library"} items={rest} onPick={onPick} />}
        {!top.length && !rest.length && <p className="t-body py-6 text-center text-fg-2">Nothing matches &ldquo;{dq}&rdquo;.</p>}
      </div>
    </div>
  );
}

function List({ title, items, onPick }: { title: string; items: LibraryExercise[]; onPick: (e: LibraryExercise) => void }) {
  return (
    <section aria-label={title}>
      <p className="t-cap mb-2 px-1">{title}</p>
      <ListGroup>
        {items.map((e) => (
          <Row key={e.slug} title={e.name} dataName wrap subtitle={`${e.primary.map((m) => MUSCLE_LABEL[m]).join(", ")} · ${equipmentLabel(e.equipment)}`} onClick={() => onPick(e)} chevron={false} />
        ))}
      </ListGroup>
    </section>
  );
}

/** A search field with a clear button (56 px, the kit's Input). */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-2" strokeWidth={1.9} aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-12 pr-11"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="press absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-fg-2 hover:text-fg">
          <X className="size-5" strokeWidth={1.9} aria-hidden />
        </button>
      )}
    </div>
  );
}
