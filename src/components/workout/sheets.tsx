"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronRight, Clock, ExternalLink, Flame, Minus, Plus, Replace, Search, SkipForward, StickyNote, Trash, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { LIBRARY, getExercise } from "@/lib/training/library";
import type { LibraryExercise } from "@/lib/training/types";
import { demoUrl, muscleLabel, musclesLine } from "@/lib/workout/copy";

/* ------------------------------------------------------------ menu row */

function MenuItem({
  icon,
  label,
  hint,
  onClick,
  href,
  disabled,
  tone,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "danger";
}) {
  const cls = cn(
    "press-soft flex min-h-[56px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left transition-colors hover:bg-white/[.04] disabled:opacity-35 disabled:hover:bg-transparent",
    tone === "danger" ? "text-danger" : "text-fg",
  );
  const inner = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px] bg-s3", tone === "danger" ? "text-danger" : "text-fg-2")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block truncate text-[12.5px] font-medium text-fg-3">{hint}</span>}
      </span>
      {href && <ChevronRight className="size-4 text-fg-3" aria-hidden />}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/* --------------------------------------------------------- exercise menu */

export function ExerciseMenuSheet({
  open,
  onOpenChange,
  name,
  slug,
  first,
  last,
  skipped,
  hasNote,
  canRemove,
  onHowTo,
  onReplace,
  onMove,
  onWarmup,
  onAddSet,
  onRemoveSet,
  onNote,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  slug: string;
  first: boolean;
  last: boolean;
  skipped: boolean;
  hasNote: boolean;
  canRemove: boolean;
  onHowTo: () => void;
  onReplace: () => void;
  onMove: (dir: -1 | 1) => void;
  onWarmup: () => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onNote: () => void;
  onSkip: () => void;
}) {
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  const lib = getExercise(slug);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={name} description="Exercise options">
      <div className="-mx-2 flex flex-col gap-0.5 pb-1">
        {lib && <MenuItem icon={<BookOpen className="size-[18px]" />} label="How to & form tips" onClick={run(onHowTo)} />}
        <MenuItem icon={<Replace className="size-[18px]" />} label="Replace exercise" hint="Logged sets stay with this exercise" onClick={run(onReplace)} />
        <MenuItem icon={<ArrowUp className="size-[18px]" />} label="Move up" disabled={first} onClick={run(() => onMove(-1))} />
        <MenuItem icon={<ArrowDown className="size-[18px]" />} label="Move down" disabled={last} onClick={run(() => onMove(1))} />
        <MenuItem icon={<Flame className="size-[18px]" />} label="Add warm-up set" hint="Shown as W · not counted in volume or records" onClick={run(onWarmup)} />
        <MenuItem icon={<Plus className="size-[18px]" />} label="Add set" onClick={run(onAddSet)} />
        <MenuItem icon={<Minus className="size-[18px]" />} label="Remove last unlogged set" disabled={!canRemove} onClick={run(onRemoveSet)} />
        <MenuItem icon={<StickyNote className="size-[18px]" />} label={hasNote ? "Edit note" : "Add note"} onClick={run(onNote)} />
        <MenuItem
          icon={skipped ? <Undo2 className="size-[18px]" /> : <SkipForward className="size-[18px]" />}
          label={skipped ? "Resume exercise" : "Skip exercise"}
          hint={skipped ? undefined : "Unlogged sets are dropped when you finish"}
          onClick={run(onSkip)}
        />
        <MenuItem icon={<Clock className="size-[18px]" />} label="Exercise history" href={`/training/exercise/${slug}`} />
      </div>
      <p className="mt-2 rounded-[12px] bg-s3 px-3.5 py-3 text-[13px] leading-relaxed text-fg-2">
        Sharp or joint pain is a stop sign. Replace or skip the exercise — never train through it.
      </p>
    </Sheet>
  );
}

/* --------------------------------------------------------------- how-to */

