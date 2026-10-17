"use client";

import { useEffect, useRef } from "react";
import { LaurelSprig } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import { formatClock, remainingSec, type RestState } from "@/lib/workout/rest";
import { useClockSec } from "../rest";

export type Moment =
  | { kind: "record"; id: number; name: string; e1rm: string; gain: string; spoken: string }
  | { kind: "first"; id: number; name: string; spoken: string };

function KeepLifting({ rest }: { rest: RestState | null }) {
  const now = useClockSec();
  const rem = rest ? remainingSec(rest, now) : 0;
  return (
    <>
      Keep lifting
      {rem > 0 && <span className="tnum text-stone"> · {formatClock(rem)}</span>}
    </>
  );
}

/**
 * The Gold-Leaf Record banner (§3.2.6): slides over the lift header — never over the deck —
 * `NEW RECORD · Bench Press · e1RM 228 (+6)` with one button, `Keep lifting · 2:41`, whose label
 * is the live rest countdown. Any tap anywhere dismisses it (and still reaches its target); it
 * fades on its own after 4 s (a first benchmark: 2 s, no laurel). Announced once, assertively.
 * The deck stays live the whole time.
 */
export function RecordBanner({ moment, rest, onDismiss }: { moment: Moment; rest: RestState | null; onDismiss: () => void }) {
  const done = useRef(onDismiss);
  useEffect(() => {
    done.current = onDismiss;
  });
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), moment.kind === "record" ? 4000 : 2000);
    // armed on the next frame, so the tap that logged the set doesn't dismiss its own moment
    let armed = false;
    const raf = window.requestAnimationFrame(() => (armed = true));
    const any = () => armed && done.current();
    document.addEventListener("pointerdown", any, true);
    return () => {
      window.clearTimeout(t);
      window.cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", any, true);
    };
  }, [moment.id, moment.kind]);

  const record = moment.kind === "record";
  return (
    <div className="pointer-events-none">
      <div
        className={cn(
          "wk-rise pointer-events-auto flex items-center gap-3 rounded-card bg-m2 px-4 py-3 shadow-(--e2)",
          record ? "shadow-[inset_0_0_0_1px_var(--leaf-line),var(--e2)]" : "shadow-[inset_0_0_0_1px_var(--vein-3),var(--e2)]",
        )}
      >
        <p className="sr-only" role="alert">
          {moment.spoken}
        </p>
        {record && <LaurelSprig aria-hidden className="size-7 shrink-0 text-leaf-300" strokeWidth={1.5} />}
        <div aria-hidden className="min-w-0 flex-1">
          <p className={cn("t-eyebrow truncate", record ? "!text-leaf-300" : "!text-ivory")}>{record ? "New record" : "First benchmark"}</p>
          <p className="t-title-3 mt-0.5 truncate text-ivory">{moment.name}</p>
          {record && (
            <p className="t-num-s mt-0.5 text-stone">
              e1RM <span className="text-ivory">{moment.e1rm}</span> <span className="text-leaf-300">{moment.gain}</span>
            </p>
          )}
        </div>
        {record && (
          <button
            type="button"
            onClick={onDismiss}
            className="press t-callout h-11 shrink-0 rounded-full px-3.5 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]"
          >
            <KeepLifting rest={rest} />
          </button>
        )}
      </div>
    </div>
  );
}
