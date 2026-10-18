"use client";

import { useState, type ReactNode } from "react";
import { Tag } from "@/components/ui/tag";
import { Chip, Segmented, Switch } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/field";
import { addDays, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { DEFAULT_DAY_SCHEDULE, formatClock, isTime, toMinutes } from "@/lib/prefs";
import { OWNER_DEFAULTS, shiftRange, type OnboardingAnswers, type StepErrors } from "@/lib/onboarding/plan";
import { fromDisplayWeight, parseNumber, round, toDisplayWeight } from "@/lib/units";
import { HeightInput, LengthUnitToggle, MiniStepper, ScheduleEditor, StepperInput, WeightUnitToggle } from "@/components/settings/inputs";
import { useTimezones } from "@/components/settings/TrainingSheets";
import { FuelArithmetic } from "./OathArt";

export interface StepProps {
  a: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
  errors: StepErrors;
  today: ISODate;
  touched: Set<string>;
  touch: (k: string) => void;
  /** Forget edits so the suggested tags come back (Reset to suggested). */
  untouch?: (keys: string[]) => void;
}

/* ------------------------------------------------------------- pieces */

function Err({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="t-meta mt-2 text-cinnabar" role="alert">
      {children}
    </p>
  );
}

function Block({ label, right, children, className, hint }: { label: ReactNode; right?: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-2.5 flex min-h-11 items-center justify-between gap-3">
        <p className="t-eyebrow">{label}</p>
        {right}
      </div>
      {children}
      {hint && <p className="t-meta mt-2 text-ash">{hint}</p>}
    </div>
  );
}

const disp = (lb: number, u: "lb" | "kg") => round(toDisplayWeight(lb, u), 1);
const toLb = (v: number, u: "lb" | "kg") => round(fromDisplayWeight(v, u), 1);

/* ------------------------------------------------- 1 · who is climbing? */

export function ClimberStep({ a, set, errors }: StepProps) {
  const u = a.weightUnit;
  const { detected, all } = useTimezones();
  const zones = all.includes(a.timezone) ? all : [a.timezone, ...all];
  const [weighIn, setWeighIn] = useState(a.todayWeighInLb != null ? disp(a.todayWeighInLb, u).toFixed(1) : "");
  // keep the optional weigh-in text in the chosen unit
  const [shownUnit, setShownUnit] = useState(u);
  if (shownUnit !== u) {
    setShownUnit(u);
    setWeighIn(a.todayWeighInLb != null && a.todayWeighInLb > 0 ? disp(a.todayWeighInLb, u).toFixed(1) : weighIn);
  }
  return (
    <div className="grid grid-cols-1 gap-7">
      <Field label="Your name" hint="Optional" error={errors.displayName}>
        {(id) => (
          <Input
            id={id}
            value={a.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
            placeholder="First name"
          />
        )}
      </Field>

      <Block label="Starting weight" right={<WeightUnitToggle value={u} onChange={(v) => set({ weightUnit: v })} />}>
        <StepperInput
          label="Starting weight"
          value={disp(a.startWeightLb, u)}
          onChange={(v) => set({ startWeightLb: toLb(v, u) })}
          step={u === "kg" ? 0.1 : 0.2}
          min={u === "kg" ? 27 : 60}
          max={u === "kg" ? 272 : 600}
          decimals={1}
          unit={u}
          size="lg"
          invalid={!!errors.startWeightLb}
          describedBy={errors.startWeightLb ? "err-start" : undefined}
        />
        <Err id="err-start">{errors.startWeightLb}</Err>
      </Block>

      <Block
        label="Today's weigh-in"
        right={
          !weighIn ? (
            <Chip
              onClick={() => {
                setWeighIn(disp(a.startWeightLb, u).toFixed(1));
                set({ todayWeighInLb: round(a.startWeightLb, 1) });
              }}
            >
              Use {disp(a.startWeightLb, u).toFixed(1)}
            </Chip>
          ) : (
            <Chip
              onClick={() => {
                setWeighIn("");
                set({ todayWeighInLb: null });
              }}
            >
              Clear
            </Chip>
          )
        }
        hint="Optional. Saved as a real weigh-in for today only if you fill it in."
      >
        <Input
          value={weighIn}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="Leave blank to skip"
          suffix={u}
          aria-label={`Today's weigh-in in ${u}, optional`}
          aria-invalid={!!errors.todayWeighInLb || undefined}
          className="tnum"
          onChange={(e) => {
            setWeighIn(e.target.value);
            const n = parseNumber(e.target.value);
            set({ todayWeighInLb: e.target.value.trim() === "" ? null : n == null ? -1 : toLb(n, u) });
          }}
        />
        <Err>{errors.todayWeighInLb}</Err>
      </Block>

      <Block label="Height" right={<LengthUnitToggle value={a.lengthUnit} onChange={(v) => set({ lengthUnit: v })} />}>
        <HeightInput cm={a.heightCm} onChange={(cm) => set({ heightCm: cm })} unit={a.lengthUnit} invalid={!!errors.heightCm} />
        <Err>{errors.heightCm}</Err>
      </Block>

      <Field label="Time zone" hint={a.timezone === detected ? "Detected from this device" : "Decides when a new day starts"} error={errors.timezone}>
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
    </div>
  );
}

/* ----------------------------------------------- 2 · where is the summit? */

export function SummitStep({ a, set, errors, today }: StepProps) {
  const u = a.weightUnit;
  // The band as it was when this step opened. The goal shifts it from here, so typing "184"
  // keystroke by keystroke never drags 180–185 along, and coming back inside restores it.
  const [anchor] = useState(() => ({ min: a.goalRangeMinLb, max: a.goalRangeMaxLb }));
  return (
    <div className="grid grid-cols-1 gap-7">
      <Block label="Goal weight">
        <StepperInput
          label="Goal weight"
          value={disp(a.goalWeightLb, u)}
          onChange={(v) => {
            const lb = toLb(v, u);
            const r = shiftRange(lb, anchor.min, anchor.max);
            set({ goalWeightLb: lb, goalRangeMinLb: r.min, goalRangeMaxLb: r.max });
          }}
          step={u === "kg" ? 0.5 : 1}
          min={u === "kg" ? 27 : 60}
          max={u === "kg" ? 272 : 600}
          decimals={1}
          minDecimals={0}
          unit={u}
          size="lg"
          invalid={!!errors.goalWeightLb}
        />
        <Err>{errors.goalWeightLb}</Err>
      </Block>

      <Field label="Target date" error={errors.targetDate}>
        {(id) => (
          <Input id={id} type="date" value={a.targetDate} min={addDays(today, 1)} onChange={(e) => set({ targetDate: e.target.value })} aria-invalid={!!errors.targetDate || undefined} />
        )}
      </Field>
      <p className="t-meta -mt-3 text-ash">
        Expect a mix of muscle, water and some fat. The 7-day trend matters more than any one weigh-in, and the target can move with real results.
      </p>
    </div>
  );
}

/* --------------------------------------------------- 3 · how do you train? */

export function TrainingStep({ a, set, errors }: StepProps) {
  const [time, setTime] = useState(a.trainAt ?? "");
  return (
    <div className="grid grid-cols-1 gap-7">
      <Block label="Experience">
        <Segmented
          ariaLabel="Training experience"
          value={a.experience}
          onChange={(v) => set({ experience: v })}
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
      </Block>

      <Block label="Weekly schedule" hint="Push, Pull and Legs twice, Sunday off. Single-day moves happen later in Train.">
        <ScheduleEditor value={a.schedule} onChange={(s) => set({ schedule: s })} />
      </Block>

      <div className="overflow-hidden rounded-card bg-m2 shadow-(--e1)">
        <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="t-title-3 text-ivory">Usual training time</p>
            <p className="t-meta text-stone">{a.trainAt ? `Now opens your session from ${formatClock(toMinutes(a.trainAt) - 90)}` : "Optional. Change it any time in Settings."}</p>
          </div>
          <input
            type="time"
            aria-label="Usual training time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (e.target.value === "") set({ trainAt: null });
              else if (isTime(e.target.value)) set({ trainAt: e.target.value });
            }}
            className="tnum h-11 w-[8.25rem] shrink-0 rounded-field border border-ui-line bg-m3 px-3 text-center text-[length:max(16px,1rem)] font-semibold text-ivory outline-none [color-scheme:dark] focus:border-leaf-300 focus:shadow-[0_0_0_3px_var(--leaf-tint)] [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
        <div className="flex min-h-16 items-center gap-3 border-t border-vein px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="t-title-3 text-ivory">Volleyball</p>
            <p className="t-meta text-stone">Sessions per week, counted as training load</p>
          </div>
          <MiniStepper label="Volleyball sessions" value={a.volleyballPerWeek} min={0} max={14} onChange={(v) => set({ volleyballPerWeek: v })} />
        </div>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 border-t border-vein px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="t-title-3 text-ivory">Start with intro volume</p>
            <p className="t-meta text-stone">One fewer set per exercise while you settle in.</p>
          </div>
          <Switch checked={a.introVolume} onCheckedChange={(v) => set({ introVolume: v })} label="Start with intro volume" />
        </label>
      </div>
      <Err>{errors.volleyballPerWeek ?? errors.trainAt}</Err>
    </div>
  );
}

