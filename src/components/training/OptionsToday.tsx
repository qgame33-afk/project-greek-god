"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import type { StoredTemplate } from "@/lib/data/training";
import { useStartWorkout, type StartOptions } from "@/lib/data/workout";
import { readinessLine } from "@/lib/recovery/guidance";
import { useReadiness } from "@/lib/recovery/hooks";
import { getExercise } from "@/lib/training/library";
import { adjustFromAdvice, type OverlapAdvice } from "@/lib/training/overlap";
import { templateLabels } from "@/lib/training/programs";
import type { Mode } from "@/lib/training/progression";
import type { DayPlanWrite } from "@/lib/training/schedule";
import { modeTemplate } from "@/lib/training/volume";
import { effortText, stopWith } from "./format";
import { useDayPlanWrites, useOverlapAdvice, useTrainingWeek } from "./hooks";
import { Caption, CheckedList, SheetActions, SheetReason, type CheckedLine } from "./parts";

/**
 * Options for today (docs/DESIGN-V3-SIMPLE.md §4.3.4, `train-suggestion`, `train-rest-today`):
 * one sheet per day, opened from Train's hero line or Today's Up next. It holds whichever of these
 * apply, in this order, and shows the first one (the others are one tap away inside the sheet):
 *
 *   1. fatigue overlap before the start (`useOverlapAdvice().preStart ?? .nextArmDay`)
 *   2. the check-in says go lighter (readiness `legs`, `trim` or `ease` with adjustments)
 *   3. rest today (`useTrainingWeek().restToday`, PROGRAM-ARNOLD §4.4)
 *
 * Nothing is written until a gold button is tapped; ✕ writes nothing; "Start as planned" starts
 * the plan unchanged. Never blocks Start.
 *
 * For TODAY (Up next):
 *   const opts = useTodayOptions();          // opts.summary = "1 change suggested" | null
 *   <OptionsToday open={open} onOpenChange={setOpen} options={opts} />
 * Train passes its own week: `useTodayOptionsFor(week)`.
 */

type Week = ReturnType<typeof useTrainingWeek>;

export type TodayOption =
  | { kind: "overlap"; title: string; reason: string; lines: CheckedLine[]; adjust: StartOptions["adjust"] }
  | { kind: "lighter"; title: string; reason: string; lines: CheckedLine[]; note: string | null; adjust: StartOptions["adjust"] }
  | { kind: "rest"; title: string; reason: string; shift: DayPlanWrite[]; skip: DayPlanWrite[]; shiftLabel: string | null; skipLabel: string; trainLabel: string };

export interface TodayOptions {
  date: ISODate;
  /** Today's planned workout (null on a rest day). */
  template: StoredTemplate | null;
  mode: Mode;
  options: TodayOption[];
  /** "1 change suggested" / "2 changes suggested", or null when there is nothing to suggest. */
  summary: string | null;
  loading: boolean;
}

/** Today's options, from Today (it reads the training week itself). */
export function useTodayOptions(): TodayOptions {
  const week = useTrainingWeek();
  return useTodayOptionsFor(week);
}

