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

/** Programme week number (1-based) and total weeks. */
export function programmeWeek(plan: PlanInput, today: ISODate) {
  const total = Math.max(1, Math.ceil(daysBetween(plan.startDate, plan.targetDate) / 7));
  const elapsed = daysBetween(plan.startDate, today);
  const week = Math.min(total, Math.max(1, Math.floor(elapsed / 7) + 1));
  return { week, total };
}