/* ----------------------------------------------------- 4 · how do you eat? */

export function FuelStep({ a, set, errors, touched, touch, untouch }: StepProps) {
  // a neutral pill, so it never reads as part of the label beside it; it goes once he edits the value
  const suggested = (k: string) =>
    touched.has(k) ? null : <span className="t-tag inline-flex h-5 items-center rounded-tag px-1.5 normal-case tracking-normal text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]">suggested</span>;
  const D = OWNER_DEFAULTS;
  const changed = a.calorieGoal !== D.calorieGoal || a.proteinGoal !== D.proteinGoal || a.fatGoal !== D.fatGoal || a.waterGoalMl !== D.waterGoalMl || a.sleepGoalH !== D.sleepGoalH;
  const meals = DEFAULT_DAY_SCHEDULE.meals;
  const t = (hhmm: string) => formatClock(toMinutes(hhmm));
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-card bg-m2 p-4 shadow-(--e1)">
        <div className="mb-3 flex items-center justify-center gap-2">
          <p className="t-eyebrow">Calories</p>
          {suggested("calorieGoal")}
        </div>
        <StepperInput label="Daily calories" value={a.calorieGoal} onChange={(v) => set({ calorieGoal: Math.round(v) })} onEdit={() => touch("calorieGoal")} step={50} min={1000} max={8000} unit="kcal a day" size="lg" thousands invalid={!!errors.calorieGoal} />
        <Err>{errors.calorieGoal}</Err>
      </div>
      <div className="grid grid-cols-2 gap-3 @max-[19rem]:grid-cols-1">
        <MacroCell label="Protein" tag={suggested("proteinGoal")}>
          <StepperInput layout="stacked" label="Protein" value={a.proteinGoal} onChange={(v) => set({ proteinGoal: Math.round(v) })} onEdit={() => touch("proteinGoal")} step={5} min={0} max={500} unit="g" invalid={!!errors.proteinGoal} />
        </MacroCell>
        <MacroCell label="Fat" tag={suggested("fatGoal")}>
          <StepperInput layout="stacked" label="Fat" value={a.fatGoal} onChange={(v) => set({ fatGoal: Math.round(v) })} onEdit={() => touch("fatGoal")} step={5} min={0} max={400} unit="g" invalid={!!errors.fatGoal} />
        </MacroCell>
      </div>
      <FuelArithmetic a={a} />
      <Err>{errors.macros}</Err>
      <div className="grid grid-cols-2 gap-3 @max-[19rem]:grid-cols-1">
        <MacroCell label="Water" tag={suggested("waterGoalMl")}>
          <StepperInput layout="stacked" label="Water goal" value={a.waterGoalMl / 1000} onChange={(v) => set({ waterGoalMl: Math.round(v * 1000) })} onEdit={() => touch("waterGoalMl")} step={0.25} min={0.5} max={10} decimals={2} minDecimals={1} unit="L a day" invalid={!!errors.waterGoalMl} />
        </MacroCell>
        <MacroCell label="Sleep" tag={suggested("sleepGoalH")}>
          <StepperInput layout="stacked" label="Sleep goal" value={a.sleepGoalH} onChange={(v) => set({ sleepGoalH: v })} onEdit={() => touch("sleepGoalH")} step={0.25} min={4} max={12} decimals={2} minDecimals={0} unit="h a night" invalid={!!errors.sleepGoalH} />
        </MacroCell>
      </div>
      <Err>{errors.waterGoalMl ?? errors.sleepGoalH}</Err>

      <section className="mt-2" aria-label="Meal times">
        <div className="flex items-center gap-2">
          <p className="t-eyebrow">Meal times</p>
          <Tag kind="PLAN" />
        </div>
        <p className="t-callout mt-2 text-stone">
          Breakfast {t(meals.breakfast)} · lunch {t(meals.lunch)} · dinner {t(meals.dinner)} · snacks {t(meals.snacks[0])}, {t(meals.snacks[1])} and {t(meals.snacks[2])}.
        </p>
        <p className="t-meta mt-1 text-ash">Now and Fuel place your planned meals at these times. Change them any time in Settings → Day schedule.</p>
      </section>

      <p className="t-meta text-ash">
        Starting estimates for a lean gain. After two weeks of weigh-ins the app can suggest a change, and nothing moves without your OK.
        {changed && (
          <>
            {" "}
            <button
              type="button"
              className="press inline-flex h-11 items-center font-semibold text-ivory underline decoration-ui-line underline-offset-4"
              onClick={() => {
                set({ calorieGoal: D.calorieGoal, proteinGoal: D.proteinGoal, fatGoal: D.fatGoal, waterGoalMl: D.waterGoalMl, sleepGoalH: D.sleepGoalH });
                untouch?.(["calorieGoal", "proteinGoal", "fatGoal", "waterGoalMl", "sleepGoalH"]);
              }}
            >
              Reset to suggested
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function MacroCell({ label, tag, children, className }: { label: string; tag: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card bg-m2 p-3 shadow-(--e1)", className)}>
      <div className="mb-3 flex min-h-11 flex-col items-center justify-start gap-1">
        <p className="t-eyebrow">{label}</p>
        {tag}
      </div>
      {children}
    </div>
  );
}
