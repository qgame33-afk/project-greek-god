"use client";

import { BellRing, Pause, Play, Plus, Timer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNowSec } from "@/lib/live-clock";
import { clockText, durationText, isDone, isRunning, timeLeft, timerId, timerProgress } from "./timer-model";
import { timers$, useTimers } from "./timers";

/**
 * A step's timer on the recipe screen: "10 min timer" until started, then the live countdown
 * with pause / +1 min / cancel, and "Done" (leaf-200, gently pulsing) when it rings. Only this chip
 * re-renders every second.
 */
export function TimerChip({ recipeKey, step, totalSec, label, className }: { recipeKey: string; step: number; totalSec: number; label: string; className?: string }) {
  const all = useTimers();
  const t = all.find((x) => x.id === timerId(recipeKey, step) && !x.dismissedAt) ?? null;
  // the shared 1 Hz clock (client-only screens: never the server's 0)
  const now = useNowSec() * 1000;

  if (!t) {
    return (
      <button
        type="button"
        onClick={() => timers$.start({ recipeKey, step, label, totalSec })}
        className={cn("press t-callout inline-flex h-11 items-center gap-2 rounded-full bg-m3 pl-3 pr-4 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-m4", className)}
        aria-label={`Start a ${durationText(totalSec)} timer for step ${step + 1}`}
      >
        <Timer className="size-4 text-stone" strokeWidth={1.6} aria-hidden />
        {durationText(totalSec)} timer
      </button>
    );
  }

  const left = timeLeft(t, now);
  const done = isDone(t, now);
  const running = isRunning(t);
  const p = timerProgress(t, now);
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)} role="timer" aria-live="off" aria-label={`Step ${step + 1} timer, ${done ? "done" : `${clockText(left)} left${running ? "" : ", paused"}`}`}>
      {done ? (
        <button
          type="button"
          onClick={() => timers$.dismiss(t.id)}
          className="press t-callout relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-m3 pl-3 pr-4 font-semibold text-leaf-200 shadow-[inset_0_0_0_1px_var(--leaf-line)]"
        >
          <BellRing className="size-4 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]" aria-hidden />
          Done · Dismiss
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (running ? timers$.pause(t.id) : timers$.resume(t.id))}
          className={cn(
            "press t-callout relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-m3 pl-3 pr-4 font-semibold",
            running ? "text-ivory shadow-[inset_0_0_0_1px_var(--ui-line)]" : "text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]",
          )}
          aria-label={running ? "Pause timer" : "Resume timer"}
        >
          {running ? <Pause className="size-4" strokeWidth={1.6} aria-hidden /> : <Play className="size-4" strokeWidth={1.6} aria-hidden />}
          <span className={cn("t-num-s", running ? "text-ivory" : "text-stone")}>{clockText(left)}</span>
          {/* elapsed share as a hairline along the bottom edge (transform only) */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
            <span className="block h-full w-full origin-left bg-ivory/70 transition-transform duration-1000 ease-linear" style={{ transform: `translateX(${(p - 1) * 100}%)` }} />
          </span>
        </button>
      )}
      <button type="button" onClick={() => timers$.add(t.id, 60)} className="press grid size-11 place-items-center rounded-full bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-3)] hover:text-ivory" aria-label="Add one minute">
        <Plus className="size-4" strokeWidth={1.6} aria-hidden />
        <span className="sr-only">1 min</span>
      </button>
      {!done && (
        <button type="button" onClick={() => timers$.cancel(t.id)} className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory" aria-label="Cancel timer">
          <X className="size-4" strokeWidth={1.6} aria-hidden />
        </button>
      )}
    </div>
  );
}
