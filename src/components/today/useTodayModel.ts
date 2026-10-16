"use client";

import { useMemo } from "react";
import { useToday } from "@/lib/data/core";
import { useMissionDays } from "@/lib/data/daily";
import { useWeights } from "@/lib/data/body";
import { useFoodEntries, useWater, useDailyNutrition } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { planFor, usePREvents, useDayPlans, useSessions, useTemplates, useVolleyball, volleyballLoad, type Session } from "@/lib/data/training";
import { useStartWorkout } from "@/lib/data/workout";
import { addDays, weekDates, type ISODate } from "@/lib/dates";
import { ascentProgress, planRatePerWeek } from "@/lib/today/ascent";
import type { CheckinFacts } from "@/lib/today/daily-line";
import { planFacts, nextSession } from "@/lib/today/plan";
import { latestRecords } from "@/lib/today/records";
import { timeline } from "@/lib/today/timeline";
import { consistencyStreak, weeklyOverview } from "@/lib/today/weekly";
import { estimateDurationMin } from "@/lib/training/program";

const LOOKBACK = 90; // days of mission history for the streak

/**
 * Everything the Today screen shows, from the shared data hooks. Query keys deliberately
 * match the mission hook's (same from/to) so TanStack Query de-duplicates the requests.
 */
export function useTodayModel() {
  const today = useToday();
  const from = addDays(today, -(LOOKBACK - 1));
  const week = useMemo(() => weekDates(today), [today]);
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const { byKey, loading: templatesLoading } = useTemplates();
  const plans = useDayPlans(week[0], addDays(today, 8));
  const sessions = useSessions(from, today);
  const { weights, loading: weightsLoading, error: weightsError } = useWeights();
  const food = useFoodEntries(today);
  const water = useWater(today);
  const foodDays = useDailyNutrition(from, today);
  const recovery = useRecovery(from, today);
  const prs = usePREvents(addDays(today, -365), today);
  const vb = useVolleyball(addDays(week[0], -6), week[6]);
  const mission = useMissionDays(from, today);
  const workout = useStartWorkout();

  const coreLoading = profileLoading || templatesLoading || plans.isLoading || sessions.isLoading || weightsLoading || food.loading || water.loading;

  const model = useMemo(() => {
    if (!profile) return null;
    const plansRows = plans.data ?? [];
    const resolve = (d: ISODate) => planFor(d, profile, plansRows, byKey);
    const todayPlan = resolve(today);

    // Sessions
    const all = sessions.data ?? [];
    const todays = all.filter((s) => s.local_date === today);
    const doneToday: Session | null = todays.find((s) => s.status === "done") ?? null;
    const active = workout.active;

    // Recovery / volleyball
    const recRows = recovery.data ?? [];
    const todayRec = recRows.find((r) => r.local_date === today) ?? null;
    const lastRec = [...recRows].reverse().find((r) => r.sleep_hours != null || r.energy != null) ?? null;
    const checkin: CheckinFacts | null = todayRec
      ? {
          sleepHours: todayRec.sleep_hours == null ? null : Number(todayRec.sleep_hours),
          energy: todayRec.energy,
          soreness: todayRec.soreness,
          fatigue: todayRec.fatigue,
          pain: !!todayRec.pain_notes?.trim(),
        }
      : null;
    const vbRows = vb.data ?? [];
    const vbDates = new Set(vbRows.map((v) => v.local_date));
    for (const r of recRows) if (r.volleyball && r.local_date >= week[0]) vbDates.add(r.local_date);
    const volleyballToday = vbDates.has(today);
    const volleyballDays7 = volleyballLoad(vbRows, today);

    // Bodyweight — the one p
    const startLb = profile.start_weight_lb == null ? null : Number(profile.start_weight_lb);
    const goalLb = profile.goal_weight_lb == null ? null : Number(profile.goal_weight_lb);
    const ascent = ascentProgress(startLb, goalLb, weights, today);
    const latestRow = weights.length ? weights[weights.length - 1] : null;
    const planRate = planRatePerWeek(startLb, goalLb, profile.start_date, profile.target_date);
    const weighInsThisWeek = weights.filter((w) => w.local_date >= week[0] && w.local_date <= today).length;

    // Timeline
    const tl = timeline(profile.start_date, profile.target_date, today);

    // Week
    const weekDays = week.map((d) => {
      const p = resolve(d);
      return { date: d, kind: (p.template ? "train" : "rest") as "train" | "rest", label: p.template?.name ?? "Rest" };
    });
    const overview = weeklyOverview({
      days: weekDays,
      today,
      doneSessions: all.filter((s) => s.status === "done").map((s) => ({ id: s.id, local_date: s.local_date })),
      food: foodDays.data ?? [],
      sleep: recRows.map((r) => ({ local_date: r.local_date, sleep_hours: r.sleep_hours == null ? null : Number(r.sleep_hours) })),
      volleyball: [...vbDates],
      prEvents: prs.data ?? [],
      startDate: profile.start_date,
    });

    // Missions
    const missionToday = mission.days.find((d) => d.date === today) ?? null;
    const streak = mission.days.length ? consistencyStreak(mission.days, today) : null;

    // Next planned session (for rest days and the done state)
    const next = nextSession(today, (d) => resolve(d).template);

    return {
      today,
      week,
      profile,
      todayPlan,
      template: todayPlan.template,
      facts: planFacts(todayPlan.template),
      durationMin: todayPlan.template ? estimateDurationMin(todayPlan.template) : null,
      doneToday,
      active,
      checkin,
      todayRec,
      lastRec,
      volleyballToday,
      volleyballDays7,
      ascent,
      weights,
      latestRow,
      planRate,
      weighInsThisWeek,
      timeline: tl,
      overview,
      missionToday,
      streak,
      next,
      records: latestRecords(prs.data ?? [], 3),
      food: food.totals,
      waterMl: water.totalMl,
      waterLogs: water.logs,
    };
  }, [profile, plans.data, byKey, today, sessions.data, workout.active, recovery.data, vb.data, weights, week, foodDays.data, prs.data, mission.days, food.totals, water.totalMl, water.logs]);

  return {
    model,
    loading: coreLoading,
    profileError,
    errors: {
      sessions: sessions.error,
      weights: weightsError,
      food: food.error,
      week: foodDays.error ?? recovery.error ?? prs.error ?? vb.error,
    },
    refetch: {
      sessions: sessions.refetch,
      food: food.refetch,
      week: () => {
        foodDays.refetch();
        recovery.refetch();
        prs.refetch();
        vb.refetch();
      },
    },
    pending: {
      mission: mission.loading,
      week: foodDays.isLoading || recovery.isLoading || vb.isLoading || mission.loading,
      records: prs.isLoading,
    },
    workout,
  };
}

export type TodayModel = NonNullable<ReturnType<typeof useTodayModel>["model"]>;
