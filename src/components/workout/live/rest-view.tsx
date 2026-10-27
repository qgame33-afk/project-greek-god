"use client";

import { useState } from "react";
import { SkipForward } from "lucide-react";
import { cn } from "@/lib/cn";
import { elapsedSec, endedAgoSec, formatClock, remainingSec, type RestState } from "@/lib/workout/rest";
import { useClockSec } from "../rest";
import { effortText } from "@/components/training/format";
import { spokenTime } from "./words";

const nowSec = () => Math.floor(Date.now() / 1000);
const ringKey = (r: RestState) => `${r.startSec}:${r.endSec}:${r.total}:${r.pausedRemaining ?? "run"}`;

/**
 * The rest ring (docs/DESIGN-V3-SIMPLE.md §4.2.4): 252 px (196 px in the short layout), stroke 12,
 * white draining on --track. The drain is one CSS animation started with a negative delay, keyed
 * per rest, so it never drifts; it keeps moving under reduced motion (`motion-keep`) because it
 * carries information. "Rest" over the timer; at 0:00 "Rest over · 0:12" counts up in --text-2.
 */
export function RestRing({ rest }: { rest: RestState }) {
  return <Ring key={ringKey(rest)} rest={rest} />;
}

function Ring({ rest }: { rest: RestState }) {
  const [elapsed] = useState(() => elapsedSec(rest, nowSec()));
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const over = rem === 0;
  const ago = endedAgoSec(rest, now);
  const size = 252;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto grid aspect-square w-[252px] place-items-center short:w-[196px]" role="timer" aria-label={over ? `Rest over, ${spokenTime(ago)} ago` : `Rest, ${spokenTime(rem)} left`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {!over && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--text)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            className="wk-ring-arc motion-keep"
            style={{ "--wk-c": `${c}px`, "--wk-dur": `${Math.max(1, rest.total)}s`, "--wk-delay": `-${elapsed}s` } as React.CSSProperties}
          />
        )}
      </svg>
      <div aria-hidden className="relative text-center">
        <p className="t-row text-fg-2">{over ? "Rest over" : "Rest"}</p>
        <p className={cn("t-timer tabular-nums", over ? "text-fg-2" : "text-fg")}>{formatClock(over ? ago : rem)}</p>
      </div>
    </div>
  );
}

/** −15 · Skip · +15 (§4.2.4): three 56 px secondary pills. */
export function RestControls({ onAdjust, onSkip }: { onAdjust: (d: number) => void; onSkip: () => void }) {
  const cls = "press flex h-14 items-center justify-center gap-2 rounded-pill bg-control text-fg t-button";
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <button type="button" className={cls} aria-label="15 seconds less rest" onClick={() => onAdjust(-15)}>
        −15
      </button>
      <button type="button" className={cls} onClick={onSkip}>
        <SkipForward className="size-5" strokeWidth={1.9} aria-hidden /> Skip
      </button>
      <button type="button" className={cls} aria-label="15 seconds more rest" onClick={() => onAdjust(15)}>
        +15
      </button>
    </div>
  );
}

/** The compact rest card under a win card or the tip (§4.2.5): "Rest 1:51", +15, Skip. */
export function CompactRest({ rest, onAdjust, onSkip }: { rest: RestState; onAdjust: (d: number) => void; onSkip: () => void }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const over = rem === 0;
  const ago = endedAgoSec(rest, now);
  const pill = "press flex h-14 items-center justify-center gap-2 rounded-pill bg-control px-5 text-fg t-button";
  return (
    <div className="flex items-center gap-2.5 rounded-card bg-surface py-3 pl-5 pr-3">
      <div className="min-w-0 flex-1" role="timer" aria-label={over ? `Rest over, ${spokenTime(ago)} ago` : `Rest, ${spokenTime(rem)} left`}>
        <p className="t-label" aria-hidden>
          {over ? "Rest over" : "Rest"}
        </p>
        <p className={cn("t-num tabular-nums", over ? "text-fg-2" : "text-fg")} aria-hidden>
          {formatClock(over ? ago : rem)}
        </p>
      </div>
      <button type="button" className={pill} aria-label="15 seconds more rest" onClick={() => onAdjust(15)}>
        +15
      </button>
      <button type="button" className={pill} onClick={onSkip}>
        <SkipForward className="size-5" strokeWidth={1.9} aria-hidden /> Skip
      </button>
    </div>
  );
}

const TANK = [
  { v: 0, label: "0" },
  { v: 1, label: "1" },
  { v: 2, label: "2" },
  { v: 3, label: "3+" },
];

/**
 * "Left in the tank?" (§4.2.4): four 44 px chips 0 · 1 · 2 · 3+ with the lift's effort target in
 * words ("To failure", "Stop with 1–2 reps left"; `aim` is the RIR text "0", "1–2"). Writes `rir`
 * of the set just logged; tapping the chosen chip again clears it. Hidden in the short layout.
 */
export function TankRow({ value, aim, onChange, className }: { value: number | null; aim: string | null; onChange: (v: number | null) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)} role="group" aria-label="Reps left in the tank">
      <div className="min-w-0 flex-1">
        <p className="t-row">Left in the tank?</p>
        {aim && <p className="t-label">{effortText(aim)}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {TANK.map((c) => {
          const on = value != null && (c.v === 3 ? value >= 3 : value === c.v);
          return (
            <button
              key={c.v}
              type="button"
              aria-pressed={on}
              aria-label={c.v === 3 ? "3 or more" : String(c.v)}
              onClick={() => onChange(on ? null : c.v)}
              className={cn("press t-row grid size-11 place-items-center rounded-full tabular-nums", on ? "bg-fg text-bg" : "bg-control text-fg")}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
