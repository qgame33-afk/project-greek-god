"use client";

import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
import { m as motionEl } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Laurel } from "@/components/art/Motifs";
import { AutoBadge, OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Ring } from "@/components/ui/ring";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useHabitDefs, useHabitLogs, useSetHabitLog, type HabitLog } from "@/lib/data/recovery";
import type { ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import type { HabitStatus } from "@/lib/habits";
import { formatHabitValue, parseHabitValue, valueHabitSpec, type ValueHabitSpec } from "@/lib/today/value-habit";
import { useClearHabitLog } from "./useClearHabitLog";
import type { TodayModel } from "./useTodayModel";

/**
 * Today's mission. Tracker-driven rows (AUTO) complete themselves and link to where they're
 * done; value habits (steps, or any custom "number with target") open a stepper sheet; check
 * habits toggle. The workout row completes only when a session is finished.
 */
export function MissionCard({ m, loading, onLogWeight, className }: { m: TodayModel; loading: boolean; onLogWeight: () => void; className?: string }) {
  const day = m.missionToday;
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const defs = useHabitDefs();
  // Same range as useMissionDays → served from the cache it already filled.
  const logs = useHabitLogs(m.from, m.today);
  const busy = useRef(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [valueFor, setValueFor] = useState<HabitStatus | null>(null);

  const statuses = day?.statuses ?? [];
  const done = day?.done ?? 0;
  const total = day?.total ?? 0;
  const complete = total > 0 && done === total;
  const logOf = (key: string): HabitLog | null => (logs.data ?? []).find((l) => l.habit_key === key && l.local_date === m.today) ?? null;

  const toggle = (s: HabitStatus) => {
    if (busy.current) return; // a second tap in the same frame, before React re-renders
    busy.current = true;
    const next = !s.done;
    const hadRow = !!logOf(s.key);
    setPendingKey(s.key);
    haptic(10);
    set.mutate(
      { habit_key: s.key, local_date: m.today, done: next },
      {
        onSuccess: () =>
          toast(next ? `${cleanLabel(s.label)} · done` : `${cleanLabel(s.label)} · cleared`, {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => (hadRow ? set.mutate({ habit_key: s.key, local_date: m.today, done: !next }) : clear.mutate({ habit_key: s.key, local_date: m.today })),
            },
          }),
        onSettled: () => {
          busy.current = false;
          setPendingKey(null);
        },
      },
    );
  };

  const def = valueFor ? (defs.data ?? []).find((d) => d.key === valueFor.key) : null;
  const spec = valueFor
    ? valueHabitSpec(valueFor.key, def ? { label: def.label, target: def.target == null ? null : Number(def.target), unit: def.unit } : null, m.profile.steps_goal)
    : null;

  return (
    <section aria-label="Today's mission" className={cn("card @container flex h-full flex-col p-4 sm:p-5 lg:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="eyebrow">Today&apos;s mission</h2>
          <p className="num-md mt-1.5 text-fg" aria-label={`${done} of ${total} done`}>
            {loading && !day ? "—" : done}
            <span className="text-fg-3"> / {loading && !day ? "—" : total}</span>
          </p>
        </div>
        <Ring value={total ? done / total : 0} size="sm" label={`${done} of ${total} missions complete`} />
      </div>

      {complete && (
        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-line-gold bg-gold-tint px-3.5 py-3">
          <Laurel size={34} className="shrink-0" />
          <div>
            <p className="t-h2 text-gold-300">Mission complete</p>
            <p className="text-[12.5px] font-medium text-fg-2">Every task done today. It counts toward your streak.</p>
          </div>
        </div>
      )}

      {loading && !day ? (
        <div className="mt-3 space-y-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !day ? (
        <ErrorNote className="mt-3">Couldn&apos;t evaluate today&apos;s missions.</ErrorNote>
      ) : (
        <ul className="-mx-2 mt-2">
          {statuses.map((s) => (
            <li key={s.key}>
              <MissionRow
                s={s}
                pending={pendingKey === s.key}
                href={s.key === "workout" && m.active ? `/workout/${m.active.id}` : s.href}
                onWeigh={s.key === "weighin" && !s.done ? onLogWeight : undefined}
                onToggle={() => toggle(s)}
                onValue={() => setValueFor(s)}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!valueFor} onOpenChange={(o) => !o && setValueFor(null)} title={spec?.label ?? "Log"} description={spec ? goalLine(spec) : undefined}>
        {valueFor && spec && (
          <ValueForm key={valueFor.key} habitKey={valueFor.key} spec={spec} log={logOf(valueFor.key)} today={m.today} onDone={() => setValueFor(null)} />
        )}
      </Sheet>
    </section>
  );
}

const cleanLabel = (l: string) => l.replace(/\s*\(optional\)\s*/i, "").trim();
const goalLine = (s: ValueHabitSpec) => `Goal ${formatHabitValue(s.target, s.integer)}${s.unit ? ` ${s.unit}` : ""} today`;

function MissionMark({ s }: { s: HabitStatus }) {
  if (s.done) {
    return (
      <motionEl.span
        initial={{ scale: 0.9, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-[image:var(--grad-leaf)] text-ink"
        role="img"
        aria-label={`${cleanLabel(s.label)}, done`}
      >
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </motionEl.span>
    );
  }
  return <Ring value={s.progress} size="xs" plain label={`${cleanLabel(s.label)}, ${Math.round(s.progress * 100)} percent`} />;
}

function MissionRow({
  s,
  href,
  pending,
  onWeigh,
  onToggle,
  onValue,
}: {
  s: HabitStatus;
  href?: string;
  pending: boolean;
  onWeigh?: () => void;
  onToggle: () => void;
  onValue: () => void;
}) {
  const optional = /optional/i.test(s.label);
  const label = cleanLabel(s.label);
  const caption = s.key === "workout" && !s.done && s.caption.startsWith("Completes") ? "Completes when you finish the session." : s.caption;
  const body = (trail: ReactNode) => (
    <>
      <MissionMark s={s} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <span className="truncate">{label}</span>
          {s.auto && <AutoBadge />}
          {optional && <OptionalBadge className="h-4 px-1 text-[9.5px]" />}
        </span>
        <span className={cn("mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug", s.done ? "text-fg-3" : "text-fg-2")}>{caption}</span>
      </span>
      {trail}
    </>
  );
  const row = "press-soft flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[.03]";
  const chevron = <ChevronRight className="hidden size-4 shrink-0 text-fg-3 @[260px]:block" aria-hidden />;

  if (s.auto) {
    if (onWeigh) {
      return (
        <button type="button" onClick={onWeigh} className={row} aria-label={`${label}: ${caption}. Log weight`}>
          {body(chevron)}
        </button>
      );
    }
    if (href) {
      return (
        <Link href={href} className={row} aria-label={`${label}: ${caption}. ${s.done ? "Done." : "Open to complete."}`}>
          {body(chevron)}
        </Link>
      );
    }
    return <div className={row}>{body(null)}</div>;
  }

  if (s.kind === "value") {
    return (
      <button type="button" onClick={onValue} className={row} aria-label={`${label}: ${caption}. Edit`}>
        {body(
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-s3 text-fg-2">
            <Plus className="size-4" aria-hidden />
          </span>,
        )}
      </button>
    );
  }

  return (
    <button type="button" onClick={onToggle} disabled={pending} className={cn(row, "disabled:opacity-60")} role="checkbox" aria-checked={s.done} aria-label={label}>
      {body(null)}
    </button>
  );
}

/**
 * Stepper form for a value habit. Starts from today's logged value (never from the goal), keeps
 * the entry if saving fails, and its Undo restores exactly what was there before — removing the
 * row when there was none.
 */
function ValueForm({ habitKey, spec, log, today, onDone }: { habitKey: string; spec: ValueHabitSpec; log: HabitLog | null; today: ISODate; onDone: () => void }) {
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const busy = useRef(false);
  const prev = log?.value != null ? { value: Number(log.value), done: log.done } : null;
  const [value, setValue] = useState<number>(prev?.value ?? 0);
  const [text, setText] = useState(prev ? String(prev.value) : "");
  const [failed, setFailed] = useState(false);
  const parsed = parseHabitValue(text, spec);
  const invalid = text.trim() !== "" && parsed == null;
  const fmt = (n: number) => `${formatHabitValue(n, spec.integer)}${spec.unit ? ` ${spec.unit}` : ""}`;

  const restore = () =>
    prev ? set.mutate({ habit_key: habitKey, local_date: today, value: prev.value, done: prev.done }) : clear.mutate({ habit_key: habitKey, local_date: today });

  const save = () => {
    if (busy.current || parsed == null) return;
    busy.current = true;
    setFailed(false);
    const v = parsed;
    set.mutate(
      { habit_key: habitKey, local_date: today, value: v, done: v >= spec.target },
      {
        onSuccess: () => {
          haptic(10);
          onDone();
          toast(`${spec.label} · ${fmt(v)}`, { duration: 6000, action: { label: "Undo", onClick: restore } });
        },
        onError: () => setFailed(true),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const remove = () => {
    if (busy.current || !prev) return;
    const was = prev;
    // Optimistic: the sheet closes now, so per-call callbacks would never run (TanStack drops
    // them on unmount). The hook rolls back and toasts by itself if the delete fails.
    clear.mutate({ habit_key: habitKey, local_date: today });
    onDone();
    toast(`${spec.label} cleared`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => set.mutate({ habit_key: habitKey, local_date: today, value: was.value, done: was.done }) },
    });
  };

  return (
    <div className="pb-4 pt-2 lg:pb-2">
      <Stepper
        label={spec.label}
        value={value}
        step={spec.step}
        min={0}
        max={spec.max}
        onChange={(v) => {
          const n = spec.integer ? Math.round(v) : Math.round(v * 10) / 10;
          setValue(n);
          setText(String(n));
        }}
      >
        <label className="block">
          <span className="sr-only">{spec.label} today</span>
          <input
            value={text}
            inputMode={spec.integer ? "numeric" : "decimal"}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="0"
            onChange={(e) => {
              // keep the decimal point: a typed "12.5" must never turn into "125"
              const t = e.target.value.replace(/[^\d.,]/g, "");
              setText(t);
              const n = parseHabitValue(t, spec);
              if (n != null) setValue(n);
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            onFocus={(e) => e.currentTarget.select()}
            className="num-xl w-full bg-transparent text-center text-fg outline-none placeholder:text-fg-3"
            aria-invalid={invalid}
          />
          {spec.unit && <span className="mt-1 block text-[12px] font-semibold uppercase tracking-[0.18em] text-fg-3">{spec.unit}</span>}
        </label>
      </Stepper>
      {invalid && <p className="mt-2 text-center text-[13px] font-medium text-danger">Enter {spec.integer ? "a whole number" : "a number"} from 0 to {formatHabitValue(spec.max, true)}.</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {spec.chips.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setValue(n);
              setText(String(n));
            }}
            className={cn(
              "press num relative h-9 rounded-full border px-3.5 text-[14px] font-semibold before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
              parsed === n ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
            )}
          >
            {formatHabitValue(n, spec.integer)}
            {n === spec.target && <span className="ml-1 font-sans text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">Goal</span>}
          </button>
        ))}
      </div>
      {failed && (
        <ErrorNote className="mt-4" onRetry={save}>
          Couldn&apos;t save. Your entry is kept.
        </ErrorNote>
      )}
      <Button variant="primary" size="lg" block className="mt-5" onClick={save} loading={set.isPending} disabled={parsed == null}>
        Save
      </Button>
      {prev && (
        <Button variant="ghost" size="md" block className="mt-2" onClick={remove}>
          Clear today&apos;s entry
        </Button>
      )}
    </div>
  );
}
