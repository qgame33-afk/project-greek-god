"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bar } from "@/components/ui/progress";
import { StepperPair } from "@/components/ui/big-value";
import { Collapse } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useStepper } from "@/components/ui/repeat";
import { cn } from "@/lib/cn";
import { isOffline } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useRecovery, type RecoveryLog } from "@/lib/data/recovery";
import { useSessions, useSetsInRange } from "@/lib/data/training";
import { addDays, type ISODate } from "@/lib/dates";
import { PAIN_MAX, SLEEP_MAX, storedSleep, type CheckinDraft } from "@/lib/recovery/checkin";
import { planLite, sorenessFocus, type Guidance } from "@/lib/recovery/guidance";
import { useReadiness, useSaveCheckin } from "@/lib/recovery/hooks";
import { sleepPrefill } from "@/lib/recovery/prefill";
import type { OverlapSet } from "@/lib/training/overlap";
import { checkinPatchPayload, SLEEP_STEP_H } from "@/lib/today/now";

/* ----------------------------------------------------------------- words */

/** The five answers of each 1–5 scale, in stored order (DESIGN-V3 §4.1.3). */
export const ENERGY = ["Low", "Meh", "OK", "Good", "Great"] as const;
export const SORENESS = ["Fresh", "OK", "A bit sore", "Sore", "Very sore"] as const;
export const TIREDNESS = ["Fresh", "A bit", "Some", "Tired", "Very tired"] as const;
export const STRESS = ["Calm", "Low", "Some", "High", "Very high"] as const;
export const QUALITY = ["Poor", "Fair", "OK", "Good", "Great"] as const;

export const wordFor = (words: readonly string[], v: number | null | undefined): string | null => (v != null && v >= 1 && v <= 5 ? words[Math.round(v) - 1] : null);

