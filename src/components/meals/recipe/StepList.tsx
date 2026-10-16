"use client";

import { Check, Thermometer } from "lucide-react";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
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
 * timer, and shows its food-safety note in a lapis info box (never red: it's guidance).
 */
export function StepList({ recipeKey, steps, done, onToggle }: { recipeKey: string; steps: RecipeStep[]; done: readonly number[]; onToggle: (i: number) => void }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const on = done.includes(i);
        return (
          <li key={i} className="relative flex gap-3.5 py-3">
            {/* the rail between numbers */}
            {i < steps.length - 1 && <span aria-hidden className="absolute bottom-[-6px] left-[19px] top-[52px] w-px bg-line" />}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Step ${i + 1}${on ? ", done" : ""}`}
              onClick={() => {
                haptic(6);
                onToggle(i);
              }}
              className={cn(
                "press relative z-[1] grid size-10 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color] duration-(--dur-fast)",
                on ? "border-transparent bg-success text-ink" : "border-line-strong bg-s2 text-gold-300 hover:border-line-gold",
              )}
            >
              {/* 44px hit area around the 40px disc */}
              <span aria-hidden className="absolute -inset-0.5" />
              {on ? <Check className="size-[18px]" strokeWidth={3} /> : <span className="num text-[19px] font-semibold leading-none">{i + 1}</span>}
            </button>
            <div className="min-w-0 flex-1 pt-[7px]">
              <p className={cn("text-[17px] font-medium leading-[1.5] transition-colors duration-(--dur-fast)", on ? "text-fg-3" : "text-fg")}>{kitchenText(s.text)}</p>
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
    <div className={cn("flex items-start gap-2.5 rounded-[12px] border border-lapis-line bg-lapis-tint px-3 py-2.5", className)} role="note">
      <Thermometer className={cn("mt-0.5 shrink-0 text-lapis-text", large ? "size-5" : "size-4")} aria-hidden />
      <p className={cn("font-medium leading-snug text-fg", large ? "text-[17px]" : "text-[14px]")}>
        <span className="sr-only">Food safety: </span>
        {kitchenText(text)}
      </p>
    </div>
  );
}
