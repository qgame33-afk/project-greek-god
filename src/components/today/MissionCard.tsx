"use client";

import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
import { m as motionEl } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Laurel } from "@/components/art/Motifs";
import { AutoBadge, OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Ring } from "@/components/ui/ring";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useSetHabitLog } from "@/lib/data/recovery";
import { haptic } from "@/lib/haptics";
import type { HabitStatus } from "@/lib/habits";
import { formatInt, parseNumber } from "@/lib/units";
import type { TodayModel } from "./useTodayModel";

/**
 * Today's mission. Tracker-driven rows (AUTO) complete themselves and link to where they're
 * done; value habits (steps) open a stepper; check habits toggle. The workout row completes
 * only when a session is finished.
 */
export function MissionCard({ m, loading, onLogWeight, className }: { m: TodayModel; loading: boolean; onLogWeight: () => void; className?: string }) {
  const day = m.missionToday;
  const set = useSetHabitLog();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [stepsFor, setStepsFor] = useState<HabitStatus | null>(null);

  const statuses = day?.statuses ?? [];
  const done = day?.done ?? 0;
  const total = day?.total ?? 0;
  const complete = total > 0 && done === total;

  const toggle = (s: HabitStatus) => {
    if (pendingKey) return;
    const next = !s.done;
    setPendingKey(s.key);
    haptic(10);
    set.mutate(
      { habit_key: s.key, local_date: m.today, done: next },
      {
        onSuccess: () =>
          toast(next ? `${s.label} · done` : `${s.label} · cleared`, {
            duration: 6000,
            action: { label: "Undo", onClick: () => set.mutate({ habit_key: s.key, local_date: m.today, done: !next }) },
          }),
        onSettled: () => setPendingKey(null),
      },
    );
  };

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
                onValue={() => setStepsFor(s)}
              />
            </li>
          ))}
        </ul>
      )}

      <StepsSheet status={stepsFor} today={m.today} goal={m.profile.steps_goal} onClose={() => setStepsFor(null)} />
    </section>
  );
}

function MissionMark({ s }: { s: HabitStatus }) {
  if (s.done) {
    return (
      <motionEl.span
        initial={{ scale: 0.9, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-[image:var(--grad-leaf)] text-ink"
        role="img"
        aria-label={`${s.label}, done`}
      >
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </motionEl.span>
    );
  }
  return <Ring value={s.progress} size="xs" plain label={`${s.label}, ${Math.round(s.progress * 100)} percent`} />;
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
  const label = s.label.replace(/\s*\(optional\)\s*/i, "");
  const body = (trail: ReactNode) => (
    <>
      <MissionMark s={s} />
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-2 text-[15px] font-semibold", s.done ? "text-fg" : "text-fg")}>
          <span className="truncate">{label}</span>
          {s.auto && <AutoBadge />}
          {optional && <OptionalBadge className="h-4 px-1 text-[9.5px]" />}
        </span>
        <span className={cn("mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug", s.done ? "text-fg-3" : "text-fg-2")}>
          {s.key === "workout" && !s.done && s.caption.startsWith("Completes") ? "Completes when you finish the session." : s.caption}
        </span>
      </span>
      {trail}
    </>
  );
  const row = "press-soft flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[.03]";

  if (s.auto) {
    if (onWeigh) {
      return (
        <button type="button" onClick={onWeigh} className={row}>
          {body(<ChevronRight className="hidden size-4 shrink-0 text-fg-3 @[260px]:block" aria-hidden />)}
        </button>
      );
    }
    if (href) {
      return (
        <Link href={href} className={row} aria-label={`${label}: ${s.caption}. ${s.done ? "Done." : "Open to complete."}`}>
          {body(<ChevronRight className="hidden size-4 shrink-0 text-fg-3 @[260px]:block" aria-hidden />)}
        </Link>
      );
    }
    return <div className={row}>{body(null)}</div>;
  }

  if (s.kind === "value") {
    return (
      <button type="button" onClick={onValue} className={row} aria-label={`${label}: ${s.caption}. Edit`}>
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

/** Tiny stepper sheet for value habits (steps). Keeps the entry if saving fails. */
function StepsSheet({ status, today, goal, onClose }: { status: HabitStatus | null; today: string; goal: number; onClose: () => void }) {
  const open = !!status;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={status?.label ?? "Steps"} description={`Goal ${formatInt(goal)} today`}>
      {status && <StepsForm key={status.key + status.caption} status={status} today={today} goal={goal} onDone={onClose} />}
    </Sheet>
  );
}

function StepsForm({ status, today, goal, onDone }: { status: HabitStatus; today: string; goal: number; onDone: () => void }) {
  const set = useSetHabitLog();
  const initial = parseNumber(status.caption.split(" of ")[0]?.replace(/,/g, "")) ?? 0;
  const prev = status.caption.includes(" of ") ? initial : null;
  const [value, setValue] = useState<number>(initial);
  const [text, setText] = useState(initial ? String(initial) : "");
  const [failed, setFailed] = useState(false);
  const invalid = text.trim() !== "" && (parseNumber(text) == null || (parseNumber(text) ?? 0) < 0 || (parseNumber(text) ?? 0) > 100000);

  const save = () => {
    if (set.isPending || invalid) return;
    const v = Math.round(parseNumber(text) ?? value);
    setFailed(false);
    set.mutate(
      { habit_key: status.key, local_date: today, value: v, done: v >= goal },
      {
        onSuccess: () => {
          haptic(10);
          onDone();
          toast(`Steps · ${formatInt(v)}`, {
            duration: 6000,
            action: { label: "Undo", onClick: () => set.mutate({ habit_key: status.key, local_date: today, value: prev, done: prev != null && prev >= goal }) },
          });
        },
        onError: () => setFailed(true),
      },
    );
  };

  return (
    <div className="pb-[calc(16px+var(--safe-bottom))] pt-2 lg:pb-2">
      <Stepper
        label="Steps"
        value={value}
        step={500}
        min={0}
        max={100000}
        onChange={(v) => {
          setValue(v);
          setText(String(v));
        }}
      >
        <label className="block">
          <span className="sr-only">Steps today</span>
          <input
            value={text}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="0"
            onChange={(e) => {
              setText(e.target.value.replace(/[^\d]/g, ""));
              const n = parseNumber(e.target.value.replace(/[^\d]/g, ""));
              if (n != null) setValue(n);
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            onFocus={(e) => e.currentTarget.select()}
            className="num-xl w-full bg-transparent text-center text-fg outline-none placeholder:text-fg-3"
            aria-invalid={invalid}
          />
          <span className="mt-1 block text-[12px] font-semibold uppercase tracking-[0.18em] text-fg-3">steps</span>
        </label>
      </Stepper>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {[2500, 5000, 7500, goal].filter((n, i, a) => a.indexOf(n) === i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setValue(n);
              setText(String(n));
            }}
            className="press num h-9 rounded-full border border-line bg-s3 px-3.5 text-[14px] font-semibold text-fg-2 hover:text-fg"
          >
            {formatInt(n)}
          </button>
        ))}
      </div>
      {failed && (
        <ErrorNote className="mt-4" onRetry={save}>
          Couldn&apos;t save. Your entry is kept.
        </ErrorNote>
      )}
      <Button variant="primary" size="lg" block className="mt-5" onClick={save} loading={set.isPending} disabled={invalid}>
        Save steps
      </Button>
    </div>
  );
}
