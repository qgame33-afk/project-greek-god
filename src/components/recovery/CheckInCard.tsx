"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Plus, ShieldAlert, Trash, Volleyball } from "lucide-react";
import { toast } from "sonner";
import { LoggedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scale, Stepper, Switch } from "@/components/ui/controls";
import { Label, Textarea } from "@/components/ui/field";
import { Divider, ErrorNote, Skeleton } from "@/components/ui/misc";
import {
  useRecoveryDay,
  useSaveRecovery,
  type RecoveryLog,
} from "@/lib/data/recovery";
import {
  useVolleyball,
  useVolleyballMutations,
  type Volleyball as VolleyballRow,
} from "@/lib/data/training";
import { localDateOf, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import {
  draftFromRow,
  draftsEqual,
  draftToPayload,
  EMPTY_DRAFT,
  formatHours,
  formatSleep,
  isDraftEmpty,
  loadStoredDraft,
  PAIN_MAX,
  parseSleepInput,
  rowToUpsert,
  SLEEP_MAX,
  SLEEP_MIN,
  SLEEP_STEP,
  storeDraft,
  type CheckinDraft,
} from "@/lib/recovery/checkin";
import { useDeleteRecovery, useOptimisticRecovery } from "@/lib/recovery/hooks";
import { cn } from "@/lib/cn";
import { SleepGoalSheet } from "./SleepGoalSheet";
import { VolleyballSheet, describeVolleyball } from "./VolleyballSheet";

export interface CheckInHandle {
  focus: () => void;
}

const SCALES: {
  key: keyof Pick<
    CheckinDraft,
    "quality" | "energy" | "soreness" | "fatigue" | "stress"
  >;
  label: string;
  low: string;
  high: string;
  invert?: boolean;
}[] = [
  { key: "quality", label: "Sleep quality", low: "Poor", high: "Great" },
  { key: "energy", label: "Energy", low: "Drained", high: "Fresh" },
  {
    key: "soreness",
    label: "Muscle soreness",
    low: "None",
    high: "Very sore",
    invert: true,
  },
  {
    key: "fatigue",
    label: "General fatigue",
    low: "Fresh",
    high: "Exhausted",
    invert: true,
  },
  { key: "stress", label: "Stress", low: "Calm", high: "High", invert: true },
];

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const savedLabel = (iso: string, today: ISODate) => {
  const d = localDateOf(iso);
  return d === today ? `Saved ${timeOf(iso)}` : `Saved ${shortDate(d, today)}`;
};

export const CheckInCard = forwardRef<
  CheckInHandle,
  {
    date: ISODate;
    today: ISODate;
    sleepGoal: number;
    className?: string;
    style?: CSSProperties;
  }
>(function CheckInCard({ date, today, sleepGoal, className, style }, ref) {
  const { log, loading } = useRecoveryDay(date);
  const formRef = useRef<CheckInHandle>(null);
  useImperativeHandle(
    ref,
    () => ({ focus: () => formRef.current?.focus() }),
    [],
  );

  return (
    <section
      className={cn(
        "card-instrument scroll-mt-[76px] p-4 sm:p-5 lg:scroll-mt-8",
        className,
      )}
      style={style}
      aria-labelledby="checkin-title"
      id="checkin"
    >
      {loading ? (
        <CheckInSkeleton />
      ) : (
        <CheckInForm
          key={date}
          ref={formRef}
          date={date}
          today={today}
          log={log}
          sleepGoal={sleepGoal}
        />
      )}
    </section>
  );
});

function CheckInSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-5 h-[52px] w-full" />
      <div className="mt-6 space-y-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[64px] w-full" />
        ))}
      </div>
      <Skeleton className="mt-6 h-14 w-full rounded-[14px]" />
    </div>
  );
}

const CheckInForm = forwardRef<
  CheckInHandle,
  { date: ISODate; today: ISODate; log: RecoveryLog | null; sleepGoal: number }
