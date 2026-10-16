"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { AutoBadge, OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardAction, CardHeader } from "@/components/ui/card";
import { Stepper } from "@/components/ui/controls";
import { NumberInput } from "@/components/ui/field";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useMissionDays } from "@/lib/data/daily";
import { useProfile } from "@/lib/data/profile";
import {
  useHabitDefs,
  useHabitLogs,
  useSetHabitLog,
  type HabitDef,
} from "@/lib/data/recovery";
import { relativeDay, type ISODate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import type { HabitStatus } from "@/lib/habits";
import { formatTarget } from "@/lib/recovery/habits-edit";
import { formatInt, parseNumber } from "@/lib/units";
import { cn } from "@/lib/cn";
import { CustomiseSheet } from "./CustomiseSheet";
import { StatusMark } from "./parts";

export function HabitsCard({
  date,
  today,
  onCheckin,
  className,
  style,
}: {
  date: ISODate;
  today: ISODate;
  onCheckin: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const { days, loading } = useMissionDays(date, date);
  const defs = useHabitDefs();
  const logs = useHabitLogs(date, date);
  const setLog = useSetHabitLog();
  const [customise, setCustomise] = useState(false);
  const [valueFor, setValueFor] = useState<HabitDef | null>(null);
  const day = days[0];
  const when = relativeDay(date, today);

  const toggle = (s: HabitStatus) => {
    haptic(s.done ? 6 : 12);
    setLog.mutate({ habit_key: s.key, local_date: date, done: !s.done });
  };

  const optional = (key: string) =>
    key === "mobility" ||
    /\(optional\)/i.test(defs.data?.find((d) => d.key === key)?.label ?? "");

  return (
    <section
      className={cn("card p-4 sm:p-5", className)}
      style={style}
      aria-labelledby={`habits-${date}`}
    >
      <CardHeader
        title={
          <span id={`habits-${date}`}>
            Habits · {when}
            {day && day.total > 0 && (
              <span className="num ml-2 text-[13px] tracking-normal text-fg-2">
                {day.done} / {day.total}
              </span>
            )}
          </span>
        }
        action={
          <CardAction onClick={() => setCustomise(true)}>Customise</CardAction>
        }
      />
      {loading || !day ? (
        defs.error ? (
          <ErrorNote onRetry={() => defs.refetch()}>
            Couldn&apos;t load your habits.
          </ErrorNote>
        ) : (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )
      ) : day.statuses.length === 0 ? (
        <Empty
          title="No habits switched on"
          action={
            <Button onClick={() => setCustomise(true)}>Choose habits</Button>
          }
        >
          Turn on the daily habits you want to track. Tracker habits complete on
          their own.
        </Empty>
      ) : (
        <ul className="-mx-1">
          {day.statuses.map((s) => {
            const def = defs.data?.find((d) => d.key === s.key);
            const inner = (
              <>
                <StatusMark
                  done={s.done}
                  progress={s.progress}
                  label={s.label}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-fg">
                      {optional(s.key)
                        ? s.label.replace(/\s*\(optional\)\s*/i, "")
                        : s.label}
                    </span>
                    {s.auto && <AutoBadge />}
                    {!s.auto && optional(s.key) && (
                      <OptionalBadge className="h-4 px-1 text-[9.5px]" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[12.5px] font-medium",
                      s.done ? "text-gold-300" : "text-fg-3",
                    )}
                  >
                    {s.caption}
                  </span>
                </span>
              </>
            );
            const row =
              "press-soft flex min-h-14 w-full items-center gap-3 rounded-[12px] px-1 py-2 text-left transition-colors hover:bg-white/[.02]";
            return (
              <li
                key={s.key}
                className="border-b border-line-hair last:border-0"
              >
                {s.auto ? (
                  s.href?.startsWith("/recovery") ? (
                    <button
                      type="button"
                      className={row}
                      onClick={onCheckin}
                      aria-label={`${s.label}: ${s.caption}. Go to check-in`}
                    >
                      {inner}
                      <ChevronRight
                        className="size-4 shrink-0 text-fg-3"
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <Link
                      href={s.href ?? "/"}
                      className={row}
                      aria-label={`${s.label}: ${s.caption}. Updates automatically from your logs`}
                    >
                      {inner}
                      <ChevronRight
                        className="size-4 shrink-0 text-fg-3"
                        aria-hidden
                      />
                    </Link>
                  )
                ) : s.kind === "value" ? (
                  <button
                    type="button"
                    className={row}
                    onClick={() => def && setValueFor(def)}
                    aria-label={`${s.label}: ${s.caption}. Edit value`}
                  >
                    {inner}
                    <ChevronRight
                      className="size-4 shrink-0 text-fg-3"
                      aria-hidden
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={row}
                    onClick={() => toggle(s)}
                    aria-pressed={s.done}
                    aria-label={`${s.label}: ${s.done ? "done. Tap to undo" : "not done. Tap when done"}`}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-fg-3">
        AUTO habits complete from your logs. Tap them to go log.
      </p>

      <CustomiseSheet open={customise} onOpenChange={setCustomise} />
      <HabitValueSheet
        def={valueFor}
        date={date}
        current={
          valueFor
            ? (logs.data?.find((l) => l.habit_key === valueFor.key)?.value ??
              null)
            : null
        }
        onClose={() => setValueFor(null)}
      />
    </section>
  );
}

/* ------------------------------------------------------- value sheet */

function stepFor(target: number) {
  if (target >= 2000) return 500;
  if (target >= 100) return 10;
  if (target >= 20) return 5;
  return 1;
}

function HabitValueSheet({
  def,
  date,
  current,
  onClose,
}: {
  def: HabitDef | null;
  date: ISODate;
  current: number | string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={!!def}
      onOpenChange={(o) => !o && onClose()}
      title={def?.label ?? "Habit"}
      description={def ? relativeDay(date) : undefined}
    >
      {def && (
        <ValueForm
          key={`${def.key}-${date}`}
          def={def}
          date={date}
          current={current == null ? null : Number(current)}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function ValueForm({
  def,
  date,
  current,
  onDone,
}: {
  def: HabitDef;
  date: ISODate;
  current: number | null;
  onDone: () => void;
}) {
  const { profile } = useProfile();
  const isSteps = def.key === "steps";
  const target = isSteps
    ? Number(def.target ?? profile?.steps_goal ?? 0)
    : Number(def.target ?? 1);
  const unit = isSteps ? "steps" : (def.unit ?? "");
  const step = stepFor(target || 1);
  const [value, setValue] = useState<number | null>(current);
  const [text, setText] = useState<string | null>(null);
  const setLog = useSetHabitLog();

  const commitText = () => {
    if (text == null) return;
    const n = parseNumber(text);
    if (n != null && n >= 0 && n <= 1_000_000)
      setValue(Math.round(n * 100) / 100);
    setText(null);
  };

  const save = (v: number | null) =>
    setLog.mutate(
      {
        habit_key: def.key,
        local_date: date,
        value: v,
        done: v != null && v >= target,
      },
      {
        onSuccess: () => {
          haptic(10);
          onDone();
        },
      },
    );

  return (
    <div className="pt-2">
      <Stepper
        label={def.label}
        value={value ?? 0}
        step={step}
        min={0}
        max={1_000_000}
        onChange={(v) => setValue(v)}
        size="lg"
      >
        {text != null ? (
          <NumberInput
            autoFocus
            decimal={!isSteps}
            enterKeyHint="done"
            aria-label={`${def.label} value`}
            className="h-14 text-center text-[32px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => e.key === "Enter" && commitText()}
          />
        ) : (
          <button
            type="button"
            onClick={() => setText(value == null ? "" : String(value))}
            className="press mx-auto block rounded-[12px] px-3 hover:bg-white/[.03]"
            aria-label="Type an exact value"
          >
            <span className={cn("num-xl", value == null && "text-fg-3")}>
              {value == null
                ? "—"
                : Number.isInteger(value)
                  ? formatInt(value)
                  : value}
            </span>
          </button>
        )}
      </Stepper>
      <p className="mt-3 text-center text-[13px] text-fg-2">
        Goal {formatTarget(target, unit || null)}
        {value != null && value >= target && (
          <span className="text-gold-300"> · met</span>
        )}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setValue(target)}
          className="press h-9 rounded-full border border-line bg-s3 px-3.5 text-[13px] font-semibold text-fg-2 hover:text-fg"
        >
          Set to goal
        </button>
        {value != null && (
          <button
            type="button"
            onClick={() => setValue(null)}
            className="press h-9 rounded-full border border-line bg-s3 px-3.5 text-[13px] font-semibold text-fg-2 hover:text-fg"
          >
            Clear
          </button>
        )}
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-6"
        disabled={value === current || setLog.isPending}
        loading={setLog.isPending}
        onClick={() => save(value)}
      >
        Save
      </Button>
    </div>
  );
}
