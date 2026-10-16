// Labels and short copy for the live workout. Numbers first, no hype.

import type { Suggestion } from "@/lib/training/progression";
import type { MuscleGroup } from "@/lib/training/types";
import { round } from "@/lib/units";
import { formatClock } from "./rest";

const MUSCLE: Record<MuscleGroup, string> = {
  chest: "Chest",
  upper_chest: "Upper chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  lower_back: "Lower back",
  biceps: "Biceps",
  brachialis: "Brachialis",
  forearms: "Forearms",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  grip: "Grip",
  full_body: "Full body",
};

export function muscleLabel(m: MuscleGroup) {
  return MUSCLE[m] ?? m;
}

/** "Chest · Front delts · Triceps" — primary first, at most four. */
export function musclesLine(primary: MuscleGroup[], secondary: MuscleGroup[], max = 4) {
  return [...new Set([...primary, ...secondary])].slice(0, max).map(muscleLabel).join(" · ");
}

/** "5–8", "8", "30–45 s", "8 each". */
export function repRange(low: number | null, high: number | null, unit: string | null): string {
  if (low == null && high == null) return "—";
  const lo = low ?? high!;
  const hi = high ?? low!;
  const r = lo === hi ? `${lo}` : `${lo}–${hi}`;
  if (unit === "sec") return `${r} s`;
  if (unit === "each") return `${r} each`;
  return r;
}

/** Target chips: "3 × 5–8" · "RIR 1–2" · "Rest 3:00". */
export function targetChips(o: { sets: number; low: number | null; high: number | null; unit: string | null; rir: string | null; restSec: number | null }): string[] {
  const out = [`${o.sets} × ${repRange(o.low, o.high, o.unit)}`];
  if (o.rir) out.push(o.rir === "Fresh" ? "Stay fresh" : `RIR ${o.rir}`);
  if (o.restSec) out.push(`Rest ${formatClock(o.restSec)}`);
  return out;
}

/**
 * Rewrites "180 lb" inside a sentence for kg users, so the progression engine's reasons
 * read correctly in either unit.
 */
export function localizeLb(text: string, unit: "lb" | "kg"): string {
  if (unit === "lb") return text;
  return text.replace(/(\d+(?:\.\d+)?) lb\b/g, (_, n: string) => {
    const kg = round(Number(n) / 2.2046226218, 1);
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
  });
}

/**
 * The SUGGESTED line's headline: "185 lb × 5–8". Null when the suggestion carries no load
 * (first session, jumps, bodyweight) — the reason sentence stands alone then.
 */
export function suggestionHeadline(s: Suggestion, fmtLoad: (lb: number) => string, unit: string, bodyweight = false): string | null {
  const range = repRange(s.target.low, s.target.high, s.target.unit);
  if (s.weightLb == null) {
    if (s.kind === "explosive") return `${range} · max quality`;
    if (s.kind === "first") return "Find your baseline";
    if (s.kind === "bodyweight") return `Bodyweight × ${range}`;
    return null;
  }
  if (bodyweight) return `BW +${fmtLoad(s.weightLb)} ${unit} × ${range}`;
  return `${fmtLoad(s.weightLb)} ${unit} × ${range}`;
}

/**
 * The sentence under SUGGESTED, in the user's unit. A first-ever bodyweight movement gets
 * bodyweight wording (the engine's generic line talks about choosing a weight).
 */
export function suggestionReason(s: Suggestion, tracking: string, unit: "lb" | "kg"): string {
  if (s.kind === "first" && (tracking === "bodyweight_reps" || tracking === "reps")) {
    const reps = repRange(s.target.low, s.target.high, s.target.unit);
    return `First time: bodyweight only, clean reps up to ${reps}. Stop a rep or two short of failure. This sets your baseline.`;
  }
  return localizeLb(s.reason, unit);
}

/** "+6" lb or "+2.5" kg — an e1RM gain in the user's unit, never "+0". */
export function formatGain(gainLb: number, unit: "lb" | "kg"): string {
  if (unit === "lb") return `+${Math.max(1, Math.round(gainLb))}`;
  const kg = gainLb / 2.2046226218;
  const v = kg < 10 ? Math.max(0.5, Math.round(kg * 2) / 2) : Math.round(kg);
  return `+${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

/** A YouTube search for the movement — an optional demonstration, clearly external. */
export function demoUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise technique`)}`;
}

export function modeLabel(mode: string | null | undefined) {
  if (mode === "deload") return "Deload week";
  if (mode === "intro") return "Intro volume";
  return "Standard";
}
