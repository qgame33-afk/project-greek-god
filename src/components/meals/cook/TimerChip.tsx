"use client";

import { BellRing, Pause, Play, Plus, Timer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNowSec } from "@/lib/live-clock";
import { clockText, durationText, isDone, isRunning, timeLeft, timerId, timerProgress } from "./timer-model";
import { timers$, useTimers } from "./timers";

/**
 * A step's timer on the recipe screen: "10 min timer" until started, then the live countdown
 * with pause / +1 min / cancel, and "Done" (gold, gently pulsing) when it rings. Only this chip
 * re-renders every second.
 */
export function TimerChip({ recipeKey, step, totalSec, label, className }: { recipeKey: string; step: number; totalSec: number; label: string; className?: string }) {
  const all = useTimers();
  const t = all.find((x) => x.id === timerId(recipeKey, step) && !x.dismissedAt) ?? null;
  const nowSec = useNowSec();
  const now = nowSec ? nowSec * 1000 : Date.now();

  if (!t) {
    return (
      <button
        type="button"
        onClick={() => timers$.start({ recipeKey, step, label, totalSec })}
        className={cn("press inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-s3 pl-3 pr-4 text-[13.5px] font-bold text-fg hover:bg-s4", className)}
        aria-label={`Start a ${durationText(totalSec)} timer for step ${step + 1}`}
      >
        <Timer className="size-4 text-gold-300" aria-hidden />
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
          className="press relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full border border-line-gold bg-gold-tint pl-3 pr-4 text-[13.5px] font-bold text-gold-200"
        >
          <BellRing className="size-4 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]" aria-hidden />
          Done · Dismiss
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (running ? timers$.pause(t.id) : timers$.resume(t.id))}
          className={cn(
            "press relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full border pl-3 pr-4 text-[13.5px] font-bold",
            running ? "border-line-gold bg-s3 text-fg" : "border-line-strong bg-s3 text-fg-2",
          )}
          aria-label={running ? "Pause timer" : "Resume timer"}
        >
          {running ? <Pause className="size-4 text-gold-300" aria-hidden /> : <Play className="size-4 text-fg-2" aria-hidden />}
          <span className={cn("num text-[17px] font-semibold tabular-nums", running ? "text-gold-200" : "text-fg-2")}>{clockText(left)}</span>
          {/* elapsed share as a hairline along the bottom edge (transform only) */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
            <span className="block h-full w-full origin-left bg-gold-400/70 transition-transform duration-1000 ease-linear" style={{ transform: `translateX(${(p - 1) * 100}%)` }} />
          </span>
        </button>
      )}
      <button type="button" onClick={() => timers$.add(t.id, 60)} className="press grid size-11 place-items-center rounded-full border border-line bg-s3 text-fg-2 hover:text-fg" aria-label="Add one minute">
        <Plus className="size-4" aria-hidden />
        <span className="sr-only">1 min</span>
      </button>
      {!done && (
        <button type="button" onClick={() => timers$.cancel(t.id)} className="press grid size-11 place-items-center rounded-full text-fg-3 hover:text-fg-2" aria-label="Cancel timer">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
