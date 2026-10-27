"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MODE_LABEL } from "@/components/training/hooks";
import { BigValue } from "@/components/ui/big-value";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { Field, Input, NumberInput, Select } from "@/components/ui/field";
import { ListGroup, RadioGroup, RadioRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { StatCard, StatRow } from "@/components/ui/stat-card";
import { HeightInput, StepperInput } from "@/components/settings/inputs";
import { useTimezones } from "@/components/settings/TrainingSheets";
import { requiredWeeklyGain } from "@/lib/bodyweight";
import { addDays, type ISODate } from "@/lib/dates";
import { balancedCarbs } from "@/lib/onboarding/macros";
import { SCHEDULE_OPTIONS, WEEK_ORDER, WEEKDAY_LABEL, paceVerdict, shiftRange, trainingDays, type OnboardingAnswers, type PlanKey, type StepErrors } from "@/lib/onboarding/plan";
import { formatClock, isTime, toMinutes } from "@/lib/prefs";
import { modeRir } from "@/lib/training/progression";
import { DEFAULT_PROGRAM, PROGRAMS, PROGRAM_IDS, templateDef, templateLabels } from "@/lib/training/programs";
import { displayBodyweight, storeBodyweight } from "@/lib/training/loads";
import { formatInt, parseNumber, round, toDisplayWeight, type LengthUnit, type WeightUnit } from "@/lib/units";

export interface StepProps {
  a: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
  errors: StepErrors;
  today: ISODate;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1 Aug 2027" */
export function dayMonthYear(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const kgText = (v: number, u: WeightUnit) => (u === "kg" ? v.toFixed(1) : String(round(v, 1)));

export function Err({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="t-label mt-3 text-center text-danger" role="alert">
      {children}
    </p>
  );
}

/** A number typed instead of stepped: tap the big number. */
function TypeSheet({ open, onOpenChange, title, unit, value, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; unit: string; value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState("");
  const n = parseNumber(text);
  return (
    <Sheet open={open} onOpenChange={(o) => (o && setText(String(value)), onOpenChange(o))} title={title}>
      <form
        className="grid gap-3 pb-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (n == null) return;
          onSave(n);
          onOpenChange(false);
        }}
      >
        <NumberInput aria-label={`${title} in ${unit}`} suffix={unit} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" size="lg" block disabled={n == null}>
          Done
        </Button>
      </form>
    </Sheet>
  );
}

/** The small "kg · Toronto" pill on the weight and height screens: units and time zone in one sheet. */
export function UnitsPill({ a, set }: { a: OnboardingAnswers; set: StepProps["set"] }) {
  const [open, setOpen] = useState(false);
  const { all } = useTimezones();
  const zones = all.includes(a.timezone) ? all : [a.timezone, ...all];
  const city = a.timezone.split("/").pop()?.replace(/_/g, " ") ?? a.timezone;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press t-label hit-44 mx-auto mt-6 flex h-9 items-center rounded-pill bg-card-2 px-3.5 font-semibold text-fg">
        {a.weightUnit} · {a.lengthUnit === "in" ? "ft · in" : a.lengthUnit} · {city}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Units and time zone">
        <div className="grid gap-5 pb-2 pt-2">
          <Field label="Weight">
            {() => (
              <Segmented<WeightUnit>
                ariaLabel="Weight unit"
                value={a.weightUnit}
                onChange={(v) => set({ weightUnit: v })}
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
              />
            )}
          </Field>
          <Field label="Height">
            {() => (
              <Segmented<LengthUnit>
                ariaLabel="Length unit"
                value={a.lengthUnit}
                onChange={(v) => set({ lengthUnit: v })}
                options={[
                  { value: "cm", label: "cm" },
                  { value: "in", label: "ft · in" },
                ]}
              />
            )}
          </Field>
          <Field label="Time zone">
            {(id) => (
              <Select id={id} value={a.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="secondary" size="lg" block onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------ 1 · name */

export function NameStep({ a, set, errors }: StepProps) {
  return (
    <Field label="Your name" hint="Optional" error={errors.displayName}>
      {(id) => (
        <Input id={id} value={a.displayName} onChange={(e) => set({ displayName: e.target.value })} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={80} placeholder="First name" autoFocus />
      )}
    </Field>
  );
}

/* ---------------------------------------------------------- 2 · weight */

export function WeightStep({ a, set, errors }: StepProps) {
  const u = a.weightUnit;
  const [typing, setTyping] = useState(false);
  const v = displayBodyweight(a.startWeightLb, u);
  const save = a.todayWeighInLb != null;
  const setWeight = (n: number) => {
    const lb = storeBodyweight(n, u);
    set({ startWeightLb: lb, todayWeighInLb: save ? lb : null });
  };
  return (
    <>
      <BigValue name="Weight today" value={v} unit={u} step={0.1} min={u === "kg" ? 27 : 60} max={u === "kg" ? 272 : 600} format={(n) => kgText(n, u)} onChange={setWeight} onKeypad={() => setTyping(true)} minusLabel="−0.1" plusLabel="+0.1" caption="Tap the number to type it" />
      <Err>{errors.startWeightLb ?? errors.todayWeighInLb}</Err>
      <ListGroup className="mt-6">
        <label className="flex min-h-[68px] cursor-pointer items-center gap-4 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="t-row block">Also save as today&apos;s weigh-in</span>
            <span className="t-label mt-0.5 block">Your first point on the weight chart.</span>
          </span>
          <Switch checked={save} onCheckedChange={(on) => set({ todayWeighInLb: on ? a.startWeightLb : null })} label="Also save as today's weigh-in" />
        </label>
      </ListGroup>
      <UnitsPill a={a} set={set} />
      <TypeSheet open={typing} onOpenChange={setTyping} title="Weight today" unit={u} value={v} onSave={setWeight} />
    </>
  );
}

/* ---------------------------------------------------------- 3 · height */

export function HeightStep({ a, set, errors }: StepProps) {
  const [typing, setTyping] = useState(false);
  return (
    <>
      {a.lengthUnit === "cm" ? (
        <BigValue name="Height" value={round(a.heightCm, 1)} unit="cm" step={0.5} min={100} max={250} format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))} onChange={(n) => set({ heightCm: round(n, 1) })} onKeypad={() => setTyping(true)} minusLabel="−0.5" plusLabel="+0.5" caption="Tap the number to type it" />
      ) : (
        <HeightInput cm={a.heightCm} onChange={(cm) => set({ heightCm: cm })} unit="in" invalid={!!errors.heightCm} />
      )}
      <Err>{errors.heightCm ?? errors.timezone}</Err>
      <UnitsPill a={a} set={set} />
      <TypeSheet open={typing} onOpenChange={setTyping} title="Height" unit="cm" value={round(a.heightCm, 1)} onSave={(n) => set({ heightCm: round(n, 1) })} />
    </>
  );
}

/* ------------------------------------------------------------ 4 · goal */

/** "That's about 0.2 kg a week by 1 Aug 2027. A steady, lean pace." from the answers (arithmetic, no guess). */
function PaceCard({ a }: { a: OnboardingAnswers }) {
  const rate = requiredWeeklyGain(a.startWeightLb, a.goalWeightLb, a.startDate, a.targetDate);
  const verdict = paceVerdict(rate);
  if (rate == null || verdict == null) return null;
  const v = toDisplayWeight(Math.abs(rate), a.weightUnit);
  const amount = `${v >= 1 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, "")} ${a.weightUnit} a week`;
  const tail = { hold: "That holds your weight.", achievable: "A steady, lean pace.", fast: "A bit fast: expect some fat with it.", too_fast: "Faster than this mostly adds fat.", loss: "That's a loss, not a gain." }[verdict];
  return (
    <div className="t-body mt-6 rounded-card bg-card px-5 py-4" data-derived="">
      {verdict === "hold" ? (
        <>Same weight by {dayMonthYear(a.targetDate)}. </>
      ) : (
        <>
          That&apos;s about <b className="font-bold">{amount}</b> by {dayMonthYear(a.targetDate)}.{" "}
        </>
      )}
      {tail}
    </div>
  );
}

export function GoalStep({ a, set, errors }: StepProps) {
  const u = a.weightUnit;
  const [typing, setTyping] = useState(false);
  // the band as it was when this step opened: the goal shifts it from here, so it never drifts
  const [anchor] = useState(() => ({ min: a.goalRangeMinLb, max: a.goalRangeMaxLb }));
  const step = u === "kg" ? 0.5 : 1;
  const v = round(toDisplayWeight(a.goalWeightLb, u) / step) * step;
  const setGoal = (n: number) => {
    const lb = storeBodyweight(n, u);
    const r = shiftRange(lb, anchor.min, anchor.max);
    set({ goalWeightLb: lb, goalRangeMinLb: r.min, goalRangeMaxLb: r.max });
  };
  const upTo = round(toDisplayWeight(Math.max(a.goalRangeMaxLb, a.goalWeightLb), u), 1);
  return (
    <>
      <BigValue
        name="Goal weight"
        value={round(v, 1)}
        unit={u}
        step={step}
        min={u === "kg" ? 27 : 60}
        max={u === "kg" ? 272 : 600}
        format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
        onChange={setGoal}
        onKeypad={() => setTyping(true)}
        minusLabel={`−${step}`}
        plusLabel={`+${step}`}
        caption={`Happy anywhere up to ${Number.isInteger(upTo) ? upTo : upTo.toFixed(1)}`}
      />
      <Err>{errors.goalWeightLb ?? errors.goalRangeMinLb}</Err>
      <PaceCard a={a} />
      <TypeSheet open={typing} onOpenChange={setTyping} title="Goal weight" unit={u} value={round(v, 1)} onSave={setGoal} />
    </>
  );
}

/* ------------------------------------------------------------ 5 · date */

export function DateStep({ a, set, errors, today }: StepProps) {
  return (
    <>
      <Field label="Target date" error={errors.targetDate}>
        {(id) => <Input id={id} type="date" value={a.targetDate} min={addDays(today, 1)} onChange={(e) => e.target.value && set({ targetDate: e.target.value })} aria-invalid={!!errors.targetDate || undefined} />}
      </Field>
      {!errors.targetDate && <PaceCard a={a} />}
    </>
  );
}

/* ---------------------------------------------------- 6 · training week */

/**
 * The default program's week from PROGRAM's data (PROGRAMS[DEFAULT_PROGRAM], templateLabels short
 * names, SCHEDULE_OPTIONS), and the intro mode switch when PROGRAM keeps intro mode: its label is
 * PROGRAM's MODE_LABEL.intro and its line comes from modeRir() on the program's own lifts.
 */
export function introLine(): string {
  const xs = PROGRAMS[DEFAULT_PROGRAM].templates.flatMap((t) => t.exercises);
  const twoSets = xs.every((x) => x.sets <= 2);
  if (twoSets && xs[0]) return `Both sets, stopping ${modeRir(xs[0], "intro")} reps short at first. Turn it off any time.`;
  return "One set fewer on most lifts at first. Turn it off any time.";
}

export function weekIntro(a: OnboardingAnswers) {
  const days = trainingDays(a.schedule);
  const off = WEEK_ORDER.filter((d) => a.schedule[d] === "rest").map((d) => WEEKDAY_LABEL[d]);
  const rest = off.length === 1 ? `${off[0]} off` : off.length ? `${off.length} days off` : "no rest day";
  return `The ${PROGRAMS[DEFAULT_PROGRAM].name.toLowerCase()}: ${days} ${days === 1 ? "day" : "days"}, ${rest}. Tap a day to change it.`;
}

const dayName = (k: PlanKey) => {
  if (k === "rest") return "Rest";
  const t = templateDef(k);
  return t ? templateLabels(t).short : k;
};

export function WeekStep({ a, set }: StepProps) {
  const [day, setDay] = useState<string | null>(null);
  const other = PROGRAM_IDS.find((p) => p !== DEFAULT_PROGRAM);
  return (
    <>
      <ListGroup ariaLabel="Your training week">
        {WEEK_ORDER.map((d) => (
          <button key={d} type="button" onClick={() => setDay(d)} className="press-soft flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left" aria-label={`${WEEKDAY_LABEL[d]}, ${dayName(a.schedule[d] ?? "rest")}. Change`}>
            <span className="t-body w-12 shrink-0 text-fg-2">{WEEKDAY_LABEL[d].slice(0, 3)}</span>
            <span className="t-row min-w-0 flex-1 truncate" data-budget-name="">
              {dayName(a.schedule[d] ?? "rest")}
            </span>
            <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
          </button>
        ))}
      </ListGroup>
      <ListGroup className="mt-3">
        <label className="flex min-h-[68px] cursor-pointer items-center gap-4 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="t-row block">{MODE_LABEL.intro}</span>
            <span className="t-label mt-0.5 block">{introLine()}</span>
          </span>
          <Switch checked={a.introVolume} onCheckedChange={(v) => set({ introVolume: v })} label={MODE_LABEL.intro} />
        </label>
      </ListGroup>
      {other && <p className="t-label mt-3 px-1">{PROGRAMS[other].name} is in Train › Program if you want it later.</p>}
      <Sheet open={day != null} onOpenChange={(o) => !o && setDay(null)} title={day ? WEEKDAY_LABEL[day] : ""}>
        {day && (
          <RadioGroup ariaLabel={`${WEEKDAY_LABEL[day]} workout`} className="mb-2 mt-2">
            {SCHEDULE_OPTIONS.map((o) => (
              <RadioRow
                key={o.value}
                title={o.label}
                checked={(a.schedule[day] ?? "rest") === o.value}
                onSelect={() => {
                  set({ schedule: { ...a.schedule, [day]: o.value } });
                  setDay(null);
                }}
              />
            ))}
          </RadioGroup>
        )}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------ 7 · usual time */

export function TimeStep({ a, set, errors }: StepProps) {
  const [time, setTime] = useState(a.trainAt ?? "");
  return (
    <>
      <Field label="Usual training time" error={errors.trainAt}>
        {(id) => (
          <Input
            id={id}
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (e.target.value === "") set({ trainAt: null });
              else if (isTime(e.target.value)) set({ trainAt: e.target.value });
            }}
            className="[color-scheme:dark]"
          />
        )}
      </Field>
      <p className="t-label mt-3 px-1">{a.trainAt ? `Today offers your workout from ${formatClock(toMinutes(a.trainAt) - 90)}.` : "Optional. Change it any time in Settings."}</p>
    </>
  );
}

/* --------------------------------------------------------- 8 · targets */

export function TargetsStep({ a, set, errors }: StepProps) {
  const [edit, setEdit] = useState(false);
  const carbs = balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal);
  return (
    <>
      <StatRow cols={2}>
        <StatCard value={formatInt(a.calorieGoal)} unit="kcal" label="Calories a day" />
        <StatCard value={formatInt(a.proteinGoal)} unit="g" label="Protein a day" />
      </StatRow>
      <p className="t-label mt-3 px-1">
        Fat {formatInt(a.fatGoal)} g, carbs {formatInt(carbs)} g to fill the rest. A starting point for a lean gain: Coach can suggest a change after two weeks of weigh-ins, and nothing moves without your OK.
      </p>
      <Err>{errors.calorieGoal ?? errors.proteinGoal ?? errors.fatGoal ?? errors.macros ?? errors.waterGoalMl ?? errors.sleepGoalH}</Err>
      <Button variant="secondary" size="md" className="mt-4" onClick={() => setEdit(true)}>
        Edit
      </Button>
      <Sheet open={edit} onOpenChange={setEdit} title="Daily targets">
        <div className="grid gap-4 pb-2 pt-2">
          <Labelled label="Calories">
            <StepperInput label="Daily calories" value={a.calorieGoal} onChange={(v) => set({ calorieGoal: Math.round(v) })} step={50} min={1000} max={8000} unit="kcal" thousands />
          </Labelled>
          <Labelled label="Protein">
            <StepperInput label="Protein" value={a.proteinGoal} onChange={(v) => set({ proteinGoal: Math.round(v) })} step={5} min={0} max={500} unit="g" />
          </Labelled>
          <Labelled label="Fat">
            <StepperInput label="Fat" value={a.fatGoal} onChange={(v) => set({ fatGoal: Math.round(v) })} step={5} min={0} max={400} unit="g" />
          </Labelled>
          <p className="t-label px-1">Carbs: {formatInt(balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal))} g, balanced from the others.</p>
          <Button variant="secondary" size="lg" block onClick={() => setEdit(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-tile-lg bg-surface p-4">
      <p className="t-label mb-2 text-center font-semibold">{label}</p>
      {children}
    </div>
  );
}
