"use client";

// Spotlight Rest Timer: a compact 104px dock, an opt-in full-screen focus mode and a
// desktop panel. Everything derives from the persisted endSec, so refreshes and
// backgrounding never lose time. Only the digits/meter subscribe to the 1 Hz clock.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Pause, Play, SkipForward } from "lucide-react";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useNowSec } from "@/lib/live-clock";
import {
  adjustRest,
  announcement,
  elapsedSec,
  endedAgoSec,
  endedWhileAway,
  formatClock,
  isFinalStretch,
  pauseRest,
  remainingSec,
  resumeRest,
  type RestState,
} from "@/lib/workout/rest";
import { chime } from "./audio";
import { getRest, setRest, useRest } from "./stores";

const nowSec = () => Math.floor(Date.now() / 1000);

/** The shared 1 Hz clock, never behind the wall clock (it can lag ~250 ms after idling). */
export function useClockSec() {
  const tick = useNowSec();
  return Math.max(tick, nowSec());
}
const ringKey = (r: RestState) => `${r.startSec}:${r.endSec}:${r.total}:${r.pausedRemaining ?? "run"}`;

/* -------------------------------------------------------------- actions */

export function restActions(sessionId: string) {
  return {
    adjust(delta: number) {
      const s = getRest(sessionId);
      if (s) setRest(sessionId, adjustRest(s, delta, nowSec()));
    },
    toggle() {
      const s = getRest(sessionId);
      if (!s) return;
      setRest(sessionId, s.pausedRemaining != null ? resumeRest(s, nowSec()) : pauseRest(s, nowSec()));
    },
    skip() {
      setRest(sessionId, null);
    },
  };
}

/* ------------------------------------------------------------- watcher */

/**
 * Headless: plays GO (haptic + optional chime) once when rest reaches zero, dismisses the
 * dock 1.2 s later, and speaks 60/30/10/0 in a polite live region.
 */
export function RestWatcher({ sessionId, chimeOn, hapticsOn, onDone }: { sessionId: string; chimeOn: boolean; hapticsOn: boolean; onDone?: (r: RestState) => void }) {
  const rest = useRest(sessionId);
  if (!rest) return null;
  return <RestTicker key={rest.startSec} sessionId={sessionId} rest={rest} chimeOn={chimeOn} hapticsOn={hapticsOn} onDone={onDone} />;
}

function RestTicker({ sessionId, rest, chimeOn, hapticsOn, onDone }: { sessionId: string; rest: RestState; chimeOn: boolean; hapticsOn: boolean; onDone?: (r: RestState) => void }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const prev = useRef<number | null>(null);
  const [msg, setMsg] = useState("");
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const a = announcement(prev.current, rem);
    prev.current = rem;
    if (a) setMsg(a);
  }, [rem]);

  useEffect(() => {
    if (rem > 0 || rest.pausedRemaining != null || rest.doneShown) return;
    const away = endedWhileAway(rest, nowSec());
    setRest(sessionId, { ...rest, doneShown: true });
    if (away) return;
    if (hapticsOn) haptic([14, 60, 14]);
    if (chimeOn) chime();
    const started = rest.startSec;
    // Not cleaned up on re-render on purpose: the state change above re-renders this
    // component, and the dismissal must still happen.
    window.setTimeout(() => {
      const cur = getRest(sessionId);
      if (cur && cur.startSec === started && remainingSec(cur, nowSec()) === 0) {
        setRest(sessionId, null);
        onDoneRef.current?.(cur);
      }
    }, 1200);
  }, [rem, rest, sessionId, chimeOn, hapticsOn]);

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {msg}
    </p>
  );
}

/* --------------------------------------------------------------- digits */

/** The live digits: m:ss, gold-200 in the last ten seconds, GO at zero. */
export function RestClock({ rest, className, goClassName }: { rest: RestState; className?: string; goClassName?: string }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const ago = endedAgoSec(rest, now);
  if (rem === 0 && rest.pausedRemaining == null && rest.doneShown && ago > 3) {
    return (
      <span className={cn("text-fg-2", className)} role="timer">
        +{formatClock(ago)}
      </span>
    );
  }
  if (rem === 0) {
    return (
      <span className={cn("relative inline-block text-gold-200", className, goClassName)} role="timer" aria-label="Rest over">
        GO
        <span aria-hidden className="wk-glow pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,rgb(213_172_103/.45),transparent)]" />
      </span>
    );
  }
  return (
    <span className={cn("tabular-nums", isFinalStretch(rem) ? "text-gold-200" : "text-fg", className)} role="timer" aria-label={`${formatClock(rem)} of rest left`}>
      {formatClock(rem)}
    </span>
  );
}

