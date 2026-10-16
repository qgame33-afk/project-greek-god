"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bar } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import type { WeightEntry } from "@/lib/data/body";
import { useGoalChanges, useProfile, useSaveProfile } from "@/lib/data/profile";
import { calorieSuggestion } from "@/lib/bodyweight";
import { localDateOf, shortDate } from "@/lib/dates";
import { carbsForGoal } from "@/lib/nutrition";
import { formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { PlanInput } from "@/lib/progress/plan";
import { signed } from "../kit";

/**
 * Smart calorie check (SPEC §12). Needs two weeks of weigh-ins; suggests a modest change when
 * the trend is well off plan; never changes the goal without an explicit confirmation.
 */
export function CalorieCard({ weights, plan, planRate, unit }: { weights: WeightEntry[]; plan: PlanInput; planRate: number | null; unit: WeightUnit }) {
  const today = useToday();
  const { profile } = useProfile();
  const changes = useGoalChanges();
  const save = useSaveProfile();
  const [review, setReview] = useState(false);

  const lastCalChange = useMemo(() => {
    const c = changes.data?.find((x) => x.field === "calorie_goal");
    return c ? localDateOf(c.changed_at) : null;
  }, [changes.data]);

  const target = Math.max(0.1, planRate ?? 0.46);
  const sug = useMemo(() => calorieSuggestion(weights, today, target, lastCalChange), [weights, today, target, lastCalChange]);
  const rate = (lb: number) => `${signed(toDisplayWeight(lb, unit), 2)} ${unit}/wk`;

  if (!profile || changes.isLoading) return null;
  const cal = profile.calorie_goal;

  if (sug.kind === "insufficient") {
    const days = Math.min(14, sug.daysOfData);
    return (
      <Card>
        <h2 className="eyebrow mb-2">Calorie check</h2>
        <p className="text-[14px] font-semibold text-fg">
          <span className="num text-[17px]">{days}</span> of 14 days logged
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Suggestions start after two weeks of steady weigh-ins{sug.weighIns < 8 ? ` (at least 8; you have ${sug.weighIns})` : ""}. Your calorie goal stays at {formatInt(cal)} kcal until you change it.
        </p>
        <Bar value={days / 14} tone="marble" className="mt-3" label={`${days} of 14 days logged`} />
      </Card>
    );
  }

  if (sug.kind === "cooldown") {
    return (
      <Card>
        <h2 className="eyebrow mb-2">Calorie check</h2>
        <p className="text-[14px] font-semibold text-fg">Calories changed {shortDate(sug.lastChange, today)}.</p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          The trend needs two weeks to respond. Next check {shortDate(sug.nextCheck, today)}. Goal: {formatInt(cal)} kcal.
        </p>
      </Card>
    );
  }

  if (sug.kind === "on_track") {
    // Within the no-change band, but say honestly when the pace is off the plan line.
    const ratio = sug.ratePerWeek / sug.targetRate;
    const pace = ratio > 1.25 ? "ahead" : ratio < 0.8 ? "behind" : "on";
    return (
      <Card>
        <h2 className="eyebrow mb-2">Calorie check</h2>
        <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <span className={pace === "on" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-fg-3"} aria-hidden />
          {pace === "on" ? "On plan" : pace === "ahead" ? "A little ahead of plan" : "A little behind plan"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Trend {rate(sug.ratePerWeek)} vs {rate(sug.targetRate)} planned over the last two weeks. Keep {formatInt(cal)} kcal
          {pace === "on" ? "." : "; a change is suggested only if the trend stays well off the plan."}
        </p>
      </Card>
    );
  }

  const next = cal + sug.delta;
  const inRange = next >= 1000 && next <= 8000;
  const carbs = carbsForGoal(next, profile.protein_goal, profile.fat_goal);
  const reason =
    sug.kind === "increase"
      ? `Two-week trend ${rate(sug.ratePerWeek)} vs ${rate(sug.targetRate)} planned.`
      : `Two-week trend ${rate(sug.ratePerWeek)} vs ${rate(sug.targetRate)} planned. Gaining this fast mostly adds fat.`;

  const apply = () => {
    if (save.isPending || !inRange) return;
    // useSaveProfile records the goal_changes row (source "suggestion"), which starts the 14-day cooldown.
    save.mutate(
      { values: { calorie_goal: next, carb_goal: carbs }, reason, source: "suggestion" },
      {
        onSuccess: () => {
          setReview(false);
          toast.success(`Calorie goal set to ${formatInt(next)} kcal`, { description: "Change it any time in Settings." });
        },
      },
    );
  };

  return (
    <>
      <Card className="border-lapis-line bg-[linear-gradient(180deg,rgb(111_163_236/.06),transparent_60%)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="eyebrow">Calorie check</h2>
          <SuggestedBadge />
        </div>
        <p className="text-[14px] font-semibold leading-snug text-fg">{reason}</p>
        <p className="mt-2 flex items-baseline gap-2 text-[13px] text-fg-2">
          Consider
          <span className="num text-[20px] font-semibold text-lapis-text">
            {signed(sug.delta, 0)}
            <span className="unit [font-size:max(12px,0.4em)]!">kcal/day</span>
          </span>
          <span className="text-fg-3">to {formatInt(next)} kcal</span>
        </p>
        <Button variant="secondary" block className="mt-4" onClick={() => setReview(true)} disabled={!inRange}>
          Review change
        </Button>
        <p className="mt-2 text-center text-[12px] font-medium text-fg-3">Nothing changes until you confirm.</p>
      </Card>

      <Sheet
        open={review}
        onOpenChange={setReview}
        title="Review calorie change"
        description="A suggestion from your weigh-in trend."
        footer={
          <div className="grid grid-cols-[1fr_1.4fr] gap-3">
            <Button variant="secondary" size="lg" onClick={() => setReview(false)}>
              Not now
            </Button>
            <Button variant="primary" size="lg" onClick={apply} loading={save.isPending} disabled={!inRange}>
              Apply change
            </Button>
          </div>
        }
      >
        <div className="py-2">
          <div className="card-inset divide-y divide-line-hair px-4">
            <Row label="Calories" from={`${formatInt(cal)} kcal`} to={`${formatInt(next)} kcal`} changed />
            <Row label="Carbs" from={`${profile.carb_goal} g`} to={`${carbs} g`} changed={carbs !== profile.carb_goal} />
            <Row label="Protein" from={`${profile.protein_goal} g`} to={`${profile.protein_goal} g`} />
            <Row label="Fat" from={`${profile.fat_goal} g`} to={`${profile.fat_goal} g`} />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-fg-2">
            {reason} The change goes into carbs so protein and fat stay put. The next check waits two weeks so the trend can respond.
          </p>
          <p className="mt-2 text-[12px] font-medium text-fg-3">Planned pace from {shortDate(plan.startDate, today)} to {shortDate(plan.targetDate, today)}. Not medical advice.</p>
        </div>
      </Sheet>
    </>
  );
}

function Row({ label, from, to, changed }: { label: string; from: string; to: string; changed?: boolean }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3">
      <span className="text-[14px] font-semibold text-fg-2">{label}</span>
      <span className="flex items-center gap-2">
        {changed ? (
          <>
            <span className="num text-[15px] text-fg-3 line-through decoration-fg-3/50">{from}</span>
            <ArrowRight className="size-4 text-fg-3" aria-label="to" />
            <span className="num text-[17px] font-semibold text-lapis-text">{to}</span>
          </>
        ) : (
          <span className="num text-[15px] text-fg-2">
            {to} <span className="font-sans text-[12px] text-fg-3">unchanged</span>
          </span>
        )}
      </span>
    </div>
  );
}
