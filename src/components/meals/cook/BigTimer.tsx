"use client";

import { BellRing, Pause, Play, RotateCcw, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useNowSec } from "@/lib/live-clock";
import { clockText, durationText, isDone, isRunning, timeLeft, timerId, timerProgress } from "./timer-model";
import { timers$, useTimers } from "./timers";

/**
 * Cooking mode's timer for one step, sized for a kitchen: the countdown in 64 px digits over a
 * draining meter, with 56 px Pause / +1 min / Cancel. Rings (gold, gently pulsing) when done
 * until dismissed. The time is always derived from the stored end time, so it keeps counting
 * while you're on another step or the phone sleeps.
 */
export function BigTimer({ recipeKey, step, totalSec, label }: { recipeKey: string; step: number; totalSec: number; label: string }) {
  const all = useTimers();
  const t = all.find((x) => x.id === timerId(recipeKey, step) && !x.dismissedAt) ?? null;
  // the shared 1 Hz clock (client-only screens: never the server's 0)
  const now = useNowSec() * 1000;

  if (!t) {
    return (
      <Button
        variant="secondary"
        size="lg"
        block
        className="h-16 rounded-[18px] text-[17px]"
        onClick={() => {
          haptic(10);
          timers$.start({ recipeKey, step, label, totalSec });
        }}
      >
        <Timer className="size-5 text-gold-300" aria-hidden />
        Start {durationText(totalSec)} timer
      </Button>
    );
  }

  const left = timeLeft(t, now);
  const done = isDone(t, now);
  const running = isRunning(t);
  const p = timerProgress(t, now);
  const last10 = running && left <= 10 && !done;

  return (
    <div
      className={cn("overflow-hidden rounded-[20px] border p-4 transition-colors duration-(--dur-base)", done ? "border-line-gold bg-gold-tint" : "border-line bg-s2")}
      role="timer"
      aria-label={`Timer, ${done ? "done" : `${durationText(left)} left${running ? "" : ", paused"}`}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{done ? "Timer done" : running ? "Timer" : "Paused"}</p>
        <p className="text-[12.5px] font-semibold text-fg-3">{durationText(t.totalSec)}</p>
      </div>
      {done ? (
        <div className="mt-2 flex items-center gap-3">
          <BellRing className="size-9 text-gold-200 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]" aria-hidden />
          <p className="num text-[56px] font-semibold leading-none text-gold-200">0:00</p>
        </div>
      ) : (
        <p className={cn("num mt-2 text-[64px] font-semibold leading-none tabular-nums transition-colors", running ? (last10 ? "text-gold-200" : "text-fg") : "text-fg-2")}>{clockText(left)}</p>
      )}
      {/* elapsed share, drained by transform only */}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--track)]" aria-hidden>
        <div className="h-full w-full rounded-full bg-gold-400 transition-transform duration-1000 ease-linear" style={{ transform: `translateX(${(p - 1) * 100}%)` }} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {done ? (
          <>
            <Button variant="outline-gold" size="lg" className="col-span-2 h-14 bg-s2" onClick={() => timers$.dismiss(t.id)}>
              Stop alarm
            </Button>
            <Button variant="secondary" size="lg" className="h-14" onClick={() => timers$.add(t.id, 60)} aria-label="Add one minute">
              +1 min
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="lg" className="h-14" onClick={() => (running ? timers$.pause(t.id) : timers$.resume(t.id))}>
              {running ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
              {running ? "Pause" : "Resume"}
            </Button>
            <Button variant="secondary" size="lg" className="h-14" onClick={() => timers$.add(t.id, 60)} aria-label="Add one minute">
              +1 min
            </Button>
            <Button variant="secondary" size="lg" className="h-14 text-fg-2" onClick={() => timers$.cancel(t.id)}>
              <X className="size-5" aria-hidden />
              Cancel
            </Button>
          </>
        )}
      </div>
      {done && (
        <button type="button" onClick={() => timers$.start({ recipeKey, step, label, totalSec })} className="press mt-2 inline-flex h-11 items-center gap-1.5 rounded-[10px] px-1 text-[13.5px] font-bold text-fg-2 hover:text-fg">
          <RotateCcw className="size-4" aria-hidden />
          Restart {durationText(totalSec)}
        </button>
      )}
    </div>
  );
}
