"use client";

import Link from "next/link";
import { ChevronRight, Footprints, Flame, PersonStanding, Play, Sparkle, Utensils, Weight } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Laurel } from "@/components/art/Laurel";
import { Moon, SealTick, TrainColumn } from "@/components/art/icons";
import { useClearHabitLog } from "./useClearHabitLog";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Collapse, ErrorNote } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { isOffline } from "@/lib/data/core";
import { useHabitDefs, useHabitLogs, useSetHabitLog, type HabitLog } from "@/lib/data/recovery";
import { useWaterMutations } from "@/lib/data/nutrition";
import type { ISODate } from "@/lib/dates";
import type { HabitStatus } from "@/lib/habits";
import type { DayItem, DayState } from "@/lib/now/day-engine";
import { formatClock as clock } from "@/lib/prefs";
import { dayMonth } from "@/lib/progress/pace";
import { earlierSummary, sleepShort, sleepSpoken, chronicleDue } from "@/lib/today/now";
import { formatHabitValue, parseHabitValue, valueHabitSpec, type ValueHabitSpec } from "@/lib/today/value-habit";
import { formatInt, formatLoad } from "@/lib/units";
import { MealRow } from "./bodies";
import { keys as localKeys, useLocal, writeLocal } from "./local";
import type { NowModel } from "./useNowData";

/* ---------------------------------------------------------------- shared */

