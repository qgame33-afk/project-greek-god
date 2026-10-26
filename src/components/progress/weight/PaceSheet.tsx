"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DetailsBody, type DetailsRow } from "@/components/ui/details-sheet";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { calorieSuggestion, calorieTargetRate, type WeighIn } from "@/lib/bodyweight";
import { isOffline } from "@/lib/data/core";
import { useGoalChanges, useSaveProfile, type Profile } from "@/lib/data/profile";
import { daysBetween, localDateOf, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { carbsForGoal } from "@/lib/nutrition";
import { calorieCall } from "@/lib/progress/ascent-copy";
import { paceChipLabel, type Pace } from "@/lib/progress/pace";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";

const MIN_CARBS = 50;

/**
 * The pace sheet (docs/DESIGN-V3-SIMPLE.md §4.5.2): the chip's word as the title, one plain
 * sentence, then Your pace, Pace you need, Calories ("Keep 3,300", or "Try 3,400" with Review)
 * and Days to go, and How we got this. Every number is read from pace() and the calorie rule
 * (calorieSuggestion); Review opens the goal-change confirm and only Apply writes, through
 * useSaveProfile (which records goal_changes).
 */
export function PaceSheet({
  open,
  onOpenChange,
  pace: pc,
  profile,
  weights,
  today,
  unit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pace: Pace;
  profile: Profile;
  weights: WeighIn[];
  today: ISODate;
  unit: WeightUnit;
}) {
  const changes = useGoalChanges();
  const save = useSaveProfile();
  const [confirm, setConfirm] = useState(false);
  const busy = useRef(false);

  const startLb = Number(profile.start_weight_lb);
  const lastCalChange = useMemo(() => {
    const c = changes.data?.find((x) => x.field === "calorie_goal");
    return c ? localDateOf(c.changed_at) : null;
  }, [changes.data]);
  const calories = profile.calorie_goal ?? null;
  const call = useMemo(() => {
    if (changes.isLoading || calories == null || !profile.target_date || profile.goal_weight_lb == null) return null;
    const target = calorieTargetRate(pc.trend.lb, startLb, Number(profile.goal_weight_lb), profile.start_date, profile.target_date, today);
    return calorieCall(calorieSuggestion(weights, today, target, lastCalChange, profile.start_date), calories, unit, today);
  }, [changes.isLoading, calories, profile.target_date, profile.goal_weight_lb, profile.start_date, pc.trend.lb, startLb, today, weights, lastCalChange, unit]);

  const rate = pc.rate.status === "ok" ? pc.rate.lbPerWeek : null;
  const c = pc.corridor;
  const d1 = (lb: number) => round(toDisplayWeight(lb, unit), 1);
  const d2 = (lb: number) => round(toDisplayWeight(lb, unit), 2);
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const plain = (lb: number) => {
    const v = d1(lb);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const band = pc.band ? (pc.band.min === pc.band.max ? `${plain(pc.band.min)} ${unit}` : `${plain(pc.band.min)}–${plain(pc.band.max)} ${unit}`) : null;
  const by = pc.target ? `${parseISODate(pc.target).getDate()} ${monthName(pc.target, true)} ${pc.target.slice(0, 4)}` : null;
  const daysLeft = pc.target ? daysBetween(today, pc.target) : null;
  const need = c ? `${sign(c.minRate)}${Math.abs(d2(c.minRate))} to ${d2(c.maxRate) < 0 ? "−" : ""}${Math.abs(d2(c.maxRate))}` : null;

  const title = paceChipLabel(pc.verdict) ?? (pc.verdict === "arrived" ? "In your goal range" : "Your pace");
  const sentence =
    rate != null && pc.verdict !== "arrived"
      ? `You're ${rate >= 0 ? "gaining" : "losing"} about ${Math.abs(d1(rate))} ${unit} a week.${c && band && by ? ` To reach ${band} by ${by} you need ${need} ${unit} a week.` : ""}`
      : pc.sentence;

  const next = call?.next ?? null;
  const rows: DetailsRow[] = [
    { label: "Your pace", value: rate != null ? `${sign(d1(rate))}${Math.abs(d1(rate))} ${unit} a week` : "—" },
    ...(need ? [{ label: "Pace you need", value: need }] : []),
    { label: "Calories", value: calories == null ? "—" : next != null ? `Try ${formatInt(next)}` : `Keep ${formatInt(calories)}`, detail: call?.detail ?? undefined },
    ...(daysLeft != null && daysLeft > 0 ? [{ label: "Days to go", value: formatInt(daysLeft) }] : []),
  ];

  // the confirm: calories, and carbs moving with them so the macros still add up
  const carbs = next != null ? carbsForGoal(next, profile.protein_goal, profile.fat_goal) : null;
  const moveCarbs = carbs != null && carbs >= MIN_CARBS && carbs !== profile.carb_goal;
  const apply = () => {
    if (next == null || busy.current) return;
    if (isOffline()) {
      toast.error("You're offline", { description: `Calories stay at ${formatInt(calories)} kcal. Try again once you're back online.` });
      return;
    }
    busy.current = true;
    save.mutate(
      { values: { calorie_goal: next, ...(moveCarbs ? { carb_goal: carbs! } : {}) }, reason: "Pace check on Progress", source: "suggestion" },
      {
        onSuccess: () => {
          toast(`Calories set to ${formatInt(next)} kcal`, { description: "Saved to your goal history. Change it any time in Settings." });
          onOpenChange(false);
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const how = [
    rate != null
      ? `Your pace is the straight-line trend of your ${pc.rate.n} weigh-ins over the last 4 weeks, as a change per week. The dashed line on the chart carries that pace forward. It is a guide, not a promise.`
      : `${pc.detail}. Your pace appears after 4 weigh-ins over at least 10 days.`,
    c && band ? `The pace you need lands your 7-day average in ${band} by your target date.` : null,
    "The calorie suggestion waits for 8 weigh-ins over two weeks, and for 14 days after any calorie change.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={title}>
        <p className="t-body -mt-1 mb-4 text-fg-2">{sentence}</p>
        <DetailsBody rows={rows} how={how}>
          {next != null && (
            <Button variant="secondary" block size="lg" className="mt-2" onClick={() => setConfirm(true)} disabled={save.isPending}>
              Review
            </Button>
          )}
        </DetailsBody>
      </Sheet>
      {next != null && calories != null && (
        <Confirm
          open={confirm}
          onOpenChange={setConfirm}
          title="Change calories?"
          destructive={false}
          confirmLabel="Apply"
          cancelLabel="Not now"
          onConfirm={apply}
          body={
            <div>
              <dl className="divide-y divide-line border-y border-line">
                <DiffRow label="Calories" before={`${formatInt(calories)} kcal`} after={`${formatInt(next)} kcal`} />
                {moveCarbs && <DiffRow label="Carbs" before={`${profile.carb_goal} g`} after={`${carbs} g`} />}
              </dl>
              <p className="mt-3">{call?.call}</p>
              <p className="mt-1.5">Saved to your goal history. You can change it back any time in Settings.</p>
            </div>
          }
        />
      )}
    </>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2">
      <dt>{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-x-2">
        <span className="t-row whitespace-nowrap text-fg-2 line-through decoration-ui-line">{before}</span>
        <ArrowRight className="size-4 text-fg-3" strokeWidth={2.2} aria-label="to" />
        <span className="t-row whitespace-nowrap text-fg">{after}</span>
      </dd>
    </div>
  );
}
