"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { dayMonth, type Terrace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

const KEY = (lb: number) => `pgg.terrace.${lb}`;
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function seen(lb: number) {
  try {
    return window.localStorage.getItem(KEY(lb)) != null;
  } catch {
    return true; // no storage: never replay a moment we can't remember
  }
}
function remember(ts: Terrace[]) {
  try {
    for (const t of ts) if (t.reachedOn) window.localStorage.setItem(KEY(t.lb), t.reachedOn);
  } catch {
    /* private mode */
  }
}

/**
 * The Terrace moment (docs/DESIGN-V2.md §3.6.4): on the first Ascent visit after the trend
 * crosses a terrace not yet celebrated (localStorage pgg.terrace.<lb>), the highest such terrace
 * is celebrated once. Every reached terrace is remembered at the same time, so nothing repeats.
 */
export function useTerraceMoment(terraces: Terrace[], ready: boolean) {
  const [moment, setMoment] = useState<{ terrace: Terrace; fromLb: number } | null>(null);
  const key = terraces.map((t) => `${t.lb}:${t.reachedOn ?? ""}`).join("|");
  useEffect(() => {
    if (!ready) return;
    const fresh = terraces.filter((t) => t.reachedOn && !seen(t.lb));
    if (!fresh.length) return;
    const top = fresh.reduce((a, b) => (b.index > a.index ? b : a));
    remember(terraces);
    const prev = terraces.find((t) => t.index === top.index - 1);
    const id = window.setTimeout(() => setMoment({ terrace: top, fromLb: prev ? prev.lb : top.lb - 2.5 }), 0);
    return () => window.clearTimeout(id);
    // the terraces' content is what matters, not the array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);
  return { moment, dismiss: () => setMoment(null) };
}

/**
 * The title card over the chart: TERRACE III / 170 LB / REACHED 14 NOV. It fades in after the
 * climber's travel (800 ms) and the contour's Inscribe (700 ms); under reduced motion it is the
 * card only. It stays until tapped, and never blocks anything outside the chart.
 */
export function TerraceCard({ terrace, unit, today, onDismiss }: { terrace: Terrace; unit: WeightUnit; today: string; onDismiss: () => void }) {
  const [reduced] = useState(() => prefersReducedMotion());
  const lb = round(toDisplayWeight(terrace.lb, unit), 1);
  const lbText = Number.isInteger(lb) ? String(lb) : lb.toFixed(1);
  const reached = terrace.reachedOn ? dayMonth(terrace.reachedOn, today) : "";
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden rounded-card bg-obsidian/95 text-center"
      style={{ animation: `spot-in 600ms var(--ease-out) ${reduced ? 0 : 1500}ms both` }}
      aria-label={`Terrace ${NUMBER_WORDS[terrace.index] ?? terrace.index}${terrace.final ? ", Olympus" : ""}, ${lbText} ${unit === "kg" ? "kilograms" : "pounds"}, reached ${reached}. Tap to close.`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgb(236_200_140/.12),transparent_70%)]" />
      <span aria-hidden className="t-film relative text-ivory" style={{ fontSize: "max(1.5rem, 24px)" }}>
        {terrace.final ? "Olympus" : `Terrace ${terrace.numeral}`}
      </span>
      <span aria-hidden className="t-monument relative mt-1 text-leaf-300">
        {lbText}
      </span>
      <span aria-hidden className="t-eyebrow relative mt-2 text-leaf-300">
        {unit} · reached {reached}
      </span>
      <span aria-hidden className="t-meta relative mt-5 text-stone">
        Tap to close
      </span>
    </button>
  );
}
