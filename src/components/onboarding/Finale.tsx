"use client";

import { useState } from "react";
import { GildedBust } from "@/components/signature/GildedBust";
import { cn } from "@/lib/cn";
import { formatInt, formatHeight, round } from "@/lib/units";
import { formatPlacardWeight, scheduleSummary, weeklyRateText, type OnboardingAnswers, type PlanSummary, type RoadmapStep, type StepId } from "@/lib/onboarding/plan";

/** The bust preview shown on the finale: nearly full, so the molten edge plays at the crown. */
export const FINALE_P = 0.995;

export function FinaleBust({ a, size }: { a: OnboardingAnswers; size: number }) {
  return <GildedBust p={FINALE_P} size={size} caption={`Gilds as your 7-day average climbs to ${formatPlacardWeight(a.goalWeightLb, a.weightUnit)} ${a.weightUnit}.`} />;
}

export function Finale({ a, plan, onEdit }: { a: OnboardingAnswers; plan: PlanSummary; onEdit: (s: StepId) => void }) {
  const u = a.weightUnit;
  const rows: { step: StepId; label: string; value: string }[] = [
    { step: "body", label: "Body", value: `${formatPlacardWeight(a.startWeightLb, u)} ${u} · ${formatHeight(a.heightCm, a.lengthUnit)}` },
    { step: "goal", label: "Goal", value: `${formatPlacardWeight(a.goalWeightLb, u)} ${u} by ${monthDay(a.targetDate)} · ${weeklyRateText(plan.weeklyRateLb, u).replace(" per week", "/wk")}` },
    {
      step: "training",
      label: "Training",
      value: `${scheduleSummary(a.schedule)}${a.volleyballPerWeek ? ` · volleyball ${a.volleyballPerWeek}×` : ""}${a.introVolume ? " · intro volume" : ""}`,
    },
    { step: "nutrition", label: "Fuel", value: `${formatInt(a.calorieGoal)} kcal · ${a.proteinGoal} P · ${plan.carbs} C · ${a.fatGoal} F` },
    { step: "nutrition", label: "Recovery", value: `${round(a.sleepGoalH, 2)} h sleep · ${(a.waterGoalMl / 1000).toFixed(a.waterGoalMl % 100 === 0 ? 1 : 2)} L water` },
    { step: "units", label: "Units", value: `${u} · ${a.lengthUnit === "in" ? "ft/in" : "cm"} · ${a.timezone.split("/").pop()?.replace(/_/g, " ")}` },
  ];
  return (
    <div className="grid grid-cols-1 gap-5">
      <section className="card-monument overflow-hidden px-5 pb-6 pt-6 text-center" aria-label="Your transformation plan">
        <div className="flex justify-center lg:hidden">
          <FinaleBust a={a} size={196} />
        </div>
        <p className="t-plaque mx-auto mt-5 max-w-[34ch] text-[12px] leading-[1.8] lg:mt-0 lg:text-[13px]">
          {plan.placard.split(" · ").map((part, i, all) => (
            <span key={i}>
              <span className="whitespace-nowrap">
                {part}
                {i < all.length - 1 && " ·"}
              </span>{" "}
            </span>
          ))}
        </p>
      </section>

      <Staircase steps={plan.roadmap} />

      <section aria-label="Plan summary" className="overflow-hidden rounded-[20px] border border-line bg-s1">
        {rows.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={() => onEdit(r.step)}
            className={cn("press-soft relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[.025]", i > 0 && "border-t border-line-hair")}
            aria-label={`Edit ${r.label.toLowerCase()}: ${r.value}`}
          >
            <span className="w-[76px] shrink-0 text-[13px] font-semibold text-fg-3">{r.label}</span>
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-fg">
              <Segs text={r.value} />
            </span>
            <span className="shrink-0 text-[13px] font-bold text-gold-300">Edit</span>
          </button>
        ))}
      </section>
    </div>
  );
}

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

function monthDay(d: string) {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, day] = d.split("-").map(Number);
  return `${M[m - 1]} ${day}, ${y}`;
}

/* -------------------------------------------------------------- staircase */

/**
 * The roadmap months rising like a staircase (DESIGN §6.6). Each month is a step that
 * scales up from its base in sequence; tap one to read its milestone.
 */
export function Staircase({ steps }: { steps: RoadmapStep[] }) {
  const [sel, setSel] = useState(0);
  const n = steps.length;
  if (!n) return null;
  const s = steps[Math.min(sel, n - 1)];
  return (
    <section className="card p-4 sm:p-5" aria-label="Month-by-month roadmap">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="eyebrow">The roadmap</p>
        <p className="text-[12px] font-semibold text-fg-3">
          {n} {n === 1 ? "month" : "months"}
        </p>
      </div>
      <div className="flex h-[120px] items-end gap-[5px]" role="group" aria-label="Roadmap months">
        {steps.map((st, i) => {
          const h = n === 1 ? 100 : 22 + (78 * i) / (n - 1);
          const last = i === n - 1;
          const first = i === 0;
          const on = i === sel;
          return (
            <button
              key={st.month}
              type="button"
              aria-pressed={on}
              aria-label={`${st.label} ${st.year}: ${st.title}`}
              onClick={() => setSel(i)}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span
                className={cn(
                  "stair block w-full origin-bottom rounded-t-[5px] rounded-b-[2px] border transition-colors",
                  first ? "border-transparent bg-[image:var(--grad-progress)]" : last ? "border-gold-300/70 bg-gold-tint" : "border-line-gold/60 bg-white/[.03]",
                  on && !first && "border-gold-300 bg-gold-tint",
                )}
                style={{ height: `${h}%`, animationDelay: `${300 + i * 70}ms` }}
              />
              {on && <span className="absolute -bottom-[3px] left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-gold-300" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-[5px]" aria-hidden>
        {steps.map((st, i) => (
          <span key={st.month} className={cn("min-w-0 flex-1 text-center font-[family-name:var(--font-num)] text-[10.5px] font-semibold tracking-[0.04em]", i === sel ? "text-gold-300" : "text-fg-3")}>
            {n > 14 ? st.label.slice(0, 1) : st.label}
          </span>
        ))}
      </div>
      <div className="mt-4 border-t border-line-hair pt-3.5" aria-live="polite">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-gold-300">
          {st(s)} · {s.title}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{s.detail}</p>
      </div>
      <style>{`
        .stair { animation: stair-rise 620ms var(--ease-gold) both; }
        @keyframes stair-rise { from { transform: scaleY(0); opacity: .2 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .stair { animation: none } }
      `}</style>
    </section>
  );
}

const st = (s: RoadmapStep) => `${s.label} ${s.year}`;