export function SectionHead({ title, right, id }: { title: string; right?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
      <h2 id={id} className="t-title-2 text-ivory">
        {title}
      </h2>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------ today's three */

export function TodaysThree({ m, onRetry }: { m: NowModel; onRetry?: () => void }) {
  const protein = Math.round(m.food.protein);
  const pGoal = m.profile.protein_goal;
  const sleep = m.todayRec?.sleep_hours == null ? null : Number(m.todayRec.sleep_hours);
  const sleepGoal = Number(m.profile.sleep_goal_h);
  // nothing logged yet today is "—" with the next step, not "0 g" (§3.1.7, law 1)
  const noFood = !m.foodFailed && m.foodLogged === 0;
  const failed = [m.sessionsFailed && "this week's sessions", m.foodFailed && "today's food", m.recoveryFailed && "the check-in"].filter((x): x is string => !!x);
  const cells: { key: string; href: string; eyebrow: string; value: ReactNode; caption: string; frac: number; earned: boolean; spoken: string }[] = [
    {
      key: "train",
      href: "/training",
      eyebrow: "Train",
      value:
        m.sealed.planned && !m.sessionsFailed ? (
          <>
            {m.sealed.done}
            <span className="t-meta text-ash">/{m.sealed.planned}</span>
          </>
        ) : (
          "—"
        ),
      caption: m.sessionsFailed ? "Couldn't load" : m.sealed.planned ? "sessions this week" : "None planned",
      frac: m.sealed.planned && !m.sessionsFailed ? m.sealed.done / m.sealed.planned : 0,
      earned: !m.sessionsFailed && m.sealed.planned > 0 && m.sealed.done >= m.sealed.planned,
      spoken: m.sessionsFailed
        ? "Training: this week's sessions didn't load"
        : m.sealed.planned
          ? `Training: ${m.sealed.done} of ${m.sealed.planned} sessions this week`
          : "Training: no sessions planned this week",
    },
    {
      key: "protein",
      href: "/nutrition",
      eyebrow: "Protein",
      value:
        m.foodFailed || noFood ? (
          <>
            —{noFood && <span className="t-meta text-ash">/{pGoal}</span>}
          </>
        ) : (
          <>
            {protein}
            <span className="t-meta text-ash">/{pGoal}</span>
          </>
        ),
      caption: m.foodFailed ? "Couldn't load food" : noFood ? "g · log a meal" : `g · ${formatInt(Math.round(m.food.calories))} kcal`,
      frac: m.foodFailed || noFood ? 0 : protein / pGoal,
      earned: !m.foodFailed && protein >= pGoal,
      spoken: m.foodFailed
        ? "Protein: couldn't load today's food"
        : noFood
          ? `Protein: nothing logged yet today, goal ${pGoal} grams. Log a meal`
          : `Protein: ${protein} of ${pGoal} grams, ${Math.round(m.food.calories)} of ${m.profile.calorie_goal} calories`,
    },
    {
      key: "sleep",
      href: sleep == null && !m.recoveryFailed ? "/?dawn=1" : "/recovery",
      eyebrow: "Sleep",
      value: sleepShort(sleep),
      caption: m.recoveryFailed ? "Couldn't load" : sleep == null ? "Check in" : "last night",
      frac: sleep == null ? 0 : sleep / sleepGoal,
      earned: sleep != null && sleep >= sleepGoal,
      spoken: m.recoveryFailed
        ? "Sleep: the check-in didn't load"
        : sleep == null
          ? "Sleep: not logged. Check in to log it"
          : `Sleep: ${sleepSpoken(sleep)} last night, goal ${sleepSpoken(sleepGoal)}`,
    },
  ];
  return (
    <div>
    <section aria-label="Today's three" className="grid grid-cols-3 border-y border-vein @max-[19rem]:grid-cols-1">
      {cells.map((c, i) => (
        <Link
          key={c.key}
          href={c.href}
          aria-label={c.spoken}
          className={cn(
            "press-soft flex min-h-[92px] min-w-0 gap-2.5 py-3.5 @max-[19rem]:border-l-0",
            i > 0 && "border-l border-vein pl-3 @max-[19rem]:border-t @max-[19rem]:pl-0",
            i < 2 && "pr-2",
          )}
        >
          <Shaft frac={c.frac} earned={c.earned} />
          <span aria-hidden className="min-w-0">
            <span className="t-eyebrow block">{c.eyebrow}</span>
            <span className={cn("t-num-m tnum mt-1.5 block truncate", c.earned ? "text-leaf-300" : "text-ivory")}>{c.value}</span>
            <span className="t-meta mt-0.5 line-clamp-2 block text-ash">{c.caption}</span>
          </span>
        </Link>
      ))}
    </section>
      {failed.length > 0 && (
        <ErrorNote className="mt-3" onRetry={onRetry}>
          Couldn&apos;t load {failed.length > 2 ? `${failed.slice(0, -1).join(", ")} and ${failed[failed.length - 1]}` : failed.join(" and ")}.
        </ErrorNote>
      )}
    </div>
  );
}

/** A column shaft beside each of Today's three, filled from the base: ivory until earned, leaf once met. */
function Shaft({ frac, earned }: { frac: number; earned: boolean }) {
  const f = Math.max(0, Math.min(1, frac));
  return (
    <span aria-hidden className="relative block w-[5px] shrink-0 self-stretch overflow-hidden rounded-full bg-m3 shadow-[inset_0_0_0_1px_var(--vein-2)]">
      <span
        className={cn("absolute inset-x-0 bottom-0 origin-bottom rounded-full transition-transform duration-(--dur-gild) ease-gold", earned ? "bg-(image:--leaf-v)" : "bg-ivory/85")}
        style={{ height: "100%", transform: `scaleY(${f})` }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ rites */

export function riteGlyph(key: string) {
  if (key === "steps") return <Footprints className="size-5" strokeWidth={1.6} />;
  if (key === "calories") return <Flame className="size-5" strokeWidth={1.6} />;
  if (key === "water")
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3.5s5.5 6.2 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.7 12 3.5 12 3.5z" />
      </svg>
    );
  if (key === "workout") return <TrainColumn className="size-5" />;
  if (key === "protein") return <Utensils className="size-5" strokeWidth={1.6} />;
  if (key === "sleep") return <Moon className="size-5" />;
  if (key === "weighin") return <Weight className="size-5" strokeWidth={1.6} />;
  if (key === "mobility") return <PersonStanding className="size-5" strokeWidth={1.6} />;
  return <Sparkle className="size-5" strokeWidth={1.6} />;
}

export const cleanLabel = (l: string) => l.replace(/\s*\(optional\)\s*/i, "").trim();

/**
 * Rites (docs/DESIGN-V2.md §3.1.1 item 5): the day's habits as seals. A check rite toggles with
 * one tap (Undo in the toast); a value rite (steps) opens its stepper; water carries +250 and +500
 * (verdigris, the water series — never the AI aegean). A seal turns leaf only when the rite is done.
 */
export function Rites({ m, rites, more }: { m: NowModel; rites: HabitStatus[]; more: number }) {
  const set = useSetHabitLog();
  const clear = useClearHabitLog();
  const logs = useHabitLogs(m.today, m.today);
  const defs = useHabitDefs();
  const water = useWaterMutations(m.today);
  const busy = useRef(false);
  const [valueFor, setValueFor] = useState<HabitStatus | null>(null);
  // offline, a tap says so here instead of showing a seal or a toast for a write that can't happen
  const [offlineNote, setOfflineNote] = useState(false);
  const logOf = (key: string): HabitLog | null => (logs.data ?? []).find((l) => l.habit_key === key && l.local_date === m.today) ?? null;
  const online = () => {
    const ok = !isOffline();
    setOfflineNote(!ok);
    return ok;
  };

  const toggle = (s: HabitStatus) => {
    if (busy.current || !online()) return;
    busy.current = true;
    const next = !s.done;
    const hadRow = !!logOf(s.key);
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
        },
      },
    );
  };

  const addWater = (ml: number) => {
    if (!online()) return;
    const id = water.addMl(ml);
    toast(`Water +${ml} ml`, { duration: 6000, action: { label: "Undo", onClick: () => water.remove.mutate(id) } });
  };

  const def = valueFor ? (defs.data ?? []).find((d) => d.key === valueFor.key) : null;
  const spec = valueFor ? valueHabitSpec(valueFor.key, def ? { label: def.label, target: def.target == null ? null : Number(def.target), unit: def.unit } : null, m.profile.steps_goal) : null;
  const done = rites.filter((r) => r.done).length;

  if (!rites.length)
    return (
      <section aria-labelledby="rites-title">
        <SectionHead id="rites-title" title="Today's rites" />
        <Link href="/recovery#habits" className="t-callout flex min-h-11 items-center gap-1 text-stone hover:text-ivory">
          Add a rite <ChevronRight className="size-4" strokeWidth={1.6} aria-hidden />
        </Link>
      </section>
    );

  const waterRite = rites.find((r) => r.key === "water") ?? null;
  const seals = rites.filter((r) => r.key !== "water");
  return (
    <section aria-labelledby="rites-title">
      <SectionHead
        id="rites-title"
        title="Today's rites"
        right={
          <span className="flex items-center gap-1">
            <span className="t-meta tnum text-stone">
              {done} of {rites.length}
            </span>
            <Link href="/recovery#habits" className="t-meta inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory">
              Edit
            </Link>
          </span>
        }
      />
      <ul className="grid gap-x-1 gap-y-3" style={{ gridTemplateColumns: `repeat(${Math.max(3, Math.min(seals.length, 4))}, minmax(0, 1fr))` }}>
        {seals.map((s) => {
          const label = cleanLabel(s.label);
          const seal = (
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full",
                s.done ? "seal-in bg-(image:--leaf-v) text-ink shadow-[inset_0_1px_0_rgb(255_255_255/.55),0_6px_14px_-8px_rgb(214_166_80/.7)]" : "bg-m1 text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]",
              )}
            >
              {s.done ? <SealTick className="size-5" /> : riteGlyph(s.key)}
            </span>
          );
          const body = (
            <>
              {seal}
              <span className="t-meta line-clamp-2 font-semibold text-ivory">{label}</span>
              {shortCaption(s) && <span className="t-meta tnum -mt-1 line-clamp-1 text-ash">{shortCaption(s)}</span>}
            </>
          );
          const cell = "flex h-full w-full flex-col items-center gap-1.5 rounded-field px-0.5 py-1 text-center";
          const spoken = `${label}: ${s.caption}${s.done ? ", done" : ""}`;
          if (s.auto)
            return (
              <li key={s.key}>
                <Link href={s.href ?? "/"} aria-label={spoken} className={cn(cell, "press-soft")}>
                  {body}
                </Link>
              </li>
            );
          if (s.kind === "value")
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOfflineNote(false);
                    setValueFor(s);
                  }}
                  aria-label={`${spoken}. Edit`}
                  className={cn(cell, "press-soft")}
                >
                  {body}
                </button>
              </li>
            );
          return (
            <li key={s.key}>
              <button type="button" role="checkbox" aria-checked={s.done} aria-label={label} onClick={() => toggle(s)} className={cn(cell, "press-soft")}>
                {body}
              </button>
            </li>
          );
        })}
      </ul>
      {waterRite && (
        <div className={cn("flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-y border-vein py-1.5", seals.length > 0 && "mt-3")}>
          <span
            role="img"
            aria-label={`Water: ${waterRite.caption}${waterRite.done ? ", done" : ""}`}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full",
              waterRite.done ? "seal-in bg-(image:--leaf-v) text-ink" : "bg-m1 text-water shadow-[inset_0_0_0_1px_var(--ui-line)]",
            )}
          >
            {waterRite.done ? <SealTick className="size-5" /> : riteGlyph("water")}
          </span>
          <span aria-hidden className="min-w-0 flex-1">
            <span className="t-callout block text-ivory">{cleanLabel(waterRite.label)}</span>
            <span className="t-meta tnum block text-ash">{waterRite.caption}</span>
          </span>
          {/* at accessibility sizes the two chips take their own row */}
          <span className="flex shrink-0 gap-3 @max-[19rem]:basis-full @max-[19rem]:pl-14">
          {[250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => addWater(ml)}
              aria-label={`Add ${ml} millilitres of water`}
              className="press tnum h-11 min-w-14 rounded-full px-3 text-[length:max(14px,0.875rem)] font-semibold text-water shadow-[inset_0_0_0_1px_rgb(127_189_182/.5)] hover:bg-white/[.03]"
            >
              +{ml}
            </button>
          ))}
          </span>
        </div>
      )}
      {offlineNote && (
        <p role="status" className="t-meta mt-2 text-stone">
          Offline · try again when you&apos;re back
        </p>
      )}
      {more > 0 && (
        <Link href="/recovery#habits" className="t-meta mt-1 inline-flex min-h-11 items-center gap-1 text-stone hover:text-ivory">
          {more} more on the Recovery ledger <ChevronRight className="size-3.5" strokeWidth={1.6} aria-hidden />
        </Link>
      )}
      <Sheet open={!!valueFor} onOpenChange={(o) => !o && setValueFor(null)} title={spec?.label ?? "Log"} description={spec ? `Goal ${formatHabitValue(spec.target, spec.integer)}${spec.unit ? ` ${spec.unit}` : ""} today` : undefined}>
        {valueFor && spec && <ValueForm key={valueFor.key} habitKey={valueFor.key} spec={spec} log={logOf(valueFor.key)} today={m.today} onDone={() => setValueFor(null)} />}
      </Sheet>
    </section>
  );
}

