"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { keys, readLocal, writeLocal } from "./local";

const GILD_START_MS = 300;
const SETTLE_MS = 1700;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The Unveiling (docs/DESIGN-V2.md §3.1.6): on the first Now render of each local day, once the hero
 * data has loaded (call this from a component that mounts with the data), the spotlight comes up and
 * the gold rises from yesterday's gild to today's. All content is final from frame 0 (only the
 * statue's light and gold move); any tap anywhere jumps to the end and still reaches its target; it
 * never plays twice in a day. Reduced motion: no motion. Not while a check-in field has focus.
 */
export function useUnveiling({ today, gild, blocked }: { today: string; gild: number; blocked: boolean }) {
  // decided once, at mount, from what this device last showed
  const [init] = useState(() => {
    const played = readLocal(keys.unveil) === today;
    if (played || blocked || prefersReducedMotion()) return { play: false, from: gild };
    const raw = readLocal(keys.gildLast);
    const last = raw == null ? 0 : Number(raw);
    return { play: true, from: Number.isFinite(last) ? clamp01(last) : 0 };
  });
  const [phase, setPhase] = useState<"hold" | "rise" | "done">(init.play ? "hold" : "done");
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    writeLocal(keys.unveil, today);
  }, [today]);

  // 300 ms of spotlight, then the gold rises; settled after the longest gild
  useEffect(() => {
    if (phase === "done") return;
    const t = window.setTimeout(() => setPhase(phase === "hold" ? "rise" : "done"), phase === "hold" ? GILD_START_MS : SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // any tap skips to the end and still reaches what was tapped (capture, never prevented)
  useEffect(() => {
    if (phase === "done") return;
    const end = () => {
      setSkip(true);
      setPhase("done");
    };
    window.addEventListener("pointerdown", end, { capture: true, passive: true });
    window.addEventListener("keydown", end, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", end, { capture: true });
      window.removeEventListener("keydown", end, { capture: true });
    };
  }, [phase]);

  // tomorrow's Unveiling rises from what the statue shows today
  useEffect(() => {
    if (phase === "done") writeLocal(keys.gildLast, String(Math.round(gild * 1000) / 1000));
  }, [phase, gild]);

  const playing = phase !== "done";
  return { playing, skip, fromP: init.play ? init.from : undefined, p: phase === "hold" ? init.from : gild };
}
