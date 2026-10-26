"use client";

import { Activity, Bed, Dumbbell, Flame, Footprints, GlassWater, Scale, Sparkle, Utensils } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "@/components/ui/check-circle";
import { Chip, Stepper } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { isOffline } from "@/lib/data/core";
import { useMissionDays } from "@/lib/data/daily";
import { useProfile } from "@/lib/data/profile";
import { useHabitDefs, useHabitLogs, useSetHabitLog, type HabitLog } from "@/lib/data/recovery";
import { relativeDay, type ISODate } from "@/lib/dates";
import type { HabitStatus } from "@/lib/habits";
import { formatHabitValue, parseHabitValue, valueHabitSpec, type ValueHabitSpec } from "@/lib/today/value-habit";
import { useClearHabitLog } from "./useClearHabitLog";

/** "Mobility (optional)" → "Mobility". */
export const cleanLabel = (l: string) => l.replace(/\s*\(optional\)\s*/i, "").trim();

/** A plain Lucide glyph per habit (§1.5). */
export function habitGlyph(key: string, className = "size-5") {
  const p = { className, strokeWidth: 1.9, "aria-hidden": true as const };
  if (key === "steps") return <Footprints {...p} />;
  if (key === "calories") return <Flame {...p} />;
  if (key === "water") return <GlassWater {...p} />;
  if (key === "workout") return <Dumbbell {...p} />;
  if (key === "protein") return <Utensils {...p} />;
  if (key === "sleep") return <Bed {...p} />;
  if (key === "weighin") return <Scale {...p} />;
  if (key === "mobility") return <Activity {...p} />;
  return <Sparkle {...p} />;
}

/**
 * One day's habits as rows with check circles (docs/DESIGN-V3-SIMPLE.md §4.1.1, §4.6): a tap ticks
 * or clears a habit (Undo in the toast), a counted habit (steps) opens its number, and a habit that
 * ticks itself from his logs says so and is not tappable. Used by Today's Habits sheet and Check-ins.
 */
export function HabitsList({ date, today }: { date: ISODate; today: ISODate }) {
  const { days, loading } = useMissionDays(date, date);
  const defs = useHabitDefs();
  const logs = useHabitLogs(date, date);
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const { profile } = useProfile();
  const busy = useRef(false);
  const [valueFor, setValueFor] = useState<HabitStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const day = days[0];
  const when = relativeDay(date, today);
  const logOf = (key: string): HabitLog | null => (logs.data ?? []).find((l) => l.habit_key === key && l.local_date === date) ?? null;

  const toggle = (s: HabitStatus) => {
    if (busy.current) return;
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    busy.current = true;
    const next = !s.done;
    const hadRow = !!logOf(s.key);
    set.mutate(
      { habit_key: s.key, local_date: date, done: next },
      {
        onSuccess: () =>
          toast(`${cleanLabel(s.label)} ${next ? "done" : "cleared"}`, {
            description: date === today ? undefined : when,
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => (hadRow ? set.mutate({ habit_key: s.key, local_date: date, done: !next }) : clear.mutate({ habit_key: s.key, local_date: date })),
            },
          }),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const def = valueFor ? (defs.data ?? []).find((d) => d.key === valueFor.key) : null;
  const spec = valueFor ? valueHabitSpec(valueFor.key, def ? { label: def.label, target: def.target == null ? null : Number(def.target), unit: def.unit } : null, profile?.steps_goal ?? 0) : null;
  const statuses = day?.statuses ?? [];

  if (loading || !day)
    return defs.error ? (
      <ErrorNote onRetry={() => void defs.refetch()} />
    ) : (
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-tile-lg" />
        ))}
      </div>
    );
  if (!statuses.length)
    return (
      <div className="rounded-tile-lg bg-surface px-4 py-5 text-center">
        <p className="t-row">No habits yet</p>
        <p className="t-label mt-1">Choose the ones you want to track each day.</p>
      </div>
    );

  return (
    <>
      <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        {statuses.map((s) => {
          const label = cleanLabel(s.label);
          const sub = s.auto ? (s.done ? "Done · ticks itself" : "Ticks itself") : s.kind === "value" ? s.caption : s.done ? "Done" : null;
          const text = (
            <span className="min-w-0 flex-1">
              <span className="t-row block truncate">{label}</span>
              {sub && <span className="t-label mt-0.5 block truncate">{sub}</span>}
            </span>
          );
          const icon = (
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
              {habitGlyph(s.key)}
            </span>
          );
          const rowCls = "flex min-h-14 items-center gap-3.5 px-4 py-2.5";
          if (s.auto)
            return (
              <li key={s.key} className={rowCls} aria-label={`${label}: ${s.caption}${s.done ? ", done" : ""}. Ticks itself`}>
                {icon}
                {text}
                <CheckCircle state={s.done ? "done" : "todo"} />
              </li>
            );
          if (s.kind === "value")
            return (
              <li key={s.key}>
                <button type="button" className={cn(rowCls, "press-soft w-full text-left")} onClick={() => setValueFor(s)} aria-label={`${label}: ${s.caption}. Edit`}>
                  {icon}
                  {text}
                  <CheckCircle state={s.done ? "done" : "todo"} />
                </button>
              </li>
            );
          return (
            <li key={s.key}>
              <button type="button" role="checkbox" aria-checked={s.done} aria-label={label} className={cn(rowCls, "press-soft w-full text-left")} onClick={() => toggle(s)}>
                {icon}
                {text}
                <CheckCircle state={s.done ? "done" : "todo"} />
              </button>
            </li>
          );
        })}
      </ul>
      {offline && (
        <p role="status" className="t-label mt-2">
          You&apos;re offline. Try again when you&apos;re back.
        </p>
      )}
      <Sheet
        open={!!valueFor}
        onOpenChange={(o) => !o && setValueFor(null)}
        title={spec?.label ?? "Habit"}
        description={spec ? `Goal ${formatHabitValue(spec.target, spec.integer)}${spec.unit ? ` ${spec.unit}` : ""}${date === today ? "" : ` · ${when}`}` : undefined}
      >
        {valueFor && spec && <ValueForm key={`${valueFor.key}-${date}`} habitKey={valueFor.key} spec={spec} log={logOf(valueFor.key)} today={date} onDone={() => setValueFor(null)} />}
      </Sheet>
    </>
  );
}