export function HowToSheet({ open, onOpenChange, slug, name, note }: { open: boolean; onOpenChange: (o: boolean) => void; slug: string; name: string; note?: string | null }) {
  const lib = getExercise(slug);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={name} description={lib ? musclesLine(lib.primary, lib.secondary) : undefined}>
      {lib ? (
        <div className="space-y-6 pb-2">
          {note && <p className="rounded-[12px] border border-line-gold/60 bg-gold-tint px-3.5 py-3 text-[14px] leading-relaxed text-fg">{note}</p>}
          <section>
            <h3 className="eyebrow mb-3">How to</h3>
            <ol className="space-y-3">
              {lib.instructions.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-fg">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-s3 text-[13px] font-semibold text-fg-2">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="eyebrow mb-3">Form tips</h3>
            <ul className="space-y-2.5">
              {lib.formTips.map((s, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-fg-2">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="text-[13px] text-fg-2">
            <p>
              Load is logged {lib.perHand ? "per dumbbell" : "as the total on the bar or stack"}
              {lib.perSide ? ", reps per side" : ""}. Rest about {Math.round(lib.rest / 60) || 1} min between sets.
            </p>
          </section>
          <a
            href={demoUrl(lib.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="press-soft flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] border border-line-strong bg-s3 px-4 text-[15px] font-bold text-fg hover:bg-s4"
          >
            <span>
              Watch a demonstration
              <span className="block text-[12px] font-medium text-fg-3">Opens a YouTube search in a new tab</span>
            </span>
            <ExternalLink className="size-4 text-fg-2" aria-hidden />
          </a>
        </div>
      ) : (
        <p className="pb-4 text-[14px] text-fg-2">No instructions are stored for this exercise.</p>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------- pick (replace / add) */

function matches(e: LibraryExercise, q: string) {
  if (!q) return true;
  const hay = `${e.name} ${[...e.primary, ...e.secondary].map(muscleLabel).join(" ")} ${e.equipment.replace("_", " ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export function PickExerciseSheet({
  open,
  onOpenChange,
  mode,
  current,
  busySlug,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "replace" | "add";
  current?: { slug: string; name: string; logged: number; open: number };
  busySlug: string | null;
  onPick: (lib: LibraryExercise) => void;
}) {
  const [q, setQ] = useState("");
  const subs = useMemo(() => {
    if (mode !== "replace" || !current) return [];
    return (getExercise(current.slug)?.substitutes ?? []).map(getExercise).filter((x): x is LibraryExercise => !!x);
  }, [mode, current]);
  const list = useMemo(() => LIBRARY.filter((e) => e.slug !== current?.slug && matches(e, q.trim())), [q, current?.slug]);

  const description =
    mode === "replace" && current
      ? current.logged
        ? `${current.logged} logged ${current.logged === 1 ? "set stays" : "sets stay"}. ${current.open} unlogged ${current.open === 1 ? "set switches" : "sets switch"}.`
        : `All ${current.open} sets switch to the new exercise.`
      : "Adds 2–3 sets at the end of the session.";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
      title={mode === "replace" ? `Replace ${current?.name ?? "exercise"}` : "Add exercise"}
      description={description}
    >
      <div className="sticky top-0 z-10 -mx-1 bg-s2 px-1 pb-3 pt-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${LIBRARY.length} exercises or muscles`}
            aria-label="Search the exercise library"
            enterKeyHint="search"
            autoComplete="off"
            className="h-[52px] w-full rounded-[12px] border border-line-field bg-s3 pl-10 pr-3.5 text-[16px] font-medium text-fg outline-none placeholder:text-fg-3 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)]"
          />
        </label>
      </div>
      {!q && subs.length > 0 && (
        <section className="mb-4">
          <h3 className="eyebrow mb-1.5 px-1">Good swaps</h3>
          <ExerciseList items={subs} busySlug={busySlug} onPick={onPick} />
        </section>
      )}
      <section className="pb-2">
        <h3 className="eyebrow mb-1.5 px-1">{q ? `${list.length} ${list.length === 1 ? "match" : "matches"}` : "Library"}</h3>
        {list.length ? <ExerciseList items={list} busySlug={busySlug} onPick={onPick} /> : <p className="px-1 py-6 text-center text-[14px] text-fg-2">Nothing matches “{q}”. Try a muscle, like “lats”.</p>}
      </section>
    </Sheet>
  );
}

function ExerciseList({ items, busySlug, onPick }: { items: LibraryExercise[]; busySlug: string | null; onPick: (e: LibraryExercise) => void }) {
  return (
    <ul className="-mx-2">
      {items.map((e) => (
        <li key={e.slug}>
          <button
            type="button"
            disabled={!!busySlug}
            onClick={() => onPick(e)}
            className="press-soft flex min-h-[56px] w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left hover:bg-white/[.04] disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-fg">{e.name}</span>
              <span className="block truncate text-[12.5px] font-medium text-fg-3">
                {musclesLine(e.primary, e.secondary, 3)} · {e.equipment.replace("_", " ")}
              </span>
            </span>
            {busySlug === e.slug ? <span className="text-[12px] font-semibold text-fg-2">Loading…</span> : <Plus className="size-4 shrink-0 text-fg-3" aria-hidden />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- notes */

export function NoteSheet({
  open,
  onOpenChange,
  title,
  description,
  initial,
  onSave,
  extra,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  initial: string;
  onSave: (text: string) => void;
  extra?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {open && <NoteForm initial={initial} onSave={onSave} onDone={() => onOpenChange(false)} extra={extra} />}
    </Sheet>
  );
}

function NoteForm({ initial, onSave, onDone, extra }: { initial: string; onSave: (t: string) => void; onDone: () => void; extra?: ReactNode }) {
  const [text, setText] = useState(initial);
  const over = text.length > 500;
  return (
    <div className="space-y-4 pb-2">
      <div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Grip, seat height, how it felt, anything to remember next time"
          aria-label="Note"
          aria-invalid={over || undefined}
          rows={4}
          enterKeyHint="done"
        />
        <p className={cn("mt-1.5 text-right text-[12px] font-medium", over ? "text-danger" : "text-fg-3")}>{text.length} / 500</p>
      </div>
      {extra}
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

/* ------------------------------------------------------------ set sheet */

export function SetSheetActions({ warm, canToggle, onToggleKind, onRemove }: { warm: boolean; canToggle: boolean; onToggleKind: () => void; onRemove: () => void }) {
  return (
    <div className="-mx-2 flex flex-col gap-0.5 border-t border-line-hair pt-2">
      {canToggle && <MenuItem icon={<Flame className="size-[18px]" />} label={warm ? "Make it a working set" : "Make it a warm-up set"} onClick={onToggleKind} />}
      <MenuItem icon={<Trash className="size-[18px]" />} label="Remove set" tone="danger" onClick={onRemove} />
    </div>
  );
}

/* --------------------------------------------------------------- finish */

export function FinishSheet({
  open,
  onOpenChange,
  logged,
  unlogged,
  saving,
  error,
  onSave,
  onDiscard,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  logged: number;
  unlogged: number;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  editing?: boolean;
}) {
  const none = logged === 0;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={editing ? "Save changes" : "Finish workout"}
      footer={
        none && !editing ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              Keep training
            </Button>
            <Button variant="destructive" size="lg" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" block loading={saving} onClick={onSave}>
            {editing ? "Save changes" : "Save session"}
          </Button>
        )
      }
    >
      <div className="pb-2">
        {none ? (
          <>
            <p className="num-lg text-fg">0</p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-2">No sets logged yet. Log at least one set to save this session, or discard it.</p>
          </>
        ) : (
          <>
            <p className="num-lg text-fg">
              {logged}
              <span className="unit">{logged === 1 ? "set logged" : "sets logged"}</span>
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
              {unlogged === 0
                ? "Every planned set is logged."
                : `${unlogged} unlogged ${unlogged === 1 ? "set" : "sets"} will be discarded. Logged sets are kept exactly as entered.`}
            </p>
          </>
        )}
        {saving && <p className="mt-3 text-[13px] font-medium text-fg-3">Syncing your sets…</p>}
        {error && (
          <p className="mt-3 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] font-medium text-fg" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function DiscardSheet({ open, onOpenChange, logged, busy, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; logged: number; busy: boolean; onConfirm: () => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Discard this workout?"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep training
          </Button>
          <Button variant="destructive-solid" size="lg" loading={busy} onClick={onConfirm}>
            Discard
          </Button>
        </div>
      }
    >
      <p className="pb-2 text-[15px] leading-relaxed text-fg-2">
        {logged
          ? `The ${logged} logged ${logged === 1 ? "set" : "sets"} won't count toward history, records or volume. You can undo right after.`
          : "Nothing is logged yet. You can undo right after."}
      </p>
    </Sheet>
  );
}
