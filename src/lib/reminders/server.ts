import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { addMonths, weekStart, type ISODate } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { estimateDurationMin, PROGRAM_BY_KEY } from "@/lib/training/program";
import type { DayTemplate, TemplateExercise, TemplateKey } from "@/lib/training/types";
import { plannedKey, scheduleFrom } from "@/lib/reviews/plan";
import type { DispatchDeps, PushPayload, PushTarget, SendResult } from "./dispatch";
import type { ReminderFacts } from "./schedule";

type Admin = SupabaseClient<Database>;

/** The service-role client, or null when the server has no service key (push can't work then). */
export function adminOrNull(): Admin | null {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- secrets */

let vapidCache: { publicKey: string; privateKey: string } | null = null;

/**
 * VAPID key pair for Web Push. Env vars win; otherwise one pair is generated on first use
 * and kept in public.app_secrets (no client access under RLS). Insert-if-absent, then
 * re-read, so concurrent first requests all end up with the same stored pair.
 */
export async function getVapidKeys(admin: Admin): Promise<{ publicKey: string; privateKey: string }> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  if (vapidCache) return vapidCache;
  const read = async () => {
    const { data, error } = await admin.from("app_secrets").select("value").eq("key", "vapid_keys").maybeSingle();
    if (error) throw new Error(`Couldn't read push keys: ${error.message}`);
    if (!data) return null;
    const v = JSON.parse(data.value) as { publicKey?: string; privateKey?: string };
    return v.publicKey && v.privateKey ? { publicKey: v.publicKey, privateKey: v.privateKey } : null;
  };
  let keys = await read();
  if (!keys) {
    const fresh = webpush.generateVAPIDKeys();
    const { error } = await admin.from("app_secrets").upsert({ key: "vapid_keys", value: JSON.stringify(fresh) }, { onConflict: "key", ignoreDuplicates: true });
    if (error) throw new Error(`Couldn't store push keys: ${error.message}`);
    keys = await read();
    if (!keys) throw new Error("Push keys could not be created.");
  }
  vapidCache = keys;
  return keys;
}

/**
 * Every secret the dispatcher accepts in x-cron-secret: the one stored in
 * app_secrets.cron_secret (what the pg_cron job sends) and, when set, the CRON_SECRET env
 * var (for an external scheduler). Accepting both means setting CRON_SECRET can never lock
 * out the database scheduler; scripts/migrate.mjs also copies CRON_SECRET into app_secrets.
 */
export async function getCronSecrets(admin: Admin | null): Promise<string[]> {
  const out: string[] = [];
  if (process.env.CRON_SECRET) out.push(process.env.CRON_SECRET);
  if (admin) {
    const { data } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
    if (data?.value) out.push(data.value);
  }
  return [...new Set(out)];
}

/** Constant-time comparison (hashing first equalises lengths); true if `given` matches any. */
export function secretMatches(given: string | null, expected: string | null | readonly string[]) {
  const list = (Array.isArray(expected) ? expected : [expected]).filter((x): x is string => !!x);
  if (!given || !list.length) return false;
  const a = createHash("sha256").update(given).digest();
  let ok = false;
  for (const e of list) ok = timingSafeEqual(a, createHash("sha256").update(e).digest()) || ok;
  return ok;
}

/** VAPID "sub" claim: an https URL for the deployed app (push services reject localhost). */
export function vapidSubject(origin?: string | null) {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.APP_URL;
  if (host) return host.startsWith("http") ? host.replace(/^http:/, "https:") : `https://${host}`;
  if (origin?.startsWith("https://")) return origin;
  return "mailto:reminders@example.com";
}

/* ----------------------------------------------------------------- send */

/** Sends one encrypted push message. 404/410 mean the subscription is gone for good. */
export async function sendPush(keys: { publicKey: string; privateKey: string }, subject: string, target: PushTarget, payload: PushPayload): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({ ...payload, ts: Date.now() }),
      {
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 3 * 60 * 60, // a reminder older than 3 hours is no longer useful
        urgency: "normal",
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        timeout: 10_000,
      },
    );
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? null;
    return { ok: false, gone: status === 404 || status === 410, status, error: (e as Error).message?.slice(0, 200) ?? "send failed" };
  }
}

/* ---------------------------------------------------------- facts (admin) */

function templateFromRow(r: { key: string; name: string; focus: string | null; exercises: unknown } | null, key: string): DayTemplate | null {
  const def = PROGRAM_BY_KEY[key as TemplateKey];
  if (!r) return def ?? null;
  return { ...(def ?? { key: key as TemplateKey, subtitle: "", weekday: 0, warmup: [] }), key: key as TemplateKey, name: r.name, focus: r.focus ?? def?.focus ?? "", exercises: (Array.isArray(r.exercises) ? r.exercises : []) as TemplateExercise[] } as DayTemplate;
}

