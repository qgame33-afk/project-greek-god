"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Ellipsis, GripVertical, Layers, NotebookPen, Plus, Repeat, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Segmented, Stepper, Switch } from "@/components/ui/controls";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ListGroup, Row } from "@/components/ui/list";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { scheduleOf, useSaveTemplate, useTemplates, type StoredTemplate } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import { templateDef, visibleWarmup } from "@/lib/training/programs";
import { weekdaysFor } from "@/lib/training/schedule";
import type { RepUnit, TemplateExercise, TemplateKey } from "@/lib/training/types";
import { RIR_OPTIONS, moveItem, newTemplateExercise, sameTemplateContent, substituteExercise, validateTemplate } from "@/lib/training/volume";
import { effortShort, plural, repText } from "./format";
import { LibraryPicker } from "./LibraryPicker";
import { Caption, SheetActions, SheetReason } from "./parts";
import { DetailSkeleton } from "./Skeletons";
import { useDragReorder } from "./useDragReorder";
import { useMounted } from "./useMounted";
import { useRefreshRestored } from "./useRefreshRestored";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const draftKey = (k: string) => `pgg.template-draft.${k}`;
/** Rest exactly as stored, m:ss. */
export const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Reps in the tank" choices: PROGRAM's options plus "0" (to failure) and whatever is stored. */
const effortOptions = (current: string) => [...new Set(["0", ...RIR_OPTIONS, current])];

/**
 * /training/program/[key] — the workout editor (docs/DESIGN-V3-SIMPLE.md §4.3.12,
 * `template-editor`). Any key of either program; the page itself 404s an unknown key. The day's
 * lifts as rows (handle, name, "4 sets · 12–20 reps each side · rest 1:00") → an exercise sheet;
 * Add exercise; warm-up steps; Quinton's notes for the day (read-only); Reset to the plan; a
 * sticky gold Save. Edits never touch completed or active workouts.
 */
export function TemplateEditor({ templateKey }: { templateKey: string }) {
  const mounted = useMounted();
  if (!mounted) return <DetailSkeleton />;
  return <Loaded templateKey={templateKey as TemplateKey} />;
}

function Loaded({ templateKey }: { templateKey: TemplateKey }) {
  const { byKey, loading } = useTemplates();
  useRefreshRestored();
  const stored = byKey[templateKey];
  if (loading || !stored) return <DetailSkeleton />;
  return <Editor key={templateKey} stored={stored} />;
}

