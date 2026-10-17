"use client";

import { ChevronRight, Minus, Plus } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { SealTick } from "@/components/art/icons";
import { Switch } from "@/components/ui/controls";
import { Collapse } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { isOffline } from "@/lib/data/core";
import { useRecovery, type RecoveryLog } from "@/lib/data/recovery";
import { addDays, type ISODate } from "@/lib/dates";
import { PAIN_MAX, SLEEP_MAX, storedSleep, type CheckinDraft } from "@/lib/recovery/checkin";
import { useSaveCheckin } from "@/lib/recovery/hooks";
import { sleepPrefill } from "@/lib/recovery/prefill";
import { checkinPatchPayload, chipFor, ENERGY_CHIPS, LEGS_CHIPS, SLEEP_STEP_H, sleepShort, sleepSpoken } from "@/lib/today/now";

const QUALITY = ["Poor", "Fair", "Okay", "Good", "Great"] as const;
const FATIGUE = ["Fresh", "Light", "Some", "Tired", "Exhausted"] as const;
const STRESS = ["Calm", "Low", "Some", "High", "Very high"] as const;

type Field = keyof CheckinDraft;
type Status = { kind: "idle" } | { kind: "saving"; field: Field } | { kind: "error"; field: Field; patch: Partial<CheckinDraft>; offline: boolean };

/**
 * The morning check-in (docs/DESIGN-V2.md §3.1.4), shared by Dawn on Now and the Recovery ledger.
 * Three questions — sleep (a stepper prefilled from the last week's median, confirmed with one tap),
 * legs and energy (five chips each) — and optional detail. Every answer saves the moment it is tapped
 * and sends ONLY that field, so the day's row is merged, never overwritten: a field answered on
 * /recovery (or another device) is never cleared, and a half-finished morning is never lost.
 *
 * `variant="dawn"` shows one open question at a time with the answered ones as a chip line;
 * `variant="ledger"` shows every question open (any date).
 */
/** One check-in date's values and a per-tap `answer()` that merges into the row (shared by both parts). */
function useCheckinAnswers(date: ISODate) {
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
    volleyball: v("volleyball", !!row?.volleyball),
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
  return { rows: rows.data ?? [], row, values, status, answer };
}

function SaveError({ status, onRetry }: { status: Status; onRetry: (patch: Partial<CheckinDraft>) => void }) {
  if (status.kind !== "error") return null;
  return (
    <p role="alert" className="t-meta mt-2 flex flex-wrap items-center gap-x-2 text-stone">
      <span className="text-cinnabar">{status.offline ? "Offline · try again when you're back." : "Couldn't save that answer."}</span>
      <button type="button" className="min-h-11 font-semibold text-ivory underline decoration-ui-line underline-offset-4" onClick={() => onRetry(status.patch)}>
        Retry
      </button>
    </p>
  );
}

