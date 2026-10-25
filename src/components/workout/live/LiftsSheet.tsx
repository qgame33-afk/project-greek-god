"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Info, NotebookPen, Plus } from "lucide-react";
import { ListGroup, Row } from "@/components/ui/list";
import { Bar } from "@/components/ui/progress";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export interface LiftRowData {
  key: string;
  name: string;
  /** "4 sets · 12–20 reps · 25 lb" */
  detail: string;
  state: "done" | "skipped" | "pending";
  done: number;
  total: number;
  current: boolean;
  best: boolean;
}

export interface OptionalRowData {
  slug: string;
  name: string;
  /** "2 sets · 10–15 reps" */
  detail: string;
}

/**
 * The Lifts sheet (docs/DESIGN-V3-SIMPLE.md §4.2.9), opened from the top bar's centre: the workout,
 * "5 of 19 sets · 19 min · done about 5:45 PM" and the bar, then one row per lift (status, a drag
 * handle; a tap on the handle offers Move up / Move down, which VoiceOver and Switch Control use).
 * Tap a lift to jump to it. Optional lifts not in the workout follow under "Optional" with "Add".
 * Then Add exercise, Notes for today, Workout note, and Discard workout with its confirm.
 */
export function LiftsSheet({
  open,
  onOpenChange,
  title,
  description,
  progress,
  rows,
  optional,
  notesCount,
  live,
  onPick,
  onMove,
  onAddOptional,
  onAdd,
  onNotesToday,
  onWorkoutNote,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  progress: number;
  rows: LiftRowData[];
  optional: OptionalRowData[];
  notesCount: number;
  live: boolean;
  onPick: (key: string) => void;
  onMove: (key: string, to: number) => void;
  onAddOptional: (slug: string) => void;
  onAdd: () => void;
  onNotesToday: () => void;
  onWorkoutNote: () => void;
  onDiscard: () => void;
}) {
  const [discard, setDiscard] = useState(false);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={<span data-budget-name="">{title}</span>} description={description}>
        <div className="space-y-3 pb-2">
          <Bar value={progress} thin />
          <ListGroup ariaLabel="Lifts">
            {rows.map((r, i) => (
              <LiftRow key={r.key} row={r} index={i} count={rows.length} onPick={() => onPick(r.key)} onMove={(to) => onMove(r.key, to)} />
            ))}
          </ListGroup>
          {optional.length > 0 && (
            <section>
              <h3 className="t-label mb-2 mt-4 px-1">Optional</h3>
              <ListGroup>
                {optional.map((o) => (
                  <div key={o.slug} className="flex min-h-[68px] items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="t-row truncate" data-budget-name="">
                        {o.name}
                      </p>
                      <p className="t-label">{o.detail}</p>
                    </div>
                    <button type="button" onClick={() => onAddOptional(o.slug)} aria-label={`Add ${o.name}`} className="press t-button h-11 shrink-0 rounded-pill bg-control px-[18px] text-fg">
                      Add
                    </button>
                  </div>
                ))}
              </ListGroup>
            </section>
          )}
          <ListGroup className="mt-4">
            <Row icon={Plus} title="Add exercise" chevron={false} onClick={onAdd} />
            {notesCount > 0 && <Row icon={Info} title="Notes for today" value={String(notesCount)} onClick={onNotesToday} />}
            <Row icon={NotebookPen} title="Workout note" onClick={onWorkoutNote} />
          </ListGroup>
          {live && (
            <button type="button" onClick={() => setDiscard(true)} className="press t-button min-h-14 w-full rounded-pill text-danger">
              Discard workout
            </button>
          )}
        </div>
      </Sheet>
      <Confirm open={discard} onOpenChange={setDiscard} title="Discard this workout?" body="Its logged sets are removed." confirmLabel="Discard" onConfirm={onDiscard} />
    </>
  );
}

function LiftRow({ row: r, index, count, onPick, onMove }: { row: LiftRowData; index: number; count: number; onPick: () => void; onMove: (to: number) => void }) {
  const [moving, setMoving] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const status =
    r.state === "done" ? (
      <span aria-label="Done" className="grid size-9 place-items-center rounded-full bg-fg text-bg">
        <Check className="size-5" strokeWidth={2.6} aria-hidden />
      </span>
    ) : r.state === "skipped" ? (
      <span className="t-label">Skipped</span>
    ) : (
      <span className="t-row tabular-nums">
        {r.done} of {r.total}
      </span>
    );
  return (
    <div
      className={cn("relative flex items-center bg-surface", r.current && "bg-control", dy !== 0 && "z-10 shadow-[0_8px_24px_rgb(0_0_0/.5)]")}
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
    >
      <button type="button" onClick={onPick} aria-current={r.current ? "step" : undefined} className="press-soft flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("t-row block truncate", r.state === "skipped" && "text-fg-2")} data-budget-name="">
            {r.name}
          </span>
          <span className="t-label block truncate">
            {r.best ? <span className="font-semibold text-gold">New best · </span> : null}
            {r.detail}
          </span>
        </span>
        {!moving && status}
      </button>
      {moving && (
        <span className="flex shrink-0 gap-1">
          <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${r.name} up`} className="press grid size-11 place-items-center rounded-full bg-card-3 text-fg disabled:opacity-30">
            <ArrowUp className="size-5" aria-hidden />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${r.name} down`} className="press grid size-11 place-items-center rounded-full bg-card-3 text-fg disabled:opacity-30">
            <ArrowDown className="size-5" aria-hidden />
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={moving ? `Done moving ${r.name}` : `Move ${r.name}`}
        aria-expanded={moving}
        className="grid h-[68px] w-12 shrink-0 touch-none place-items-center text-fg-3"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const row = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          drag.current = { y: e.clientY, h: row.height, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const delta = e.clientY - d.y;
          if (Math.abs(delta) > 6) d.moved = true;
          if (d.moved) setDy(Math.max(-index * d.h, Math.min((count - 1 - index) * d.h, delta)));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (d.moved) {
            dragged.current = true;
            const to = Math.max(0, Math.min(count - 1, index + Math.round(dy / d.h)));
            setDy(0);
            if (to !== index) onMove(to);
          }
        }}
        onClick={() => {
          // a tap (or VoiceOver / Switch Control activation) offers Move up / Move down
          if (dragged.current) dragged.current = false;
          else setMoving((m) => !m);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDy(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && index > 0) {
            e.preventDefault();
            onMove(index - 1);
          } else if (e.key === "ArrowDown" && index < count - 1) {
            e.preventDefault();
            onMove(index + 1);
          }
        }}
      >
        <GripVertical className="size-5" strokeWidth={1.9} aria-hidden />
      </button>
    </div>
  );
}

/** The day's training notes, read-only (`templateDef(key).notes`). */
export function NotesTodaySheet({ open, onOpenChange, notes }: { open: boolean; onOpenChange: (o: boolean) => void; notes: string[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Notes for today">
      <ul className="space-y-2.5 pb-2" data-program-text="">
        {notes.map((n, i) => (
          <li key={i} className="t-body rounded-tile-lg bg-surface px-4 py-3.5">
            {n}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