/** The number for a counted habit (steps): starts from that day's value (never the goal); Undo restores exactly. */
export function ValueForm({ habitKey, spec, log, today, onDone }: { habitKey: string; spec: ValueHabitSpec; log: HabitLog | null; today: ISODate; onDone: () => void }) {
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const busy = useRef(false);
  const prev = log?.value != null ? { value: Number(log.value), done: log.done } : null;
  const [text, setText] = useState(prev ? String(prev.value) : "");
  const [failed, setFailed] = useState<false | "offline" | "error">(false);
  const parsed = parseHabitValue(text, spec);
  const invalid = text.trim() !== "" && parsed == null;
  const fmt = (n: number) => `${formatHabitValue(n, spec.integer)}${spec.unit ? ` ${spec.unit}` : ""}`;
  const restore = () => (prev ? set.mutate({ habit_key: habitKey, local_date: today, value: prev.value, done: prev.done }) : clear.mutate({ habit_key: habitKey, local_date: today }));
  const save = () => {
    if (busy.current || parsed == null) return;
    if (isOffline()) {
      setFailed("offline");
      return;
    }
    busy.current = true;
    setFailed(false);
    const v = parsed;
    set.mutate(
      { habit_key: habitKey, local_date: today, value: v, done: v >= spec.target },
      {
        onSuccess: () => {
          onDone();
          toast(`${spec.label} saved · ${fmt(v)}`, { duration: 6000, action: { label: "Undo", onClick: restore } });
        },
        onError: () => setFailed("error"),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };
  const inputId = useId();
  return (
    <div className="pb-4 pt-2 lg:pb-2">
      <Stepper label={spec.label} value={parsed ?? 0} step={spec.step} min={0} max={spec.max} onChange={(n) => setText(String(spec.integer ? Math.round(n) : Math.round(n * 10) / 10))}>
        <label htmlFor={inputId} className="block">
          <span className="sr-only">{spec.label}</span>
          <input
            id={inputId}
            value={text}
            inputMode={spec.integer ? "numeric" : "decimal"}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="0"
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && save()}
            onFocus={(e) => e.currentTarget.select()}
            className="t-hero w-full bg-transparent text-center text-fg outline-none placeholder:text-fg-2"
            aria-invalid={invalid}
          />
          {spec.unit && <span className="t-label mt-1 block">{spec.unit}</span>}
        </label>
      </Stepper>
      {invalid && (
        <p className="t-label mt-2 text-center text-danger">
          Enter {spec.integer ? "a whole number" : "a number"} from 0 to {formatHabitValue(spec.max, true)}.
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {spec.chips.map((n) => (
          <Chip key={n} selected={parsed === n} onClick={() => setText(String(n))}>
            {formatHabitValue(n, spec.integer)}
            {n === spec.target ? " · goal" : ""}
          </Chip>
        ))}
      </div>
      {failed && (
        <ErrorNote className="mt-4" onRetry={save}>
          {failed === "offline" ? "You're offline. Your number is kept." : "Couldn't save. Your number is kept."}
        </ErrorNote>
      )}
      <Button variant="primary" size="lg" block className="mt-5" onClick={save} loading={set.isPending} disabled={parsed == null}>
        Save
      </Button>
    </div>
  );
}
