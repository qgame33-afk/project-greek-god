"use client";

import { Check, ChevronRight, Plus, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export interface LiftRow {
  key: string;
  index: number;
  name: string;
  state: "done" | "skipped" | "pending";
  current: boolean;
  /** "2/3 · 190×5 · 190×5" or "3 × 5–8". */
  detail: string;
  record: boolean;
}

/**
 * All lifts (§3.2.2): the frieze opens this list of 44 px+ rows — jump to any lift, resume a
 * skipped one, add an exercise, keep session notes, or discard the workout. Swiping is never
 * required to move between lifts.
 */
export function LiftsSheet({
  open,
  onOpenChange,
  title,
  description,
  rows,
  live,
  notes,
  onNotes,
  onNotesBlur,
  onPick,
  onResume,
  onAdd,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  rows: LiftRow[];
  live: boolean;
  notes: string;
  onNotes: (v: string) => void;
  onNotesBlur: () => void;
  onPick: (key: string) => void;
  onResume: (key: string) => void;
  onAdd: () => void;
  onDiscard: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <ol className="-mx-2 pb-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (r.state === "skipped" ? onResume(r.key) : onPick(r.key))}
              aria-current={r.current ? "step" : undefined}
              className={cn("press-soft flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-field px-2 text-left hover:bg-white/[.03]", r.current && "bg-m2")}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  r.state === "done" ? "bg-leaf-300 text-ink" : r.current ? "text-ivory shadow-[inset_0_0_0_1.5px_var(--leaf-line)]" : "text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]",
                )}
              >
                {r.state === "done" ? <Check className="size-4" strokeWidth={2.4} /> : r.state === "skipped" ? <SkipForward className="size-3.5" strokeWidth={1.8} /> : <span className="t-num-s">{r.index}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("t-title-3 block truncate", r.state === "skipped" ? "text-stone line-through decoration-ash" : "text-ivory")}>
                  {r.name}
                  {r.record && <span className="t-tag ml-2 align-middle text-leaf-300">record</span>}
                </span>
                <span className="t-meta tnum block truncate text-stone">{r.state === "skipped" ? "Skipped · tap to resume" : r.detail}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <Button variant="secondary" block size="lg" className="mt-2" onClick={onAdd}>
        <Plus className="size-4" aria-hidden /> Add exercise
      </Button>
      <div className="mt-6">
        <label htmlFor="session-notes" className="t-eyebrow mb-2 block">
          Session notes
        </label>
        <Textarea
          id="session-notes"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          onBlur={onNotesBlur}
          placeholder="Energy, sleep, anything that affected today"
          rows={3}
          maxLength={2000}
        />
      </div>
      {live && (
        <button type="button" onClick={onDiscard} className="t-callout mt-4 inline-flex min-h-11 items-center font-semibold text-stone hover:text-cinnabar">
          Discard workout
        </button>
      )}
    </Sheet>
  );
}
