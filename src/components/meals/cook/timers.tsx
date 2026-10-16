"use client";

// The step-timer store shared by the recipe screen and cooking mode. Timers are kept on this
// device (localStorage) so one started on the recipe screen is still running in cooking mode,
// after a reload, or when the phone wakes up. The alarm (chime + vibration) is played by
// <TimerAlarm/>, which both screens mount.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { chime, unlockAudio } from "@/components/workout/audio";
import { haptic } from "@/lib/haptics";
import { useNowSec } from "@/lib/live-clock";
import { addTime, isRinging, pauseTimer, resumeTimer, sanitizeTimers, startTimer, timerId, type CookTimer } from "./timer-model";

const KEY = "pgg.meals.timers";
const SOUND_KEY = "pgg.meals.timer-sound";

let timers: CookTimer[] = [];
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    timers = sanitizeTimers(JSON.parse(localStorage.getItem(KEY) ?? "[]"), Date.now());
  } catch {
    timers = [];
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      timers = sanitizeTimers(JSON.parse(e.newValue ?? "[]"), Date.now());
    } catch {
      timers = [];
    }
    subs.forEach((f) => f());
  });
}

function save(next: CookTimer[]) {
  timers = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: timers still work for this page */
  }
  subs.forEach((f) => f());
}

function subscribe(cb: () => void) {
  load();
  subs.add(cb);
  return () => subs.delete(cb);
}

const EMPTY: CookTimer[] = [];

/** Every stored timer (running, paused or finished-but-not-dismissed). */
export function useTimers(): CookTimer[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return timers;
    },
    () => EMPTY,
  );
}

const update = (id: string, f: (t: CookTimer) => CookTimer | null) => {
  const next: CookTimer[] = [];
  for (const t of timers) {
    if (t.id !== id) next.push(t);
    else {
      const u = f(t);
      if (u) next.push(u);
    }
  }
  save(next);
};

export const timers$ = {
  /** Start (or restart) the timer for a step. Call from a tap: it also unlocks audio on iOS. */
  start(input: { recipeKey: string; step: number; label: string; totalSec: number }) {
    unlockAudio();
    const t = startTimer(input, Date.now());
    save([...timers.filter((x) => x.id !== t.id), t]);
  },
  pause: (id: string) => update(id, (t) => pauseTimer(t, Date.now())),
  resume: (id: string) => {
    unlockAudio();
    update(id, (t) => resumeTimer(t, Date.now()));
  },
  add: (id: string, sec: number) => update(id, (t) => addTime(t, sec, Date.now())),
  /** Stop the alarm (the timer leaves the list). */
  dismiss: (id: string) => update(id, (t) => ({ ...t, dismissedAt: Date.now() })),
  /** Cancel a running or paused timer. */
  cancel: (id: string) => update(id, () => null),
  get: (recipeKey: string, step: number) => {
    load();
    return timers.find((t) => t.id === timerId(recipeKey, step)) ?? null;
  },
};

export function readTimerSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeTimerSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/**
 * Rings finished timers: a chime (when sound is on and the browser allows audio) and a
 * vibration where supported, repeated every 4 s for up to a minute until dismissed. Renders
 * nothing; a polite live region announces the finish for screen readers.
 */
export function TimerAlarm({ sound = true }: { sound?: boolean }) {
  const now = useNowSec();
  const all = useTimers();
  const lastRing = useRef(new Map<string, number>());
  const announce = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!now) return;
    const ms = now * 1000;
    for (const t of all) {
      if (!isRinging(t, ms)) continue;
      const doneAt = t.endAt ?? ms;
      if (ms - doneAt > 60_000) continue; // a minute of alarms is enough
      const last = lastRing.current.get(t.id) ?? 0;
      if (ms - last < 4000) continue;
      lastRing.current.set(t.id, ms);
      if (sound) chime();
      haptic([180, 90, 180]);
      if (!t.rangAt) {
        update(t.id, (x) => ({ ...x, rangAt: ms }));
        if (announce.current) announce.current.textContent = `Timer done: ${t.label}`;
      }
    }
  }, [now, all, sound]);
  return <p ref={announce} className="sr-only" aria-live="polite" />;
}