/** "7 h 15 min", "8 h", "—" */
export function sleepWords(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

/** "7 hours 15 minutes" */
export function sleepSpokenWords(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh} ${hh === 1 ? "hour" : "hours"}${mm ? ` ${mm} minutes` : ""}`;
}

/** The check-in's result word: "Ready", or "Go lighter" when the readiness call trims or eases the day. */
export function readinessWord(g: Pick<Guidance, "level" | "hasCheckin"> | null | undefined): "Ready" | "Go lighter" | null {
  if (!g || !g.hasCheckin) return null;
  return g.level === "legs" || g.level === "trim" || g.level === "ease" || g.level === "recover" ? "Go lighter" : "Ready";
}

/** The soreness question, worded for the day (PROGRAM's sorenessFocus). */
export function sorenessPrompt(focus: "legs" | "arms" | "general"): string {
  return focus === "legs" ? "How do your legs feel?" : focus === "arms" ? "How do your arms feel?" : "How sore are you?";
}

/* ------------------------------------------------------------------ data */

type Field = keyof CheckinDraft;
type Status = { kind: "idle" } | { kind: "saving"; field: Field } | { kind: "error"; field: Field; patch: Partial<CheckinDraft>; offline: boolean };

/**
 * One check-in date's values and a per-tap `answer()` that sends ONLY that field, so the day's row
 * is merged, never overwritten: a field set on another screen (or device) is never cleared, and a
 * half-finished morning is never lost. Columns the check-in no longer asks about stay as stored.
 */
export function useCheckinAnswers(date: ISODate) {
  const rows = useRecovery(addDays(date, -13), date);
  const row: RecoveryLog | null = (rows.data ?? []).find((r) => r.local_date === date) ?? null;
  const save = useSaveCheckin();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // answers tapped but not yet confirmed by the server (kept on screen through an error)
  const [pending, setPending] = useState<Partial<CheckinDraft>>({});
  const v = <K extends Field>(k: K, fromRow: CheckinDraft[K]): CheckinDraft[K] => (pending[k] !== undefined ? (pending[k] as CheckinDraft[K]) : fromRow);
  const values = {
    sleep: v("sleep", storedSleep(row?.sleep_hours)),
    soreness: v("soreness", row?.soreness ?? null),
    energy: v("energy", row?.energy ?? null),
    quality: v("quality", row?.sleep_quality ?? null),
    fatigue: v("fatigue", row?.fatigue ?? null),
    stress: v("stress", row?.stress ?? null),
    pain: v("pain", row?.pain_notes ?? ""),
  };

  const answer = (patch: Partial<CheckinDraft>) => {
    const field = Object.keys(patch)[0] as Field;
    setPending((p) => ({ ...p, ...patch }));
    if (isOffline()) {
      setStatus({ kind: "error", field, patch, offline: true });
      return;
    }
    setStatus({ kind: "saving", field });
    save.mutate(checkinPatchPayload(date, patch), {
      onSuccess: () => {
        setPending((p) => {
          const next = { ...p };
          for (const k of Object.keys(patch) as Field[]) if (next[k] === patch[k]) delete next[k];
          return next;
        });
        setStatus((st) => (st.kind === "saving" && st.field === field ? { kind: "idle" } : st));
      },
      onError: () => setStatus({ kind: "error", field, patch, offline: isOffline() }),
    });
  };
  return { rows: rows.data ?? [], row, values, status, answer, loading: rows.isLoading };
}

/** What the soreness question asks about on `date`: from the plan and yesterday's done session. */
export function useSorenessFocus(date: ISODate): "legs" | "arms" | "general" {
  const readiness = useReadiness(date);
  const y = addDays(date, -1);
  const sessions = useSessions(y, y);
  const sets = useSetsInRange(y, y);
  return useMemo(() => {
    const p = readiness.plan;
    if (!p) return "general";
    const plan = planLite(p.key, p.template?.name ?? null, p.template?.exercises.map((e) => e.slug) ?? []);
    const done = (sessions.data ?? []).filter((s) => s.local_date === y && s.status === "done").sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))[0];
    const yesterday = done
      ? {
          session: done,
          sets: (sets.data ?? [])
            .filter((r) => r.session_id === done.id && r.exercise_slug)
            .map((r): OverlapSet => ({ id: r.id, session_id: r.session_id!, exercise_slug: r.exercise_slug!, set_index: r.set_index ?? 0, weight_lb: r.weight_lb, reps: r.reps, completed: true })),
        }
      : null;
    return sorenessFocus(plan, yesterday);
  }, [readiness.plan, sessions.data, sets.data, y]);
}

/* ----------------------------------------------------------------- sheet */

/** A tap this soon after a question opens is the tail of a double tap on the one before. */
const SETTLE_MS = 400;

/**
 * The check-in sheet (docs/DESIGN-V3-SIMPLE.md §4.1.3): one question per screen — sleep (prefilled
 * from the week's median, accepted with Next), energy and soreness (five pills; the soreness
 * question is worded from PROGRAM's sorenessFocus) — with Tiredness, Stress, Sleep quality and
 * "Anything hurt?" one tap away under the last. Every answer saves the moment it is tapped.
 * "Done" closes it with "Checked in · Ready" or "Checked in · Go lighter today".
 * `onDelete` (Check-ins only) adds "Delete this check-in" for a day that has one.
 */
export function CheckInSheet({ open, onOpenChange, date, onDelete }: { open: boolean; onOpenChange: (o: boolean) => void; date: ISODate; onDelete?: () => void }) {
  const { profile } = useProfile();
  const sleepGoal = Number(profile?.sleep_goal_h ?? 8) || 8;
  const { rows, row, values, status, answer: save } = useCheckinAnswers(date);
  const readiness = useReadiness(date);
  const focus = useSorenessFocus(date);
  const prefill = sleepPrefill(rows, date).hours;
  const [step, setStep] = useState(0);
  const [sleep, setSleep] = useState<number>(values.sleep ?? prefill ?? sleepGoal);
  const done = useRef(false);

  // each opening starts at the first open question, with the sleep stepper at the logged value,
  // else the week's usual, else the goal
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const first = values.sleep == null ? 0 : values.energy == null ? 1 : values.soreness == null ? 2 : 0;
      setStep(onDelete ? 0 : first);
      setSleep(values.sleep ?? prefill ?? sleepGoal);
    }
  }
  // the week's rows can land after the sheet opened: take the usual then, unless something is set
  const [seenPrefill, setSeenPrefill] = useState(prefill);
  if (prefill !== seenPrefill) {
    setSeenPrefill(prefill);
    if (values.sleep == null && prefill != null) setSleep(prefill);
  }

  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = performance.now();
  }, [step, open]);
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);
  const settled = () => performance.now() - openedAt.current >= SETTLE_MS;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onOpenChange(false);
    if (status.kind === "error") return;
    const word = readinessWord(readiness.guidance);
    if (word) toast(word === "Go lighter" ? "Checked in · Go lighter today" : "Checked in · Ready", { duration: 4000 });
  };

  const next = () => {
    if (step === 0) {
      if (values.sleep !== sleep) save({ sleep });
      setStep(1);
    } else if (step === 1) setStep(2);
    else finish();
  };

  const pick = (field: "energy" | "soreness", n: number | null) => {
    if (!settled()) return;
    save({ [field]: n } as Partial<CheckinDraft>);
    // energy moves on by itself; soreness stays for the optional detail and Done
    if (field === "energy" && n != null) window.setTimeout(() => setStep((s) => (s === 1 ? 2 : s)), 220);
  };

  const title = (
    <span className="t-label font-semibold text-fg-2">
      Check-in · {step + 1} of 3
    </span>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div>
          <Button variant="primary" size="lg" block onClick={next}>
            {step === 2 ? "Done" : "Next"}
          </Button>
          <p className="t-cap mt-3 text-center">Saved as you go. Skip any question.</p>
        </div>
      }
    >
      <div className="@container pb-4">
        <Bar value={(step + 1) / 3} thin className="mt-1" />
        {step === 0 && (
          <Question title="How long did you sleep?" sub={values.sleep == null ? (prefill != null ? `Your usual is ${sleepWords(prefill)}.` : `Your goal is ${sleepWords(sleepGoal)}.`) : "Saved. Change it if it's off."}>
            <SleepValue value={sleep} onChange={setSleep} />
            {onDelete && values.sleep != null && (
              <button type="button" onClick={() => save({ sleep: null })} className="press t-label mx-auto mt-3 flex min-h-11 items-center font-semibold">
                Clear sleep
              </button>
            )}
          </Question>
        )}
        {step === 1 && (
          <Question title="How's your energy?">
            <Pills name="Energy" words={ENERGY} value={values.energy} onPick={(n) => pick("energy", n)} />
          </Question>
        )}
        {step === 2 && (
          <Question title={sorenessPrompt(focus)}>
            <Pills name="Soreness" words={SORENESS} value={values.soreness} onPick={(n) => pick("soreness", n)} />
            <Detail values={values} answer={save} rowKey={`${date}:${row?.pain_notes ?? ""}`} />
            {onDelete && row && (
              <button type="button" onClick={onDelete} className="press t-label mt-4 flex min-h-11 items-center font-semibold text-danger">
                Delete this check-in
              </button>
            )}
          </Question>
        )}
        <SaveError status={status} onRetry={save} />
      </div>
    </Sheet>
  );
}

function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="t-head">{title}</h3>
      {sub && <p className="t-label mt-1.5">{sub}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function SaveError({ status, onRetry }: { status: Status; onRetry: (patch: Partial<CheckinDraft>) => void }) {
  if (status.kind !== "error") return null;
  return (
    <div role="alert" className="mt-4 flex flex-wrap items-center gap-x-3 rounded-tile-lg bg-sheet-card px-4 py-3">
      <span className="t-body min-w-0 flex-1">{status.offline ? "You're offline. That answer isn't saved yet." : "Couldn't save that answer."}</span>
      <button type="button" className="press t-button h-11 rounded-pill bg-control px-4" onClick={() => onRetry(status.patch)}>
        Try again
      </button>
    </div>
  );
}

/** "7 h 15 min" in `t-big`, a spinbutton, with −15 min / +15 min under it. */
function SleepValue({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const s = useStepper({ value, onChange, step: SLEEP_STEP_H, min: 0, max: SLEEP_MAX });
  const total = Math.round(value * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return (
    <div className="flex flex-col items-center">
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label="Hours slept"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={SLEEP_MAX}
        aria-valuetext={sleepSpokenWords(value)}
        onKeyDown={s.onKeyDown}
        className="rounded-tile px-2 text-center outline-offset-4"
      >
        <span aria-hidden className="t-big whitespace-nowrap">
          {hh}
          <span className="unit">h</span> {String(mm).padStart(2, "0")}
          <span className="unit">min</span>
        </span>
      </div>
      <StepperPair
        className="mt-8 w-full"
        minus={{ label: "−15 min", ariaLabel: "15 minutes less", disabled: s.atMin, hold: s.hold(-1) }}
        plus={{ label: "+15 min", ariaLabel: "15 minutes more", disabled: s.atMax, hold: s.hold(1) }}
      />
    </div>
  );
}

/** Five 56 px answers as a radio group (one column in the AX layout). Tapping the chosen one clears it. */
export function Pills({ name, words, value, onPick, small }: { name: string; words: readonly string[]; value: number | null; onPick: (n: number | null) => void; small?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAt = (i: number) => refs.current[(i + words.length) % words.length]?.focus();
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-5 gap-2 ax:grid-cols-1">
      {words.map((w, i) => {
        const on = value === i + 1;
        return (
          <button
            key={w}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={(value == null ? i === 0 : on) ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                focusAt(i + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                focusAt(i - 1);
              }
            }}
            onClick={() => onPick(on ? null : i + 1)}
            className={cn(
              "press t-label flex min-w-0 items-center justify-center rounded-tile-lg px-1 text-center font-semibold leading-tight ax:justify-start ax:px-4",
              small ? "min-h-12" : "min-h-14",
              on ? "bg-fg text-bg" : "bg-control text-fg",
            )}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}

/** The optional detail under the soreness question: four rows, each opening its own answers. */
function Detail({ values, answer, rowKey }: { values: ReturnType<typeof useCheckinAnswers>["values"]; answer: (p: Partial<CheckinDraft>) => void; rowKey: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const items: { key: string; title: string; prompt: string; words: readonly string[]; value: number | null; field: "fatigue" | "stress" | "quality" }[] = [
    { key: "fatigue", title: "Tiredness", prompt: "How tired is your whole body?", words: TIREDNESS, value: values.fatigue, field: "fatigue" },
    { key: "stress", title: "Stress", prompt: "How stressed are you?", words: STRESS, value: values.stress, field: "stress" },
    { key: "quality", title: "Sleep quality", prompt: "How well did you sleep?", words: QUALITY, value: values.quality, field: "quality" },
  ];
  return (
    <div className="mt-6 overflow-hidden rounded-tile-lg bg-sheet-card [&>*+*]:border-t [&>*+*]:border-line">
      {items.map((it) => (
        <DetailRow key={it.key} id={it.key} title={it.title} value={wordFor(it.words, it.value)} open={open === it.key} onToggle={() => setOpen((o) => (o === it.key ? null : it.key))}>
          <p className="t-label mb-3">{it.prompt}</p>
          <Pills small name={it.title} words={it.words} value={it.value} onPick={(n) => answer({ [it.field]: n } as Partial<CheckinDraft>)} />
        </DetailRow>
      ))}
      <DetailRow id="pain" title="Anything hurt?" danger value={values.pain.trim() ? "Noted" : null} open={open === "pain"} onToggle={() => setOpen((o) => (o === "pain" ? null : "pain"))}>
        <PainNote key={rowKey} initial={values.pain} onSave={(t) => answer({ pain: t })} />
      </DetailRow>
    </div>
  );
}

function DetailRow({ id, title, value, open, onToggle, danger, children }: { id: string; title: string; value: string | null; open: boolean; onToggle: () => void; danger?: boolean; children: ReactNode }) {
  const panel = `checkin-detail-${id}`;
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle} className="press-soft flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <span className={cn("t-row min-w-0 flex-1", danger && value && "text-danger")}>{title}</span>
        <span className={cn("t-body shrink-0 text-fg-2", danger && value && "text-danger")}>{value ?? "Add"}</span>
        <ChevronDown className={cn("size-5 shrink-0 text-fg-3 transition-transform duration-(--dur-fast)", open && "rotate-180")} strokeWidth={1.9} aria-hidden />
      </button>
      <Collapse open={open} id={panel}>
        <div className="@container px-4 pb-4">{children}</div>
      </Collapse>
    </div>
  );
}

function PainNote({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="t-label block text-danger">
        Where, and what makes it worse
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={PAIN_MAX}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== initial.trim()) onSave(text);
        }}
        placeholder="Left knee on deep squats"
        className="t-body mt-2 w-full resize-none rounded-field bg-control px-4 py-3 text-danger outline-none placeholder:text-fg-2 focus:ring-2 focus:ring-fg"
      />
    </div>
  );
}
