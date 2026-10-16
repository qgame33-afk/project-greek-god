// The user's transformation plan (start → goal between two dates) and the rules that
// colour progress against it. Pure — no React, no Supabase.

import { daysBetween, type ISODate } from "@/lib/dates";
import { round } from "@/lib/units";

export interface PlanInput {
  startDate: ISODate;
  targetDate: ISODate;
  startLb: number;
  goalLb: number;
}

interface ProfileLike {
  start_date?: string | null;
  target_date?: string | null;
  start_weight_lb?: number | string | null;
  goal_weight_lb?: number | string | null;
}

export const DEFAULT_START_LB = 163;
export const DEFAULT_GOAL_LB = 183;

/** Plan parameters from a profile row, falling back to the programme defaults. */
export function planFromProfile(p: ProfileLike | null | undefined, today: ISODate): PlanInput {
  const startLb = Number(p?.start_weight_lb ?? DEFAULT_START_LB);
  const goalLb = Number(p?.goal_weight_lb ?? DEFAULT_GOAL_LB);
  return {
    startDate: p?.start_date ?? today,
    targetDate: p?.target_date ?? "2027-08-01",
    startLb: Number.isFinite(startLb) ? startLb : DEFAULT_START_LB,
    goalLb: Number.isFinite(goalLb) ? goalLb : DEFAULT_GOAL_LB,
  };
}

/** Planned weekly change r = (goal − start) ÷ programme weeks. Null when the dates make no sense. */
export function planRatePerWeek(plan: PlanInput): number | null {
  const days = daysBetween(plan.startDate, plan.targetDate);
  if (days <= 0) return null;
  return round(((plan.goalLb - plan.startLb) / days) * 7, 3);
}

export type Tone = "success" | "warning" | "neutral";

/**
 * Delta colour follows the plan, not the sign (DESIGN §5.3): a weekly change between 0.5r
 * and 1.6r is success, above 2r is a warning ("Faster than plan"), anything else is neutral.
 * Works for a losing plan too because it compares the ratio to r.
 */
export function rateTone(ratePerWeek: number | null | undefined, planRate: number | null | undefined): Tone {
  if (ratePerWeek == null || planRate == null || !Number.isFinite(ratePerWeek) || planRate === 0) return "neutral";
  const q = ratePerWeek / planRate;
  if (q >= 0.5 && q <= 1.6) return "success";
  if (q > 2) return "warning";
  return "neutral";
}

/** Same rule for a change over `days` days (e.g. a 30-day change), scaled to weekly. */
export function changeTone(change: number | null | undefined, days: number, planRate: number | null | undefined): Tone {
  if (change == null || days <= 0) return "neutral";
  return rateTone((change / days) * 7, planRate);
}

/** Programme week number (1-based) and total weeks. */
export function programmeWeek(plan: PlanInput, today: ISODate) {
  const total = Math.max(1, Math.ceil(daysBetween(plan.startDate, plan.targetDate) / 7));
  const elapsed = daysBetween(plan.startDate, today);
  const week = Math.min(total, Math.max(1, Math.floor(elapsed / 7) + 1));
  return { week, total };
}
