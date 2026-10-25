"use client";

import { BellRing, Pause, Play, RotateCcw, X } from "lucide-react";
import { Bar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { useNowSec } from "@/lib/live-clock";
import { clockText, durationText, isDone, isRunning, timeLeft, timerId } from "./timer-model";
import { timers$, useTimers } from "./timers";

const pill = "press t-label hit-44 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-pill bg-control px-4 font-semibold text-fg";

/**
 * Cooking mode's timer for one step (docs/DESIGN-V3-SIMPLE.md §4.4.4): a card with "Timer",
 * the time and "Start". Running, it counts down (from the stored end time, so it keeps counting
 * on another step or a sleeping phone) with Pause, +1 min and Cancel; ringing, it says so with
 * "Stop alarm". The draining bar carries information, so it keeps moving under reduced motion.
 */
export function BigTimer({ recipeKey, step, totalSec, label }: { recipeKey: string; step: number; totalSec: number; label: string }) {
  const all = useTimers();
  const t = all.find((x) => x.id === timerId(recipeKey, step) && !x.dismissedAt) ?? null;
  // the shared 1 Hz clock (client-only screens: never the server's 0)
  const now = useNowSec() * 1000;

  if (!t) {
    return (
      <div className="flex items-center gap-4 rounded-card bg-surface py-5 pl-6 pr-4">
        <div className="min-w-0 flex-1">
          <p className="t-label">Timer</p>
          <p className="t-num mt-1 tabular-nums">{clockText(totalSec)}</p>
        </div>
        <button type="button" className={pill} onClick={() => timers$.start({ recipeKey, step, label, totalSec })} aria-label={`Start a ${durationText(totalSec)} timer`}>
          Start
        </button>
      </div>
    );
  }

  const left = timeLeft(t, now);
  const done = isDone(t, now);
  const running = isRunning(t);
  return (
    <div className="rounded-card bg-surface px-6 pb-5 pt-5" role="timer" aria-label={`Timer, ${done ? "done" : `${durationText(left)} left${running ? "" : ", paused"}`}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-label">{done ? "Timer done" : running ? "Timer" : "Paused"}</p>
          <p className={cn("t-num mt-1 flex items-center gap-2 tabular-nums", !running && !done && "text-fg-2")}>
            {done && <BellRing className="size-6" strokeWidth={1.9} aria-hidden />}
            {done ? "0:00" : clockText(left)}
          </p>
        </div>
        {done ? (
          <button type="button" className={pill} onClick={() => timers$.dismiss(t.id)}>
            Stop alarm
          </button>
        ) : (
          <button type="button" className={pill} onClick={() => (running ? timers$.pause(t.id) : timers$.resume(t.id))}>
            {running ? <Pause className="size-4" strokeWidth={1.9} aria-hidden /> : <Play className="size-4" strokeWidth={1.9} aria-hidden />}
            {running ? "Pause" : "Resume"}
          </button>
        )}
      </div>
      {!done && <Bar thin className="motion-keep mt-4" value={t.totalSec > 0 ? left / t.totalSec : 0} label={`${durationText(left)} left`} />}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={pill} onClick={() => timers$.add(t.id, 60)} aria-label="Add one minute">
          +1 min
        </button>
        {done ? (
          <button type="button" className={pill} onClick={() => timers$.start({ recipeKey, step, label, totalSec })}>
            <RotateCcw className="size-4" strokeWidth={1.9} aria-hidden />
            Restart {durationText(totalSec)}
          </button>
        ) : (
          <button type="button" className={pill} onClick={() => timers$.cancel(t.id)}>
            <X className="size-4" strokeWidth={1.9} aria-hidden />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
