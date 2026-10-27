"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, History, Info, Layers, NotebookPen, Plus, Repeat, Search, SkipForward, Undo2 } from "lucide-react";
import { effortText } from "@/components/training/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { useRecentHistory } from "@/lib/data/workout";
import { shortDate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import { pickableLibrary } from "@/lib/training/programs";
import { groupSessions, type PastSet } from "@/lib/training/progression";
import type { LibraryExercise, WarmupStep } from "@/lib/training/types";
import { demoUrl, muscleLabel, musclesLine } from "@/lib/workout/copy";
import { trackingFor } from "@/lib/workout/session";
import { formatClock } from "@/lib/workout/rest";
import { lastTimeText } from "./words";

/* ------------------------------------------------------------ lift menu */

/** The ⋯ sheet, titled with the lift (§4.2.6). */
export function MoreSheet({
  open,
  onOpenChange,
  name,
  rir,
  skipped,
  hasNote,
  onHowTo,
  onSwap,
  onHistory,
  onAddSet,
  onWarmup,
  onNote,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  rir: string | null;
  skipped: boolean;
  hasNote: boolean;
  onHowTo: () => void;
  onSwap: () => void;
  onHistory: () => void;
  onAddSet: () => void;
  onWarmup: () => void;
  onNote: () => void;
  onSkip: () => void;
}) {
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={<span data-budget-name="">{name}</span>}>
      <div className="space-y-3 pb-2">
        <ListGroup>
          <Row icon={Info} title="How to do it" subtitle={`Steps, form tips${rir ? `, ${effortText(rir).toLowerCase()}` : ""}`} wrap onClick={run(onHowTo)} />
          <Row icon={Repeat} title="Swap exercise" onClick={run(onSwap)} />
          <Row icon={History} title="History" onClick={run(onHistory)} />
        </ListGroup>
        <ListGroup>
          <Row icon={Plus} title="Add a set" chevron={false} onClick={run(onAddSet)} />
          <Row icon={Layers} title="Add a warm-up set" chevron={false} onClick={run(onWarmup)} />
          <Row icon={NotebookPen} title={hasNote ? "Edit note" : "Note"} chevron={false} onClick={run(onNote)} />
          <Row icon={skipped ? Undo2 : SkipForward} title={skipped ? "Do this exercise after all" : "Skip this exercise"} chevron={false} onClick={run(onSkip)} />
        </ListGroup>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------- how-to */

export function HowToSheet({ open, onOpenChange, slug, name, note, rir, rest }: { open: boolean; onOpenChange: (o: boolean) => void; slug: string; name: string; note: string | null; rir: string | null; rest: number | null }) {
  const lib = getExercise(slug);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={<span data-budget-name="">{name}</span>} description={lib ? musclesLine(lib.primary, lib.secondary) : undefined}>
      {lib ? (
        <div className="space-y-6 pb-2" data-program-text="">
          {note && <p className="t-body rounded-tile-lg bg-surface px-4 py-3.5">{note}</p>}
          <section>
            <h3 className="t-section mb-3">How to do it</h3>
            <ol className="space-y-3">
              {lib.instructions.map((s, i) => (
                <li key={i} className="t-body flex gap-3">
                  <span className="t-cap grid size-6 shrink-0 place-items-center rounded-full bg-control font-semibold text-fg">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="t-section mb-3">Form tips</h3>
            <ul className="t-body list-disc space-y-2 pl-5">
              {lib.formTips.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
          <ListGroup>
            {rir && <Row title="Effort" subtitle={effortText(rir)} />}
            <Row title="Rest" subtitle={`${formatClock(rest ?? lib.rest)} between sets`} />
            <Row title="Muscles worked" subtitle={lib.primary.map(muscleLabel).join(", ")} />
            <Row title="Weight" subtitle={lib.perHand ? "Log the weight of one dumbbell" : "Log the total on the bar or stack"} />
          </ListGroup>
          <a href={demoUrl(lib.name)} target="_blank" rel="noopener noreferrer" className="press-soft flex min-h-14 items-center justify-between gap-3 rounded-tile-lg bg-surface px-4">
            <span className="t-row">Watch a video</span>
            <ExternalLink className="size-5 text-fg-3" strokeWidth={1.9} aria-hidden />
          </a>
        </div>
      ) : (
        <p className="t-body pb-4 text-fg-2">No steps are saved for this exercise.</p>
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------- history */

/** The lift's last sessions (the exercise detail in short), with a link to the full page. */
export function HistorySheet({ open, onOpenChange, slug, name, history, toDisplay }: { open: boolean; onOpenChange: (o: boolean) => void; slug: string; name: string; history: PastSet[]; toDisplay: (lb: number) => number }) {
  const t = trackingFor(getExercise(slug), null);
  const sessions = groupSessions(history);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={<span data-budget-name="">{name}</span>} description="Your last workouts with this lift">
      <div className="space-y-3 pb-2" data-history="">
        {sessions.length ? (
          <ListGroup>
            {sessions.map((s) => (
              <Row key={s[0].session_id} title={shortDate(s[0].local_date)} value={lastTimeText(s, t, toDisplay) ?? "—"} />
            ))}
          </ListGroup>
        ) : (
          <p className="t-body py-4 text-fg-2">Not done yet. Your sets show here after this workout.</p>
        )}
        <Button asChild variant="secondary" size="lg" block>
          <a href={`/training/exercise/${slug}`}>All history</a>
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- notes */

export function NoteSheet({ open, onOpenChange, title, initial, onSave, placeholder }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial: string; onSave: (text: string) => void; placeholder?: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {open && <NoteForm initial={initial} placeholder={placeholder} onSave={onSave} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function NoteForm({ initial, onSave, onDone, placeholder }: { initial: string; onSave: (t: string) => void; onDone: () => void; placeholder?: string }) {
  const [text, setText] = useState(initial);
  const over = text.length > 500;
  return (
    <div className="space-y-4 pb-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? "Seat height, grip, how it felt"} aria-label="Note" aria-invalid={over || undefined} rows={4} />
      {over && <p className="t-label text-danger">Keep it under 500 characters.</p>}
      <Button
        variant="primary"
        size="lg"
        block
        disabled={over || text === initial}
        onClick={() => {
          onSave(text.trim());
          onDone();
        }}
      >
        Save note
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------- warm-up */

export function WarmupSheet({ open, onOpenChange, steps }: { open: boolean; onOpenChange: (o: boolean) => void; steps: WarmupStep[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Warm-up">
      <ol className="space-y-3 pb-2" data-program-text="">
        {steps.map((s, i) => (
          <li key={i} className="rounded-tile-lg bg-surface px-4 py-3.5">
            <p className="t-row">{s.label}</p>
            <p className="t-label mt-0.5">{s.detail}</p>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/* --------------------------------------------------- swap / add exercise */

function matches(e: LibraryExercise, q: string) {
  if (!q) return true;
  const hay = `${e.name} ${[...e.primary, ...e.secondary].map(muscleLabel).join(" ")} ${e.equipment.replace("_", " ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/**
 * Swap for today, or Add exercise (§4.2.6, §4.2.9): the swap lists the lift's substitutes ("Works
 * the same muscles") with "Last time 20 × 15" or "Not done yet", then "Search all exercises".
 * Retired lifts are never offered (`pickableLibrary()`).
 */
export function PickSheet({
  open,
  onOpenChange,
  mode,
  current,
  busySlug,
  toDisplay,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "replace" | "add";
  current?: { slug: string; name: string; logged: number };
  busySlug: string | null;
  toDisplay: (lb: number) => number;
  onPick: (lib: LibraryExercise) => void;
}) {
  const [q, setQ] = useState("");
  const pickable = useMemo(() => pickableLibrary(), []);
  const subs = useMemo(() => {
    if (mode !== "replace" || !current) return [];
    const ok = new Set(pickable.map((e) => e.slug));
    return (getExercise(current.slug)?.substitutes ?? []).filter((s) => ok.has(s)).map(getExercise).filter((x): x is LibraryExercise => !!x);
  }, [mode, current, pickable]);
  const hist = useRecentHistory(open ? subs.map((s) => s.slug) : []);
  const list = useMemo(() => pickable.filter((e) => e.slug !== current?.slug && matches(e, q.trim())), [q, current?.slug, pickable]);
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setQ("");
  };
  const lastOf = (e: LibraryExercise): string => {
    const h = hist.data?.[e.slug] ?? [];
    const s = groupSessions(h)[0];
    return s ? `Last time ${lastTimeText(s.slice(0, 1), trackingFor(e, null), toDisplay)}` : "Not done yet";
  };
  const row = (e: LibraryExercise, sub?: ReactNode) => (
    <Row key={e.slug} title={e.name} dataName subtitle={busySlug === e.slug ? "Adding…" : sub} onClick={busySlug ? undefined : () => onPick(e)} />
  );
  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={mode === "replace" ? "Swap for today" : "Add exercise"}
      description={
        mode === "replace" && current
          ? `Instead of ${current.name}.${current.logged ? ` Logged sets stay with it.` : ""} Your plan stays the same.`
          : "Adds it at the end of today's workout."
      }
    >
      <div className="space-y-3 pb-2">
        {mode === "replace" && subs.length > 0 && !q && (
          <section>
            <h3 className="t-label mb-2 px-1">Works the same muscles</h3>
            <ListGroup>{subs.map((e) => row(e, lastOf(e)))}</ListGroup>
          </section>
        )}
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-3" strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all exercises"
            aria-label="Search all exercises"
            enterKeyHint="search"
            autoComplete="off"
            className="t-body h-14 w-full rounded-field bg-surface pl-12 pr-4 text-fg outline-none placeholder:text-fg-2 focus:ring-2 focus:ring-fg"
          />
        </label>
        {(q || mode === "add" || !subs.length) &&
          (list.length ? (
            <ListGroup>{list.slice(0, q ? 40 : 60).map((e) => row(e, musclesLine(e.primary, e.secondary, 3)))}</ListGroup>
          ) : (
            <p className="t-body px-1 py-6 text-center text-fg-2">Nothing matches “{q}”. Try a muscle, like “lats”.</p>
          ))}
      </div>
    </Sheet>
  );
}
