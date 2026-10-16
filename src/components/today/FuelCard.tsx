"use client";

import Link from "next/link";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { NotebookPen, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardAction } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/misc";
import { Ring, type RingTone } from "@/components/ui/ring";
import { cn } from "@/lib/cn";
import { useWaterMutations } from "@/lib/data/nutrition";
import { haptic } from "@/lib/haptics";
import { kcalSummary, ratio } from "@/lib/today/fuel";
import { formatInt } from "@/lib/units";
import { useReveal } from "./dawn";
import type { TodayModel } from "./useTodayModel";

const WATER_CHIPS = [250, 500];

/** Fuel: calories left, the four macro/water rings, and instant water logging. */
export function FuelCard({ m, error, onRetry, className }: { m: TodayModel; error?: Error | null; onRetry?: () => void; className?: string }) {
  const { ref: revealRef, seen, delay, stagger } = useReveal<HTMLElement>(700);
  const p = m.profile;
  const eaten = m.food;
  const k = kcalSummary(eaten.calories, p.calorie_goal);
  const water = useWaterMutations(m.today);
  const qc = useQueryClient();

  // Each tap inserts its own row; Undo removes exactly that row (by the id the hook returns).
  // If the insert is still in flight, Undo waits for it so it can't land after the delete.
  const addWater = (ml: number) => {
    const id = water.addMl(ml);
    haptic(10);
    const tid = toast(`+${ml} mL water`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          void insertSettled(qc, id).then((saved) => {
            if (saved) water.remove.mutate(id, { onSuccess: () => toast(`Removed ${ml} mL`) });
          }),
      },
    });
    // If the write fails the hook rolls back and says so; drop the optimistic "+250" toast.
    void insertSettled(qc, id).then((saved) => {
      if (!saved) toast.dismiss(tid);
    });
  };

  const macros: { key: string; label: string; eaten: number; goal: number; unit: string; tone: RingTone; display: (n: number) => string }[] = [
    { key: "protein", label: "Protein", eaten: eaten.protein, goal: p.protein_goal, unit: "g", tone: "marble", display: (n) => formatInt(n) },
    { key: "carbs", label: "Carbs", eaten: eaten.carbs, goal: p.carb_goal, unit: "g", tone: "terracotta", display: (n) => formatInt(n) },
    { key: "fat", label: "Fat", eaten: eaten.fat, goal: p.fat_goal, unit: "g", tone: "porphyry", display: (n) => formatInt(n) },
    { key: "water", label: "Water", eaten: m.waterMl, goal: p.water_goal_ml, unit: "L", tone: "lapis", display: (n) => (n / 1000).toFixed(1) },
  ];

  return (
    <section ref={revealRef} aria-label="Fuel" className={cn("card @container flex h-full flex-col p-4 sm:p-5 lg:p-6", className)}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h2 className="eyebrow">Fuel · today</h2>
        <CardAction href="/nutrition">Nutrition</CardAction>
      </div>
      {error && (
        <ErrorNote className="mb-3" onRetry={onRetry}>
          Couldn&apos;t load today&apos;s food.
        </ErrorNote>
      )}

      {/* Calories */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 @[300px]:flex-row @[300px]:gap-5">
        <Ring
          value={seen ? k.ratio : 0}
          size="lg"
          tone="gold"
          delay={delay}
          label={`Calories ${formatInt(eaten.calories)} of ${formatInt(p.calorie_goal)}, ${k.over > 0 ? `${formatInt(k.over)} over` : `${formatInt(k.left)} left`}`}
        >
          <span className="num-md leading-none text-fg">{m.foodFailed ? "—" : k.value}</span>
          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-3">{k.label}</span>
        </Ring>
        <dl className="grid w-full min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-3 @[300px]:grid-cols-1">
          <div>
            <dt className="eyebrow">Eaten</dt>
            <dd className="num-md mt-1 text-fg">
              {m.foodFailed ? "—" : formatInt(eaten.calories)}
              {!m.foodFailed && <span className="unit">kcal</span>}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Target</dt>
            <dd className="num-md mt-1 text-fg-2">
              {formatInt(p.calorie_goal)}
              <span className="unit">kcal</span>
            </dd>
            {k.over > 0 && <dd className="mt-1 text-[12px] font-medium text-fg-2">+{formatInt(k.over)} over</dd>}
          </div>
        </dl>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" size="md" className="px-3">
          <Link href="/nutrition/scan">
            <ScanLine className="size-[18px]" aria-hidden />
            Scan meal
          </Link>
        </Button>
        <Button asChild variant="ghost" size="md" className="border border-line px-3">
          <Link href="/nutrition?add=1">
            <NotebookPen className="size-[18px]" aria-hidden />
            Log food
          </Link>
        </Button>
      </div>

      {/* Macros + water */}
      <div className="pt-5">
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 border-t border-line-hair pt-4 @[300px]:grid-cols-4">
          {macros.map((x, i) => {
            const met = x.goal > 0 && x.eaten >= x.goal;
            return (
              <div key={x.key} className="flex flex-col items-center text-center">
                <Ring
                  value={seen ? ratio(x.eaten, x.goal) : 0}
                  size="md"
                  tone={x.tone}
                  delay={delay + stagger * (i + 1)}
                  label={`${x.label} ${x.display(x.eaten)} of ${x.display(x.goal)} ${x.unit === "L" ? "litres" : "grams"}, ${Math.round(ratio(x.eaten, x.goal) * 100)} percent`}
                >
                  <span className="num text-[19px] font-semibold leading-none text-fg">{m.foodFailed && x.key !== "water" ? "—" : x.display(x.eaten)}</span>
                </Ring>
                <p className="eyebrow mt-2 !tracking-[0.14em]">{x.label}</p>
                <p className={cn("num-xs mt-0.5 text-[13px]", met ? "text-gold-300" : "text-fg-3")}>
                  / {x.display(x.goal)} {x.unit}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {WATER_CHIPS.map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => addWater(ml)}
              className="press relative inline-flex h-9 flex-1 items-center justify-center rounded-full border border-lapis-line bg-lapis-tint text-[13px] font-semibold text-lapis-text before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
              aria-label={`Add ${ml} millilitres of water`}
            >
              <span className="num text-[15px]">+{ml}</span>
              <span className="ml-1 text-[12px]">mL water</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Resolves once the water insert carrying `id` is no longer pending: true when it saved (or
 * already had), false when it failed — the add hook has rolled back and said so already.
 */
function insertSettled(qc: QueryClient, id: string): Promise<boolean> {
  const cache = qc.getMutationCache();
  const find = () => cache.getAll().find((mu) => (mu.state.variables as { id?: unknown } | undefined)?.id === id);
  const state = () => find()?.state.status;
  return new Promise((resolve) => {
    const check = () => {
      const s = state();
      if (s === "pending") return false;
      resolve(s !== "error");
      return true;
    };
    if (check()) return;
    const unsub = cache.subscribe(() => {
      if (check()) unsub();
    });
  });
}
