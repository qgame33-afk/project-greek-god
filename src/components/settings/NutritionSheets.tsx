"use client";

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { AutoBadge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/field";
import { Empty, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { EmptyArt } from "@/components/art/Motifs";
import { useGoalChanges, type Profile } from "@/lib/data/profile";
import { localDateOf, shortDate, type ISODate } from "@/lib/dates";
import { balancedCarbs, macroLine, macrosOverflow } from "@/lib/onboarding/macros";
import { cn } from "@/lib/cn";
import { formatInt, formatLiters, round, toDisplayWeight } from "@/lib/units";
import { EditSheet } from "./EditSheet";
import { StepperInput } from "./inputs";
import { SwitchRow } from "./List";
import { useCommit } from "./useCommit";
import { useResetOnOpen } from "./useResetOnOpen";

type SheetProps = { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile; today: ISODate };

/** The live "Macros = 3,301 kcal ✓" line. Warning text (not just colour) when off. */
export function MacroCheck({ calories, protein, carbs, fat, className }: { calories: number; protein: number; carbs: number; fat: number; className?: string }) {
  const l = macroLine({ calories, protein, carbs, fat });
  return (
    <p className={cn("flex items-center gap-1.5 text-[13px] font-semibold", l.ok ? "text-success" : "text-warning", className)} role="status" aria-live="polite">
      {l.ok ? <Check className="size-4 shrink-0" aria-hidden /> : <TriangleAlert className="size-4 shrink-0" aria-hidden />}
      <span className="num text-[14px]">{l.ok ? l.text.replace(" ✓", "") : l.text}</span>
    </p>
  );
}

/* ------------------------------------------------------- nutrition targets */

export function NutritionSheet({ open, onOpenChange, profile }: SheetProps) {
  const { commit, pending, error, clearError } = useCommit();
  const [kcal, setKcal] = useState(3300);
  const [protein, setProtein] = useState(185);
  const [fat, setFat] = useState(85);
  const [carbs, setCarbs] = useState(449);
  const [auto, setAuto] = useState(true);
  const [reason, setReason] = useState("");
  useResetOnOpen(open, () => {
    setKcal(profile.calorie_goal);
    setProtein(profile.protein_goal);
    setFat(profile.fat_goal);
    setCarbs(profile.carb_goal);
    setAuto(macroLine({ calories: profile.calorie_goal, protein: profile.protein_goal, carbs: profile.carb_goal, fat: profile.fat_goal }).ok);
    setReason("");
    clearError();
  });

  const c = auto ? balancedCarbs(kcal, protein, fat) : carbs;
  const line = macroLine({ calories: kcal, protein, carbs: c, fat });
  const err =
    kcal < 1000 || kcal > 8000
      ? "Calories between 1,000 and 8,000."
      : protein < 0 || protein > 500
        ? "Protein between 0 and 500 g."
        : fat < 0 || fat > 400
          ? "Fat between 0 and 400 g."
          : c < 0 || c > 1200
            ? "Carbs between 0 and 1,200 g."
            : macrosOverflow(kcal, protein, fat)
              ? "Protein and fat alone are over the calorie goal."
              : !line.ok
                ? "Targets must add up. Turn on auto-balance or adjust a macro."
                : null;
  const changed = kcal !== profile.calorie_goal || protein !== profile.protein_goal || fat !== profile.fat_goal || c !== profile.carb_goal;

  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nutrition targets"
      description="Starting estimates. Adjust with your bodyweight trend, hunger and training."
      canSave={!err && changed}
      pending={pending}
      error={error}
      onSave={() =>
        commit(
          { calorie_goal: kcal, protein_goal: protein, fat_goal: fat, carb_goal: c },
          { reason, message: `${formatInt(kcal)} kcal · ${protein} g protein`, onDone: () => onOpenChange(false) },
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 pb-2">
        <div className="card-inset p-4">
          <p className="eyebrow mb-3 text-center">Calories</p>
          <StepperInput label="Calories" value={kcal} onChange={setKcal} step={50} min={1000} max={8000} unit="kcal" size="lg" thousands />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-inset p-3">
            <p className="eyebrow mb-2 text-center">Protein</p>
            <StepperInput layout="stacked" label="Protein" value={protein} onChange={setProtein} step={5} min={0} max={500} unit="g" />
          </div>
          <div className="card-inset p-3">
            <p className="eyebrow mb-2 text-center">Fat</p>
            <StepperInput layout="stacked" label="Fat" value={fat} onChange={setFat} step={5} min={0} max={400} unit="g" />
          </div>
        </div>
        <div className="card-inset p-3">
          <div className="mb-2 flex items-center justify-center gap-2">
            <p className="eyebrow">Carbs</p>
            {auto && <AutoBadge />}
          </div>
          {auto ? (
            <div className="flex h-[52px] flex-col items-center justify-center">
              <p className="num-md">{formatInt(c)}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">g · balances calories</p>
            </div>
          ) : (
            <StepperInput label="Carbs" value={carbs} onChange={setCarbs} step={5} min={0} max={1200} unit="g" />
          )}
        </div>
        <div className="overflow-hidden rounded-[16px] border border-line bg-s1">
          <SwitchRow
            label="Auto-balance carbs"
            detail="Carbs fill whatever calories protein and fat leave."
            checked={auto}
            onChange={(v) => {
              setAuto(v);
              if (!v) setCarbs(balancedCarbs(kcal, protein, fat));
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <MacroCheck calories={kcal} protein={protein} carbs={c} fat={fat} />
          {err && line.ok && <p className="text-[13px] text-danger">{err}</p>}
          {!line.ok && !auto && (
            <button type="button" className="h-11 px-2 text-[13px] font-bold text-gold-300" onClick={() => setCarbs(balancedCarbs(kcal, protein, fat))}>
              Balance carbs to {formatInt(balancedCarbs(kcal, protein, fat))} g
            </button>
          )}
        </div>
        <Field label="Why the change?" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Weight flat for two weeks" />}
        </Field>
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------ daily goals */

type DailyKind = "water" | "sleep" | "steps";

const DAILY: Record<DailyKind, { title: string; description: string }> = {
  water: { title: "Water goal", description: "Counts toward the hydration ring and habit." },
  sleep: { title: "Sleep goal", description: "Used by recovery check-ins and the weekly review." },
  steps: { title: "Steps goal", description: "Daily movement target for the steps habit." },
};

export function DailyGoalSheet({ kind, open, onOpenChange, profile }: SheetProps & { kind: DailyKind }) {
  const { commit, pending, error, clearError } = useCommit();
  const [v, setV] = useState(0);
  useResetOnOpen(open, () => {
    setV(kind === "water" ? profile.water_goal_ml / 1000 : kind === "sleep" ? Number(profile.sleep_goal_h) : profile.steps_goal);
    clearError();
  });
  const cfg =
    kind === "water"
      ? { step: 0.25, min: 0.5, max: 10, decimals: 2, unit: "L", ok: v >= 0.5 && v <= 10, msg: "Between 0.5 and 10 L." }
      : kind === "sleep"
        ? { step: 0.25, min: 4, max: 12, decimals: 2, unit: "hours", ok: v >= 4 && v <= 12, msg: "Between 4 and 12 hours." }
        : { step: 500, min: 0, max: 100000, decimals: 0, unit: "steps", ok: v >= 0 && v <= 100000 && Number.isInteger(v), msg: "Between 0 and 100,000 steps." };
  const values =
    kind === "water" ? { water_goal_ml: Math.round(v * 1000) } : kind === "sleep" ? { sleep_goal_h: round(v, 2) } : { steps_goal: Math.round(v) };
  const current = kind === "water" ? profile.water_goal_ml : kind === "sleep" ? Number(profile.sleep_goal_h) : profile.steps_goal;
  const next = Object.values(values)[0] as number;
  const label = kind === "water" ? formatLiters(next, 2).replace(/0 L$/, " L").replace(/\.0 L$/, " L") : kind === "sleep" ? `${round(next, 2)} h` : `${formatInt(next)} steps`;
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title={DAILY[kind].title}
      description={DAILY[kind].description}
      canSave={cfg.ok && next !== current}
      pending={pending}
      error={error}
      onSave={() => commit(values, { message: `${DAILY[kind].title} ${label}`, onDone: () => onOpenChange(false) })}
    >
      <div className="pb-3 pt-2">
        <StepperInput label={DAILY[kind].title} value={v} onChange={setV} step={cfg.step} min={cfg.min} max={cfg.max} decimals={cfg.decimals} minDecimals={kind === "water" ? 1 : kind === "sleep" ? 0 : undefined} unit={cfg.unit} size="lg" thousands={kind === "steps"} invalid={!cfg.ok} />
        {!cfg.ok && <p className="mt-2 text-center text-[13px] text-danger">{cfg.msg}</p>}
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------ goal history */

const FIELD_LABEL: Record<string, [string, string]> = {
  calorie_goal: ["Calories", "kcal"],
  protein_goal: ["Protein", "g"],
  carb_goal: ["Carbs", "g"],
  fat_goal: ["Fat", "g"],
  goal_weight_lb: ["Goal weight", "lb"],
  water_goal_ml: ["Water", "mL"],
  sleep_goal_h: ["Sleep", "h"],
  steps_goal: ["Steps", ""],
};
const SOURCE: Record<string, string> = { user: "You", suggestion: "Accepted suggestion", onboarding: "Onboarding" };

export function GoalHistorySheet({ open, onOpenChange, today, weightUnit = "lb" }: { open: boolean; onOpenChange: (o: boolean) => void; today: ISODate; weightUnit?: "lb" | "kg" }) {
  const q = useGoalChanges();
  const rows = q.data ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Goal history" description="Every target change, newest first.">
      <div className="pb-4 pt-1">
        {q.isLoading ? (
          <div className="grid grid-cols-1 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : q.error ? (
          <p className="text-[13px] text-danger">Couldn&apos;t load the history. {(q.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <Empty art={<EmptyArt kind="plinth" size={56} />} title="No changes yet">
            When you change a calorie, macro or weight goal, it shows up here with the date and your reason.
          </Empty>
        ) : (
          <ul className="overflow-hidden rounded-[16px] border border-line bg-s1">
            {rows.map((r, i) => {
              const [name, baseUnit] = FIELD_LABEL[r.field] ?? [r.field, ""];
              const isWeight = r.field === "goal_weight_lb";
              const unit = isWeight ? weightUnit : baseUnit;
              const fmt = (v: number | null) =>
                v == null ? "—" : isWeight ? round(toDisplayWeight(Number(v), weightUnit), 1).toFixed(1) : r.field === "sleep_goal_h" ? String(round(Number(v), 2)) : formatInt(Number(v));
              return (
                <li key={r.id} className={cn("px-4 py-3", i > 0 && "border-t border-line-hair")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] font-semibold text-fg">{name}</p>
                    <p className="num shrink-0 text-[15px] text-fg-2">
                      {fmt(r.old_value)} → <span className="text-fg">{fmt(r.new_value)}</span> {unit}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-fg-3">
                    {shortDate(localDateOf(r.changed_at), today)} · {SOURCE[r.source] ?? r.source}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
