// The rule-based daily line under the hero greeting: one focus plus one number.
// "Push A today. Protein is the lever: 185 g." · "Legs A today. Jumps first, while you're fresh."
// Deterministic and built only from real data the caller passes in — no AI, no invented numbers.

import { readinessLine, type Guidance } from "@/lib/recovery/guidance";
import { formatInt } from "@/lib/units";

export interface CheckinFacts {
  sleepHours: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  pain: boolean;
}

export type PlanFacts = { kind: "train"; name: string; explosiveFirst: boolean; legs: boolean } | { kind: "rest" };

export interface DailyLineInput {
  plan: PlanFacts;
  /** State of today's session: none yet, in progress, or finished. */
  session: "none" | "active" | "done";
  /** Name of the active / finished session (falls back to the plan name). */
  sessionName?: string | null;
  volleyballToday: boolean;
  /** Distinct volleyball days in the last 7 (including today). */
  volleyballDays7: number;
  /** Today's recovery check-in (covers last night's sleep), or null. */
  checkin: CheckinFacts | null;
  protein: { eaten: number; goal: number };
  calories: { eaten: number; goal: number };
  sleepGoalH: number;
  /**
   * The Recovery screen's guidance for today. When it rests on a real check-in it decides the
   * training advice, so Today, Training and Recovery always say the same thing (SPEC §25).
   */
  readiness?: Pick<Guidance, "level" | "score" | "adjustments" | "hasCheckin" | "pain"> | null;
}

/** Sleep shown to the nearest quarter hour: 7.25 → "7.25", 8 → "8". */
export function fmtHours(h: number): string {
  const q = Math.round(h * 4) / 4;
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, "");
}

const LOW_SLEEP_GAP = 1.5; // hours under the goal that count as a short night

export function dailyLine(i: DailyLineInput): string {
  const proteinLeft = Math.max(0, Math.round(i.protein.goal - i.protein.eaten));
  const kcalLeft = Math.max(0, Math.round(i.calories.goal - i.calories.eaten));
  const sleep = i.checkin?.sleepHours ?? null;
  const shortNight = sleep != null && sleep < i.sleepGoalH - LOW_SLEEP_GAP ? sleep : null;
  const lowEnergy = i.checkin?.energy != null && i.checkin.energy <= 2 ? i.checkin.energy : null;
  const highFatigue = i.checkin?.fatigue != null && i.checkin.fatigue >= 4 ? i.checkin.fatigue : null;
  const sore = i.checkin?.soreness != null && i.checkin.soreness >= 4 ? i.checkin.soreness : null;
  const pain = !!i.checkin?.pain;
  const goalH = fmtHours(i.sleepGoalH);
  const planName = i.plan.kind === "train" ? i.plan.name : null;
  const name = i.sessionName || planName || "Training";

  if (i.session === "active") {
    return `${name} is underway. Log every set, then refuel.`;
  }

  if (i.session === "done") {
    if (proteinLeft > 0) return `${name} done. Protein next: ${proteinLeft} g to go.`;
    if (kcalLeft > i.calories.goal * 0.1) return `${name} done. ${formatInt(kcalLeft)} kcal left to fuel the recovery.`;
    return `${name} done and fuelled. Sleep ${goalH} h to lock it in.`;
  }

  const guided = i.readiness?.hasCheckin ? i.readiness : null;

  if (i.plan.kind === "train") {
    const n = i.plan.name;
    const r = guided ? readinessLine(guided, n) : null;
    if (r) return guided!.pain && guided!.level !== "recover" ? `${r} Skip anything that hurts.` : r;
    if (pain) return `${n} today. You noted pain, so skip anything that aggravates it.`;
    if (i.volleyballToday && (i.plan.legs || i.plan.explosiveFirst)) return `${n} today. Volleyball too, so the jumps are optional.`;
    if (i.volleyballToday) return `${n} today, volleyball later. Fuel both: ${formatInt(i.calories.goal)} kcal.`;
    if (shortNight != null) return `${n} today on ${fmtHours(shortNight)} h of sleep. Keep 2 reps in reserve.`;
    if (lowEnergy != null) return `${n} today. Energy is ${lowEnergy}/5, so warm up longer and keep 2 in reserve.`;
    if (highFatigue != null) return `${n} today. Fatigue is ${highFatigue}/5, so keep 2 reps in reserve.`;
    if (i.plan.legs && i.volleyballDays7 >= 3) return `${n} today. ${i.volleyballDays7} volleyball days this week, so trim the jumps.`;
    if (i.plan.explosiveFirst) return `${n} today. Jumps first, while you're fresh.`;
    if (i.protein.eaten > 0 && proteinLeft > 0) return `${n} today. Protein is the lever: ${proteinLeft} g to go.`;
    return `${n} today. Protein is the lever: ${Math.round(i.protein.goal)} g.`;
  }

  // Rest day
  const r = guided ? readinessLine(guided, null) : null;
  if (r) return r;
  if (pain) return "Rest day. You noted pain, so keep it to gentle movement.";
  if (shortNight != null) return `Rest day. Last night was ${fmtHours(shortNight)} h, so aim for ${goalH} h tonight.`;
  if (sore != null) return `Rest day. Soreness is ${sore}/5: walk, stretch, nothing heavy.`;
  if (i.volleyballToday) return `Rest day, volleyball later. Eat to target: ${formatInt(i.calories.goal)} kcal.`;
  return `Rest day. Walk, stretch, sleep ${goalH} h.`;
}
