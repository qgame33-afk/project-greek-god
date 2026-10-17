"use client";

import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { Sundial } from "@/components/art/Sundial";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";
import { clockTime } from "@/lib/workout/gym";
import { elapsedSec, endedAgoSec, formatClock, isFinalStretch, remainingSec, type RestState } from "@/lib/workout/rest";
import { restActions, useClockSec } from "../rest";

/** The arc is as wide as the column, up to 340 px; on short phones it gives the deck room. */
const DIAL_W = "w-full max-w-[300px] [@media(max-height:740px)]:max-w-[264px]";
/** 96 px minimum (§1.2.3); a little under the full t-timer so "1:12" sits inside the arc. */
const DIGITS = { fontSize: "clamp(96px, 25.5vw, 6.5rem)" };
const nowSec = () => Math.floor(Date.now() / 1000);
const ringKey = (r: RestState) => `${r.startSec}:${r.endSec}:${r.total}:${r.pausedRemaining ?? "run"}`;

/** "1 minute 12 seconds" for VoiceOver. */
function spoken(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return [m ? `${m} minute${m === 1 ? "" : "s"}` : "", s || !m ? `${s} second${s === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

/**
 * The sundial rest (§3.2.1, §3.2.3): a 180° arc that drains with the remaining rest (labelled as
 * remaining rest for VoiceOver), bezel ticks every 15 s, and the heavy tabular digits (t-timer,
 * 96–120 px). Idle, it shows the planned rest in ash: "Rest starts when you seal". Under it the
 * −15 · Skip · +15 controls (56 px). Final 10: leaf digits, a leaf outer stroke, one edge flash
 * and one pulse of the seal key (via `onZero`). Only the digits re-render each second. Tapping
 * the digits pauses and resumes. `variant="bar"` is the AX layout.
 */
export function RestDial({
  sessionId,
  rest,
  plannedSec,
  variant,
  onZero,
}: {
  sessionId: string;
  rest: RestState | null;
  /** The next set's rest, shown while idle. */
  plannedSec: number | null;
  variant: "arc" | "bar";
  onZero: () => void;
}) {
  const a = restActions(sessionId);
  return (
    <section aria-label="Rest" className="relative pt-2">
      {rest ? (
        <RunningDial key={ringKey(rest)} rest={rest} variant={variant} onZero={onZero} onToggle={a.toggle} />
      ) : (
        <IdleDial plannedSec={plannedSec} variant={variant} />
      )}
      <div className="mt-3 grid grid-cols-[1fr_1.25fr_1fr] gap-2">
        <RestButton label="Subtract 15 seconds of rest" disabled={!rest} onClick={() => a.adjust(-15)}>
          <span className="t-num-s">−15</span>
        </RestButton>
        <RestButton label="Skip rest" disabled={!rest} onClick={a.skip}>
          <SkipForward className="size-[18px]" strokeWidth={1.8} aria-hidden />
          <span className="text-[length:max(15px,0.9375rem)] font-semibold">Skip</span>
        </RestButton>
        <RestButton label="Add 15 seconds of rest" disabled={!rest} onClick={() => a.adjust(15)}>
          <span className="t-num-s">+15</span>
        </RestButton>
      </div>
    </section>
  );
}

function RestButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex h-14 items-center justify-center gap-2 rounded-btn bg-m2 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m3 active:bg-m3 disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein)]"
    >
      {children}
    </button>
  );
}

function IdleDial({ plannedSec, variant }: { plannedSec: number | null; variant: "arc" | "bar" }) {
  const digits = (
    <>
      <p className="t-eyebrow">Rest starts when you seal</p>
      <p className="t-timer mt-1 text-ash" style={DIGITS} aria-label={plannedSec ? `Planned rest ${spoken(plannedSec)}` : "No rest planned"}>
        {plannedSec ? formatClock(plannedSec) : "—"}
      </p>
    </>
  );
  return (
    <Sundial rest={null} variant={variant} label="Rest timer idle" className={variant === "arc" ? DIAL_W : undefined}>
      {digits}
    </Sundial>
  );
}

function RunningDial({ rest, variant, onZero, onToggle }: { rest: RestState; variant: "arc" | "bar"; onZero: () => void; onToggle: () => void }) {
  // The drain is a CSS animation started with a negative delay: computed once per rest (this
  // component is keyed by it), never per tick, so the arc never drifts.
  const [elapsed] = useState(() => elapsedSec(rest, nowSec()));
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const ago = endedAgoSec(rest, now);
  const paused = rest.pausedRemaining != null;
  const final = isFinalStretch(rem) && !paused;
  const ended = rem === 0 && !paused && rest.doneShown && ago > 3;
  const go = rem === 0 && !paused && !ended;
  const [flash, setFlash] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (rem > 0 || paused || fired.current || rest.doneShown) return;
    fired.current = true;
    onZero();
    if (prefersReducedMotion()) return;
    const on = window.setTimeout(() => setFlash(true), 0);
    const off = window.setTimeout(() => setFlash(false), 450);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [rem, paused, rest.doneShown, onZero]);

  const eyebrow = ended ? "Rest ended" : go ? "Rest over · go" : paused ? "Paused · tap to resume" : `Rest · ends ${clockTime(rest.endSec * 1000)}`;
  const text = ended ? formatClock(ago) : go ? "GO" : formatClock(rem);
  const label = ended ? `Rest ended ${spoken(ago)} ago` : go ? "Rest over. Next set." : paused ? `Rest paused, ${spoken(rem)} left. Resume` : `${spoken(rem)} of rest left. Pause`;
  return (
    <Sundial
      rest={{ total: rest.total, elapsed, paused, key: ringKey(rest) }}
      final={final}
      variant={variant}
      label={ended ? "Rest ended" : "Remaining rest"}
      className={variant === "arc" ? DIAL_W : undefined}
    >
      <p className={cn("t-eyebrow", (final || go) && "!text-leaf-200")}>{eyebrow}</p>
      <button
        type="button"
        onClick={ended || go ? undefined : onToggle}
        aria-label={label}
        aria-disabled={ended || go || undefined}
        className={cn("t-timer press-soft mt-1 rounded-card px-2", ended || paused ? "text-stone" : go || final ? "text-leaf-200" : "text-ivory")}
        style={text.length > 4 ? { fontSize: "96px" } : DIGITS}
      >
        <span role="timer" aria-hidden>
          {text}
        </span>
        {ended && <span className="t-title-3 ml-1.5 align-baseline text-ash">ago</span>}
      </button>
      {flash && <span aria-hidden className="wk-edge pointer-events-none fixed inset-0 z-(--z-deck) shadow-[inset_0_0_0_3px_var(--leaf-200),inset_0_0_80px_var(--leaf-line)]" />}
    </Sundial>
  );
}
