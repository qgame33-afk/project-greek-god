"use client";

import { useMemo } from "react";
import { dayState, type DayInput, type DayState } from "@/lib/now/day-engine";
import { normalizeSettings } from "@/lib/reminders/schedule";
import { dawnCheckinDone } from "@/lib/recovery/prefill";
import { toMinutes } from "@/lib/prefs";
import { closingDate, minuteOn } from "@/lib/today/now";
import { useMinuteOfDay } from "./clock";
import { keys, useLocal } from "./local";
import type { NowModel } from "./useNowData";

/**
 * Assembles the Day Engine's input (docs/DESIGN-V2.md §4.2, §5.3) from Now's data: today's plan at
 * his usual training time (prefs.day.trainAt, else the workout reminder), the session, the planned
 * meals placed with plannedTime(), Dawn's check-in and weigh-in, and the per-device flags (Dawn put
 * off, the day sealed). Re-evaluates every minute and on focus.
 */
export function useDayInput(m: NowModel | null): { input: DayInput | null; state: DayState | null; now: number; sealDate: string } {
  const now = useMinuteOfDay();
  const date = m?.today ?? "";
  const later = useLocal(keys.dawnLater(date));
  // after midnight (before 05:00) the Seal card closes yesterday, so its seal is yesterday's
  const sealDate = date ? closingDate(date, now) : "";
  const sealed = useLocal(keys.sealed(sealDate)) != null;

  const input = useMemo<DayInput | null>(() => {
    if (!m) return null;
    const t = m.template;
    const train = t ? { key: t.key, name: t.name, at: m.trainAt, durationMin: m.durationMin } : null;
    const plan: DayInput["plan"] = m.volleyballToday ? { kind: "volleyball", train: train ?? undefined } : train ? { kind: "train", ...train } : { kind: "rest" };

    // the session: one running (from any day) or finished today
    let session: DayInput["session"] = { status: "none" };
    if (m.active) session = { status: "active", startedAt: minuteOn(m.active.started_at, date) ?? 0 };
    else if (m.doneToday) session = { status: "done", endedAt: minuteOn(m.doneToday.ended_at, date) ?? now };

    const checkInDone = dawnCheckinDone(m.todayRec);
    const weighInDone = !!m.weighToday;
    const laterAt = later != null && Number.isFinite(Number(later)) ? Number(later) : null;
    // when Dawn was finished (the later of the two answers) or put off
    let dawnDoneAt: number | null = null;
    if (checkInDone && weighInDone) {
      const a = minuteOn(m.todayRec?.updated_at, date);
      const b = minuteOn(m.weighToday?.measured_at, date);
      dawnDoneAt = a != null && b != null ? Math.max(a, b) : (a ?? b);
    } else if (laterAt != null) dawnDoneAt = laterAt;

    const sleep = normalizeSettings(m.profile.reminders).sleep;
    const lightsOut = sleep.on ? toMinutes(sleep.time) : null;

    return {
      date,
      now,
      plan,
      session,
      meals: m.meals.map((x) => ({ id: x.id, slot: x.slot, position: x.position, name: x.name, kcal: x.kcal, protein: x.protein, at: x.at, role: x.role, eaten: x.eaten })),
      checkInDone,
      weighInDone,
      dawnDismissed: laterAt != null,
      sealed,
      lightsOut: lightsOut != null && Number.isFinite(lightsOut) ? lightsOut : null,
      dawnDoneAt,
    };
  }, [m, date, now, later, sealed]);

  const state = useMemo(() => (input ? dayState(input) : null), [input]);
  return { input, state, now, sealDate };
}
