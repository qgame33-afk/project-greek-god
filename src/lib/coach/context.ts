import "server-only";

// Reads the signed-in user's own rows (RLS-bound server client) and builds the coach snapshot.
// Categories the user hasn't shared are not even read.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeighIn } from "@/lib/bodyweight";
import { addDays, type ISODate } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type { MuscleGroup, TemplateExercise } from "@/lib/training/types";
import { normalizeAccess } from "./access";
import type { CheckIn, DayTotals, HistorySet, MeasurementRow } from "./aggregate";
import { buildSnapshot, type RawCoachData, type RawProfile, type RawTraining, type Snapshot } from "./snapshot";

type SB = SupabaseClient<Database>;
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize || out.length > 50_000) break;
  }
  return out;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const n = (v: unknown) => (v == null ? null : Number(v));

export function toRawProfile(p: ProfileRow): RawProfile {
  return {
    display_name: p.display_name,
    height_cm: n(p.height_cm),
    start_weight_lb: Number(p.start_weight_lb ?? 163),
    goal_weight_lb: Number(p.goal_weight_lb ?? 183),
    goal_range_min_lb: n(p.goal_range_min_lb),
    goal_range_max_lb: n(p.goal_range_max_lb),
    start_date: p.start_date,
    target_date: p.target_date,
    experience: p.experience,
    weight_unit: p.weight_unit === "kg" ? "kg" : "lb",
    length_unit: p.length_unit === "cm" ? "cm" : "in",
    calorie_goal: Number(p.calorie_goal),
    protein_goal: Number(p.protein_goal),
    carb_goal: Number(p.carb_goal),
    fat_goal: Number(p.fat_goal),
    water_goal_ml: Number(p.water_goal_ml),
    sleep_goal_h: Number(p.sleep_goal_h),
    weekly_schedule: p.weekly_schedule,
    training_mode: p.training_mode,
    volleyball_per_week: Number(p.volleyball_per_week),
  };
}

async function loadTraining(sb: SB, today: ISODate): Promise<RawTraining> {
  const from28 = addDays(today, -27);
  const from56 = addDays(today, -55);
  const [sessions, sets, bests, prs, templates, overrides, volleyball, athletic, custom] = await Promise.all([
    pageAll((a, b) =>
      sb
        .from("workout_sessions")
        .select("id,local_date,name,template_key,duration_sec,total_volume_lb,sets_completed,pr_count,status")
        .in("status", ["done", "active"])
        .gte("local_date", from28)
        .lte("local_date", today)
        .order("local_date")
        .range(a, b),
    ),
    pageAll((a, b) =>
      sb
        .from("set_history")
        .select("session_id,local_date,exercise_slug,exercise_name,set_index,weight_lb,reps,duration_sec,e1rm_lb,completed_at")
        .gte("local_date", from56)
        .lte("local_date", today)
        .order("local_date")
        .order("set_index")
        .range(a, b),
    ),
    pageAll((a, b) => sb.from("exercise_bests").select("exercise_slug,exercise_name,best_e1rm_lb,best_weight_lb,last_date").range(a, b)),
    pageAll((a, b) =>
      sb.from("pr_events").select("local_date,exercise_slug,exercise_name,weight_lb,reps,e1rm_lb").gte("local_date", from28).lte("local_date", today).order("local_date", { ascending: false }).range(a, b),
    ),
    sb.from("program_templates").select("key,name,exercises").order("sort").then(ok),
    sb.from("day_plans").select("plan_date,template_key,reason,moved_from").gte("plan_date", from28).lte("plan_date", addDays(today, 7)).then(ok),
    sb.from("volleyball_sessions").select("local_date,kind,duration_min,intensity").gte("local_date", addDays(today, -13)).lte("local_date", today).then(ok),
    sb.from("athletic_tests").select("local_date,test_type,value").order("local_date").limit(500).then(ok),
    sb.from("custom_exercises").select("slug,primary_muscles").then(ok),
  ]);
  return {
    sessions: sessions.map((s) => ({ ...s, total_volume_lb: n(s.total_volume_lb), status: s.status })),
    sets: sets
      .filter((s) => s.session_id && s.local_date && s.exercise_slug)
      .map(
        (s): HistorySet => ({
          session_id: s.session_id!,
          local_date: s.local_date!,
          exercise_slug: s.exercise_slug!,
          exercise_name: s.exercise_name ?? s.exercise_slug!,
          set_index: s.set_index ?? 0,
          weight_lb: n(s.weight_lb),
          reps: n(s.reps),
          duration_sec: n(s.duration_sec),
          e1rm_lb: n(s.e1rm_lb),
          completed_at: s.completed_at,
        }),
      ),
    bests: bests.filter((b) => b.exercise_slug).map((b) => ({ ...b, exercise_slug: b.exercise_slug!, best_e1rm_lb: n(b.best_e1rm_lb), best_weight_lb: n(b.best_weight_lb) })),
    prs: prs.filter((r) => r.exercise_slug && r.local_date).map((r) => ({ ...r, local_date: r.local_date!, exercise_slug: r.exercise_slug!, weight_lb: n(r.weight_lb), e1rm_lb: n(r.e1rm_lb) })),
    templates: (templates ?? []).map((t) => ({ key: t.key, name: t.name, exercises: (Array.isArray(t.exercises) ? t.exercises : []) as unknown as TemplateExercise[] })),
    overrides: overrides ?? [],
    volleyball: volleyball ?? [],
    athletic: (athletic ?? []).map((a) => ({ ...a, value: Number(a.value) })),
    custom: Object.fromEntries((custom ?? []).map((c) => [c.slug, (c.primary_muscles ?? []) as MuscleGroup[]])),
  };
}

