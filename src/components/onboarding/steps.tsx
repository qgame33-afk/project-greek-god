"use client";

import { useState, type ReactNode } from "react";
import { LaurelBullet } from "@/components/art/Motifs";
import { AutoBadge, OptionalBadge, SuggestedBadge } from "@/components/ui/badge";
import { Chip, Segmented, Switch } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/field";
import { addDays, daysBetween, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { balancedCarbs } from "@/lib/onboarding/macros";
import { OWNER_DEFAULTS, planSummary, shiftRange, weeklyRateText, type OnboardingAnswers, type StepErrors } from "@/lib/onboarding/plan";
import { formatBodyweight, formatHeight, formatInt, fromDisplayWeight, parseNumber, round, toDisplayWeight } from "@/lib/units";
import { GoalScale } from "@/components/settings/GoalScale";
import { HeightInput, LengthUnitToggle, MiniStepper, ScheduleEditor, StepperInput, WeightUnitToggle } from "@/components/settings/inputs";
import { MacroCheck } from "@/components/settings/NutritionSheets";
import { useTimezones } from "@/components/settings/TrainingSheets";

export interface StepProps {
  a: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
  errors: StepErrors;
  today: ISODate;
  touched: Set<string>;
  touch: (k: string) => void;
}

/* ------------------------------------------------------------- pieces */

function Err({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-2 text-[13px] font-medium text-danger" role="alert">
      {children}
    </p>
  );
}

function Block({ label, right, children, className, hint }: { label: ReactNode; right?: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-2.5 flex min-h-9 items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-fg-2">{label}</p>
        {right}
      </div>
      {children}
      {hint && <p className="mt-2 text-[12.5px] leading-relaxed text-fg-3">{hint}</p>}
    </div>
  );
}

const disp = (lb: number, u: "lb" | "kg") => round(toDisplayWeight(lb, u), 1);
const toLb = (v: number, u: "lb" | "kg") => round(fromDisplayWeight(v, u), 1);

/* ------------------------------------------------------------ 1 welcome */

export function WelcomeStep() {
  const lines = [
    "Train the six-day program and log every set, with the rest timer and records built in.",
    "Hit calories and protein with photo and chat logging that you confirm.",
    "Watch bodyweight, strength and photos climb toward your goal.",
  ];
  return (
    <ul className="grid grid-cols-1 gap-4">
      {lines.map((l) => (
        <li key={l} className="flex items-start gap-3 text-[15px] leading-relaxed text-fg-2">
          <LaurelBullet size={14} className="mt-1 shrink-0" />
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- 2 body */

export function BodyStep({ a, set, errors }: StepProps) {
  const u = a.weightUnit;
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

      <Block label="Height" right={<LengthUnitToggle value={a.lengthUnit} onChange={(v) => set({ lengthUnit: v })} />}>
        <HeightInput cm={a.heightCm} onChange={(cm) => set({ heightCm: cm })} unit={a.lengthUnit} invalid={!!errors.heightCm} />
        <Err>{errors.heightCm}</Err>
      </Block>

      <Block
        label={
          <span className="flex items-center gap-2">
            Today&apos;s weigh-in <OptionalBadge />
          </span>
        }
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
        hint="Saved as a real weigh-in for today only if you fill it in. Best first thing in the morning."
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
          className="num text-[18px] placeholder:font-sans placeholder:text-[15px] placeholder:font-medium"
          onChange={(e) => {
            setWeighIn(e.target.value);
            const n = parseNumber(e.target.value);
            set({ todayWeighInLb: e.target.value.trim() === "" ? null : n == null ? -1 : toLb(n, u) });
          }}
        />
        <Err>{errors.todayWeighInLb}</Err>
      </Block>
    </div>
  );
}

/* --------------------------------------------------------------- 3 goal */

export function GoalStep({ a, set, errors, today }: StepProps) {
  const u = a.weightUnit;
  const plan = planSummary(a);
  const validDate = !errors.targetDate && a.targetDate > today && a.targetDate > a.startDate;
  return (
    <div className="grid grid-cols-1 gap-7">
      <Block label="Goal weight">
        <StepperInput
          label="Goal weight"
          value={disp(a.goalWeightLb, u)}
          onChange={(v) => {
            const lb = toLb(v, u);
            const r = shiftRange(lb, a.goalRangeMinLb, a.goalRangeMaxLb);
            set({ goalWeightLb: lb, goalRangeMinLb: r.min, goalRangeMaxLb: r.max });
          }}
          step={u === "kg" ? 0.5 : 1}
          min={u === "kg" ? 27 : 60}
          max={u === "kg" ? 272 : 600}
          decimals={u === "kg" ? 1 : 0}
          unit={u}
          size="lg"
          invalid={!!errors.goalWeightLb}
        />
        <Err>{errors.goalWeightLb}</Err>
        <GoalScale startLb={a.startWeightLb} goalLb={a.goalWeightLb} rangeMinLb={a.goalRangeMinLb} rangeMaxLb={a.goalRangeMaxLb} unit={u} className="mt-6 px-3" />
      </Block>

      <Field label="Target date" error={errors.targetDate}>
        {(id) => (
          <Input
            id={id}
            type="date"
            value={a.targetDate}
            min={addDays(today, 1)}
            onChange={(e) => set({ targetDate: e.target.value })}
            aria-invalid={!!errors.targetDate || undefined}
          />
        )}
      </Field>

      <div className="card-inset p-4" aria-live="polite">
        {validDate && plan.weeklyRateLb != null ? (
          <>
            <p className="eyebrow">The pace</p>
            <p className="mt-2 text-[22px] font-semibold leading-tight text-fg">
              <span className="num text-[28px]">{weeklyRateText(plan.weeklyRateLb, u).replace(/ per week$/, "")}</span>
              <span className="ml-1.5 text-[15px] font-medium text-fg-2">per week</span>
            </p>
            <p className="mt-1.5 text-[13px] text-fg-2">
              {plan.weeks} weeks · {formatInt(daysBetween(a.startDate, a.targetDate))} days · {plan.deltaLb >= 0 ? "+" : "−"}
              {formatBodyweight(Math.abs(plan.deltaLb), u)}
            </p>
            {plan.tooFast && <p className="mt-3 border-t border-line-hair pt-3 text-[13px] font-medium text-fg-2">Faster than this mostly adds fat.</p>}
          </>
        ) : (
          <p className="text-[13px] text-fg-3">Pick a date after today to see the weekly pace.</p>
        )}
      </div>
      <p className="-mt-3 text-[12.5px] leading-relaxed text-fg-3">
        Expect a mix of muscle, water and some fat. The 7-day trend matters more than any single weigh-in, and the target can move with real results.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- 4 training */

export function TrainingStep({ a, set, errors }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-7">
      <Block label="Training experience">
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

      <Block label="Weekly schedule" hint="Push/Pull/Legs twice, Sunday off. Single-day moves happen later from Training.">
        <ScheduleEditor value={a.schedule} onChange={(s) => set({ schedule: s })} />
      </Block>

      <div className="overflow-hidden rounded-[16px] border border-line bg-s1">
        <div className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">Volleyball</p>
            <p className="text-[12.5px] text-fg-3">Sessions per week</p>
          </div>
          <MiniStepper label="Volleyball sessions" value={a.volleyballPerWeek} min={0} max={14} onChange={(v) => set({ volleyballPerWeek: v })} />
        </div>
        <label className="flex min-h-[64px] cursor-pointer items-center gap-3 border-t border-line-hair px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">Start with intro volume</p>
            <p className="text-[12.5px] leading-snug text-fg-3">One fewer set per exercise while you settle in. Switch it off any time in Settings.</p>
          </div>
          <Switch checked={a.introVolume} onCheckedChange={(v) => set({ introVolume: v })} label="Start with intro volume" />
        </label>
      </div>
      <Err>{errors.volleyballPerWeek}</Err>
    </div>
  );
}

/* ---------------------------------------------------------- 5 nutrition */

export function NutritionStep({ a, set, errors, touched, touch }: StepProps) {
  const carbs = balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal);
  const badge = (k: string) => (touched.has(k) ? null : <SuggestedBadge />);
  const D = OWNER_DEFAULTS;
  const changed = a.calorieGoal !== D.calorieGoal || a.proteinGoal !== D.proteinGoal || a.fatGoal !== D.fatGoal || a.waterGoalMl !== D.waterGoalMl || a.sleepGoalH !== D.sleepGoalH;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="card-inset p-4">
        <div className="mb-3 flex items-center justify-center gap-2">
          <p className="eyebrow">Calories</p>
          {badge("calorieGoal")}
        </div>
        <StepperInput label="Daily calories" value={a.calorieGoal} onChange={(v) => set({ calorieGoal: Math.round(v) })} onEdit={() => touch("calorieGoal")} step={50} min={1000} max={8000} unit="kcal / day" size="lg" thousands invalid={!!errors.calorieGoal} />
        <Err>{errors.calorieGoal}</Err>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card-inset p-3">
          <div className="mb-3 flex min-h-[44px] flex-col items-center justify-start gap-1.5">
            <p className="eyebrow">Protein</p>
            {badge("proteinGoal")}
          </div>
          <StepperInput layout="stacked" label="Protein" value={a.proteinGoal} onChange={(v) => set({ proteinGoal: Math.round(v) })} onEdit={() => touch("proteinGoal")} step={5} min={0} max={500} unit="g" invalid={!!errors.proteinGoal} />
        </div>
        <div className="card-inset p-3">
          <div className="mb-3 flex min-h-[44px] flex-col items-center justify-start gap-1.5">
            <p className="eyebrow">Fat</p>
            {badge("fatGoal")}
          </div>
          <StepperInput layout="stacked" label="Fat" value={a.fatGoal} onChange={(v) => set({ fatGoal: Math.round(v) })} onEdit={() => touch("fatGoal")} step={5} min={0} max={400} unit="g" invalid={!!errors.fatGoal} />
        </div>
      </div>
      <div className="card-inset flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Carbs</p>
          <AutoBadge />
        </div>
        <p className="num-sm">
          {formatInt(carbs)}
          <span className="unit">g</span>
        </p>
      </div>
      <div className="flex flex-col items-center gap-1 py-1">
        <MacroCheck calories={a.calorieGoal} protein={a.proteinGoal} carbs={carbs} fat={a.fatGoal} />
        <Err>{errors.macros}</Err>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card-inset p-3">
          <div className="mb-3 flex min-h-[44px] flex-col items-center justify-start gap-1.5">
            <p className="eyebrow">Water</p>
            {badge("waterGoalMl")}
          </div>
          <StepperInput layout="stacked" label="Water goal" value={a.waterGoalMl / 1000} onChange={(v) => set({ waterGoalMl: Math.round(v * 1000) })} onEdit={() => touch("waterGoalMl")} step={0.25} min={0.5} max={10} decimals={2} minDecimals={1} unit="L / day" invalid={!!errors.waterGoalMl} />
        </div>
        <div className="card-inset p-3">
          <div className="mb-3 flex min-h-[44px] flex-col items-center justify-start gap-1.5">
            <p className="eyebrow">Sleep</p>
            {badge("sleepGoalH")}
          </div>
          <StepperInput layout="stacked" label="Sleep goal" value={a.sleepGoalH} onChange={(v) => set({ sleepGoalH: v })} onEdit={() => touch("sleepGoalH")} step={0.5} min={4} max={12} decimals={1} unit="h / night" invalid={!!errors.sleepGoalH} />
        </div>
      </div>
      <Err>{errors.waterGoalMl ?? errors.sleepGoalH}</Err>
      <p className="text-[12.5px] leading-relaxed text-fg-3">
        Starting estimates for a lean gain. After two weeks of weigh-ins the app can suggest a change, and nothing moves without your OK.
        {changed && (
          <>
            {" "}
            <button
              type="button"
              className="inline-flex h-8 items-center font-bold text-gold-300"
              onClick={() => set({ calorieGoal: D.calorieGoal, proteinGoal: D.proteinGoal, fatGoal: D.fatGoal, waterGoalMl: D.waterGoalMl, sleepGoalH: D.sleepGoalH })}
            >
              Reset to suggested
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- 6 units */

export function UnitsStep({ a, set, errors }: StepProps) {
  const { detected, all } = useTimezones();
  const options = all.includes(a.timezone) ? all : [a.timezone, ...all];
  return (
    <div className="grid grid-cols-1 gap-7">
      <Block label="Weight">
        <Segmented
          ariaLabel="Weight unit"
          value={a.weightUnit}
          onChange={(v) => set({ weightUnit: v })}
          options={[
            { value: "lb", label: "Pounds · lb" },
            { value: "kg", label: "Kilograms · kg" },
          ]}
        />
      </Block>
      <Block label="Length">
        <Segmented
          ariaLabel="Length unit"
          value={a.lengthUnit}
          onChange={(v) => set({ lengthUnit: v })}
          options={[
            { value: "in", label: "Feet and inches" },
            { value: "cm", label: "Centimetres" },
          ]}
        />
      </Block>
      <Field label="Time zone" hint={a.timezone === detected ? "Detected from this device" : undefined} error={errors.timezone}>
        {(id) => (
          <Select id={id} value={a.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {options.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="card-inset grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="eyebrow">Shows as</p>
          <p className="num-sm mt-2">{formatBodyweight(a.startWeightLb, a.weightUnit)}</p>
        </div>
        <div>
          <p className="eyebrow">Height</p>
          <p className="num-sm mt-2">{formatHeight(a.heightCm, a.lengthUnit)}</p>
        </div>
      </div>
      <p className={cn("-mt-3 text-[12.5px] leading-relaxed text-fg-3")}>Stored in pounds and inches either way, so switching later never changes your data.</p>
    </div>
  );
}
