"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, Plus, Replace, RotateCcw, Trash } from "lucide-react";
import { toast } from "sonner";
import { EmptyArt } from "@/components/art/Motifs";
import { OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader } from "@/components/ui/card";
import { Segmented, Switch } from "@/components/ui/controls";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Empty } from "@/components/ui/misc";
import { Confirm } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useUser } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { scheduleOf, useSaveTemplate, useTemplates, type StoredTemplate } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import { PROGRAM_BY_KEY } from "@/lib/training/program";
import { weekdaysFor } from "@/lib/training/schedule";
import type { RepUnit, TemplateExercise, TemplateKey } from "@/lib/training/types";
import { RIR_OPTIONS, moveItem, newTemplateExercise, sameTemplateContent, substituteExercise, validateTemplate } from "@/lib/training/volume";
import { targetLabel, templateMeta, weekdaysLabel } from "./format";
import { LibraryPicker } from "./LibraryPicker";
import { DetailSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: StoredTemplate, b: StoredTemplate) => sameTemplateContent(a, b);
const draftKey = (k: string) => `pgg.template-draft.${k}`;
const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** /training/program/[key] — edit one of the six day templates. */
export function TemplateEditor({ templateKey }: { templateKey: string }) {
  const mounted = useMounted();
  if (!mounted) return <DetailSkeleton />;
  if (!(templateKey in PROGRAM_BY_KEY)) {
    return (
      <div>
        <BackLink />
        <h1 className="sr-only">No such workout</h1>
        <Empty art={<EmptyArt kind="column" size={56} />} title="No such workout" className="mt-6" action={<Button variant="secondary" asChild><Link href="/training">Back to Training</Link></Button>}>
          The program has six templates: Push A, Pull A, Legs A, Push B, Pull B and Legs B.
        </Empty>
      </div>
    );
  }
  return <Loaded templateKey={templateKey as TemplateKey} />;
}

function BackLink() {
  return (
    <Link href="/training" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
      <ChevronLeft className="size-5" />
      Training
    </Link>
  );
}

function Loaded({ templateKey }: { templateKey: TemplateKey }) {
  const { byKey, loading } = useTemplates();
  if (loading) return <DetailSkeleton />;
  return <Editor key={templateKey} stored={byKey[templateKey]} />;
}

