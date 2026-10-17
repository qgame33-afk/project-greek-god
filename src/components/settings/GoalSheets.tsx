"use client";

import { useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { Profile } from "@/lib/data/profile";
import { addDays, daysBetween, shortDate, type ISODate } from "@/lib/dates";
import { requiredWeeklyGain } from "@/lib/bodyweight";
import { formatPlacardWeight, shiftRange, weeklyRateText } from "@/lib/onboarding/plan";
import { formatBodyweight, formatHeight, fromDisplayWeight, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { EditSheet } from "./EditSheet";
import { GoalScale } from "./GoalScale";
import { HeightInput, StepperInput } from "./inputs";
import { useCommit } from "./useCommit";
import { useResetOnOpen } from "./useResetOnOpen";

type SheetProps = { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile; today: ISODate };

const wUnit = (p: Profile) => (p.weight_unit === "kg" ? "kg" : "lb") as WeightUnit;
const toLb = (v: number, u: WeightUnit) => round(fromDisplayWeight(v, u), 1);
const toDisp = (lb: number, u: WeightUnit) => round(toDisplayWeight(lb, u), 1);
const inRange = (lb: number) => lb >= 60 && lb <= 600;

/* ----------------------------------------------------------- start weight */

export function StartWeightSheet({ open, onOpenChange, profile, today }: SheetProps) {
  const u = wUnit(profile);
  const { commit, pending, error, clearError } = useCommit();
  const [w, setW] = useState(0);
  const [date, setDate] = useState(today);
  useResetOnOpen(open, () => {
    setW(toDisp(Number(profile.start_weight_lb ?? 163), u));
    setDate(profile.start_date);
    clearError();
  });
  const lb = toLb(w, u);
  const wErr = inRange(lb) ? null : `Enter a weight between ${u === "kg" ? "27 and 272 kg" : "60 and 600 lb"}.`;
  const dErr = !date ? "Pick a date." : date >= profile.target_date ? "The start must be before your target date." : null;
  const changed = lb !== Number(profile.start_weight_lb) || date !== profile.start_date;
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Starting point"
      description="Progress is measured from here."
      canSave={!wErr && !dErr && changed}
      pending={pending}
      error={error}
      onSave={() =>
        commit(
          { start_weight_lb: lb, start_date: date },
          { message: `Start set to ${formatBodyweight(lb, u)} on ${shortDate(date, today)}`, onDone: () => onOpenChange(false) },
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 pb-2">
        <div>
          <p className="mb-2 t-meta font-semibold text-stone">Start weight</p>
          <StepperInput label="Start weight" value={w} onChange={setW} step={u === "kg" ? 0.1 : 0.2} min={u === "kg" ? 27 : 60} max={u === "kg" ? 272 : 600} decimals={1} unit={u} size="lg" invalid={!!wErr} />
          {wErr && <p className="mt-2 text-center t-meta text-cinnabar">{wErr}</p>}
        </div>
        <Field label="Start date" error={dErr}>
          {(id) => <Input id={id} type="date" value={date} max={addDays(profile.target_date, -1)} onChange={(e) => setDate(e.target.value)} aria-invalid={!!dErr || undefined} />}
        </Field>
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------ goal weight */

export function GoalWeightSheet({ open, onOpenChange, profile, today }: SheetProps) {
  const u = wUnit(profile);
  const { commit, pending, error, clearError } = useCommit();
  const [goal, setGoal] = useState(0);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  // The band the goal moves relative to: the saved range, or whatever the user last set by hand.
  // Shifting from this anchor (not from the previous keystroke's band) means typing "184" never
  // drags 180–185 along through "1" and "18", and stepping back inside restores it exactly.
  const [anchor, setAnchor] = useState({ min: 0, max: 0 });
  const [reason, setReason] = useState("");
  useResetOnOpen(open, () => {
    const lo = toDisp(Number(profile.goal_range_min_lb ?? 180), u);
    const hi = toDisp(Number(profile.goal_range_max_lb ?? 185), u);
    setGoal(toDisp(Number(profile.goal_weight_lb ?? 183), u));
    setMin(lo);
    setMax(hi);
    setAnchor({ min: lo, max: hi });
    setReason("");
    clearError();
  });

  const goalLb = toLb(goal, u);
  const minLb = toLb(min, u);
  const maxLb = toLb(max, u);
  const startLb = Number(profile.start_weight_lb ?? 163);
  const err = !inRange(goalLb)
    ? `Enter a goal between ${u === "kg" ? "27 and 272 kg" : "60 and 600 lb"}.`
    : minLb > maxLb
      ? "The range's low end must be below its high end."
      : goalLb < minLb || goalLb > maxLb
        ? "Keep your goal inside its range."
        : null;
  const rate = requiredWeeklyGain(startLb, goalLb, profile.start_date, profile.target_date);
  const changed = goalLb !== Number(profile.goal_weight_lb) || minLb !== Number(profile.goal_range_min_lb) || maxLb !== Number(profile.goal_range_max_lb);
  const step = u === "kg" ? 0.5 : 1;

  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Goal weight"
      description="An ambitious target, adjustable as real results come in."
      canSave={!err && changed}
      pending={pending}
      error={error}
      onSave={() =>
        commit(
          { goal_weight_lb: goalLb, goal_range_min_lb: minLb, goal_range_max_lb: maxLb },
          { reason, message: `Goal ${formatBodyweight(goalLb, u)} · range ${formatPlacardWeight(minLb, u)}–${formatPlacardWeight(maxLb, u)} ${u}`, onDone: () => onOpenChange(false) },
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 pb-2">
        <StepperInput
          label="Goal weight"
          value={goal}
          onChange={(v) => {
            setGoal(v);
            const r = shiftRange(v, anchor.min, anchor.max);
            setMin(r.min);
            setMax(r.max);
          }}
          step={step}
          min={u === "kg" ? 27 : 60}
          max={u === "kg" ? 272 : 600}
          decimals={1}
          minDecimals={0}
          unit={u}
          size="lg"
          invalid={!!err}
        />
        <GoalScale startLb={startLb} goalLb={goalLb} rangeMinLb={minLb} rangeMaxLb={maxLb} unit={u} className="px-2" />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card bg-m2 shadow-(--e1) p-3">
            <p className="mb-2 text-center t-meta font-semibold text-ash">Range low</p>
            <StepperInput
              layout="stacked"
              label="Range low"
              value={min}
              onChange={(v) => {
                setMin(v);
                setAnchor({ min: v, max });
              }}
              step={step}
              min={u === "kg" ? 27 : 60}
              max={u === "kg" ? 272 : 600}
              decimals={1}
              minDecimals={0}
            />
          </div>
          <div className="rounded-card bg-m2 shadow-(--e1) p-3">
            <p className="mb-2 text-center t-meta font-semibold text-ash">Range high</p>
            <StepperInput
              layout="stacked"
              label="Range high"
              value={max}
              onChange={(v) => {
                setMax(v);
                setAnchor({ min, max: v });
              }}
              step={step}
              min={u === "kg" ? 27 : 60}
              max={u === "kg" ? 272 : 600}
              decimals={1}
              minDecimals={0}
            />
          </div>
        </div>
        {err ? (
          <p className="text-center t-meta font-medium text-cinnabar" role="alert">
            {err}
          </p>
        ) : (
          <p className="text-center t-meta font-medium text-stone">
            {weeklyRateText(rate, u)} from {formatBodyweight(startLb, u)} by {shortDate(profile.target_date, today)}
            {rate != null && rate > 1 && <span className="mt-1 block text-ash">Faster than this mostly adds fat.</span>}
          </p>
        )}
        <Field label="Why the change?" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Gaining faster than planned" />}
        </Field>
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------ target date */

export function TargetDateSheet({ open, onOpenChange, profile, today }: SheetProps) {
  const u = wUnit(profile);
  const { commit, pending, error, clearError } = useCommit();
  const [date, setDate] = useState(profile.target_date);
  useResetOnOpen(open, () => {
    setDate(profile.target_date);
    clearError();
  });
  const err = !date ? "Pick a date." : date <= today ? "Pick a date after today." : date <= profile.start_date ? "Pick a date after your start date." : null;
  const startLb = Number(profile.start_weight_lb ?? 163);
  const goalLb = Number(profile.goal_weight_lb ?? 183);
  const rate = err ? null : requiredWeeklyGain(startLb, goalLb, profile.start_date, date);
  const left = err ? null : daysBetween(today, date);
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Target date"
      description="The countdown and plan line follow this date."
      canSave={!err && date !== profile.target_date}
      pending={pending}
      error={error}
      onSave={() => commit({ target_date: date }, { message: `Target date ${shortDate(date, "0000-01-01")}`, onDone: () => onOpenChange(false) })}
    >
      <div className="grid grid-cols-1 gap-4 pb-2">
        <Field label="Target date" error={err}>
          {(id) => <Input id={id} type="date" value={date} min={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} aria-invalid={!!err || undefined} />}
        </Field>
        {!err && left != null && (
          <div className="rounded-card bg-m2 shadow-(--e1) grid grid-cols-2 gap-3 p-4">
            <div>
              <p className="t-eyebrow">Days left</p>
              <p className="t-num-m mt-1.5">{left.toLocaleString("en-US")}</p>
            </div>
            <div>
              <p className="t-eyebrow">Pace needed</p>
              <p className="mt-1.5 t-callout font-semibold text-ivory">{weeklyRateText(rate, u).replace(" per week", "/wk")}</p>
            </div>
            {rate != null && rate > 1 && <p className="col-span-2 t-meta text-stone">Faster than this mostly adds fat.</p>}
          </div>
        )}
      </div>
    </EditSheet>
  );
}

/* ----------------------------------------------------------------- height */

export function HeightSheet({ open, onOpenChange, profile }: SheetProps) {
  const lu = profile.length_unit === "cm" ? "cm" : "in";
  const { commit, pending, error, clearError } = useCommit();
  const [cm, setCm] = useState(189.2);
  useResetOnOpen(open, () => {
    setCm(Number(profile.height_cm ?? 189.2));
    clearError();
  });
  const err = cm >= 100 && cm <= 250 ? null : lu === "cm" ? "Enter a height between 100 and 250 cm." : "Enter a height between 3′4″ and 8′2″.";
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Height"
      canSave={!err && round(cm, 1) !== Number(profile.height_cm)}
      pending={pending}
      error={error}
      onSave={() => commit({ height_cm: round(cm, 1) }, { message: `Height ${formatHeight(cm, lu)}`, onDone: () => onOpenChange(false) })}
    >
      <div className="grid grid-cols-1 gap-3 pb-2">
        {open && <HeightInput cm={cm} onChange={setCm} unit={lu} invalid={!!err} />}
        {err ? <p className="t-meta text-cinnabar">{err}</p> : <p className="t-meta text-ash">{formatHeight(cm, lu === "cm" ? "in" : "cm")}</p>}
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------------- name */

export function NameSheet({ open, onOpenChange, profile }: SheetProps) {
  const { commit, pending, error, clearError } = useCommit();
  const [name, setName] = useState("");
  useResetOnOpen(open, () => {
    setName(profile.display_name ?? "");
    clearError();
  });
  const clean = name.trim();
  const err = clean.length > 60 ? "Keep it under 60 characters." : null;
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your name"
      description="Used in greetings. Optional."
      canSave={!err && clean !== (profile.display_name ?? "")}
      pending={pending}
      error={error}
      onSave={() => commit({ display_name: clean || null }, { message: clean ? `Name set to ${clean}` : "Name removed", onDone: () => onOpenChange(false) })}
    >
      <div className="pb-2">
        <Field label="Name" error={err}>
          {(id) => <Input id={id} value={name} autoComplete="given-name" autoCapitalize="words" enterKeyHint="done" maxLength={80} placeholder="Your first name" onChange={(e) => setName(e.target.value)} />}
        </Field>
      </div>
    </EditSheet>
  );
}
