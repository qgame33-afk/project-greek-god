"use client";

import { BellRing, Pause, Play, RotateCcw, Timer, X } from "lucide-react";
import { Sundial } from "@/components/art/Sundial";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useNowSec } from "@/lib/live-clock";
import { clockText, durationText, isDone, isRunning, timeLeft, timerId } from "./timer-model";
import { timers$, useTimers } from "./timers";

/**
 * Cooking mode's timer for one step (docs/DESIGN-V2.md §3.5.4): a small Sundial that drains while
 * it runs, the digits in t-num-l inside it (the big timer face is kept for rest in the gym), and
 * 56 px Pause / +1 min / Cancel. When it rings the digits turn leaf-200 until dismissed. The time
 * always comes from the stored end time, so it keeps counting on another step or a sleeping phone.
 */
export function BigTimer({ recipeKey, step, totalSec, label }: { recipeKey: string; step: number; totalSec: number; label: string }) {
  const all = useTimers();
  const t = all.find((x) => x.id === timerId(recipeKey, step) && !x.dismissedAt) ?? null;
  // the shared 1 Hz clock (client-only screens: never the server's 0)
  const now = useNowSec() * 1000;

  if (!t) {
    return (
      <Button variant="secondary" size="xl" block className="rounded-btn" onClick={() => timers$.start({ recipeKey, step, label, totalSec })}>
        <Timer className="size-5" strokeWidth={1.6} aria-hidden />
        Start {durationText(totalSec)} timer
      </Button>
    );
  }

  const left = timeLeft(t, now);
  const done = isDone(t, now);
  const running = isRunning(t);
  const last10 = running && left <= 10 && !done;

  return (
    <div
      className={cn("rounded-card bg-m1 px-4 pb-4 pt-3 transition-shadow duration-(--dur-base)", done ? "shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "shadow-[inset_0_0_0_1px_var(--vein-2)]")}
      role="timer"
      aria-label={`Timer, ${done ? "done" : `${durationText(left)} left${running ? "" : ", paused"}`}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={cn("t-eyebrow", done && "text-leaf-200")}>{done ? "Timer done" : running ? "Timer" : "Paused"}</p>
        <p className="t-meta text-stone">{durationText(t.totalSec)}</p>
      </div>
      <Sundial
        className="mt-1"
        width={240}
        label={done ? "Timer done" : `${durationText(left)} left`}
        final={last10 || done}
        rest={done ? null : { total: t.totalSec, elapsed: t.totalSec - left, paused: !running, key: `${t.endAt ?? "p"}:${t.totalSec}` }}
      >
        <span className={cn("t-num-l flex items-center gap-2 pb-1", done || last10 ? "text-leaf-200" : running ? "text-ivory" : "text-stone")}>
          {done && <BellRing className="size-6 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]" strokeWidth={1.6} aria-hidden />}
          {done ? "0:00" : clockText(left)}
        </span>
      </Sundial>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {done ? (
          <>
            <Button variant="outline" size="lg" className="col-span-2" onClick={() => timers$.dismiss(t.id)}>
              Stop alarm
            </Button>
            <Button variant="secondary" size="lg" onClick={() => timers$.add(t.id, 60)} aria-label="Add one minute">
              +1 min
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={() => (running ? timers$.pause(t.id) : timers$.resume(t.id))}>
              {running ? <Pause className="size-5" strokeWidth={1.6} aria-hidden /> : <Play className="size-5" strokeWidth={1.6} aria-hidden />}
              {running ? "Pause" : "Resume"}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => timers$.add(t.id, 60)} aria-label="Add one minute">
              +1 min
            </Button>
            <Button variant="secondary" size="lg" className="text-stone" onClick={() => timers$.cancel(t.id)}>
              <X className="size-5" strokeWidth={1.6} aria-hidden />
              Cancel
            </Button>
          </>
        )}
      </div>
      {done && (
        <button type="button" onClick={() => timers$.start({ recipeKey, step, label, totalSec })} className="press t-callout mt-2 inline-flex h-11 items-center gap-1.5 rounded-field px-1 font-semibold text-stone hover:text-ivory">
          <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden />
          Restart {durationText(totalSec)}
        </button>
      )}
    </div>
  );
}