function Editor({ stored }: { stored: StoredTemplate }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { profile } = useProfile();
  const save = useSaveTemplate();
  const busy = useRef(false);
  const def = templateDef(stored.key)!;
  const [draft, setDraft] = useState<StoredTemplate>(() => clone(stored));
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // unsaved edits from an earlier visit (kept in sessionStorage when the page was left)
  const [earlier, setEarlier] = useState<StoredTemplate | null>(() => {
    try {
      const raw = sessionStorage.getItem(draftKey(stored.key));
      const d = raw ? (JSON.parse(raw) as StoredTemplate) : null;
      return d && Array.isArray(d.exercises) && !sameTemplateContent(d, stored) ? d : null;
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "sub"; index: number } | null>(null);
  const [sheet, setSheet] = useState<"more" | "rename" | "warmup" | "notes" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // keep the form in step with the stored template until editing starts
  const [base, setBase] = useState(stored);
  if (!sameTemplateContent(stored, base)) {
    setBase(stored);
    if (sameTemplateContent(draft, base)) setDraft(clone(stored));
  }

  const dirty = !sameTemplateContent(draft, stored);
  const { ok, errors } = validateTemplate(draft);
  const days = weekdaysFor(scheduleOf(profile ?? undefined), stored.key);
  const isPlan = sameTemplateContent(draft, def);
  const working = draft.exercises.filter((e) => !e.optional);
  const notes = def.notes ?? [];

  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey(stored.key), JSON.stringify(draft));
      else if (!earlier) sessionStorage.removeItem(draftKey(stored.key));
    } catch {
      /* storage blocked: the leave guard still protects in-app links */
    }
  }, [dirty, draft, stored.key, earlier]);

  // leaving with unsaved edits: reloads get the browser prompt, in-app links a Confirm
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const forgetDraft = () => {
    try {
      sessionStorage.removeItem(draftKey(stored.key));
    } catch {
      /* nothing stored */
    }
  };
  const writeCache = (t: StoredTemplate) => qc.setQueriesData<StoredTemplate[]>({ queryKey: ["templates"] }, (rows) => (rows ? rows.map((r) => (r.key === t.key ? { ...r, ...t } : r)) : rows));

  const persist = async (next: StoredTemplate, message: string) => {
    if (busy.current) return false;
    busy.current = true;
    const prev = clone(stored);
    try {
      await save.mutateAsync(next);
    } catch {
      return false; // the form keeps every edit; the hook said why
    } finally {
      busy.current = false;
    }
    writeCache(next);
    forgetDraft();
    toast.success(message, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          save
            .mutateAsync(prev)
            .then(() => {
              writeCache(prev);
              setDraft(clone(prev));
              toast("Previous version restored.");
            })
            .catch(() => {}),
      },
    });
    return true;
  };

  const onSave = async () => {
    if (!dirty) return;
    if (!ok) {
      setShowErrors(true);
      const first = Object.keys(errors.exercise)[0];
      if (first != null) setOpen(Number(first));
      else if (errors.name) setSheet("rename");
      else if (Object.keys(errors.warmup).length) setSheet("warmup");
      toast.error("A few fields need fixing before saving.");
      return;
    }
    const next = { ...draft, name: draft.name.trim(), focus: draft.focus.trim(), warmup: draft.warmup.map((w) => ({ label: w.label.trim(), detail: w.detail.trim() })) };
    if (await persist(next, `${next.name} saved`)) {
      setDraft(clone(next));
      setShowErrors(false);
    }
  };
  const onReset = async () => {
    const next: StoredTemplate = { ...clone(def), id: stored.id };
    if (await persist(next, `${def.name} is back to the plan`)) {
      setDraft(clone(next));
      setShowErrors(false);
    }
  };

  const setEx = (i: number, patch: Partial<TemplateExercise>) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const removeEx = (i: number) => {
    const removed = draft.exercises[i];
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }));
    setOpen(null);
    toast(`Removed ${removed.name}`, {
      description: "Save to keep the change.",
      duration: 6000,
      action: { label: "Undo", onClick: () => setDraft((d) => ({ ...d, exercises: [...d.exercises.slice(0, i), removed, ...d.exercises.slice(i)] })) },
    });
  };
  const moveEx = (from: number, to: number) => {
    if (to < 0 || to >= draft.exercises.length) return;
    setDraft((d) => ({ ...d, exercises: moveItem(d.exercises, from, to) }));
    setOpen((o) => (o === from ? to : o));
  };
  const drag = useDragReorder(draft.exercises.length, moveEx);
  const subFor = picker?.mode === "sub" ? draft.exercises[picker.index] : null;
  const dayLabel = days.length === 0 ? "Not in your week" : days.length === 1 ? DAY[days[0]] : days.map((d) => SHORT[d]).join(" & ");

  const more = (
    <Button variant="secondary" size="icon" aria-label="More" aria-haspopup="dialog" onClick={() => setSheet("more")}>
      <Ellipsis aria-hidden />
    </Button>
  );

  return (
    <div className="pb-4">
      <BackHeader
        href="/training?tab=program"
        parent="Program"
        right={more}
        title={
          <span className="break-words" data-budget-name="">
            {draft.name.trim() || "Untitled"}
          </span>
        }
        subtitle={
          <span aria-live="polite">
            {dayLabel} · {plural(working.length, "lift")} · {plural(working.reduce((n, e) => n + e.sets, 0), "set")}
          </span>
        }
      />

      {earlier && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile-lg bg-surface px-4 py-2">
          <p className="t-row min-w-0 flex-1">You left unsaved changes here.</p>
          <div className="-mr-2 flex shrink-0 items-center">
            <Button variant="ghost" size="sm" onClick={() => (setEarlier(null), forgetDraft())}>
              Discard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => (setDraft(clone(earlier)), setEarlier(null))}>
              Restore
            </Button>
          </div>
        </div>
      )}

      {errors.exercises && showErrors && (
        <p className="t-label mt-4 text-danger" role="alert">
          {errors.exercises}
        </p>
      )}
      <ol className="mt-5 overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line" aria-label="Lifts">
        {draft.exercises.map((e, i) => (
          <li key={`${e.slug}-${i}`} className={cn("flex min-h-[68px] items-center gap-1 bg-surface pl-1.5 pr-3", drag.dragging === i && "shadow-[0_0_0_1.5px_var(--ui-line)]")} style={drag.style(i)}>
            <span {...drag.handle(i)}>
              <GripVertical className="size-5" strokeWidth={1.9} />
            </span>
            <button type="button" onClick={() => setOpen(i)} aria-haspopup="dialog" className="press-soft flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="t-row block" data-budget-name="">
                  {e.name}
                </span>
                <span className={cn("t-label mt-0.5 block", showErrors && errors.exercise[i] && "text-danger")}>
                  {showErrors && errors.exercise[i] ? errors.exercise[i] : `${plural(e.sets, "set")} · ${repText(e)} · rest ${fmtRest(e.rest)}${e.optional ? " · optional" : ""}`}
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 -rotate-90 text-fg-3" strokeWidth={1.9} aria-hidden />
            </button>
          </li>
        ))}
      </ol>

      <ListGroup className="mt-3">
        <Row icon={Plus} title="Add exercise" onClick={() => setPicker({ mode: "add" })} chevron={false} />
        <Row icon={Layers} title="Warm-up steps" value={String(visibleWarmup(draft.warmup).length)} onClick={() => setSheet("warmup")} />
        {notes.length > 0 && <Row icon={NotebookPen} title="Notes for this day" value={String(notes.length)} onClick={() => setSheet("notes")} />}
      </ListGroup>

      <Button variant="ghost" size="lg" block className="mt-4 text-fg-2" disabled={isPlan || save.isPending} onClick={() => setConfirmReset(true)}>
        Reset to the plan
      </Button>

      <div className="sticky bottom-[calc(var(--chrome-clear)-8px)] z-(--z-sticky) -mx-gutter mt-3 bg-bg px-gutter pb-1 pt-3">
        <Button variant="primary" size="lg" block onClick={onSave} loading={save.isPending} disabled={!dirty}>
          {dirty ? "Save" : "Saved"}
        </Button>
      </div>

      <ExerciseSheet
        index={open}
        e={open != null ? draft.exercises[open] : null}
        count={draft.exercises.length}
        error={open != null && showErrors ? errors.exercise[open] : undefined}
        onClose={() => setOpen(null)}
        onChange={(p) => open != null && setEx(open, p)}
        onMove={(dir) => open != null && moveEx(open, open + dir)}
        onRemove={() => open != null && removeEx(open)}
        onSwap={() => open != null && setPicker({ mode: "sub", index: open })}
      />

      <Sheet open={sheet === "more"} onOpenChange={(o) => !o && setSheet(null)} title={draft.name.trim() || stored.name}>
        <ListGroup className="mb-4">
          <Row title="Rename" onClick={() => setSheet("rename")} />
          <Row title="Reset to the plan" onClick={() => (setSheet(null), setConfirmReset(true))} chevron={false} />
        </ListGroup>
      </Sheet>

      <Sheet open={sheet === "rename"} onOpenChange={(o) => !o && setSheet(null)} title="Rename">
        <div className="flex flex-col gap-4 pb-2">
          <Field label="Name" error={showErrors ? errors.name : null} hint={`${draft.name.length}/40`}>
            {(id) => <Input id={id} value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={showErrors && !!errors.name} autoComplete="off" enterKeyHint="done" />}
          </Field>
          <Field label="Focus" hint="Optional">
            {(id) => <Textarea id={id} value={draft.focus} maxLength={200} rows={2} onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))} />}
          </Field>
          <Caption className="mt-0">Save on the workout page to keep it.</Caption>
          <Button variant="secondary" size="lg" block onClick={() => setSheet(null)}>
            Done
          </Button>
        </div>
      </Sheet>

      <WarmupSheet open={sheet === "warmup"} onOpenChange={(o) => !o && setSheet(null)} draft={draft} setDraft={setDraft} errors={showErrors ? errors.warmup : {}} />

      <Sheet open={sheet === "notes"} onOpenChange={(o) => !o && setSheet(null)} title="Notes for this day">
        <ul className="flex flex-col gap-3 pb-4" data-program-text="">
          {notes.map((n) => (
            <li key={n} className="t-body rounded-tile-lg bg-surface px-4 py-3.5">
              {n}
            </li>
          ))}
        </ul>
        <Caption className="mt-0 pb-4">Quinton&apos;s notes for this day. They come with the plan.</Caption>
      </Sheet>

      <LibraryPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker?.mode === "sub" ? `Swap ${subFor?.name ?? ""}` : "Add exercise"}
        description={picker?.mode === "sub" ? "Same movement first. Sets, reps and rest stay as they are." : "Added to the end. Drag it or use the arrows to move it."}
        first={subFor ? (getExercise(subFor.slug)?.substitutes ?? []) : []}
        firstTitle="Swap options"
        exclude={picker?.mode === "sub" && subFor ? [subFor.slug] : []}
        onPick={(lib) => {
          if (picker?.mode === "sub") {
            const i = picker.index;
            const prev = draft.exercises[i];
            setEx(i, substituteExercise(prev, lib));
            toast(`${prev.name} → ${lib.name}`, { description: "Save to keep the change.", duration: 6000, action: { label: "Undo", onClick: () => setEx(i, prev) } });
          } else {
            setDraft((d) => ({ ...d, exercises: [...d.exercises, newTemplateExercise(lib)] }));
            setOpen(draft.exercises.length);
          }
          setPicker(null);
        }}
      />

      <Confirm
        open={!!leaveTo}
        onOpenChange={(o) => !o && setLeaveTo(null)}
        title="Discard your changes?"
        body={`Your changes to ${draft.name.trim() || stored.name} aren't saved.`}
        confirmLabel="Discard"
        onConfirm={() => {
          const to = leaveTo;
          forgetDraft();
          setDraft(clone(stored));
          setLeaveTo(null);
          if (to) router.push(to);
        }}
      />
      <Confirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Put ${def.name} back to the plan?`}
        body="Your past workouts don't change. You can undo right after."
        confirmLabel="Reset"
        destructive={false}
        onConfirm={onReset}
      />
    </div>
  );
}

/* ---------------------------------------------------------- one exercise */

function ExerciseSheet({
  index,
  e,
  count,
  error,
  onClose,
  onChange,
  onMove,
  onRemove,
  onSwap,
}: {
  index: number | null;
  e: TemplateExercise | null;
  count: number;
  error?: string;
  onClose: () => void;
  onChange: (p: Partial<TemplateExercise>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
}) {
  const lib = e ? getExercise(e.slug) : undefined;
  return (
    <Sheet open={index != null && !!e} onOpenChange={(o) => !o && onClose()} title={e?.name ?? ""}>
      {e && index != null && (
        <div className="flex flex-col gap-5 pb-2">
          <Field label="Name" hint={lib && lib.name !== e.name ? `Library: ${lib.name}` : undefined}>
            {(id) => <Input id={id} value={e.name} maxLength={60} onChange={(ev) => onChange({ name: ev.target.value })} autoComplete="off" />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="t-label mb-1.5">Sets</p>
              <Stepper size="sm" value={e.sets} min={1} max={10} step={1} onChange={(v) => onChange({ sets: v })} label="Sets" />
            </div>
            <div>
              <p className="t-label mb-1.5">Rest</p>
              <Stepper size="sm" value={e.rest} min={0} max={600} step={15} onChange={(v) => onChange({ rest: v })} label="Rest" format={fmtRest} valueText={fmtRest(e.rest)} />
            </div>
          </div>
          <div>
            <p className="t-label mb-1.5">{e.unit === "sec" ? "Seconds, low and high" : e.unit === "each" ? "Reps each side, low and high" : "Reps, low and high"}</p>
            <div className="flex items-center gap-2">
              <IntInput value={e.repLow} onChange={(v) => onChange({ repLow: v })} label="Low" />
              <span className="t-label">to</span>
              <IntInput value={e.repHigh} onChange={(v) => onChange({ repHigh: v })} label="High" />
            </div>
            <Segmented<RepUnit>
              className="mt-2"
              ariaLabel="Count"
              value={e.unit}
              onChange={(u) => onChange({ unit: u })}
              options={[
                { value: "reps", label: "Reps" },
                { value: "each", label: "Each side" },
                { value: "sec", label: "Seconds" },
              ]}
            />
          </div>
          <Field label="Reps in the tank">
            {(id) => (
              <Select id={id} value={e.rir} onChange={(ev) => onChange({ rir: ev.target.value })}>
                {effortOptions(e.rir).map((r) => (
                  <option key={r} value={r}>
                    {effortShort(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Coaching note" hint="Optional">
            {(id) => <Input id={id} value={e.note ?? ""} maxLength={160} onChange={(ev) => onChange({ note: ev.target.value || undefined })} autoComplete="off" />}
          </Field>
          <div className="flex min-h-14 items-center justify-between gap-3 rounded-tile-lg bg-surface px-4">
            <span className="t-row">Optional</span>
            <Switch checked={!!e.optional} onCheckedChange={(v) => onChange({ optional: v || undefined })} label={`${e.name} is optional`} />
          </div>
          {error && (
            <p className="t-label text-danger" role="alert">
              {error}
            </p>
          )}
          <SheetActions>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="md" disabled={index === 0} onClick={() => onMove(-1)}>
                <ChevronUp aria-hidden />
                Move up
              </Button>
              <Button variant="secondary" size="md" disabled={index === count - 1} onClick={() => onMove(1)}>
                <ChevronDown aria-hidden />
                Move down
              </Button>
            </div>
            <Button variant="secondary" size="md" block onClick={onSwap}>
              <Repeat aria-hidden />
              Swap
            </Button>
            <Button variant="destructive" size="md" block onClick={onRemove}>
              <Trash aria-hidden />
              Remove
            </Button>
          </SheetActions>
        </div>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------- warm-up */

function WarmupSheet({ open, onOpenChange, draft, setDraft, errors }: { open: boolean; onOpenChange: (o: boolean) => void; draft: StoredTemplate; setDraft: (f: (d: StoredTemplate) => StoredTemplate) => void; errors: Record<number, string> }) {
  const set = (i: number, patch: Partial<{ label: string; detail: string }>) => setDraft((d) => ({ ...d, warmup: d.warmup.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Warm-up steps">
      <div className="flex flex-col gap-3 pb-2">
        {draft.warmup.length === 0 && <SheetReason>No warm-up steps. Add a general warm-up and ramp-up sets for the first big lift.</SheetReason>}
        {draft.warmup.map((w, i) => (
          <div key={i} className="rounded-tile-lg bg-surface p-3">
            <div className="flex items-center gap-1">
              <span className="t-label flex-1 pl-1">Step {i + 1}</span>
              <IconBtn label="Move step up" disabled={i === 0} onClick={() => setDraft((d) => ({ ...d, warmup: moveItem(d.warmup, i, i - 1) }))}>
                <ChevronUp className="size-5" />
              </IconBtn>
              <IconBtn label="Move step down" disabled={i === draft.warmup.length - 1} onClick={() => setDraft((d) => ({ ...d, warmup: moveItem(d.warmup, i, i + 1) }))}>
                <ChevronDown className="size-5" />
              </IconBtn>
              <IconBtn label="Remove step" onClick={() => setDraft((d) => ({ ...d, warmup: d.warmup.filter((_, j) => j !== i) }))}>
                <Trash className="size-5" />
              </IconBtn>
            </div>
            <Input value={w.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Step" aria-label={`Warm-up step ${i + 1}`} maxLength={60} className="mt-1 font-semibold" />
            <Textarea value={w.detail} onChange={(e) => set(i, { detail: e.target.value })} placeholder="What to do" aria-label={`Warm-up step ${i + 1}, what to do`} rows={Math.max(2, Math.ceil(w.detail.length / 36))} maxLength={300} className="mt-2 [field-sizing:content]" />
            {errors[i] && <p className="t-label mt-1.5 text-danger">{errors[i]}</p>}
          </div>
        ))}
        <Button variant="secondary" size="md" block onClick={() => setDraft((d) => ({ ...d, warmup: [...d.warmup, { label: "", detail: "" }] }))}>
          <Plus aria-hidden />
          Add step
        </Button>
        <Caption className="mt-0">Save on the workout page to keep changes.</Caption>
      </div>
    </Sheet>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="press grid size-11 shrink-0 place-items-center rounded-full text-fg disabled:text-fg-3">
      {children}
    </button>
  );
}

/** An integer field that can be cleared and retyped without the value jumping. */
function IntInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <Input
      value={text}
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      enterKeyHint="done"
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
        setText(t);
        const n = t === "" ? 0 : Number(t);
        setLast(n);
        onChange(n);
      }}
      className="min-w-0 flex-1 text-center font-semibold tabular-nums"
    />
  );
}
