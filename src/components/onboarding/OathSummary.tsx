"use client";

import { ChevronRight } from "lucide-react";
import { formatClock, toMinutes } from "@/lib/prefs";
import { formatPlacardWeight, scheduleSummary, weeklyRateText, type OathStepId, type OnboardingAnswers, type PlanSummary } from "@/lib/onboarding/plan";
import { formatHeight, formatInt, round } from "@/lib/units";

const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${M[m - 1]} ${y}`;
};

/** "a · b · c" that only wraps between segments. */
function Segs({ text }: { text: string }) {
  const parts = text.split(" · ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          <span className="whitespace-nowrap">
            {p}
            {i < parts.length - 1 && " ·"}
          </span>{" "}
        </span>
      ))}
    </>
  );
}

/**
 * The Oath's page (docs/DESIGN-V2.md §3.11 step 5): the promise in his own numbers, in the voice,
 * then every answer as a row he can tap to change. The hold below it begins the ascent.
 */
export function OathSummary({ a, plan, onEdit }: { a: OnboardingAnswers; plan: PlanSummary; onEdit: (s: OathStepId) => void }) {
  const u = a.weightUnit;
  const name = a.displayName.trim();
  const rows: { step: OathStepId; label: string; value: string }[] = [
    { step: "climber", label: "Climber", value: `${name ? `${name} · ` : ""}${formatPlacardWeight(a.startWeightLb, u)} ${u} · ${formatHeight(a.heightCm, a.lengthUnit)} · ${a.timezone.split("/").pop()?.replace(/_/g, " ")}` },
    { step: "summit", label: "Summit", value: `${formatPlacardWeight(a.goalWeightLb, u)} ${u} · band ${formatPlacardWeight(a.goalRangeMinLb, u)}–${formatPlacardWeight(a.goalRangeMaxLb, u)} · ${weeklyRateText(plan.weeklyRateLb, u).replace(" per week", " a week")}` },
    {
      step: "training",
      label: "Training",
      value: `${scheduleSummary(a.schedule)}${a.trainAt ? ` · at ${formatClock(toMinutes(a.trainAt))}` : ""}${a.volleyballPerWeek ? ` · volleyball ${a.volleyballPerWeek}×` : ""}${a.introVolume ? " · intro volume" : ""}`,
    },
    { step: "fuel", label: "Fuel", value: `${formatInt(a.calorieGoal)} kcal · ${a.proteinGoal} g protein · ${plan.carbs} g carbs · ${a.fatGoal} g fat` },
    { step: "fuel", label: "Recovery", value: `${round(a.sleepGoalH, 2)} h sleep · ${(a.waterGoalMl / 1000).toFixed(a.waterGoalMl % 100 === 0 ? 1 : 2)} L water` },
  ];
  return (
    <div className="grid grid-cols-1 gap-7">
      <section aria-label="The oath" className="border-y border-vein py-5">
        <p className="t-verdict text-ivory">
          From {formatPlacardWeight(a.startWeightLb, u)} to {formatPlacardWeight(a.goalWeightLb, u)} {u} by {longDay(a.targetDate)}.
        </p>
        <p className="t-callout mt-3 text-stone">
          <Segs text={`${plan.weeks} weeks · ${plan.trainingDays} days a week · ${formatInt(a.calorieGoal)} kcal · ${a.proteinGoal} g protein`} />
        </p>
        <p className="t-meta mt-3 text-ash">The statue gilds only as your 7-day trend climbs. Nothing is gold until you earn it.</p>
      </section>

      <section aria-label="Your answers">
        <p className="t-eyebrow mb-1">Your answers</p>
        <ul className="divide-y divide-vein border-y border-vein">
          {rows.map((r) => (
            <li key={r.label}>
              <button type="button" onClick={() => onEdit(r.step)} className="press-soft flex min-h-14 w-full items-center gap-3 py-2.5 text-left" aria-label={`Change ${r.label.toLowerCase()}: ${r.value}`}>
                <span className="t-meta w-[4.75rem] shrink-0 font-semibold text-ash">{r.label}</span>
                <span className="t-callout min-w-0 flex-1 font-semibold text-ivory">
                  <Segs text={r.value} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