/** Today's facts for one user, read with the service role and always filtered by user_id. */
export async function loadFacts(admin: Admin, userId: string, date: ISODate): Promise<ReminderFacts> {
  const must = <T,>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data as T;
  };
  const prev = addMonths(date, -1);
  const [profile, plan, sessions, food, water, weights, photo, review] = await Promise.all([
    admin.from("profiles").select("calorie_goal,water_goal_ml,sleep_goal_h,weekly_schedule").eq("id", userId).single(),
    admin.from("day_plans").select("template_key").eq("user_id", userId).eq("plan_date", date).maybeSingle(),
    admin.from("workout_sessions").select("id").eq("user_id", userId).eq("local_date", date).eq("status", "done").limit(1),
    admin.from("food_entries").select("meal,calories").eq("user_id", userId).eq("local_date", date),
    admin.from("water_logs").select("amount_ml").eq("user_id", userId).eq("local_date", date),
    admin.from("weight_entries").select("local_date").eq("user_id", userId).gte("local_date", weekStart(date)).lte("local_date", date),
    admin.from("progress_photos").select("local_date").eq("user_id", userId).lte("local_date", date).order("local_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("monthly_reviews").select("id").eq("user_id", userId).eq("month", prev).maybeSingle(),
  ]);
  const p = must(profile, "profile");
  const overrides: Record<string, string> = {};
  const planRow = must(plan, "plan");
  if (planRow) overrides[date] = planRow.template_key;
  const key = plannedKey(date, scheduleFrom(p.weekly_schedule), overrides);
  let plannedWorkout: ReminderFacts["plannedWorkout"] = null;
  if (key !== "rest") {
    const t = must(await admin.from("program_templates").select("key,name,focus,exercises").eq("user_id", userId).eq("key", key).maybeSingle(), "template");
    const tpl = templateFromRow(t, key);
    if (tpl) plannedWorkout = { name: tpl.name, exercises: tpl.exercises.length, minutes: tpl.exercises.length ? estimateDurationMin(tpl) : null };
  }
  const foods = must(food, "food") ?? [];
  const w = must(weights, "weights") ?? [];
  return {
    plannedWorkout,
    workoutDone: (must(sessions, "sessions") ?? []).length > 0,
    mealsLogged: new Set(foods.map((f) => f.meal)).size,
    caloriesToday: foods.reduce((a, f) => a + Number(f.calories ?? 0), 0),
    calorieGoal: p.calorie_goal,
    waterMl: (must(water, "water") ?? []).reduce((a, x) => a + x.amount_ml, 0),
    waterGoalMl: p.water_goal_ml,
    weighedInToday: w.some((x) => x.local_date === date),
    weighInsThisWeek: w.length,
    lastPhotoDate: must(photo, "photos")?.local_date ?? null,
    lastMonthReviewSaved: !!must(review, "review"),
    sleepGoalH: Number(p.sleep_goal_h),
  };
}

/* ----------------------------------------------------------- dispatch deps */

export function adminDispatchDeps(admin: Admin, keys: { publicKey: string; privateKey: string }, subject: string): DispatchDeps {
  return {
    async candidates() {
      const [{ data: profiles, error }, { data: subs, error: subErr }] = await Promise.all([
        admin.from("profiles").select("id,timezone,reminders").eq("onboarded", true).range(0, 9999),
        admin.from("push_subscriptions").select("user_id").range(0, 49999),
      ]);
      if (error || subErr) throw new Error((error ?? subErr)!.message);
      const withDevice = new Set((subs ?? []).map((s) => s.user_id));
      return (profiles ?? []).filter((p) => withDevice.has(p.id)).map((p) => ({ userId: p.id, timezone: p.timezone, reminders: p.reminders }));
    },
    facts: (userId, date) => loadFacts(admin, userId, date),
    async sentOn(userId, date) {
      const { data, error } = await admin.from("reminder_deliveries").select("reminder").eq("user_id", userId).eq("due_key", date);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.reminder);
    },
    async claim(userId, n) {
      const { data, error } = await admin
        .from("reminder_deliveries")
        .upsert({ user_id: userId, reminder: n.kind, due_key: n.dueKey }, { onConflict: "user_id,reminder,due_key", ignoreDuplicates: true })
        .select("reminder");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async release(userId, n) {
      await admin.from("reminder_deliveries").delete().eq("user_id", userId).eq("reminder", n.kind).eq("due_key", n.dueKey);
    },
    async subscriptions(userId) {
      const { data, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    send: (t, payload) => sendPush(keys, subject, t, payload),
    async removeSubscription(id) {
      await admin.from("push_subscriptions").delete().eq("id", id);
    },
  };
}

/* ------------------------------------------------------------- status rpc */

export interface SchedulerStatus {
  state: "active" | "not_scheduled" | "unavailable" | "unknown";
  url: string | null;
  lastRunAt: string | null;
}

/** Reads the pg_cron job (via a service-role-only RPC) and the dispatcher's last-run stamp. */
export async function schedulerStatus(admin: Admin): Promise<SchedulerStatus> {
  const untyped = admin as unknown as SupabaseClient;
  const [rpc, last] = await Promise.all([
    untyped.rpc("pgg_reminders_status"),
    admin.from("app_secrets").select("value").eq("key", "reminders_last_run").maybeSingle(),
  ]);
  const lastRunAt = last.data?.value ?? null;
  if (rpc.error || !rpc.data) return { state: "unknown", url: null, lastRunAt };
  const d = rpc.data as { cron_available?: boolean; net_available?: boolean; scheduled?: boolean; url?: string | null };
  if (d.scheduled) return { state: "active", url: d.url ?? null, lastRunAt };
  if (d.cron_available === false || d.net_available === false) return { state: "unavailable", url: null, lastRunAt };
  return { state: "not_scheduled", url: null, lastRunAt };
}

export async function stampLastRun(admin: Admin, at: Date) {
  await admin.from("app_secrets").upsert({ key: "reminders_last_run", value: at.toISOString() }, { onConflict: "key" });
}