/** The short line under a seal: "0.8 of 3 L" → "0.8 / 3 L", "Tap when done" → "tap". */
function shortCaption(s: HabitStatus): string {
  if (s.done) return "done";
  if (s.kind === "check") return "";
  return s.caption.replace(" of ", " / ").replace(/ kcal$/, "").replace(/^Goal /, "goal ");
}

/** Stepper form for a value rite: starts from that day's value (never the goal); Undo restores exactly. Also used by the Recovery ledger. */
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
          toast(`${spec.label} · ${fmt(v)}`, { duration: 6000, action: { label: "Undo", onClick: restore } });
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
            className="t-dial tnum w-full bg-transparent text-center text-ivory outline-none placeholder:text-ash"
            aria-invalid={invalid}
          />
          {spec.unit && <span className="t-eyebrow mt-1 block">{spec.unit}</span>}
        </label>
      </Stepper>
      {invalid && <p className="t-meta mt-2 text-center text-cinnabar">Enter {spec.integer ? "a whole number" : "a number"} from 0 to {formatHabitValue(spec.max, true)}.</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {spec.chips.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setText(String(n))}
            className={cn(
              "press tnum h-11 rounded-full px-4 text-[length:max(14px,0.875rem)] font-semibold",
              parsed === n ? "bg-m4 text-ivory shadow-[inset_0_0_0_1.5px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]",
            )}
          >
            {formatHabitValue(n, spec.integer)}
            {n === spec.target && <span className="t-tag ml-1.5 text-ash">Goal</span>}
          </button>
        ))}
      </div>
      {failed && (
        <ErrorNote className="mt-4" onRetry={save}>
          {failed === "offline" ? "Offline · try again when you're back. Your entry is kept." : "Couldn't save. Your entry is kept."}
        </ErrorNote>
      )}
      <Button variant="primary" size="lg" block className="mt-5" onClick={save} loading={set.isPending} disabled={parsed == null}>
        Save
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ later today */