/** "Rest ended 0:42 ago" vs "REST · then Set 3 · 185 × 6". */
function RestCaption({ rest, className }: { rest: RestState; className?: string }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const ago = endedAgoSec(rest, now);
  const next = rest.next ? `${rest.next.exercise === rest.exercise ? "" : `${rest.next.exercise} · `}${rest.next.set}${rest.next.load ? ` · ${rest.next.load}` : ""}` : "Last set done";
  let text: ReactNode;
  if (rem === 0 && rest.doneShown && ago > 3) text = `Rest ended ${formatClock(ago)} ago · ${next}`;
  else if (rem === 0) text = `Up next · ${next}`;
  else if (rest.pausedRemaining != null) text = `Paused · then ${next}`;
  else text = `Rest · then ${next}`;
  return <span className={className}>{text}</span>;
}

/** Top-edge meter: marble, gold in the final ten seconds. Drains with one keyframe. */
function RestMeter({ rest }: { rest: RestState }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const style = {
    "--wk-dur": `${Math.max(1, rest.total)}s`,
    "--wk-delay": `-${elapsedSec(rest, nowSec())}s`,
  } as CSSProperties;
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-t-[20px] bg-white/[.06]" aria-hidden>
      <div
        key={ringKey(rest)}
        className={cn("wk-meter h-full w-full transition-colors duration-300", isFinalStretch(rem) || rem === 0 ? "bg-gold-400" : "bg-marble/80")}
        data-paused={rest.pausedRemaining != null || undefined}
        style={style}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- ring */

export function RestRing({ rest, size, stroke, children, className }: { rest: RestState | null; size: number; stroke: number; children?: ReactNode; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pad = 7;
  const r = (size - stroke) / 2 - pad;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const style = rest
    ? ({ "--wk-c": `${c}px`, "--wk-dur": `${Math.max(1, rest.total)}s`, "--wk-delay": `-${elapsedSec(rest, nowSec())}s` } as CSSProperties)
    : undefined;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1={size} x2={size} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A97E40" />
            <stop offset="55%" stopColor="#D5AC67" />
            <stop offset="100%" stopColor="#F3DDA8" />
          </linearGradient>
        </defs>
        <path d={ticks(cx, r + stroke / 2 + 3, 3, (i) => i % 15 !== 0)} stroke="var(--line-hair)" strokeWidth={1} />
        <path d={ticks(cx, r + stroke / 2 + 3, 3, (i) => i % 15 === 0)} stroke="var(--gold-800)" strokeWidth={1} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {rest && (
          <circle
            key={ringKey(rest)}
            className="wk-ring-arc"
            data-paused={rest.pausedRemaining != null || undefined}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={`url(#rg-${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={style}
          />
        )}
      </svg>
      <div className="relative z-10 flex flex-col items-center text-center">{children}</div>
    </div>
  );
}

function ticks(c: number, r1: number, len: number, include: (i: number) => boolean) {
  let d = "";
  for (let i = 0; i < 60; i++) {
    if (!include(i)) continue;
    const a = (i / 60) * Math.PI * 2;
    d += `M${(c + r1 * Math.cos(a)).toFixed(2)} ${(c + r1 * Math.sin(a)).toFixed(2)}L${(c + (r1 + len) * Math.cos(a)).toFixed(2)} ${(c + (r1 + len) * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}

/* ---------------------------------------------------------- compact dock */

function DockButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn("press grid size-[52px] shrink-0 place-items-center rounded-[14px] border border-line-strong bg-s3 text-fg hover:bg-s4", className)}
    >
      {children}
    </button>
  );
}

export function RestDock({ sessionId, rest, onFocus }: { sessionId: string; rest: RestState; onFocus: () => void }) {
  const a = restActions(sessionId);
  const now = useClockSec();
  const over = remainingSec(rest, now) === 0;
  return (
    <div
      role="region"
      aria-label="Rest timer"
      className="wk-up fixed inset-x-0 bottom-0 z-40 rounded-t-[20px] border-t border-line bg-s2 shadow-[var(--e3)] lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <RestMeter rest={rest} />
      <div className="mx-auto flex h-[101px] max-w-[720px] items-center gap-2 pl-4 pr-3">
        <button type="button" onClick={onFocus} className="press-soft min-w-0 flex-1 text-left" aria-label="Open the full-screen rest timer">
          <RestClock rest={rest} className="num-xl block leading-[.9]" />
          <RestCaption rest={rest} className="mt-1.5 block truncate text-[12.5px] font-semibold uppercase tracking-[0.06em] text-fg-2" />
        </button>
        {over && rest.doneShown ? (
          <button type="button" onClick={a.skip} className="press h-[52px] rounded-[14px] border border-line-strong bg-s3 px-5 text-[15px] font-bold text-fg">
            Dismiss
          </button>
        ) : (
          <>
            <DockButton label="Subtract 15 seconds" onClick={() => a.adjust(-15)}>
              <span className="num text-[17px] font-semibold">−15</span>
            </DockButton>
            <DockButton label="Add 15 seconds" onClick={() => a.adjust(15)}>
              <span className="num text-[17px] font-semibold">+15</span>
            </DockButton>
            <DockButton label="Skip rest" onClick={a.skip}>
              <SkipForward className="size-5" />
            </DockButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ focus mode */

export function RestFocus({ sessionId, rest, onClose }: { sessionId: string; rest: RestState; onClose: () => void }) {
  const a = restActions(sessionId);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const paused = rest.pausedRemaining != null;
  const next = rest.next;
  return (
    <div role="dialog" aria-modal="true" aria-label="Rest timer" className="wk-fade fixed inset-0 z-40 flex flex-col bg-bg-deep">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(70%_55%_at_50%_0%,rgb(213_172_103/.14),transparent_70%)]" />
      <div className="relative flex items-center justify-between px-3" style={{ paddingTop: "calc(var(--safe-top) + 6px)" }}>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Back to the workout" className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
          <ChevronDown className="size-6" />
        </button>
        <p className="eyebrow">Rest</p>
        <span className="size-11" />
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <RestRing rest={rest} size={264} stroke={14}>
          <RestClock rest={rest} className="num-hero" />
          {paused && <span className="eyebrow mt-3 text-gold-300">Paused</span>}
        </RestRing>
        {next && (
          <div className="max-w-[320px] text-center">
            <p className="eyebrow">Up next</p>
            <p className="mt-2 text-[18px] font-bold text-fg">{next.exercise}</p>
            <p className="num mt-1 text-[17px] font-medium text-fg-2">
              {next.set}
              {next.load && <span className="text-fg"> · {next.load}</span>}
            </p>
          </div>
        )}
      </div>
      <div className="relative grid grid-cols-4 gap-3 px-6 pt-4" style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)", minHeight: "35vh" }}>
        <FocusButton label="Subtract 15 seconds" onClick={() => a.adjust(-15)}>
          <span className="num text-[20px] font-semibold">−15</span>
        </FocusButton>
        <FocusButton label={paused ? "Resume rest" : "Pause rest"} onClick={a.toggle}>
          {paused ? <Play className="size-6" /> : <Pause className="size-6" />}
        </FocusButton>
        <FocusButton label="Add 15 seconds" onClick={() => a.adjust(15)}>
          <span className="num text-[20px] font-semibold">+15</span>
        </FocusButton>
        <FocusButton
          label="Skip rest"
          onClick={() => {
            a.skip();
            onClose();
          }}
        >
          <SkipForward className="size-6" />
        </FocusButton>
      </div>
    </div>
  );
}

function FocusButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="press grid size-16 place-items-center rounded-full border border-line-strong bg-s3 text-fg hover:bg-s4"
      >
        {children}
      </button>
      <span className="text-[11px] font-semibold text-fg-3" aria-hidden>
        {label.startsWith("Subtract") ? "−15 s" : label.startsWith("Add") ? "+15 s" : label.split(" ")[0]}
      </span>
    </div>
  );
}

/* --------------------------------------------------------- desktop panel */

export function RestPanel({ sessionId, rest, idleNext, onFocus }: { sessionId: string; rest: RestState | null; idleNext: string | null; onFocus: () => void }) {
  const a = restActions(sessionId);
  const paused = rest?.pausedRemaining != null;
  return (
    <section className="card-instrument p-5" aria-label="Rest timer">
      <p className="eyebrow">Rest</p>
      <div className="mt-4 flex items-center gap-5">
        <button type="button" onClick={rest ? onFocus : undefined} disabled={!rest} className="press-soft rounded-full disabled:cursor-default" aria-label={rest ? "Open the full-screen rest timer" : "Rest timer idle"}>
          <RestRing rest={rest} size={136} stroke={11}>
            {rest ? <RestClock rest={rest} className="num-md" /> : <span className="num-md text-fg-3">—</span>}
          </RestRing>
        </button>
        <div className="min-w-0 flex-1">
          {rest ? (
            <RestCaption rest={rest} className="text-[13px] font-semibold leading-snug text-fg-2" />
          ) : (
            <p className="text-[13px] leading-snug text-fg-2">Starts after each logged working set.{idleNext && <span className="mt-1.5 block font-semibold text-fg">Up next · {idleNext}</span>}</p>
          )}
        </div>
      </div>
      {rest && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <DockButton label="Subtract 15 seconds" onClick={() => a.adjust(-15)} className="w-full">
            <span className="num text-[17px] font-semibold">−15</span>
          </DockButton>
          <DockButton label={paused ? "Resume rest" : "Pause rest"} onClick={a.toggle} className="w-full">
            {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </DockButton>
          <DockButton label="Add 15 seconds" onClick={() => a.adjust(15)} className="w-full">
            <span className="num text-[17px] font-semibold">+15</span>
          </DockButton>
          <DockButton label="Skip rest" onClick={a.skip} className="w-full">
            <SkipForward className="size-5" />
          </DockButton>
        </div>
      )}
    </section>
  );
}