/**
 * Build the coach context for `today` (the user's local date). Returns the snapshot plus the
 * profile row the suggestion validator checks against.
 */
export async function buildCoachContext(sb: SB, userId: string, today: ISODate, localTime: string | null): Promise<{ snapshot: Snapshot; profile: ProfileRow; raw: RawCoachData }> {
  const pr = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (pr.error) throw new Error(pr.error.message);
  const profile: ProfileRow | null = pr.data;
  if (!profile) throw new Error("Profile not found");
  const access = normalizeAccess(profile.coach_access);

  const [goalChanges, weights, training, nutrition, recovery, measurements] = await Promise.all([
    sb.from("goal_changes").select("field,old_value,new_value,changed_at,source").order("changed_at", { ascending: false }).limit(30).then(ok),
    access.bodyweight
      ? pageAll((a, b) => sb.from("weight_entries").select("local_date,weight_lb").lte("local_date", today).order("local_date").range(a, b)).then((rows) =>
          rows.map((r): WeighIn => ({ local_date: r.local_date, weight_lb: Number(r.weight_lb) })),
        )
      : Promise.resolve(null),
    access.training ? loadTraining(sb, today) : Promise.resolve(null),
    access.nutrition
      ? Promise.all([
          sb.from("daily_nutrition").select("local_date,calories,protein_g,carbs_g,fat_g,entries").gte("local_date", addDays(today, -14)).lte("local_date", today).then(ok),
          sb.from("daily_water").select("local_date,total_ml").gte("local_date", addDays(today, -8)).lte("local_date", today).then(ok),
        ]).then(([days, water]) => ({
          days: (days ?? []).filter((d) => d.local_date).map((d): DayTotals => ({ ...d, local_date: d.local_date!, calories: n(d.calories), protein_g: n(d.protein_g), carbs_g: n(d.carbs_g), fat_g: n(d.fat_g), entries: n(d.entries) })),
          water: (water ?? []).filter((w) => w.local_date).map((w) => ({ local_date: w.local_date!, total_ml: n(w.total_ml) })),
        }))
      : Promise.resolve(null),
    access.recovery
      ? sb
          .from("recovery_logs")
          .select("local_date,sleep_hours,sleep_quality,energy,soreness,fatigue,stress,pain_notes,volleyball")
          .gte("local_date", addDays(today, -13))
          .lte("local_date", today)
          .order("local_date", { ascending: false })
          .then(ok)
          .then((logs) => ({ logs: (logs ?? []).map((l): CheckIn => ({ ...l, sleep_hours: n(l.sleep_hours) })) }))
      : Promise.resolve(null),
    access.measurements
      ? sb
          .from("body_measurements")
          .select("local_date,biceps_flexed_in,forearm_in,chest_in,shoulders_in,waist_in,hips_in,thigh_in,calf_in,body_fat_pct")
          .order("local_date")
          .limit(500)
          .then(ok)
          .then((rows) => ({ rows: (rows ?? []) as MeasurementRow[] }))
      : Promise.resolve(null),
  ]);

  const raw: RawCoachData = {
    today,
    localTime,
    profile: toRawProfile(profile),
    access,
    goalChanges: (goalChanges ?? []).map((g) => ({ ...g, old_value: n(g.old_value), new_value: n(g.new_value) })),
    weights,
    training,
    nutrition,
    recovery,
    measurements,
  };
  return { snapshot: buildSnapshot(raw), profile, raw };
}
