"use client";

import { Check, Thermometer } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RecipeStep } from "@/lib/meals/types";
import { kitchenText } from "../cook/cook-model";
import { TimerChip } from "../cook/TimerChip";

/** "Step 2 · Brown the beef" for timers and announcements. */
export function stepLabel(i: number, text: string): string {
  const first = text.split(/[.;:]/)[0].trim();
  const short = first.length > 40 ? `${first.slice(0, 38).replace(/\s+\S*$/, "")}…` : first;
  return `Step ${i + 1} · ${short}`;
}

/**
 * Numbered steps in plain words. Each step can be ticked off (kept on this device), offers its
 * timer, and shows its food-safety note as a quiet callout (guidance: never red, never aegean).
 */
export function StepList({ recipeKey, steps, done, onToggle }: { recipeKey: string; steps: RecipeStep[]; done: readonly number[]; onToggle: (i: number) => void }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const on = done.includes(i);
        return (
          <li key={i} className="relative flex gap-3.5 py-3">
            {/* the rail between numbers */}
            {i < steps.length - 1 && <span aria-hidden className="absolute -bottom-1.5 left-[1.375rem] top-[3.25rem] w-px bg-vein-2" />}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Step ${i + 1}${on ? ", done" : ""}`}
              onClick={() => onToggle(i)}
              className={cn(
                "press relative grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-(--dur-fast)",
                on ? "bg-ivory text-ink" : "bg-m2 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:shadow-[inset_0_0_0_1px_var(--ui-line)]",
              )}
            >
              {on ? <Check className="size-[18px]" strokeWidth={2.6} /> : <span className="t-num-s leading-none">{i + 1}</span>}
            </button>
            <div className="min-w-0 flex-1 pt-2">
              <p className={cn("t-body transition-colors duration-(--dur-fast)", on ? "text-stone" : "text-ivory")}>{kitchenText(s.text)}</p>
              {s.safety && <SafetyNote text={s.safety} className="mt-3" />}
              {s.timerSec ? <TimerChip recipeKey={recipeKey} step={i} totalSec={s.timerSec} label={stepLabel(i, s.text)} className="mt-3" /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SafetyNote({ text, className, large }: { text: string; className?: string; large?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-field bg-m2 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--vein-3)]", className)} role="note">
      <Thermometer className={cn("mt-0.5 shrink-0 text-ivory", large ? "size-5" : "size-4")} strokeWidth={1.6} aria-hidden />
      <p className={cn("text-ivory", large ? "t-body" : "t-callout")}>
        <span className="sr-only">Food safety: </span>
        {kitchenText(text)}
      </p>
    </div>
  );
}
