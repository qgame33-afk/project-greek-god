"use client";

import { useState } from "react";
import { Activity, Check, ChevronLeft, Copy, Plus } from "lucide-react";
import { Stepper } from "@/components/ui/controls";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ListGroup, Row } from "@/components/ui/list";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { TankRow } from "./rest-view";
import type { TipRow } from "./words";

/* ------------------------------------------------------------ set sheet */

export interface SetRowData {
  id: string;
  /** "Set 1", "Warm-up" */
  label: string;
  /** "25 × 16" (logged or planned), "now" for the current set */
  text: string;
  logged: boolean;
  current: boolean;
  best: boolean;
  weight: number | null;
  work: number | null;
  rir: number | null;
  notes: string | null;
}

/**
 * The set sheet (docs/DESIGN-V3-SIMPLE.md §4.2.8), opened from the set dots: "Set 1 · 25 × 16 ✓",
 * "Set 2 · now", "Set 3 · 25 × 16" (planned values in --text-2). A logged set opens its editor:
 * weight, reps, "Left in the tank", note, "Unlog", "Remove set". Also "Copy last time's sets" and
 * "Add a set". A new best reads "New best" in gold text on its row.
 */
export function SetSheet({
  open,
  onOpenChange,
  title,
  rows,
  weight,
  work,
  aim,
  canCopy,
  onPick,
  onWeight,
  onWork,
  onRir,
  onNote,
  onUnlog,
  onRemove,
  onCopy,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  rows: SetRowData[];
  /** The weight stepper (null for lifts without a weight). */
  weight: { unit: string; step: number } | null;
  work: { unit: string; step: number };
  aim: string | null;
  canCopy: boolean;
  onPick: (id: string) => void;
  onWeight: (id: string, v: number) => void;
  onWork: (id: string, v: number) => void;
  onRir: (id: string, v: number | null) => void;
  onNote: (id: string, text: string) => void;
  onUnlog: (id: string) => void;
  onRemove: (id: string) => void;
  onCopy: () => void;
  onAdd: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const edit = editId ? rows.find((r) => r.id === editId) : undefined;
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setEditId(null);
  };
  return (
    <Sheet open={open} onOpenChange={close} title={edit ? edit.label : <span data-budget-name="">{title}</span>} description={edit ? <span data-budget-name="">{title}</span> : undefined}>
      {edit ? (
        <div className="space-y-4 pb-2">
          <button type="button" onClick={() => setEditId(null)} className="press t-label hit-44 -ml-1 inline-flex items-center gap-1 font-semibold text-fg">
            <ChevronLeft className="size-5" aria-hidden /> All sets
          </button>
          {weight && (
            <div className="rounded-tile-lg bg-surface px-4 py-3">
              <p className="t-label mb-1">Weight</p>
              <Stepper value={edit.weight ?? 0} step={weight.step} min={0} max={2000} onChange={(v) => onWeight(edit.id, v)} label="Weight" valueText={`${edit.weight ?? 0} ${weight.unit}`} format={(v) => `${v} ${weight.unit}`} />
            </div>
          )}
          <div className="rounded-tile-lg bg-surface px-4 py-3">
            <p className="t-label mb-1">{work.unit === "sec" ? "Time" : "Reps"}</p>
            <Stepper value={edit.work ?? 0} step={work.step} min={0} max={work.unit === "sec" ? 900 : 100} onChange={(v) => onWork(edit.id, v)} label={work.unit === "sec" ? "Seconds" : "Reps"} valueText={`${edit.work ?? 0} ${work.unit}`} format={(v) => `${v} ${work.unit}`} />
          </div>
          <TankRow value={edit.rir} aim={aim} onChange={(v) => onRir(edit.id, v)} className="rounded-tile-lg bg-surface px-4 py-3" />
          <NoteField key={edit.id} initial={edit.notes ?? ""} onSave={(t) => onNote(edit.id, t)} />
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                onUnlog(edit.id);
                setEditId(null);
              }}
            >
              Unlog
            </Button>
            <Button
              variant="destructive"
              size="lg"
              onClick={() => {
                onRemove(edit.id);
                setEditId(null);
              }}
            >
              Remove set
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <ListGroup ariaLabel="Sets">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => (r.logged ? setEditId(r.id) : (onPick(r.id), close(false)))}
                className={cn("press-soft flex min-h-14 w-full items-center gap-3 px-4 text-left", r.current && "bg-control")}
              >
                <span className="t-row w-20 shrink-0">{r.label}</span>
                <span className={cn("t-body min-w-0 flex-1 truncate tabular-nums", r.logged || r.current ? "text-fg" : "text-fg-2")}>{r.current && !r.logged ? "now" : r.text}</span>
                {r.best && <span className="t-label shrink-0 font-semibold text-gold">New best</span>}
                {r.logged && <Check className="size-5 shrink-0 text-fg" strokeWidth={2.4} aria-label="Logged" />}
              </button>
            ))}
          </ListGroup>
          <ListGroup>
            {canCopy && <Row icon={Copy} title="Copy last time's sets" chevron={false} onClick={onCopy} />}
            <Row icon={Plus} title="Add a set" chevron={false} onClick={onAdd} />
          </ListGroup>
        </div>
      )}
    </Sheet>
  );
}

