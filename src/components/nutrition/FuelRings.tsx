"use client";

import Link from "next/link";
import { Bar } from "@/components/ui/progress";
import { Ring } from "@/components/ui/ring";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { caloriesHit, type Macros } from "@/lib/nutrition";
import { leftLabel } from "@/lib/nutrition-ui/format";
import { liters, waterCells, waterToGo } from "@/lib/nutrition-ui/water";
import { formatInt } from "@/lib/units";
import type { Goals } from "./context";

/**
 * Calories ring + macro meters + water meter for the viewed day.
 * `totals` null = the day couldn't be loaded: every value reads "—", never a plausible 0.
 */
export function FuelRings({
  totals,
  goals,
  waterMl,
  isToday,
  empty,
}: {
  totals: Macros | null;
  goals: Goals;
  waterMl: number | null;
  isToday: boolean;
  empty: boolean;
}) {
  const goal = goals.calories;
  const known = totals != null;
  const eaten = totals?.calories ?? 0;
  const left = goal - eaten;
  const over = known && left < -0.5;
  const ratio = known && goal > 0 ? eaten / goal : 0;
  const hit = known && caloriesHit(eaten, goal);
  const pct = Math.round(ratio * 100);
  const ringText = !known ? "—" : over ? `+${formatInt(-left)}` : formatInt(Math.max(0, left));
  // "+19,810" on an extreme day still fits inside the ring at 375 px
  const ringSize = ringText.length >= 7 ? "text-[26px]" : ringText.length >= 6 ? "text-[30px]" : "text-[35px]";

  const caption = !known
    ? "This day didn't load, so nothing is counted yet."
    : over
      ? `+${formatInt(-left)} kcal over target${hit ? ", within your range." : "."}`
      : hit
        ? "On target for the day."
        : empty
          ? isToday
            ? "Nothing logged yet today."
            : "Nothing logged this day."
          : `${pct}% of the daily target.`;

  return (
    <section className="card @container p-4 sm:p-5 lg:p-6" aria-label="Calories and macros">
      <div className="flex items-center gap-5">
        <Ring
          size="lg"
          value={ratio}
          label={known ? `Calories ${formatInt(eaten)} of ${formatInt(goal)}, ${pct} percent${over ? `, ${formatInt(-left)} over` : ""}` : "Calories not loaded"}
        >
          <span className={cn("num font-semibold leading-none tracking-[-0.01em] text-fg", ringSize)}>{ringText}</span>
          <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-fg-3">{over ? "kcal over" : "kcal left"}</span>
        </Ring>
        <dl className="grid min-w-0 flex-1 gap-3">
          <div>
            <dt className="eyebrow">Eaten</dt>
            <dd className="num-md mt-1 truncate">
              {known ? formatInt(eaten) : "—"}
              <span className="unit !text-[12px]">kcal</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Target</dt>
            <dd className="num-md mt-1 truncate text-fg-2">
              {formatInt(goal)}
              <span className="unit !text-[12px]">kcal</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className={cn("mt-3 min-h-5 text-[13px] font-semibold", hit && !over ? "text-gold-300" : "text-fg-2")} aria-live="polite">
        {caption}
      </p>

      <div className="mt-4 grid gap-x-6 gap-y-3.5 border-t border-line-hair pt-4 @[34rem]:grid-cols-2">
        <MacroMeter label="Protein" dot="bg-marble" tone="marble" eaten={totals?.protein ?? null} goal={goals.protein} delay={80} />
        <MacroMeter label="Carbs" dot="bg-terracotta" tone="terracotta" eaten={totals?.carbs ?? null} goal={goals.carbs} delay={160} />
        <MacroMeter label="Fat" dot="bg-porphyry" tone="porphyry" eaten={totals?.fat ?? null} goal={goals.fat} delay={240} />
        <WaterMeter ml={waterMl} goal={goals.waterMl} />
      </div>
    </section>
  );
}

function MacroMeter({ label, dot, tone, eaten, goal, delay }: { label: string; dot: string; tone: "marble" | "terracotta" | "porphyry"; eaten: number | null; goal: number; delay: number }) {
  const l = eaten == null ? null : leftLabel(goal, eaten);
  const met = l?.state === "met" || (l?.state === "over" && label === "Protein");
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn("flex items-center gap-2 text-[13px] font-semibold", met ? "text-gold-300" : "text-fg-2")}>
          <span className={cn("size-2 rounded-full", dot)} aria-hidden />
          {label}
        </span>
        <span className="truncate text-right">
          <span className="num text-[16px] font-semibold text-fg">{eaten == null ? "—" : formatInt(eaten)}</span>
          <span className="num text-[15px] text-fg-3"> / {goal > 0 ? formatInt(goal) : "—"} g</span>
          {l && <span className={cn("ml-1.5 text-[12px] font-semibold", met ? "text-gold-300" : "text-fg-3")}>· {l.state === "left" ? l.text : met ? "Goal met" : l.text}</span>}
        </span>
      </div>
      <Bar
        value={goal > 0 && eaten != null ? eaten / goal : 0}
        tone={tone}
        delay={delay}
        label={eaten == null ? `${label} not loaded` : `${label} ${formatInt(eaten)} of ${formatInt(goal)} grams`}
      />
    </div>
  );
}

function WaterMeter({ ml, goal }: { ml: number | null; goal: number }) {
  const known = ml != null;
  const cells = waterCells(ml ?? 0, goal);
  const leftMl = goal - (ml ?? 0);
  const met = known && goal > 0 && leftMl <= 0;
  return (
    <a href="#water" className="group relative block rounded-[10px] outline-offset-4 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn("flex items-center gap-2 text-[13px] font-semibold", met ? "text-gold-300" : "text-fg-2")}>
          <span className="size-2 rounded-full bg-lapis" aria-hidden />
          Water
        </span>
        <span className="truncate text-right">
          <span className="num text-[16px] font-semibold text-fg">{known ? liters(ml) : "—"}</span>
          <span className="num text-[15px] text-fg-3"> / {goal > 0 ? liters(goal) : "—"} L</span>
          {known && goal > 0 && <span className={cn("ml-1.5 text-[12px] font-semibold", met ? "text-gold-300" : "text-fg-3")}>· {met ? "Goal met" : `${waterToGo(goal, ml ?? 0)} left`}</span>}
        </span>
      </div>
      <div className="flex gap-1" role="img" aria-label={known ? `Water ${liters(ml)} of ${liters(goal)} litres` : "Water not loaded"}>
        {cells.map((f, i) => (
          <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/[.07]">
            <span
              className="absolute inset-0 bg-lapis"
              style={{ transform: `translateX(${(f - 1) * 100}%)`, opacity: f > 0 ? 1 : 0, transition: `transform 600ms var(--ease-gold) ${i * 25}ms, opacity 150ms` }}
            />
          </span>
        ))}
      </div>
    </a>
  );
}

export function FuelRingsSkeleton() {
  return (
    <section className="card p-4 sm:p-5 lg:p-6" aria-busy="true" aria-label="Loading nutrition">
      <div className="flex items-center gap-5">
        <Skeleton className="size-[136px] rounded-full" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="mt-6 space-y-4 border-t border-line-hair pt-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </section>
  );
}

export function NoTargets() {
  return (
    <section className="card p-5">
      <p className="t-h3">No daily targets yet</p>
      <p className="mt-1 text-[13px] text-fg-2">Set calories and macros so the rings know what to measure.</p>
      <Link href="/settings" className="mt-3 inline-flex h-11 items-center text-[14px] font-bold text-gold-300">
        Set targets
      </Link>
    </section>
  );
}