/** Today's options from a training week the caller already has (Train). */
export function useTodayOptionsFor(week: Week): TodayOptions {
  const { today } = week;
  const plan = week.resolve(today);
  const template = plan.template;
  const overlap = useOverlapAdvice({ date: today, template });
  const readiness = useReadiness(today).guidance;

  return useMemo(() => {
    const started = week.sessions.some((s) => s.local_date === today && (s.status === "active" || s.status === "done"));
    const options: TodayOption[] = [];
    if (template && !started) {
      const eff = modeTemplate(template, week.mode);
      const sets = (slug: string) => eff.exercises.find((e) => e.slug === slug)?.sets ?? template.exercises.find((e) => e.slug === slug)?.sets ?? 0;
      const nameOf = (slug: string) => template.exercises.find((e) => e.slug === slug)?.name ?? getExercise(slug)?.name ?? slug;

      // 1. fatigue overlap before the start
      const pre = overlap.preStart;
      const advice: OverlapAdvice | null = pre ?? overlap.nextArmDay;
      if (advice && advice.actions.length) {
        options.push({
          kind: "overlap",
          title: pre ? "Arms still sore?" : "Save some for tomorrow?",
          reason: overlapReason(advice, pre ? null : nextFamilyLine(week, today)),
          lines: advice.actions.map((a): CheckedLine => {
            if (a.kind === "drop") {
              const n = sets(a.slug);
              const left = Math.max(1, n - a.sets);
              return { title: nameOf(a.slug), subtitle: `${left} ${left === 1 ? "set" : "sets"} instead of ${n}`, dataName: true };
            }
            if (a.kind === "rir") return { title: stopWith(a.rir), subtitle: `On ${nameOf(a.slug)}` };
            return { title: `${nameOf(a.move)} first`, subtitle: `Before ${nameOf(a.before)}` };
          }),
          adjust: adjustFromAdvice(advice, template.exercises),
        });
      }

      // 2. the check-in says go lighter
      const g = readiness;
      if (g && (g.level === "legs" || g.level === "trim" || g.level === "ease") && (g.adjustments.dropSets > 0 || g.adjustments.rir)) {
        const legsOnly = g.level === "legs";
        const slugs = eff.exercises.filter((e) => !legsOnly || isLegLift(e.slug)).map((e) => e.slug);
        const lines: CheckedLine[] = [];
        if (g.adjustments.dropSets > 0) lines.push({ title: g.adjustments.dropSets === 1 ? `One set fewer on ${legsOnly ? "each leg lift" : "each lift"}` : `${g.adjustments.dropSets} sets fewer on ${legsOnly ? "each leg lift" : "each lift"}`, subtitle: "Never below 1 set" });
        if (g.adjustments.rir) lines.push({ title: effortText(g.adjustments.rir), subtitle: legsOnly ? "On the leg lifts" : "On every lift" });
        const dropSets = g.adjustments.dropSets > 0 ? Object.fromEntries(slugs.map((s) => [s, g.adjustments.dropSets])) : undefined;
        const rir = g.adjustments.rir ? Object.fromEntries(slugs.map((s) => [s, g.adjustments.rir as string])) : undefined;
        options.push({
          kind: "lighter",
          title: "Go lighter today?",
          reason: readinessLine(g, template.name) ?? g.detail,
          lines,
          note: g.adjustments.loadPct ? `Take about ${Math.abs(g.adjustments.loadPct)}% off the weights as you go.` : null,
          adjust: { ...(dropSets ? { dropSets } : {}), ...(rir ? { rir } : {}) },
        });
      }

      // 3. rest today
      if (week.restToday) {
        const { shift, skip } = week.restToday;
        const label = (key: string) => (key === "rest" ? "Rest" : templateLabels(week.byKey[key] ?? { key, name: key }).abbr);
        const shifted = shift.filter((w) => w.plan_date > today).sort((a, b) => a.plan_date.localeCompare(b.plan_date));
        const tomorrow = week.resolve(addDays(today, 1));
        options.push({
          kind: "rest",
          title: "Rest today?",
          reason: restReason(week, today),
          shift,
          skip,
          shiftLabel: shift.length ? shifted.map((w) => `${dayName(w.plan_date, true)} ${label(w.template_key)}`).join(" · ") : null,
          skipLabel: tomorrow.template ? `${dayName(tomorrow.date)} stays ${templateLabels(tomorrow.template).short}` : `${dayName(tomorrow.date)} stays a rest day`,
          trainLabel: template.name,
        });
      }
    }
    const n = options.length;
    return {
      date: today,
      template,
      mode: week.mode,
      options,
      summary: n ? `${n} ${n === 1 ? "change" : "changes"} suggested` : null,
      loading: week.loading,
    };
  }, [week, today, template, overlap.preStart, overlap.nextArmDay, readiness]);
}

const LEG = new Set(["quads", "hamstrings", "glutes", "calves", "adductors"]);
/** A lift that trains the legs (by its library muscles). */
function isLegLift(slug: string) {
  return (getExercise(slug)?.primary ?? []).some((m) => LEG.has(m));
}

/** The advice's sentence without its "Today: …" clause (that clause is the checked list). */
function overlapReason(a: OverlapAdvice, tomorrow: string | null) {
  const cut = a.text.split(/\s*Today:/)[0].trim();
  return tomorrow ? `${cut} ${tomorrow}` : cut;
}

/** "Friday is Chest & Back." — the day the prevention protects. */
function nextFamilyLine(week: Week, today: ISODate) {
  const t = week.resolve(addDays(today, 1)).template;
  return t ? `${dayName(addDays(today, 1))} is ${templateLabels(t).short}.` : null;
}