export function CheckIn({
  date,
  sleepGoal,
  variant = "dawn",
  after,
  withDetail = true,
  className,
}: {
  date: ISODate;
  sleepGoal: number;
  variant?: "dawn" | "ledger";
  /** Shown once the three questions are answered (Dawn: the readiness line). */
  after?: ReactNode;
  /** Render the optional detail here (Dawn puts it after the scale instead). */
  withDetail?: boolean;
  className?: string;
}) {
  const { rows, values, status, answer: save } = useCheckinAnswers(date);
  const [editing, setEditing] = useState<"sleep" | "legs" | "energy" | null>(null);
  const answer = (patch: Partial<CheckinDraft>) => {
    setEditing(null);
    save(patch);
  };
  const prefill = sleepPrefill(rows, date);
  const { sleep, soreness, energy } = values;

  const answered = { sleep: sleep != null, legs: soreness != null, energy: energy != null };
  const done = answered.sleep && answered.legs && answered.energy;
  const order: ("sleep" | "legs" | "energy")[] = ["sleep", "legs", "energy"];
  const openQ = variant === "ledger" ? null : (editing ?? order.find((q) => !answered[q]) ?? null);
  const count = order.filter((q) => answered[q]).length;

  const sleepQ = (
    <SleepQuestion
      key="sleep"
      value={sleep}
      prefill={prefill.hours}
      goal={sleepGoal}
      onConfirm={(h) => answer({ sleep: h })}
      saving={status.kind === "saving" && status.field === "sleep"}
    />
  );
  const legsQ = <ChipQuestion key="legs" prompt="How do your legs feel?" name="Legs" chips={LEGS_CHIPS} value={soreness} onPick={(n) => answer({ soreness: n })} />;
  const energyQ = <ChipQuestion key="energy" prompt="Energy right now?" name="Energy" chips={ENERGY_CHIPS} value={energy} onPick={(n) => answer({ energy: n })} />;
  const Q = { sleep: sleepQ, legs: legsQ, energy: energyQ };

  const chipLine = order
    .filter((q) => answered[q] && q !== openQ)
    .map((q) => ({
      q,
      text: q === "sleep" ? sleepShort(sleep) : q === "legs" ? `Legs: ${chipFor(LEGS_CHIPS, soreness)}` : `Energy: ${chipFor(ENERGY_CHIPS, energy)}`,
      spoken: q === "sleep" ? `Slept ${sleepSpoken(sleep)}` : q === "legs" ? `Legs ${chipFor(LEGS_CHIPS, soreness)}` : `Energy ${chipFor(ENERGY_CHIPS, energy)}`,
    }));

  return (
    <div className={className}>
      {variant === "dawn" ? (
        <>
          {chipLine.length > 0 && (
            <ul className="flex flex-wrap gap-x-1 gap-y-1" aria-label="Answered">
              {chipLine.map((c) => (
                <li key={c.q}>
                  <button
                    type="button"
                    onClick={() => setEditing(c.q)}
                    aria-label={`${c.spoken}. Change`}
                    className="press t-callout tnum inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-leaf-300 hover:bg-white/[.03]"
                  >
                    {c.text}
                    <SealTick className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openQ ? (
            <div className="relative mt-1">
              <span className="t-meta tnum absolute right-0 top-0.5 text-ash">{count + 1} of 3</span>
              {Q[openQ]}
            </div>
          ) : (
            done && after
          )}
        </>
      ) : (
        <div className="divide-y divide-vein">
          {order.map((q) => (
            <div key={q} className="py-3 first:pt-0">
              {Q[q]}
            </div>
          ))}
        </div>
      )}

      <SaveError status={status} onRetry={answer} />
      {withDetail && <CheckInDetail date={date} open={variant === "ledger"} ruled={variant === "dawn"} />}
    </div>
  );
}

/**
 * The optional detail (§3.1.4): sleep quality, fatigue, stress, a pain note (cinnabar label) and
 * volleyball today, each saved on its own like the three questions.
 */
export function CheckInDetail({ date, open: initiallyOpen = false, ruled = true, className }: { date: ISODate; open?: boolean; ruled?: boolean; className?: string }) {
  const { row, values, status, answer } = useCheckinAnswers(date);
  const [detail, setDetail] = useState(initiallyOpen);
  const detailId = useId();
  const { quality, fatigue, stress, volleyball } = values;
  return (
    <div className={cn(ruled && "mt-1 border-t border-vein", className)}>
      {!initiallyOpen && (
        <button
          type="button"
          aria-expanded={detail}
          aria-controls={detailId}
          onClick={() => setDetail((d) => !d)}
          className="t-meta flex min-h-11 w-full items-center justify-between gap-3 text-left text-stone hover:text-ivory"
        >
          <span className="truncate">
            <span className="font-semibold text-ivory">Add detail</span> · quality, stress, pain, volleyball
          </span>
          <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-(--dur-fast)", detail && "rotate-90")} strokeWidth={1.6} aria-hidden />
        </button>
      )}
      <Collapse open={detail} id={detailId}>
        <div className={cn("space-y-4", initiallyOpen ? "mt-3 border-t border-vein pt-4" : "pb-2 pt-1")}>
          <ChipQuestion prompt="Sleep quality" name="Sleep quality" chips={QUALITY} value={quality} onPick={(n) => answer({ quality: n })} small />
          <ChipQuestion prompt="Whole-body fatigue" name="Fatigue" chips={FATIGUE} value={fatigue} onPick={(n) => answer({ fatigue: n })} small />
          <ChipQuestion prompt="Stress" name="Stress" chips={STRESS} value={stress} onPick={(n) => answer({ stress: n })} small />
          <PainNote key={`${date}:${row?.pain_notes ?? ""}`} initial={row?.pain_notes ?? ""} onSave={(t) => answer({ pain: t })} />
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="t-callout text-ivory">Volleyball today</span>
            <Switch checked={volleyball} onCheckedChange={(on) => answer({ volleyball: on })} label="Volleyball today" />
          </div>
        </div>
      </Collapse>
      <SaveError status={status} onRetry={answer} />
    </div>
  );
}

/* ------------------------------------------------------------- questions */

function SleepQuestion({ value, prefill, goal, onConfirm, saving }: { value: number | null; prefill: number | null; goal: number; onConfirm: (h: number) => void; saving: boolean }) {
  // the stepper starts at the logged value, else last week's median, else empty ("—", goal hint)
  const [draft, setDraft] = useState<number | null>(value ?? prefill);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value != null) setDraft(value);
  }
  const bump = (dir: 1 | -1) => setDraft((d) => Math.min(SLEEP_MAX, Math.max(0, (d ?? goal) + (d == null ? 0 : dir * SLEEP_STEP_H))));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      bump(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      bump(-1);
    }
  };
  const confirmed = value != null && draft === value;
  const btn = "press grid size-11 shrink-0 place-items-center rounded-full bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4 disabled:text-disabled";
  return (
    <div role="group" aria-label="How long did you sleep?">
      <p className="t-title-3 pr-14 text-ivory">How long did you sleep?</p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btn} aria-label="15 minutes less" onClick={() => bump(-1)} disabled={draft === 0}>
          <Minus className="size-5" strokeWidth={1.8} />
        </button>
        <div
          role="spinbutton"
          tabIndex={0}
          aria-label="Hours slept"
          aria-valuenow={draft ?? undefined}
          aria-valuemin={0}
          aria-valuemax={SLEEP_MAX}
          aria-valuetext={draft == null ? `Not set. Goal ${sleepSpoken(goal)}` : sleepSpoken(draft)}
          onKeyDown={onKey}
          className="min-w-0 flex-1 text-center outline-offset-4"
        >
          <p className={cn("t-num-l tnum", draft == null ? "text-ash" : "text-ivory")}>{draft == null ? "—" : sleepShort(draft)}</p>
          <p className="t-meta whitespace-nowrap text-ash">{draft == null ? `Goal ${sleepShort(goal)}` : prefill != null && value == null && draft === prefill ? "your usual" : " "}</p>
        </div>
        <button type="button" className={btn} aria-label="15 minutes more" onClick={() => bump(1)} disabled={draft != null && draft >= SLEEP_MAX}>
          <Plus className="size-5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          disabled={draft == null || saving}
          onClick={() => draft != null && onConfirm(draft)}
          aria-label={draft == null ? "Confirm: set your hours first" : `Confirm ${sleepSpoken(draft)}`}
          className={cn(
            "press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[length:max(14px,0.875rem)] font-semibold disabled:opacity-40",
            confirmed ? "text-leaf-300 shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "bg-m4 text-ivory shadow-[inset_0_0_0_1.5px_var(--ivory)]",
          )}
        >
          {confirmed ? <SealTick className="size-4" /> : null}
          {confirmed ? "Saved" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

/** A 1–5 question as a radio group of chips (a vertical list in the AX layout). */
export function ChipQuestion({
  prompt,
  name,
  chips,
  value,
  onPick,
  small,
}: {
  prompt: string;
  name: string;
  chips: readonly string[];
  value: number | null;
  onPick: (n: number) => void;
  small?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAt = (i: number) => refs.current[(i + chips.length) % chips.length]?.focus();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className={cn(small ? "t-callout" : "t-title-3 pr-14", "text-ivory")}>
        {prompt}
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1.5 @max-[19rem]:grid-cols-1">
        {chips.map((c, i) => {
          const on = value === i + 1;
          const tabbable = value == null ? i === 0 : on;
          return (
            <button
              key={c}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${name}: ${c}`}
              tabIndex={tabbable ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  focusAt(i + 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  focusAt(i - 1);
                }
              }}
              onClick={() => onPick(i + 1)}
              className={cn(
                "press flex min-h-11 items-center justify-center rounded-field px-1 text-center text-[length:max(13px,0.8125rem)] font-semibold leading-tight transition-colors @max-[19rem]:justify-start @max-[19rem]:px-4",
                on ? "bg-m4 text-ivory shadow-[inset_0_0_0_1.5px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PainNote({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="t-callout flex items-center gap-2 text-cinnabar">
        Pain note
        <span className="t-meta text-ash">only if something hurts</span>
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
        placeholder="Where, and what makes it worse"
        className="t-body mt-2 w-full resize-none rounded-field bg-m1 px-3.5 py-3 text-ivory shadow-[inset_0_0_0_1px_var(--ui-line)] outline-none placeholder:text-ash focus:shadow-[inset_0_0_0_1.5px_var(--ivory)]"
      />
    </div>
  );
}

/** The readiness call once the three questions are in (Dawn): one sentence + RULE. */
export function ReadinessCall({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <p className="t-callout flex flex-wrap items-center gap-x-2 gap-y-1 text-ivory">
      <span>{line}</span>
      <Tag kind="RULE" explain="From your check-in, last nights' sleep, volleyball and recent training (the readiness rule on the Recovery ledger)." />
    </p>
  );
}