function NoteField({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== initial.trim() && onSave(text.trim())}
      placeholder="Note for this set"
      aria-label="Note for this set"
      rows={2}
      maxLength={500}
    />
  );
}

/* --------------------------------------------------------------- finish */

/**
 * Finish (§4.2.10): "Finish Shoulders, Biceps & Triceps B?", what is dropped, gold "Finish
 * workout" (the existing finish, reconcile and outbox call), secondary "Keep going", danger
 * "Discard workout" with its own confirm. With nothing logged it offers Keep going / Discard.
 */
export function FinishSheet({
  open,
  onOpenChange,
  name,
  line,
  none,
  saving,
  error,
  onFinish,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  line: string;
  none: boolean;
  saving: boolean;
  error: string | null;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)} title={none ? "Nothing logged yet" : <span data-budget-name="">{`Finish ${name}?`}</span>} description={none ? "Log a set to finish this workout, or discard it." : line}>
        <div className="space-y-2.5 pb-1 pt-2">
          {error && (
            <p role="alert" className="t-body rounded-tile-lg bg-danger-soft px-4 py-3.5 text-fg">
              {error}
            </p>
          )}
          {!none && (
            <Button variant="primary" size="lg" block loading={saving} onClick={onFinish}>
              {saving ? "Saving" : "Finish workout"}
            </Button>
          )}
          <Button variant="secondary" size="lg" block disabled={saving} onClick={() => onOpenChange(false)}>
            Keep going
          </Button>
          <Button variant="destructive" size="lg" block disabled={saving} onClick={() => setConfirm(true)}>
            Discard workout
          </Button>
        </div>
      </Sheet>
      <Confirm open={confirm} onOpenChange={setConfirm} title="Discard this workout?" body="Its logged sets are removed." confirmLabel="Discard" onConfirm={onDiscard} />
    </>
  );
}

/* --------------------------------------------------------- overlap tip */

/**
 * The in-workout tip (§4.2.15): a calm --card (never gold, never red), `role="status"`: an
 * `Activity` tile, "Triceps tired from Thursday", the evidence line, the changes as plain rows,
 * then secondary "Apply" and ghost "Keep plan". In the short layout the rows hide and "Apply"
 * reads "See change" (it opens TipSheet).
 */
export function TipCard({ title, evidence, rows, short, onApply, onSeeChange, onKeep }: { title: string; evidence: string | null; rows: TipRow[]; short: boolean; onApply: () => void; onSeeChange: () => void; onKeep: () => void }) {
  return (
    <section role="status" aria-live="polite" className="rounded-card bg-surface p-5" data-program-text="">
      <div className="flex items-center gap-3.5">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-tile bg-control text-fg">
          <Activity className="size-5" strokeWidth={1.9} />
        </span>
        <h2 className="t-row">{title}</h2>
      </div>
      {evidence && <p className="t-label mt-3">{evidence}</p>}
      {!short && rows.length > 0 && (
        <ListGroup className="mt-3">
          {rows.map((r, i) => (
            <Row key={i} title={r.title} subtitle={r.detail} />
          ))}
        </ListGroup>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Button variant="secondary" size="lg" onClick={short ? onSeeChange : onApply}>
          {short ? "See change" : "Apply"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onKeep}>
          Keep plan
        </Button>
      </div>
    </section>
  );
}

/** The short layout's tip sheet: the change rows and a gold "Apply". */
export function TipSheet({ open, onOpenChange, title, rows, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; rows: TipRow[]; onApply: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-3 pb-1" data-program-text="">
        <ListGroup>
          {rows.map((r, i) => (
            <Row key={i} title={r.title} subtitle={r.detail} />
          ))}
        </ListGroup>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            onApply();
            onOpenChange(false);
          }}
        >
          Apply
        </Button>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------- stale workout */

/** "This workout started yesterday" (§4.2.13) with gold "Finish it" and danger "Discard it". */
export function StaleSheet({ open, onOpenChange, title, body, onFinish, onDiscard }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; onFinish: () => void; onDiscard: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={title} description={body}>
        <div className="space-y-2.5 pb-1 pt-2">
          <Button variant="primary" size="lg" block onClick={onFinish}>
            Finish it
          </Button>
          <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)}>
            Discard it
          </Button>
        </div>
      </Sheet>
      <Confirm open={confirm} onOpenChange={setConfirm} title="Discard this workout?" body="Its logged sets are removed." confirmLabel="Discard" onConfirm={onDiscard} />
    </>
  );
}
