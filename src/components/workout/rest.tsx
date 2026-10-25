"use client";

// Rest timer plumbing shared by Gym Mode's sundial (gym/RestDial) and the live slot: the 1 Hz
// clock, the −15 / +15 / pause / skip actions and the headless watcher (GO, chime and the
// 60/30/10/0 announcements). Everything derives from the persisted endSec, so refreshes and
// backgrounding never lose time.

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useNowSec } from "@/lib/live-clock";
import { adjustRest, announcement, endedWhileAway, pauseRest, remainingSec, resumeRest, type RestState } from "@/lib/workout/rest";
import { chime } from "./audio";
import { getRest, setRest, useRest } from "./stores";

const nowSec = () => Math.floor(Date.now() / 1000);

/** The shared 1 Hz clock, never behind the wall clock (it can lag ~250 ms after idling). */
export function useClockSec() {
  const tick = useNowSec();
  return Math.max(tick, nowSec());
}

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
export function RestWatcher({ sessionId, chimeOn, hapticsOn, onDone, keep }: { sessionId: string; chimeOn: boolean; hapticsOn: boolean; onDone?: (r: RestState) => void; keep?: boolean }) {
  const rest = useRest(sessionId);
  if (!rest) return null;
  return <RestTicker key={rest.startSec} sessionId={sessionId} rest={rest} chimeOn={chimeOn} hapticsOn={hapticsOn} onDone={onDone} keep={keep} />;
}

/**
 * `keep`: the rest is not dismissed after GO (the live slot, off the workout screen, goes on to
 * "Rest ended 0:42 ago"; the workout shows "Rest over" until the next set or Skip).
 */
function RestTicker({ sessionId, rest, chimeOn, hapticsOn, onDone, keep }: { sessionId: string; rest: RestState; chimeOn: boolean; hapticsOn: boolean; onDone?: (r: RestState) => void; keep?: boolean }) {
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
    if (keep) return;
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
  }, [rem, rest, sessionId, chimeOn, hapticsOn, keep]);

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {msg}
    </p>
  );
}
