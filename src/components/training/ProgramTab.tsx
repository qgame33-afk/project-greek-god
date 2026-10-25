"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ListGroup, RadioGroup, RadioRow, Row, SectionAction, SectionHead } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useSavePrefs } from "@/lib/data/profile";
import { useActiveProgram, useSetProgram } from "@/lib/data/program";
import { scheduleOf, useActiveSession } from "@/lib/data/training";
import { effectiveTrainAt, formatClock, isTime, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { PROGRAM_IDS, PROGRAMS } from "@/lib/training/programs";
import type { Mode } from "@/lib/training/progression";
import { scheduleIssues } from "@/lib/training/schedule";
import type { ProgramId } from "@/lib/training/types";
import { MODE_LABEL, offlineNoChange, useSaveSchedule, useSetTrainingMode, type useTrainingWeek } from "./hooks";
import { Caption, CheckedList, SheetActions, SheetReason } from "./parts";
import { useDragReorder } from "./useDragReorder";

type Week = ReturnType<typeof useTrainingWeek>;

/** Monday first, Sunday last; the stored keys are JS weekdays ("0" = Sunday). */
const DAYS = [
  { wd: 1, short: "Mon", long: "Monday" },
  { wd: 2, short: "Tue", long: "Tuesday" },
  { wd: 3, short: "Wed", long: "Wednesday" },
  { wd: 4, short: "Thu", long: "Thursday" },
  { wd: 5, short: "Fri", long: "Friday" },
  { wd: 6, short: "Sat", long: "Saturday" },
  { wd: 0, short: "Sun", long: "Sunday" },
];

/** "the Arnold split" / "Push/Pull/Legs": a program's name as it reads inside a sentence. */
export const programInSentence = (id: ProgramId) => (/split$/i.test(PROGRAMS[id].name) ? `the ${PROGRAMS[id].name}` : PROGRAMS[id].name);

const MODES: { value: Mode; sub: string }[] = [
  { value: "standard", sub: "The full plan" },
  { value: "intro", sub: "One set fewer on most lifts, same weights" },
  { value: "deload", sub: "About half the sets, a bit lighter" },
];

/**
 * Train › Program (docs/DESIGN-V3-SIMPLE.md §4.3.5, `train-program`): the plan (Arnold split or
 * Push/Pull/Legs, from `PROGRAMS`), his week with "Change order", how hard (Normal · Fewer sets ·
 * Light week), the usual training time and "How the plan works". Every name comes from data.
 */
export function ProgramTab({ week }: { week: Week }) {
  const { program } = useActiveProgram();
  const { mode, setMode, pending: modePending } = useSetTrainingMode();
  const [switchTo, setSwitchTo] = useState<ProgramId | null>(null);
  const [rearrange, setRearrange] = useState(false);
  const [rules, setRules] = useState(false);
  const [time, setTime] = useState(false);
  const [restDay, setRestDay] = useState<number | null>(null);
  const schedule = scheduleOf(week.profile ?? undefined);
  const def = PROGRAMS[program];
  const issues = scheduleIssues(schedule, def.keys);
  const byKey = week.byKey;
  const name = (k: string) => (k === "rest" ? "Rest" : (byKey[k]?.name ?? k));
  const prefs = parseAppPrefs(week.profile?.prefs);
  const trainAt = effectiveTrainAt(prefs, week.profile?.reminders);
  const trainDays = (id: ProgramId) => Object.values(PROGRAMS[id].schedule).filter((k) => k !== "rest").length;

  const issueLine = [
    ...issues.missing.map((k) => `${name(k)} isn't in your week.`),
    ...issues.duplicates.map((k) => `${name(k)} is in your week twice.`),
  ][0];

  return (
    <div>
      <BackHeader href="/training" parent="Train" title="Program" />

      <SectionHead>Plan</SectionHead>
      <RadioGroup ariaLabel="Plan">
        {PROGRAM_IDS.map((id) => (
          <RadioRow
            key={id}
            title={PROGRAMS[id].name}
            subtitle={`${trainDays(id)} days · ${id === program ? (id === "arnold" ? "shoulders and arms first" : "push, pull and legs") : "saved with your changes"}`}
            checked={id === program}
            onSelect={() => id !== program && setSwitchTo(id)}
          />
        ))}
      </RadioGroup>

      <SectionHead action={<SectionAction onClick={() => setRearrange(true)}>Change order</SectionAction>}>Your week</SectionHead>
      {week.loading ? (
        <Skeleton className="h-[420px] rounded-tile-lg" />
      ) : (
        <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
          {DAYS.map(({ wd, short, long }) => {
            const key = schedule[String(wd)] ?? "rest";
            const inner = (
              <>
                <span aria-hidden className="t-body w-11 shrink-0 self-start pt-0.5 text-fg-2">
                  {short}
                </span>
                <span className="t-row min-w-0 flex-1" data-budget-name="">
                  {name(key)}
                </span>
                <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
              </>
            );
            const cls = "press-soft flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left";
            return (
              <li key={wd}>
                {key === "rest" ? (
                  <button type="button" onClick={() => setRestDay(wd)} className={cls} aria-label={`${long}, rest. Train on ${long}?`}>
                    {inner}
                  </button>
                ) : (
                  <Link href={`/training/program/${key}`} className={cls} aria-label={`${long}, ${name(key)}. Edit the workout`}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {issueLine && <Caption>{issueLine}</Caption>}

      <SectionHead>How hard</SectionHead>
      <RadioGroup ariaLabel="How hard">
        {MODES.map((m) => (
          <RadioRow key={m.value} title={MODE_LABEL[m.value]} subtitle={m.sub} checked={mode === m.value} disabled={modePending} onSelect={() => void setMode(m.value)} />
        ))}
      </RadioGroup>

      <ListGroup className="mt-7">
        <Row title="Usual training time" value={trainAt ? formatClock(toMinutes(trainAt)) : "—"} onClick={() => setTime(true)} />
        <Row title="How the plan works" value={`${def.rules.length} rules`} onClick={() => setRules(true)} />
      </ListGroup>

      <SwitchSheet to={switchTo} from={program} onOpenChange={(o) => !o && setSwitchTo(null)} />
      <RearrangeSheet open={rearrange} onOpenChange={setRearrange} week={week} program={program} />
      <RulesSheet open={rules} onOpenChange={setRules} program={program} />
      <TrainingTimeSheet open={time} onOpenChange={setTime} week={week} />
      <RestDaySheet wd={restDay} onOpenChange={(o) => !o && setRestDay(null)} week={week} />
    </div>
  );
}

/* --------------------------------------------------------- switch plan */

function SwitchSheet({ to, from, onOpenChange }: { to: ProgramId | null; from: ProgramId; onOpenChange: (o: boolean) => void }) {
  const { setProgram, pending } = useSetProgram();
  const active = useActiveSession();
  const lines = [
    { title: `Your ${PROGRAMS[from].name} stays saved, with your edits` },
    { title: "Past workouts and bests don't change" },
    { title: "Days you moved stay moved" },
    { title: "Starts with your next workout" },
    ...(active.data ? [{ title: "Your workout in progress finishes as it started" }] : []),
  ];
  return (
    <Sheet open={!!to} onOpenChange={onOpenChange} title={to ? `Switch to ${programInSentence(to)}?` : ""}>
      {to && (
        <div className="flex flex-col gap-5 pb-2">
          <div>
            <CheckedList lines={lines} />
            <Caption>Switch back any time in Program.</Caption>
          </div>
          <SheetActions>
            <Button
              variant="primary"
              size="lg"
              block
              loading={pending}
              onClick={async () => {
                if (await setProgram(to)) onOpenChange(false);
              }}
            >
              Switch plan
            </Button>
            <Button variant="secondary" size="lg" block disabled={pending} onClick={() => onOpenChange(false)}>
              Keep {PROGRAMS[from].name}
            </Button>
          </SheetActions>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------- change order */

const sameWeek = (a: Record<string, string>, b: Record<string, string>) => DAYS.every(({ wd }) => (a[String(wd)] ?? "rest") === (b[String(wd)] ?? "rest"));

function RearrangeSheet({ open, onOpenChange, week, program }: { open: boolean; onOpenChange: (o: boolean) => void; week: Week; program: ProgramId }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Change the order">
      {open && <RearrangeBody week={week} program={program} close={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function RearrangeBody({ week, program, close }: { week: Week; program: ProgramId; close: () => void }) {
  const save = useSaveSchedule();
  const saved = scheduleOf(week.profile ?? undefined) as Record<string, string>;
  const [order, setOrder] = useState<string[]>(() => DAYS.map(({ wd }) => saved[String(wd)] ?? "rest"));
  const draft = Object.fromEntries(DAYS.map(({ wd }, i) => [String(wd), order[i]]));
  const usual = PROGRAMS[program].schedule as Record<string, string>;
  const dirty = !sameWeek(draft, saved);
  const name = (k: string) => (k === "rest" ? "Rest" : (week.byKey[k]?.name ?? k));
  const trainedToday = week.sessions.some((s) => s.local_date === week.today && (s.status === "active" || s.status === "done"));
  const [live, setLive] = useState("");

  const move = (from: number, to: number) => {
    if (to < 0 || to > 6 || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
    setLive(`${name(x)} is now on ${DAYS[to].long}.`);
  };

  const drag = useDragReorder(7, move);

  const commit = async () => {
    if (!dirty) return close();
    if (await save.commit(draft, saved)) close();
  };
  const reset = async () => {
    if (sameWeek(usual, saved)) {
      setOrder(DAYS.map(({ wd }) => usual[String(wd)] ?? "rest"));
      return;
    }
    if (await save.commit({ ...usual }, saved)) close();
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SheetReason>Drag a workout to another day. Done workouts stay where they were.</SheetReason>
      <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line" aria-label="Your week">
        {order.map((k, i) => (
          <li key={DAYS[i].wd} className={cn("flex min-h-16 items-center gap-2 bg-surface py-2 pl-2 pr-3", drag.dragging === i && "shadow-[0_0_0_1.5px_var(--ui-line)]")} style={drag.style(i)}>
            <span {...drag.handle(i)}>
              <GripVertical className="size-5" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-label block">{DAYS[i].short}</span>
              <span className="t-row block" data-budget-name="">
                {name(k)}
              </span>
            </span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${name(k)} up to ${i > 0 ? DAYS[i - 1].long : DAYS[i].long}`} className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg disabled:opacity-30">
              <ChevronUp className="size-5" strokeWidth={1.9} aria-hidden />
            </button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === 6} aria-label={`Move ${name(k)} down to ${i < 6 ? DAYS[i + 1].long : DAYS[i].long}`} className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg disabled:opacity-30">
              <ChevronDown className="size-5" strokeWidth={1.9} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <Caption className="mt-0">Starts today. Days before today{trainedToday ? " and today" : ""} keep the plan they had.</Caption>
      <SheetActions>
        <Button variant="primary" size="lg" block loading={save.pending} onClick={commit}>
          Save
        </Button>
        <Button variant="ghost" size="lg" block disabled={save.pending || sameWeek(draft, usual)} onClick={reset}>
          Back to the usual order
        </Button>
      </SheetActions>
    </div>
  );
}

/* --------------------------------------------------------- rest day row */

function RestDaySheet({ wd, onOpenChange, week }: { wd: number | null; onOpenChange: (o: boolean) => void; week: Week }) {
  const save = useSaveSchedule();
  const [picked, setPicked] = useState<string | null>(null);
  const day = DAYS.find((d) => d.wd === wd);
  const saved = scheduleOf(week.profile ?? undefined) as Record<string, string>;
  return (
    <Sheet open={wd != null} onOpenChange={(o) => (setPicked(null), onOpenChange(o))} title={day ? `Train on ${day.long}?` : ""}>
      {day && (
        <div className="flex flex-col gap-4 pb-2">
          <SheetReason>Pick a workout for every {day.long}. It starts this week.</SheetReason>
          <RadioGroup ariaLabel="Workout">
            {week.templates.map((t) => (
              <RadioRow key={t.key} title={t.name} checked={picked === t.key} onSelect={() => setPicked(t.key)} />
            ))}
          </RadioGroup>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!picked}
            loading={save.pending}
            onClick={async () => {
              if (picked && (await save.commit({ ...saved, [String(day.wd)]: picked }, saved))) onOpenChange(false);
            }}
          >
            Train on {day.long}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- rules */

function RulesSheet({ open, onOpenChange, program }: { open: boolean; onOpenChange: (o: boolean) => void; program: ProgramId }) {
  const rules = PROGRAMS[program].rules;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="How the plan works">
      <ol className="flex flex-col gap-4 pb-4" data-budget-group="" data-program-text="">
        {rules.map((r, i) => (
          <li key={i} className="flex gap-3.5">
            <span aria-hidden className="t-row grid size-7 shrink-0 place-items-center rounded-full bg-control tabular-nums">
              {i + 1}
            </span>
            <span className="t-body min-w-0 flex-1 pt-0.5">{r}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/* --------------------------------------------------------- training time */

/** The usual training time (prefs.day.trainAt, written with useSavePrefs; other keys kept). Today reads it. */
function TrainingTimeSheet({ open, onOpenChange, week }: { open: boolean; onOpenChange: (o: boolean) => void; week: Week }) {
  const save = useSavePrefs();
  const prefs = parseAppPrefs(week.profile?.prefs);
  const stored = prefs.day.trainAt ?? null;
  const effective = effectiveTrainAt(prefs, week.profile?.reminders);
  const [text, setText] = useState(stored ?? effective ?? "");
  const write = (next: string | null) => {
    const prev = stored;
    if (next === prev) return onOpenChange(false);
    if (offlineNoChange("Your training time")) return;
    save.mutate(
      { day: { trainAt: next } },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(next ? `Usual training time ${formatClock(toMinutes(next))}` : "Usual training time cleared", {
            duration: 6000,
            action: { label: "Undo", onClick: () => save.mutate({ day: { trainAt: prev } }) },
          });
        },
      },
    );
  };
  return (
    <Sheet open={open} onOpenChange={(o) => (o && setText(stored ?? effective ?? ""), onOpenChange(o))} title="Usual training time">
      <div className="flex flex-col gap-4 pb-2">
        <SheetReason>Today uses this to know when to get you ready for the workout.</SheetReason>
        <Input type="time" value={text} step={300} onChange={(e) => setText(e.target.value)} aria-label="Usual training time" className="tabular-nums" />
        <SheetActions>
          <Button variant="primary" size="lg" block loading={save.isPending} disabled={!isTime(text)} onClick={() => write(text)}>
            Save
          </Button>
          {stored && (
            <Button variant="ghost" size="lg" block disabled={save.isPending} onClick={() => write(null)}>
              Clear
            </Button>
          )}
        </SheetActions>
      </div>
    </Sheet>
  );
}