export function LaterToday({
  m,
  state,
  now,
  exclude,
  onBegin,
  starting,
  planNoteInCard,
}: {
  m: NowModel;
  state: DayState;
  now: number;
  exclude: Set<string>;
  onBegin: () => void;
  starting: boolean;
  /** The Now card already says "No meals planned · Plan this week". */
  planNoteInCard?: boolean;
}) {
  const chronicle = chronicleDue(m.today, m.profile.start_date);
  const opened = useLocal(chronicle ? `pgg.chronicle.opened.${chronicle.param}` : "pgg.chronicle.none");
  const items = state.later.filter((x) => !exclude.has(`${x.kind}:${x.id}`));
  const showChronicle = !!chronicle && !opened;
  const noPlan = !m.hasPlan && !m.mealsLoading && !m.mealsFailed && !planNoteInCard;
  if (!items.length && !showChronicle && !noPlan) return null;
  return (
    <section aria-labelledby="later-title">
      <SectionHead id="later-title" title="Later today" />
      <ul className="divide-y divide-vein border-y border-vein">
        {showChronicle && (
          <li>
            <Link
              href={`/reviews/${chronicle.param}`}
              onClick={() => writeLocal(`pgg.chronicle.opened.${chronicle.param}`, new Date().toISOString())}
              className="press-soft flex min-h-14 items-center gap-3 py-2.5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full text-leaf-300 shadow-[inset_0_0_0_1px_var(--leaf-line)]">
                <Laurel size={28} leaves={7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-eyebrow block">The Chronicle · Book {chronicle.book}</span>
                <span className="t-title-3 mt-0.5 block text-ivory">{chronicle.monthName} is ready</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
            </Link>
          </li>
        )}
        {items.map((it) => (
          <li key={`${it.kind}:${it.id}`}>
            <LaterItem m={m} item={it} now={now} onBegin={onBegin} starting={starting} />
          </li>
        ))}
        {noPlan && (
          <li>
            <Link href="/nutrition/meals?generate=1" className="press-soft flex min-h-14 items-center gap-3 py-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-ui-line text-stone">
                <Utensils className="size-[18px]" strokeWidth={1.6} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title-3 block text-ivory">No meals planned</span>
                <span className="t-meta block text-stone">Plan this week and they appear here, at your times</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

function LaterItem({ m, item, now, onBegin, starting }: { m: NowModel; item: DayItem; now: number; onBegin: () => void; starting: boolean }) {
  if (item.kind === "meal") {
    const meal = m.meals.find((x) => x.id === item.id);
    return meal ? <MealRow meal={meal} now={now} blocked={m.foodFailed} className="py-1" /> : null;
  }
  if (item.kind === "session") {
    const late = item.at != null ? item.at < now : now >= 18 * 60;
    return (
      <div className="flex min-h-14 items-center gap-3 py-1 @max-[19rem]:flex-wrap">
        <span className="grid size-10 shrink-0 place-items-center rounded-full text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
          <TrainColumn className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* at accessibility sizes the name wraps and Begin takes its own row, so "Push A" never reads "Pu…" */}
          <p className="t-title-3 truncate text-ivory @max-[19rem]:whitespace-normal">
            {item.at != null && <span className="tnum text-stone">{clock(item.at).toLowerCase()} · </span>}
            {item.label}
          </p>
          <p className="t-meta tnum mt-0.5 text-ash">
            {late ? "Not started" : "Planned"}
            {m.durationMin ? ` · ~${m.durationMin} min` : ""}
          </p>
        </div>
        {!m.active && (
          <Button variant="outline" size="sm" className="rounded-full @max-[19rem]:ml-13" loading={starting} onClick={onBegin} aria-label={`Begin ${item.label}`}>
            <Play className="size-3.5 fill-current" aria-hidden />
            Begin
          </Button>
        )}
      </div>
    );
  }
  return null;
}

/* ---------------------------------------------------------------- earlier */

export function Earlier({ m, state, now, skippedChip, onOpenDawn }: { m: NowModel; state: DayState; now: number; skippedChip: string | null; onOpenDawn: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const items = state.earlier;
  const summary = earlierSummary(items);
  if (!items.length && !skippedChip) return null;
  return (
    <section aria-label="Earlier today">
      <div className="flex items-center gap-2 border-y border-vein @max-[19rem]:flex-wrap @max-[19rem]:pb-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          disabled={!items.length}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 text-left @max-[19rem]:basis-full"
        >
          <span className="t-eyebrow shrink-0">Earlier</span>
          <span className="t-callout min-w-0 flex-1 truncate text-stone">{summary || "Nothing logged yet"}</span>
          {items.length > 0 && <ChevronRight className={cn("size-4 shrink-0 text-ash transition-transform duration-(--dur-fast)", open && "rotate-90")} strokeWidth={1.6} aria-hidden />}
        </button>
        {skippedChip && (
          <button
            type="button"
            onClick={onOpenDawn}
            className="press t-meta inline-flex h-11 shrink-0 items-center rounded-full px-3 font-semibold text-stone shadow-[inset_0_0_0_1px_var(--ui-line)] hover:text-ivory"
          >
            {skippedChip}
          </button>
        )}
      </div>
      <Collapse open={open} id={id}>
        <ul className="divide-y divide-vein border-b border-vein">
          {items.map((it) => {
            if (it.kind === "meal") {
              const meal = m.meals.find((x) => x.id === it.id);
              return meal ? (
                <li key={`meal:${it.id}`}>
                  <MealRow meal={meal} now={now} blocked={m.foodFailed} className="py-1" />
                </li>
              ) : null;
            }
            const text =
              it.kind === "weighin"
                ? `Weigh-in · ${m.weighToday ? `${formatLoad(Number(m.weighToday.weight_lb), m.unit, false)} ${m.unit}` : "logged"}`
                : it.kind === "checkin"
                  ? `Check-in · ${sleepShort(m.todayRec?.sleep_hours == null ? null : Number(m.todayRec.sleep_hours))} sleep`
                  : it.kind === "session"
                    ? `${it.label} · sealed`
                    : it.label;
            return (
              <li key={`${it.kind}:${it.id}`} className="t-callout flex min-h-12 items-center gap-2.5 text-ivory">
                <SealTick className="size-4 text-leaf-300" />
                <span className="tnum">{text}</span>
              </li>
            );
          })}
        </ul>
      </Collapse>
    </section>
  );
}

/* ---------------------------------------------------------- latest record */

export function LatestRecord({ m }: { m: NowModel }) {
  const r = m.record;
  if (!r) return null;
  const load = formatLoad(r.weightLb, m.unit, false);
  const e1 = formatLoad(r.e1rmLb, m.unit, false);
  const gain = r.gainLb > 0 ? ` (+${formatLoad(r.gainLb, m.unit, false)})` : "";
  return (
    <Link
      href="/progress?tab=strength"
      aria-label={`Latest record, ${dayMonth(r.date, m.today, true)}: ${r.name}, ${load} for ${r.reps}, estimated max ${e1}${gain ? `, up ${formatLoad(r.gainLb, m.unit, false)}` : ""}. Open the Hall`}
      className="press-soft flex min-h-20 items-center gap-4 rounded-card bg-m1 px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--leaf-line)]"
    >
      <span aria-hidden className="shrink-0">
        <Laurel size={52} leaves={8} />
      </span>
      <span aria-hidden className="min-w-0 flex-1">
        <span className="t-eyebrow block text-leaf-300">Latest record · {dayMonth(r.date, m.today)}</span>
        <span className="t-title-3 mt-1 line-clamp-2 block text-ivory">{r.name}</span>
        <span className="t-meta tnum mt-0.5 block text-stone">
          {load} × {r.reps} · e1RM {e1}
          {gain}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ash" strokeWidth={1.6} />
    </Link>
  );
}

export { localKeys };
