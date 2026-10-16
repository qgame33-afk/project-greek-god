// Pure "what was planned on this date" resolution, shared by monthly reviews and the
// reminder scheduler (both run outside React, so they can't use the client planFor()).
// Mirrors src/lib/data/training.ts planFor(): an explicit day_plans override wins, else
// the weekly schedule (merged over the program default), else rest.

import { weekday, type ISODate } from "@/lib/dates";
import { DEFAULT_SCHEDULE } from "@/lib/training/program";

export type PlannedKey = string; // a template key or "rest"

export function scheduleFrom(weekly: unknown): Record<string, PlannedKey> {
  const out: Record<string, PlannedKey> = { ...DEFAULT_SCHEDULE };
  if (weekly && typeof weekly === "object" && !Array.isArray(weekly)) {
    for (const [k, v] of Object.entries(weekly as Record<string, unknown>)) {
      if (/^[0-6]$/.test(k) && typeof v === "string" && v) out[k] = v;
    }
  }
  return out;
}

export function plannedKey(date: ISODate, schedule: Record<string, PlannedKey>, overrides: Map<ISODate, PlannedKey> | Record<ISODate, PlannedKey>): PlannedKey {
  const o = overrides instanceof Map ? overrides.get(date) : overrides[date];
  return o ?? schedule[String(weekday(date))] ?? "rest";
}
