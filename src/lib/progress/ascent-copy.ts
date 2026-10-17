// Copy for the Mountain (docs/DESIGN-V2.md §3.6.1). Every number here is read from pace(),
// calorieSuggestion() or terraces(); nothing is recomputed. Pure.

import type { CalorieSuggestion } from "@/lib/bodyweight";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { dayMonth, type Pace } from "./pace";

const w2 = (lb: number, unit: WeightUnit) => {
  const v = round(toDisplayWeight(lb, unit), 2);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
};
const plain2 = (lb: number, unit: WeightUnit) => {
  const v = round(toDisplayWeight(lb, unit), 2);
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
};
const bandTxt = (b: { min: number; max: number }, unit: WeightUnit) => {
  const f = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  return b.min === b.max ? `${f(b.min)} ${unit}` : `${f(b.min)}–${f(b.max)}`;
};

/**
 * The explanation under the verdict: "You gain +0.40 lb a week. Anything from 0.28 to 0.40 lands
 * you in 180–185 by 1 Aug." Null parts are left out; never a guess.
 */
export function mountainExplain(p: Pace, unit: WeightUnit): { text: string; proj: boolean } {
  const rate = p.rate.status === "ok" ? p.rate.lbPerWeek : null;
  const c = p.corridor;
  const by = p.target ? dayMonth(p.target, p.today) : null;
  if (p.verdict === "needs_data") return { text: `${p.detail}.`, proj: false };
  if (p.verdict === "arrived") return { text: `${p.detail}.`, proj: false };
  const verb = rate! >= 0 ? "gain" : "lose";
  const first = `You ${verb} ${w2(rate!, unit).replace("−", "")} ${unit} a week.`;
  if (!c || !p.band || !by) return { text: first, proj: false };
  const window = `${plain2(c.minRate, unit)} to ${plain2(c.maxRate, unit)}`;
  if (p.verdict === "above") return { text: `${first} ${window} is the lean-gain window that lands you in ${bandTxt(p.band, unit)} by ${by}.`, proj: true };
  return { text: `${first} Anything from ${window} lands you in ${bandTxt(p.band, unit)} by ${by}.`, proj: true };
}

/** Where the rate sits in the window, as the first half of the gauge's RULE call. */
export function windowPhrase(p: Pace): string | null {
  switch (p.verdict) {
    case "top":
      return "Top of the window.";
    case "on_pace":
      return "Inside the window.";
    case "below":
      return "Under the window.";
    case "above":
      return "Above the window.";
    case "arrived":
      return "Inside the goal band.";
    default:
      return null;
  }
}

/** The calorie rule's call, in words (§3.6.1 item 5). `since` names the calorie change it judged from. */
export function calorieCall(s: CalorieSuggestion, calories: number, unit: WeightUnit, today: string): { call: string; detail: string | null; next: number | null } {
  const sinceTxt = (since: string | null | undefined) => (since ? `since your calorie change on ${dayMonth(since, today)}` : "over the last 4 weeks");
  switch (s.kind) {
    case "cooldown":
      return { call: `Calories changed ${dayMonth(s.lastChange, today)}. Hold ${formatInt(calories)} kcal.`, detail: `The trend needs two weeks to respond. Next check ${dayMonth(s.nextCheck, today)}.`, next: null };
    case "insufficient":
      return {
        call: `Hold ${formatInt(calories)} kcal.`,
        detail: `The calorie rule needs 8 weigh-ins over two weeks ${sinceTxt(s.since)}. ${s.weighIns} so far.`,
        next: null,
      };
    case "on_track":
      return { call: `Hold ${formatInt(calories)} kcal.`, detail: `${cap(sinceTxt(s.since))}: ${w2(s.ratePerWeek, unit)} ${unit} a week against ${w2(s.targetRate, unit)} needed.`, next: null };
    case "increase":
    case "reassess": {
      const next = calories + s.delta;
      const sign = s.delta > 0 ? "+" : "−";
      return {
        call: `Consider ${sign}${formatInt(Math.abs(s.delta))} kcal a day, to ${formatInt(next)}.`,
        detail: `${cap(sinceTxt(s.since))}: ${w2(s.ratePerWeek, unit)} ${unit} a week against ${w2(s.targetRate, unit)} needed.${s.kind === "reassess" && s.earlyWater ? " The first two weeks include water and glycogen." : ""}`,
        next,
      };
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