function Editor({ stored }: { stored: StoredTemplate }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { userId } = useUser();
  const { profile } = useProfile();
  const save = useSaveTemplate();
  const busy = useRef(false);
  const [draft, setDraft] = useState<StoredTemplate>(() => clone(stored));
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // Unsaved edits from an earlier visit (kept in sessionStorage when the page was left).
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Keep the form in step with the stored template until the user starts editing.
  const [base, setBase] = useState(stored);
  if (!same(stored, base)) {
    setBase(stored);
    if (same(draft, base)) setDraft(clone(stored));
  }

  const dirty = !same(draft, stored);
  const { ok, errors } = validateTemplate(draft);
  const days = weekdaysFor(scheduleOf(profile ?? undefined), stored.key);
  const def = PROGRAM_BY_KEY[stored.key];
  const isDefault = sameTemplateContent(draft, def);

  // Keep unsaved edits for this browser session, so a back gesture never loses them.
  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey(stored.key), JSON.stringify(draft));
      else if (!earlier) sessionStorage.removeItem(draftKey(stored.key));
    } catch {
      /* storage blocked: the leave guard below still protects in-app links */
    }
  }, [dirty, draft, stored.key, earlier]);

  // Leaving with unsaved edits: reloads get the browser prompt, in-app links get a Confirm.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
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

  const writeCache = (t: StoredTemplate) =>
    qc.setQueryData<StoredTemplate[]>(["templates", userId], (rows) => (rows ? rows.map((r) => (r.key === t.key ? { ...r, ...t } : r)) : rows));

  const persist = async (next: StoredTemplate, message: string) => {
    if (busy.current) return false;
    busy.current = true;
    const prev = clone(stored);
    try {
      await save.mutateAsync(next);
    } catch {
      return false; // the form keeps every edit; the hook showed why
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
    if (!ok) {
      setShowErrors(true);
      const first = Object.keys(errors.exercise)[0];
      if (first != null) setOpen(Number(first));
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
    if (await persist(next, `${def.name} reset to the original program`)) {
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
  const moveEx = (i: number, dir: -1 | 1) => {
    setDraft((d) => ({ ...d, exercises: moveItem(d.exercises, i, i + dir) }));
    setOpen((o) => (o === i ? i + dir : o === i + dir ? i : o));
  };

  const meta = useMemo(() => templateMeta(draft), [draft]);
  const subFor = picker?.mode === "sub" ? draft.exercises[picker.index] : null;

  return (
    <div className={cn("pb-6", dirty && "pb-28 lg:pb-24")}>
      <BackLink />
      <header className="mb-6 mt-3">
        <p className="eyebrow">{weekdaysLabel(days)} · template</p>
        <h1 className="t-title mt-2 break-words">{draft.name.trim() || "Untitled"}</h1>
        <p className="num mt-2 text-[16px] text-fg-2" aria-live="polite">
          {meta}
        </p>
      </header>

      {earlier && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-line-gold bg-gold-tint px-4 py-2.5">
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-fg">You left unsaved changes here.</p>
          <div className="-mr-2 flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="md"
              className="h-11 px-3 text-[14px]"
              onClick={() => {
                setEarlier(null);
                forgetDraft();
              }}
            >
              Discard
            </Button>
            <Button
              variant="link"
              className="h-11 px-3 text-[14px]"
              onClick={() => {
                setDraft(clone(earlier));
                setEarlier(null);
              }}
            >
              Restore
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <Card>
            <CardHeader title={`Exercises · ${draft.exercises.length}`} />
            {errors.exercises && showErrors && <p className="mb-3 text-[13px] font-medium text-danger">{errors.exercises}</p>}
            <ol className="space-y-2">
              {draft.exercises.map((e, i) => (
                <ExerciseItem
                  key={`${e.slug}-${i}`}
                  e={e}
                  index={i}
                  count={draft.exercises.length}
                  open={open === i}
                  error={showErrors ? errors.exercise[i] : undefined}
                  onToggle={() => setOpen(open === i ? null : i)}
                  onChange={(p) => setEx(i, p)}
                  onMove={(dir) => moveEx(i, dir)}
                  onRemove={() => removeEx(i)}
                  onSubstitute={() => setPicker({ mode: "sub", index: i })}
                />
              ))}
            </ol>
            <Button variant="outline-gold" block className="mt-3" onClick={() => setPicker({ mode: "add" })}>
              <Plus className="size-4" />
              Add exercise
            </Button>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-5">
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-4">
              <Field label="Name" error={showErrors ? errors.name : null} hint={`${draft.name.length}/40`}>
                {(id) => <Input id={id} value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={showErrors && !!errors.name} autoComplete="off" enterKeyHint="done" />}
              </Field>
              <Field label="Focus" hint="Optional">
                {(id) => <Textarea id={id} value={draft.focus} maxLength={200} rows={2} onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Warm-up"
              action={<CardAction onClick={() => setDraft((d) => ({ ...d, warmup: [...d.warmup, { label: "", detail: "" }] }))}>Add step</CardAction>}
            />
            {draft.warmup.length === 0 && <p className="text-[13px] text-fg-2">No warm-up steps. Add at least a general warm-up and ramp-up sets for the first big lift.</p>}
            <ol className="space-y-3">
              {draft.warmup.map((w, i) => (
                <li key={i} className="rounded-[14px] bg-s3 p-3">
                  <div className="-mr-1.5 -mt-1.5 flex items-center gap-1">
                    <span className="eyebrow flex-1">Step {i + 1}</span>
                    <IconBtn label="Move step up" disabled={i === 0} onClick={() => setDraft((d) => ({ ...d, warmup: moveItem(d.warmup, i, i - 1) }))}>
                      <ArrowUp className="size-4" />
                    </IconBtn>
                    <IconBtn label="Move step down" disabled={i === draft.warmup.length - 1} onClick={() => setDraft((d) => ({ ...d, warmup: moveItem(d.warmup, i, i + 1) }))}>
                      <ArrowDown className="size-4" />
                    </IconBtn>
                    <IconBtn
                      label="Remove step"
                      onClick={() => {
                        const removed = draft.warmup[i];
                        setDraft((d) => ({ ...d, warmup: d.warmup.filter((_, j) => j !== i) }));
                        toast("Warm-up step removed", {
                          description: "Save to keep the change.",
                          duration: 6000,
                          action: { label: "Undo", onClick: () => setDraft((d) => ({ ...d, warmup: [...d.warmup.slice(0, i), removed, ...d.warmup.slice(i)] })) },
                        });
                      }}
                    >
                      <Trash className="size-4" />
                    </IconBtn>
                  </div>
                  <Input
                    value={w.label}
                    onChange={(e) => setDraft((d) => ({ ...d, warmup: d.warmup.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                    placeholder="Step title"
                    aria-label={`Warm-up step ${i + 1} title`}
                    maxLength={60}
                    className="mt-1 h-11 min-w-0 bg-s2 font-semibold"
                  />
                  <Textarea
                    value={w.detail}
                    onChange={(e) => setDraft((d) => ({ ...d, warmup: d.warmup.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) }))}
                    placeholder="What to do"
                    aria-label={`Warm-up step ${i + 1} detail`}
                    rows={Math.max(2, Math.ceil(w.detail.length / 36))}
                    maxLength={300}
                    className="mt-2 min-h-16 min-w-0 bg-s2 text-[16px] [field-sizing:content]"
                  />
                  {showErrors && errors.warmup[i] && <p className="mt-1.5 text-[13px] font-medium text-danger">{errors.warmup[i]}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Original program" />
            <p className="text-[13px] leading-relaxed text-fg-2">
              {isDefault ? "This template matches the original program." : "Your edits are kept until you reset. History and records are never affected."}
            </p>
            <Button variant="secondary" block className="mt-3" disabled={isDefault || save.isPending} onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-4" />
              Reset to default
            </Button>
          </Card>
        </div>
      </div>

      {dirty && (
        <div className="chrome fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] z-[36] border-t border-line-hair px-4 py-3 md:bottom-0 md:left-[76px] md:pb-[calc(12px+var(--safe-bottom))] lg:left-[248px]">
          <div className="mx-auto flex max-w-[1116px] items-center gap-3">
            <p className="hidden min-w-0 flex-1 text-[13px] text-fg-2 sm:block">{ok || !showErrors ? "Unsaved changes" : "Fix the highlighted fields to save."}</p>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(clone(stored));
                setShowErrors(false);
                forgetDraft();
              }}
              disabled={save.isPending}
              className="shrink-0"
            >
              Discard
            </Button>
            <Button variant="primary" onClick={onSave} loading={save.isPending} className="flex-1 sm:w-48 sm:flex-none">
              Save
            </Button>
          </div>
        </div>
      )}

      <LibraryPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker?.mode === "sub" ? `Substitute ${subFor?.name ?? ""}` : "Add exercise"}
        description={picker?.mode === "sub" ? "Same pattern first. Sets, reps and rest stay as they are." : "Added to the end — reorder with the arrows."}
        first={subFor ? (getExercise(subFor.slug)?.substitutes ?? []) : []}
        firstTitle="Substitutes"
        exclude={picker?.mode === "sub" && subFor ? [subFor.slug] : []}
        onPick={(lib) => {
          if (picker?.mode === "sub") {
            const i = picker.index;
            const prev = draft.exercises[i];
            setEx(i, substituteExercise(prev, lib));
            toast(`${prev.name} → ${lib.name}`, {
              description: "Save to keep the change.",
              duration: 6000,
              action: { label: "Undo", onClick: () => setEx(i, prev) },
            });
          } else {
            setDraft((d) => ({ ...d, exercises: [...d.exercises, newTemplateExercise(lib)] }));
            setOpen(draft.exercises.length);
            toast(`Added ${lib.name}`, { description: "Set the sets and reps, then save." });
          }
          setPicker(null);
        }}
      />

      <Confirm
        open={!!leaveTo}
        onOpenChange={(o) => !o && setLeaveTo(null)}
        title="Discard your changes?"
        body={`Your edits to ${draft.name.trim() || stored.name} are not saved. Leave and lose them, or stay and save.`}
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
        title={`Reset ${def.name}?`}
        body="Name, focus, warm-up and exercises go back to the original program. Your logged sessions are not touched. You can undo right after."
        confirmLabel="Reset"
        destructive={false}
        onConfirm={onReset}
      />
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg disabled:opacity-30">
      {children}
    </button>
  );
}

function ExerciseItem({
  e,
  index,
  count,
  open,
  error,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onSubstitute,
}: {
  e: TemplateExercise;
  index: number;
  count: number;
  open: boolean;
  error?: string;
  onToggle: () => void;
  onChange: (p: Partial<TemplateExercise>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSubstitute: () => void;
}) {
  const lib = getExercise(e.slug);
  const rirOpts = RIR_OPTIONS.includes(e.rir as (typeof RIR_OPTIONS)[number]) ? RIR_OPTIONS : [...RIR_OPTIONS, e.rir];
  const id = `ex-${index}`;
  return (
    <li className={cn("overflow-hidden rounded-[14px] border bg-s3 transition-colors", error ? "border-danger/60" : open ? "border-line-strong" : "border-transparent")}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="num w-5 shrink-0 text-[15px] text-fg-3">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{e.name}</span>
            {e.optional && <OptionalBadge />}
          </span>
          <span className="num block truncate text-[14px] text-fg-2">
            {targetLabel(e)} · {e.rir === "Fresh" ? "Fresh" : `RIR ${e.rir}`} · {fmtRest(e.rest)} rest
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-[rotate] duration-(--dur-base) ease-out", open && "rotate-180")} />
      </button>
      {error && !open && <p className="-mt-1 px-3.5 pb-2.5 pl-11 text-[13px] font-medium text-danger">{error}</p>}
      {open && (
        <div id={id} className="swap-in space-y-4 border-t border-line-hair px-3.5 pb-3.5 pt-4">
          <Field label="Name on the card" hint={lib && lib.name !== e.name ? `Library: ${lib.name}` : undefined}>
            {(fid) => <Input id={fid} value={e.name} maxLength={60} onChange={(ev) => onChange({ name: ev.target.value })} className="bg-s2" autoComplete="off" />}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <MiniStepper label="Sets" value={e.sets} min={1} max={10} step={1} onChange={(v) => onChange({ sets: v })} />
            <MiniStepper label="Rest" value={e.rest} min={0} max={600} step={15} format={fmtRest} onChange={(v) => onChange({ rest: v })} />
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-fg-2">{e.unit === "sec" ? "Time range (seconds)" : e.unit === "each" ? "Reps per side" : "Rep range"}</p>
            <div className="flex items-center gap-2">
              <IntInput value={e.repLow} onChange={(v) => onChange({ repLow: v })} label="Low end" />
              <span className="text-fg-3">to</span>
              <IntInput value={e.repHigh} onChange={(v) => onChange({ repHigh: v })} label="High end" />
            </div>
            <Segmented<RepUnit>
              className="mt-2"
              size="md"
              ariaLabel="Unit"
              value={e.unit}
              onChange={(u) => onChange({ unit: u })}
              options={[
                { value: "reps", label: "Reps" },
                { value: "each", label: "Each side" },
                { value: "sec", label: "Seconds" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target RIR">
              {(fid) => (
                <Select id={fid} value={e.rir} onChange={(ev) => onChange({ rir: ev.target.value })} className="bg-s2">
                  {rirOpts.map((r) => (
                    <option key={r} value={r}>
                      {r === "Fresh" ? "Fresh (jumps)" : r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-fg-2">Optional</p>
              <div className="flex h-[52px] items-center">
                <Switch checked={!!e.optional} onCheckedChange={(v) => onChange({ optional: v || undefined })} label={`${e.name} is optional`} />
              </div>
            </div>
          </div>

          <Field label="Coaching note" hint="Optional">
            {(fid) => <Input id={fid} value={e.note ?? ""} maxLength={140} onChange={(ev) => onChange({ note: ev.target.value || undefined })} className="bg-s2" autoComplete="off" />}
          </Field>

          {error && <p className="text-[13px] font-medium text-danger" role="alert">{error}</p>}

          <div className="-mx-1 flex items-center gap-1 border-t border-line-hair pt-2">
            <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="size-[18px]" />
            </IconBtn>
            <IconBtn label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown className="size-[18px]" />
            </IconBtn>
            <span className="flex-1" />
            <Button variant="ghost" size="md" className="h-11 px-3 text-[14px]" onClick={onSubstitute}>
              <Replace className="size-4" />
              Substitute
            </Button>
            <Button variant="ghost" size="md" className="h-11 px-3 text-[14px] hover:text-danger" onClick={onRemove}>
              <Trash className="size-4" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function MiniStepper({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-fg-2">{label}</p>
      <div className="flex h-[52px] items-center rounded-[12px] bg-s2" role="group" aria-label={label}>
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className="press grid size-11 shrink-0 place-items-center text-[20px] text-fg-2 disabled:opacity-30">
          −
        </button>
        <span className="num flex-1 text-center text-[20px] font-semibold" aria-live="polite">
          {format ? format(value) : value}
        </span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className="press grid size-11 shrink-0 place-items-center text-[20px] text-fg-2 disabled:opacity-30">
          +
        </button>
      </div>
    </div>
  );
}

/** Integer field that lets the user clear and retype without the value jumping. */
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
      className="num min-w-0 flex-1 bg-s2 text-center text-[20px] font-semibold"
    />
  );
}