>(function CheckInForm({ date, today, log, sleepGoal }, ref) {
  const server = draftFromRow(log);
  const [draft, setDraft] = useState<CheckinDraft>(() => {
    const stored = loadStoredDraft(date);
    return stored && !draftsEqual(stored, server) ? stored : server;
  });
  const [restored] = useState(() => {
    const stored = loadStoredDraft(date);
    return !!stored && !draftsEqual(stored, server);
  });
  const [error, setError] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [vbOpen, setVbOpen] = useState(false);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const sleepBtn = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const save = useSaveRecovery();
  const del = useDeleteRecovery();
  const optimistic = useOptimisticRecovery();
  const vb = useVolleyball(date, date);
  const vbMut = useVolleyballMutations();
  const vbRows = vb.data ?? [];

  const dirty = !draftsEqual(draft, server);
  const canSave = dirty && !(isDraftEmpty(draft) && !log);

  useImperativeHandle(ref, () => ({
    focus: () =>
      (sleepBtn.current ?? titleRef.current)?.focus({ preventScroll: true }),
  }));

  // Keep unsaved input across reloads and date switches; clear it once it matches the saved row.
  useEffect(() => {
    storeDraft(date, dirty ? draft : null);
  }, [date, draft, dirty]);

  const set = (patch: Partial<CheckinDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const submit = async () => {
    if (pending.current || !canSave) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    const payload = draftToPayload(date, draft);
    const prev = log;
    const rollback = optimistic(date, payload);
    try {
      await save.mutateAsync(payload);
      storeDraft(date, null);
      haptic(10);
      const parts = [
        payload.sleep_hours != null
          ? `Sleep ${formatHours(payload.sleep_hours)} h`
          : null,
        payload.energy != null ? `Energy ${payload.energy}/5` : null,
        payload.soreness != null ? `Soreness ${payload.soreness}/5` : null,
      ].filter(Boolean);
      toast(prev ? "Check-in updated" : "Check-in saved", {
        id: `checkin-${date}`,
        description: parts.length ? parts.join(" · ") : undefined,
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            if (prev) {
              const rest = rowToUpsert(prev);
              const undo = optimistic(date, rest);
              save.mutate(rest, { onError: undo });
            } else {
              del.mutate({
                ...(log ?? ({} as RecoveryLog)),
                ...payload,
              } as RecoveryLog);
            }
            setDraft(draftFromRow(prev));
          },
        },
      });
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const remove = () => {
    if (!log || del.isPending) return;
    const row = log;
    const before = draft;
    setDraft({ ...EMPTY_DRAFT });
    del.mutate(row, {
      onError: () => setDraft(before),
      onSuccess: () => {
        storeDraft(date, null);
        toast("Check-in deleted", {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              const rest = rowToUpsert(row);
              const undo = optimistic(date, rest);
              save.mutate(rest, { onError: undo });
              setDraft(draftFromRow(row));
            },
          },
        });
      },
    });
  };

  const removeVb = (row: VolleyballRow) =>
    vbMut.remove.mutate(row.id, {
      onSuccess: () =>
        toast("Volleyball session removed", {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () =>
              vbMut.add.mutate({
                local_date: row.local_date,
                kind: row.kind,
                duration_min: row.duration_min,
                intensity: row.intensity,
                notes: row.notes,
              }),
          },
        }),
    });

  const dayLabel = relativeDay(date, today);
  const sleepDelta = draft.sleep == null ? null : draft.sleep - sleepGoal;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Check-in · {dayLabel}</p>
          <h2
            id="checkin-title"
            ref={titleRef}
            tabIndex={-1}
            className="t-h2 mt-1.5 outline-none"
          >
            {date === today
              ? "How did you recover?"
              : `${shortDate(date, today)} check-in`}
          </h2>
        </div>
        <div className="shrink-0 pt-0.5">
          {log && !dirty ? (
            <LoggedBadge />
          ) : dirty ? (
            <span className="inline-flex h-5 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-fg-2">
              <span className="size-1.5 rounded-full bg-gold-400" aria-hidden />
              Unsaved
            </span>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg-3">
              Not logged
            </span>
          )}
        </div>
      </div>
      {restored && dirty && (
        <p className="mt-2 text-[12px] font-medium text-fg-3">
          Restored your unsaved entry from earlier.
        </p>
      )}

      {/* ------------------------------------------------------- sleep */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-fg-2">
            Hours slept
          </span>
          <button
            type="button"
            onClick={() => setGoalOpen(true)}
            className="-my-3 -mr-2 inline-flex h-11 items-center px-2 text-[13px] font-semibold text-fg-3 hover:text-fg-2"
          >
            Goal{" "}
            <span className="num ml-1 text-[15px] text-gold-300">
              {formatHours(sleepGoal)} h
            </span>
          </button>
        </div>
        <Stepper
          label="hours slept"
          value={draft.sleep ?? sleepGoal}
          step={SLEEP_STEP}
          min={SLEEP_MIN}
          max={SLEEP_MAX}
          onChange={(v) => set({ sleep: draft.sleep == null ? sleepGoal : v })}
        >
          <SleepValue
            ref={sleepBtn}
            value={draft.sleep}
            onCommit={(v) => set({ sleep: v })}
          />
        </Stepper>
        <div className="mt-2 flex min-h-5 items-center justify-center gap-2 text-[12px] font-medium text-fg-3">
          {draft.sleep == null ? (
            <span>
              Not logged · ± starts at {formatHours(sleepGoal)} h · tap the dash
              to type
            </span>
          ) : (
            <>
              <span>{formatSleep(draft.sleep)}</span>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  sleepDelta != null && sleepDelta >= 0 && "text-gold-300",
                )}
              >
                {sleepDelta === 0
                  ? "On goal"
                  : sleepDelta! > 0
                    ? `${formatHours(sleepDelta!)} h over goal`
                    : `${formatHours(-sleepDelta!)} h under goal`}
              </span>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="-my-3 inline-flex h-11 items-center font-semibold text-fg-2 hover:text-fg"
                onClick={() => set({ sleep: null })}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <Divider className="my-5" />

      {/* ------------------------------------------------------- scales */}
      <div className="space-y-4">
        {SCALES.map((s) => (
          <Scale
            key={s.key}
            label={s.label}
            low={s.low}
            high={s.high}
            invert={s.invert}
            value={draft[s.key]}
            onChange={(v) => set({ [s.key]: v } as Partial<CheckinDraft>)}
          />
        ))}
        <p className="text-[12px] font-medium text-fg-3">
          Tap a selected number again to clear it.
        </p>
      </div>

      <Divider className="my-5" />

      {/* --------------------------------------------------- volleyball */}
      <div>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <label htmlFor={`vb-${date}`} className="min-w-0">
            <span className="flex items-center gap-2 text-[15px] font-bold text-fg">
              <Volleyball className="size-[18px] text-fg-3" aria-hidden />
              Volleyball {date === today ? "today" : "this day"}
            </span>
            <span className="mt-0.5 block text-[12px] font-medium text-fg-3">
              Counts toward leg fatigue in your guidance.
            </span>
          </label>
          <Switch
            id={`vb-${date}`}
            label="Volleyball participation"
            checked={draft.volleyball}
            onCheckedChange={(v) => set({ volleyball: v })}
          />
        </div>
        {(draft.volleyball || vbRows.length > 0) && (
          <div className="mt-3 space-y-2">
            {vbRows.map((r) => (
              <div
                key={r.id}
                className="card-inset flex min-h-[52px] items-center justify-between gap-3 py-2 pl-3.5 pr-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-fg">
                    {describeVolleyball(r)}
                  </p>
                  {r.notes && (
                    <p className="truncate text-[12px] text-fg-3">{r.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeVb(r)}
                  disabled={vbMut.remove.isPending}
                  className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 hover:text-danger"
                  aria-label="Remove volleyball session"
                >
                  <Trash className="size-4" />
                </button>
              </div>
            ))}
            {vbRows.length === 0 && (
              <button
                type="button"
                onClick={() => setVbOpen(true)}
                className="press inline-flex h-11 items-center gap-1.5 text-[13px] font-bold text-gold-300 hover:text-gold-200"
              >
                <Plus className="size-4" /> Add session details
              </button>
            )}
          </div>
        )}
      </div>

      <Divider className="my-5" />

      {/* --------------------------------------------------------- pain */}
      <div>
        <Label
          htmlFor={`pain-${date}`}
          hint={
            draft.pain.length > PAIN_MAX - 80
              ? `${draft.pain.length}/${PAIN_MAX}`
              : "Optional"
          }
        >
          Pain or injury
        </Label>
        <Textarea
          id={`pain-${date}`}
          rows={2}
          maxLength={PAIN_MAX}
          className="min-h-[76px]"
          placeholder="Where, and what makes it worse. e.g. Left knee on deep squats"
          value={draft.pain}
          onChange={(e) => set({ pain: e.target.value })}
          enterKeyHint="done"
          autoComplete="off"
        />
        {draft.pain.trim() && (
          <div
            className="mt-2.5 flex gap-2.5 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] leading-snug text-fg"
            role="note"
          >
            <ShieldAlert
              className="mt-px size-4 shrink-0 text-danger"
              aria-hidden
            />
            <span>
              Coach will avoid loading this area. Sharp or lasting pain: get it
              checked.
            </span>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- save */}
      <div className="mt-6">
        {error && (
          <ErrorNote className="mb-3" onRetry={submit}>
            Couldn&apos;t save. Your entry is kept. {error}
          </ErrorNote>
        )}
        <Button
          variant="primary"
          size="lg"
          block
          onClick={submit}
          disabled={!canSave}
          loading={saving}
        >
          Save check-in
        </Button>
        <div className="mt-2 flex min-h-11 items-center justify-between gap-3 text-[12px] font-medium text-fg-3">
          <span>
            {saving
              ? "Saving…"
              : log && !dirty
                ? savedLabel(log.updated_at, today)
                : isDraftEmpty(draft) && !log
                  ? "Add at least one answer to save."
                  : dirty
                    ? "Changes not saved yet."
                    : ""}
          </span>
          {log && (
            <button
              type="button"
              onClick={remove}
              disabled={del.isPending}
              className="-mr-2 inline-flex h-11 items-center gap-1.5 px-2 font-semibold text-fg-3 hover:text-danger"
            >
              <Trash className="size-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <SleepGoalSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        current={sleepGoal}
      />
      <VolleyballSheet
        open={vbOpen}
        onOpenChange={setVbOpen}
        date={date}
        onAdded={() => {
          if (!draft.volleyball) set({ volleyball: true });
        }}
      />
    </div>
  );
});

/* ----------------------------------------------------------- sleep value */

/** The stepper's centre: the value, or "—" until set; tap to type an exact time. */
const SleepValue = forwardRef<
  HTMLButtonElement,
  { value: number | null; onCommit: (v: number | null) => void }
>(function SleepValue({ value, onCommit }, ref) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (!text.trim()) {
      setEditing(false);
      return;
    }
    const v = parseSleepInput(text);
    if (v == null) {
      setInvalid(true);
      return;
    }
    onCommit(v);
    setEditing(false);
  };

  if (editing)
    return (
      <div className="mx-auto max-w-[150px]">
        <input
          autoFocus
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Hours slept"
          aria-invalid={invalid || undefined}
          placeholder="7.5"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className={cn(
            "num h-[52px] w-full rounded-[12px] border bg-s3 text-center text-[28px] font-semibold text-fg outline-none focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)]",
            invalid ? "border-danger" : "border-gold-400",
          )}
        />
        {invalid && (
          <p className="mt-1 text-center text-[12px] font-medium text-danger">
            Use hours, e.g. 7.5 or 7:30
          </p>
        )}
      </div>
    );

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        setText(value == null ? "" : String(value));
        setInvalid(false);
        setEditing(true);
      }}
      className="press mx-auto flex h-[52px] min-w-[120px] items-baseline justify-center rounded-[12px] px-3 hover:bg-white/[.03]"
      aria-label={
        value == null
          ? "Hours slept: not logged. Tap to type"
          : `Hours slept: ${value}. Tap to type`
      }
    >
      {value == null ? (
        <span className="num-lg leading-[52px] text-fg-3">—</span>
      ) : (
        <span className="num-lg leading-[52px]">
          {formatHours(value)}
          <span className="unit">h</span>
        </span>
      )}
    </button>
  );
});
