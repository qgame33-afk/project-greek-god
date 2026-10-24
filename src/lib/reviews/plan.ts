// Pure "what was planned on this date" resolution, shared by monthly reviews and the
// reminder scheduler (both run outside React, so they can't use the client planFor()).
// Delegates to the one plan resolver (lib/training/programs resolvePlanKey): an explicit
// day_plans override wins (program-aware), else the weekly schedule merged over the active
// program's default week, else rest.

import type { ISODate } from "@/lib/dates";
import { activeProgram, programSince, resolvePlanKey, scheduleFor } from "@/lib/training/programs";
import type { ProgramId } from "@/lib/training/types";

export type PlannedKey = string; // a template key or "rest"

/** An override as stored: its key alone, or with the row's note. */
export type PlanOverride = PlannedKey | { template_key: PlannedKey; note?: string | null };

/** The weekly schedule merged over the active program's default week (prefs decide the program). */
export function scheduleFrom(weekly: unknown, prefs?: unknown): Record<string, PlannedKey> {
  return scheduleFor({ weekly_schedule: weekly, prefs });
}

/** The program context resolvePlanKey needs, from a profile's prefs and weekly schedule. */
export function planContext(weekly: unknown, prefs: unknown): { program: ProgramId; since: ISODate | null } {
  const program = activeProgram({ weekly_schedule: weekly, prefs });
  return { program, since: programSince(prefs, program) };
}

export function plannedKey(
  date: ISODate,
  schedule: Record<string, PlannedKey>,
  overrides: Map<ISODate, PlanOverride> | Record<ISODate, PlanOverride>,
  ctx: { program: ProgramId; since: ISODate | null } = { program: "arnold", since: null },
): PlannedKey {
  const o = overrides instanceof Map ? overrides.get(date) : overrides[date];
  const row = o == null ? null : typeof o === "string" ? { template_key: o } : o;
  return resolvePlanKey(date, schedule, row, ctx);
}