/** "Your check-in: 4 h of sleep, very sore, very tired. Six days a week isn't a must." */
function restReason(week: Week, today: ISODate) {
  const c = week.recovery.find((r) => r.local_date === today);
  const parts: string[] = [];
  const sleep = c?.sleep_hours == null ? null : Number(c.sleep_hours);
  if (sleep != null && Number.isFinite(sleep)) parts.push(`${Number.isInteger(sleep) ? sleep : sleep.toFixed(1)} h of sleep`);
  const sore = c?.soreness == null ? null : Number(c.soreness);
  if (sore != null && sore >= 4) parts.push(sore >= 5 ? "very sore" : "sore");
  const tired = c?.fatigue == null ? null : Number(c.fatigue);
  if (tired != null && tired >= 4) parts.push(tired >= 5 ? "very tired" : "tired");
  const energy = c?.energy == null ? null : Number(c.energy);
  if (energy != null && energy <= 2) parts.push("low energy");
  const head = parts.length ? `Your check-in: ${parts.join(", ")}.` : "Your check-in says to take it easy.";
  return `${head} Six days a week isn't a must.`;
}

/* ------------------------------------------------------------------ sheet */

export function OptionsToday({ open, onOpenChange, options }: { open: boolean; onOpenChange: (open: boolean) => void; options: TodayOptions }) {
  const [index, setIndex] = useState(0);
  const list = options.options;
  const i = Math.min(index, Math.max(0, list.length - 1));
  const opt = list[i] ?? null;
  const change = (o: boolean) => {
    if (!o) setIndex(0);
    onOpenChange(o);
  };
  return (
    <Sheet open={open} onOpenChange={change} title={opt?.title ?? "Options for today"}>
      {opt && options.template ? (
        <OptionBody key={`${opt.kind}-${i}`} option={opt} options={options} template={options.template} close={() => change(false)} />
      ) : (
        <p className="t-body pb-4 text-fg-2">Nothing to change today. Start as planned.</p>
      )}
      {list.length > 1 && (
        <button type="button" onClick={() => setIndex((i + 1) % list.length)} className="press t-label hit-44 mx-auto mt-4 block font-semibold text-fg-2">
          {i + 1 < list.length ? `Another option · ${list[i + 1].title}` : `Back to · ${list[0].title}`}
        </button>
      )}
    </Sheet>
  );
}

function OptionBody({ option, options, template, close }: { option: TodayOption; options: TodayOptions; template: StoredTemplate; close: () => void }) {
  const { start, starting } = useStartWorkout();
  const base: StartOptions = { template, date: options.date, mode: options.mode };

  if (option.kind === "rest") return <RestBody option={option} base={base} close={close} />;

  return (
    <div className="flex flex-col gap-5 pb-2">
      <SheetReason>{option.reason}</SheetReason>
      <div>
        <p className="t-cap mb-2 px-1">Today only</p>
        <CheckedList lines={option.lines} label="Today only" />
        {option.kind === "lighter" && option.note && <Caption>{option.note}</Caption>}
      </div>
      <SheetActions>
        <Button variant="primary" size="lg" block loading={starting} onClick={() => start({ ...base, adjust: option.adjust })}>
          Start with this
        </Button>
        <Button variant="secondary" size="lg" block disabled={starting} onClick={() => start(base)}>
          Start as planned
        </Button>
      </SheetActions>
    </div>
  );
}

type Choice = "shift" | "skip" | "train";

function RestBody({ option, base, close }: { option: Extract<TodayOption, { kind: "rest" }>; base: StartOptions; close: () => void }) {
  const [choice, setChoice] = useState<Choice>(option.shiftLabel ? "shift" : "skip");
  const { apply, pending } = useDayPlanWrites();
  const { start, starting } = useStartWorkout();
  const go = async () => {
    if (choice === "train") return void start(base);
    const writes = choice === "shift" ? option.shift : option.skip;
    if (await apply({ writes, message: "Today is a rest day" })) close();
  };
  return (
    <div className="flex flex-col gap-5 pb-2">
      <SheetReason>{option.reason}</SheetReason>
      <RadioGroup ariaLabel="Rest today">
        {option.shiftLabel && <RadioRow title="Rest today, shift the week" subtitle={option.shiftLabel} checked={choice === "shift"} onSelect={() => setChoice("shift")} />}
        <RadioRow title="Rest today, skip this workout" subtitle={option.skipLabel} checked={choice === "skip"} onSelect={() => setChoice("skip")} />
        <RadioRow title="Train anyway" subtitle={option.trainLabel} checked={choice === "train"} onSelect={() => setChoice("train")} />
      </RadioGroup>
      <div>
        <Button variant="primary" size="lg" block loading={pending || starting} onClick={go}>
          {choice === "train" ? "Start workout" : "Rest today"}
        </Button>
        <p className="t-cap mt-3 text-center">You can undo this.</p>
      </div>
    </div>
  );
}
