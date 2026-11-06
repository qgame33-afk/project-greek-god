"use client";

import { useState } from "react";
import { ExternalLink, History, Info, Layers, NotebookPen, Plus, Repeat, SkipForward, Undo2 } from "lucide-react";
import { effortText } from "@/components/training/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { ListGroup, RadioGroup, RadioRow, Row } from "@/components/ui/list";
import { Collapse } from "@/components/ui/misc";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { shortDate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
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

export interface PickChoice {
  everyTime: boolean;
  sibling: boolean;
}

/**
 * The picker's confirm view in a workout (§4.2.6, §4.2.9): the lift he picked, what today gets
 * ("2 sets · 8–12 reps · rest 1:30"), how to do it, and how long the change lasts: "Just today"
 * (the plan stays the same) or "Every time" (the day's template changes; the other rotation only
 * when he turns it on). One gold action names the change. Nothing is written before it.
 */
export function PickConfirm({
  mode,
  lib,
  current,
  plan,
  everyTime,
  sibling,
  offline,
  busy,
  onConfirm,
  onBack,
}: {
  mode: "replace" | "add";
  lib: LibraryExercise;
  current?: { name: string; logged: number };
  /** "2 sets · 8–12 reps · rest 1:30" */
  plan: string;
  /** "Monday's Arms & Shoulders" when "Every time" can be offered (live, the template has the lift / can take it), else null. */
  everyTime: string | null;
  /** "Thursday's Arms & Shoulders" when the other rotation can take the same change, else null. */
  sibling: string | null;
  offline: boolean;
  busy: boolean;
  onConfirm: (c: PickChoice) => void;
  onBack: () => void;
}) {
  const [every, setEvery] = useState(false);
  const [both, setBoth] = useState(false);
  const [how, setHow] = useState(false);
  const canEvery = !!everyTime && !offline;
  const isEvery = every && canEvery;
  const verb = mode === "replace" ? "Swap" : "Add";
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-tile-lg bg-surface px-4 py-3.5">
        <p className="t-label">{musclesLine(lib.primary, lib.secondary, 3)}</p>
        <p className="t-row mt-1">{plan}</p>
        {mode === "replace" && current && (
          <p className="t-label mt-1">
            Instead of {current.name}.{current.logged ? ` Your ${current.logged} logged ${current.logged === 1 ? "set stays" : "sets stay"} with it.` : ""}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-tile-lg bg-surface">
        <Row icon={Info} title="How to do it" subtitle={how ? undefined : "Steps and form tips"} chevron={false} onClick={() => setHow((h) => !h)} ariaLabel={how ? "Hide how to do it" : "Show how to do it"} />
        <Collapse open={how}>
          <div className="px-4 pb-4">
            <ol className="space-y-2.5" data-program-text="">
              {lib.instructions.map((x, i) => (
                <li key={i} className="t-body flex gap-3">
                  <span className="t-cap grid size-6 shrink-0 place-items-center rounded-full bg-control font-semibold text-fg">{i + 1}</span>
                  <span>{x}</span>
                </li>
              ))}
            </ol>
            <ul className="t-label mt-3 list-disc space-y-1.5 pl-5">
              {lib.formTips.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </Collapse>
      </div>
      <RadioGroup ariaLabel="How long">
        <RadioRow title="Just today" subtitle={mode === "replace" ? "Your plan stays the same." : "Only in this workout."} checked={!isEvery} onSelect={() => setEvery(false)} />
        {everyTime && (
          <RadioRow
            title="Every time"
            subtitle={offline ? "Needs a connection. Just today works offline." : `${mode === "replace" ? "Changes" : "Adds it to"} ${everyTime} from now on.`}
            checked={isEvery}
            disabled={!canEvery}
            onSelect={() => setEvery(true)}
          />
        )}
      </RadioGroup>
      {isEvery && sibling && (
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-tile-lg bg-surface px-4 py-3">
          <span className="min-w-0">
            <span className="t-row block">Also on {sibling.split("'s ")[0]}</span>
            <span className="t-label mt-0.5 block">{mode === "replace" ? `Changes ${sibling} too.` : `Adds it to ${sibling} too.`}</span>
          </span>
          <Switch checked={both} onCheckedChange={setBoth} label={`Also change ${sibling}`} />
        </div>
      )}
      <SheetFooterBar>
        <Button variant="primary" size="lg" block loading={busy} disabled={busy} onClick={() => onConfirm({ everyTime: isEvery, sibling: isEvery && !!sibling && both })}>
          {verb} {isEvery ? "every time" : "for today"}
        </Button>
        <Button variant="ghost" size="md" block className="mt-1" onClick={onBack} disabled={busy}>
          Pick another
        </Button>
      </SheetFooterBar>
    </div>
  );
}
