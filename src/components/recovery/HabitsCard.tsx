"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SealTick } from "@/components/art/icons";
import { ValueForm, cleanLabel, riteGlyph } from "@/components/now/Lower";
import { useClearHabitLog } from "@/components/now/useClearHabitLog";
import { Button } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useMissionDays } from "@/lib/data/daily";
import { useProfile } from "@/lib/data/profile";
import { useHabitDefs, useHabitLogs, useSetHabitLog, type HabitLog } from "@/lib/data/recovery";
import { relativeDay, type ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import type { HabitStatus } from "@/lib/habits";
import { isOptionalHabit } from "@/lib/recovery/habits-edit";
import { formatHabitValue, valueHabitSpec } from "@/lib/today/value-habit";
import { CustomiseSheet } from "./CustomiseSheet";

/**
 * The rites for a chosen day on the Recovery ledger (docs/DESIGN-V2.md §3.7, `#habits`): every rite
 * as a ruled row with its seal, ticked or valued for any past day (Undo in the toast), and the rite
 * editor ("Edit rites", the CustomiseSheet). Auto rites complete from their logs and link there.
 */
export function HabitsCard({ date, today, onCheckin, className }: { date: ISODate; today: ISODate; onCheckin: () => void; className?: string }) {
  const { days, loading } = useMissionDays(date, date);
  const defs = useHabitDefs();
  const logs = useHabitLogs(date, date);
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const { profile } = useProfile();
  const busy = useRef(false);
  const [customise, setCustomise] = useState(false);
  const [valueFor, setValueFor] = useState<HabitStatus | null>(null);
  const day = days[0];
  const when = relativeDay(date, today);
  const logOf = (key: string): HabitLog | null => (logs.data ?? []).find((l) => l.habit_key === key && l.local_date === date) ?? null;

  const toggle = (s: HabitStatus) => {
    if (busy.current) return;
    busy.current = true;
    haptic(s.done ? 6 : 12);
    const next = !s.done;
    const hadRow = !!logOf(s.key);
    set.mutate(
      { habit_key: s.key, local_date: date, done: next },
      {
        onSuccess: () =>
          toast(`${cleanLabel(s.label)} · ${next ? "done" : "cleared"}`, {
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
  const done = statuses.filter((s) => s.done).length;

  return (
    <section id="habits" aria-labelledby="habits-title" className={cn("scroll-mt-20", className)}>
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">Rites · {when}</p>
          <h2 id="habits-title" className="t-title-2 mt-1 text-ivory">
            {statuses.length ? (
              <>
                {done} of {statuses.length} kept
              </>
            ) : (
              "Rites"
            )}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setCustomise(true)}
          className="t-meta -mr-2 inline-flex min-h-11 shrink-0 items-center px-2 font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory"
        >
          Edit rites
        </button>
      </div>

      {loading || !day ? (
        defs.error ? (
          <ErrorNote onRetry={() => void defs.refetch()}>Couldn&apos;t load your rites.</ErrorNote>
        ) : (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )
      ) : statuses.length === 0 ? (
        <div className="border-y border-vein py-5">
          <p className="t-title-3 text-ivory">No rites switched on</p>
          <p className="t-callout mt-1 text-stone">Choose the daily rites you want to keep. Auto rites complete from your logs.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setCustomise(true)}>
            Choose rites
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-vein border-y border-vein">
          {statuses.map((s) => (
            <li key={s.key}>
              <RiteRow s={s} optional={!s.auto && isOptionalHabit(s.key, s.label)} onToggle={() => toggle(s)} onValue={() => setValueFor(s)} onCheckin={onCheckin} />
            </li>
          ))}
        </ul>
      )}
      <p className="t-meta mt-2 text-ash">Auto rites complete from your logs. Tap one to go and log it.</p>

      <CustomiseSheet open={customise} onOpenChange={setCustomise} />
      <Sheet
        open={!!valueFor}
        onOpenChange={(o) => !o && setValueFor(null)}
        title={spec?.label ?? "Rite"}
        description={spec ? `Goal ${formatHabitValue(spec.target, spec.integer)}${spec.unit ? ` ${spec.unit}` : ""} · ${when}` : undefined}
      >
        {valueFor && spec && <ValueForm key={`${valueFor.key}-${date}`} habitKey={valueFor.key} spec={spec} log={logOf(valueFor.key)} today={date} onDone={() => setValueFor(null)} />}
      </Sheet>
    </section>
  );
}

function RiteRow({ s, optional, onToggle, onValue, onCheckin }: { s: HabitStatus; optional: boolean; onToggle: () => void; onValue: () => void; onCheckin: () => void }) {
  const label = cleanLabel(s.label);
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          s.done ? "bg-(image:--leaf-v) text-ink" : cn("bg-m1 shadow-[inset_0_0_0_1px_var(--ui-line)]", s.key === "water" ? "text-water" : "text-stone"),
        )}
      >
        {s.done ? <SealTick className="size-5" /> : riteGlyph(s.key)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="t-title-3 truncate text-ivory">{label}</span>
          {(s.auto || optional) && <span className="t-tag inline-flex h-5 shrink-0 items-center rounded-tag px-1.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]">{s.auto ? "Auto" : "Optional"}</span>}
        </span>
        <span className={cn("t-meta tnum mt-0.5 block truncate", s.done ? "text-leaf-300" : "text-ash")}>{s.kind === "check" && !s.done ? "Not kept" : s.caption}</span>
      </span>
    </>
  );
  const row = "press-soft flex min-h-14 w-full items-center gap-3 py-2 text-left";
  const chevron = <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />;
  if (s.auto) {
    if (s.href?.startsWith("/recovery"))
      return (
        <button type="button" className={row} onClick={onCheckin} aria-label={`${label}: ${s.caption}. Go to the check-in`}>
          {inner}
          {chevron}
        </button>
      );
    return (
      <Link href={s.href ?? "/"} className={row} aria-label={`${label}: ${s.caption}. Completes from your logs`}>
        {inner}
        {chevron}
      </Link>
    );
  }
  if (s.kind === "value")
    return (
      <button type="button" className={row} onClick={onValue} aria-label={`${label}: ${s.caption}. Edit`}>
        {inner}
        {chevron}
      </button>
    );
  return (
    <button type="button" role="checkbox" aria-checked={s.done} className={row} onClick={onToggle} aria-label={label}>
      {inner}
    </button>
  );
}
