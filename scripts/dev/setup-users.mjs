// LOCAL DEVELOPMENT ONLY. Creates two test accounts in the local Supabase stack:
//   fresh@greekgod.local — brand new, not onboarded (tests onboarding + empty states)
//   demo@greekgod.local  — onboarded, filled with ~5 weeks of sample logs (tests charts)
// Refuses to run against anything but localhost so sample data can never reach production.
//
//   node scripts/dev/setup-users.mjs [--reset]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error("Refusing: not a local Supabase URL");
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const PASSWORD = "ascent-test-123";

async function ensureUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list.users.find((u) => u.email === email);
  if (existing && process.argv.includes("--reset")) {
    await admin.auth.admin.deleteUser(existing.id);
  } else if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

// deterministic PRNG so the sample data is stable between runs
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

async function seedDemo(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const start = addDays(today, -35);
  for (const t of ["exercise_sets", "workout_sessions", "food_entries", "water_logs", "weight_entries", "recovery_logs", "body_measurements", "athletic_tests", "habit_logs", "volleyball_sessions", "program_templates", "habit_definitions", "goal_changes", "ai_messages", "ai_conversations", "saved_foods"]) {
    await admin.from(t).delete().eq("user_id", uid);
  }
  await admin
    .from("profiles")
    .update({ onboarded: true, display_name: "Quinton", start_date: start, start_weight_lb: 163, goal_weight_lb: 183, target_date: "2027-08-01", volleyball_per_week: 2 })
    .eq("id", uid);

  // bodyweight: ~0.45 lb/week trend with water noise
  const weights = [];
  for (let i = 0; i <= 35; i++) {
    if (rand() < 0.18 && i !== 35) continue;
    weights.push({ user_id: uid, local_date: addDays(start, i), weight_lb: +(163 + i * 0.07 + (rand() - 0.5) * 1.6).toFixed(1) });
  }
  await admin.from("weight_entries").insert(weights);

  // nutrition: 3 meals + snack most days
  const foods = [
    ["breakfast", "Oats with whey and banana", 1, "bowl", 640, 42, 92, 11],
    ["breakfast", "Eggs, scrambled", 3, "piece", 234, 19, 2, 16],
    ["lunch", "Chicken breast, grilled", 250, "g", 413, 78, 0, 9],
    ["lunch", "White rice, cooked", 300, "g", 390, 8, 85, 1],
    ["dinner", "Lean ground beef bolognese", 1, "plate", 820, 52, 96, 22],
    ["dinner", "Salmon fillet", 200, "g", 412, 40, 0, 27],
    ["snacks", "Greek yogurt 0%", 250, "g", 148, 25, 9, 1],
    ["snacks", "Bagel with peanut butter", 1, "piece", 480, 16, 58, 20],
  ];
  const entries = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    if (rand() < 0.1) continue;
    for (const f of foods) {
      if (rand() < 0.3) continue;
      const k = 0.85 + rand() * 0.35;
      entries.push({
        user_id: uid, local_date: d, eaten_at: `${d}T${f[0] === "breakfast" ? "08" : f[0] === "lunch" ? "12" : f[0] === "dinner" ? "18" : "15"}:30:00Z`, meal: f[0], name: f[1],
        amount: +(f[2] * k).toFixed(f[3] === "g" ? 0 : 2), unit: f[3], calories: Math.round(f[4] * k), protein_g: +(f[5] * k).toFixed(1), carbs_g: +(f[6] * k).toFixed(1), fat_g: +(f[7] * k).toFixed(1),
        base_amount: f[2], base_calories: f[4], base_protein_g: f[5], base_carbs_g: f[6], base_fat_g: f[7], source: "manual", confidence: "logged",
      });
    }
  }
  for (let i = 0; i < entries.length; i += 500) await admin.from("food_entries").insert(entries.slice(i, i + 500));

  // water + recovery
  const water = [], rec = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    const taps = 4 + Math.floor(rand() * 6);
    for (let t = 0; t < taps; t++) water.push({ user_id: uid, local_date: d, amount_ml: pick([250, 500, 500, 750]) });
    if (rand() < 0.85) rec.push({ user_id: uid, local_date: d, sleep_hours: +(6.25 + rand() * 2.5).toFixed(2), sleep_quality: 2 + Math.floor(rand() * 4), energy: 2 + Math.floor(rand() * 4), soreness: 1 + Math.floor(rand() * 4), fatigue: 1 + Math.floor(rand() * 4), stress: 1 + Math.floor(rand() * 4), volleyball: [2, 4].includes(new Date(d + "T12:00:00Z").getUTCDay()) });
  }
  await admin.from("water_logs").insert(water);
  await admin.from("recovery_logs").insert(rec);

  // volleyball Tue/Thu evenings
  const vb = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    if ([2, 4].includes(new Date(d + "T12:00:00Z").getUTCDay())) vb.push({ user_id: uid, local_date: d, kind: pick(["practice", "practice", "game"]), duration_min: 90, intensity: 3 + Math.floor(rand() * 2) });
  }
  await admin.from("volleyball_sessions").insert(vb);

  // workouts following the program, with progressive loads
  const prog = {
    1: ["Push A", "push_a", [["barbell-bench-press", "Barbell Bench Press", 3, 5, 8, 165, 5], ["incline-db-press", "Incline Dumbbell Press", 3, 8, 10, 55, 5], ["seated-db-shoulder-press", "Seated Dumbbell Shoulder Press", 3, 6, 10, 45, 5], ["cable-lateral-raise", "Cable Lateral Raises", 3, 12, 20, 15, 2.5], ["cable-triceps-pushdown", "Cable Triceps Pushdown", 3, 10, 15, 50, 5], ["overhead-cable-triceps-extension", "Overhead Cable Triceps Extension", 2, 10, 15, 40, 5]]],
    2: ["Pull A", "pull_a", [["weighted-pull-up", "Weighted Pull-Ups or Lat Pulldown", 3, 6, 10, 10, 2.5], ["chest-supported-row", "Chest-Supported Row", 3, 6, 10, 90, 5], ["ez-bar-curl", "EZ-Bar Biceps Curl", 3, 8, 12, 60, 5], ["hammer-curl", "Hammer Curl", 3, 10, 12, 30, 5]]],
    3: ["Legs A", "legs_a", [["back-squat", "Barbell Back Squat", 4, 4, 6, 205, 10], ["romanian-deadlift", "Romanian Deadlift", 3, 6, 8, 185, 10], ["seated-leg-curl", "Seated Leg Curl", 3, 10, 12, 90, 5], ["standing-calf-raise", "Standing Calf Raises", 3, 10, 15, 140, 10]]],
    4: ["Push B", "push_b", [["incline-smith-press", "Incline Smith Machine Press", 3, 8, 12, 135, 5], ["machine-chest-press", "Machine Chest Press", 3, 10, 12, 140, 5], ["cable-lateral-raise", "Cable Lateral Raises", 4, 12, 20, 15, 2.5], ["rope-triceps-pushdown", "Rope Triceps Pushdown", 2, 12, 15, 45, 5]]],
    5: ["Pull B", "pull_b", [["neutral-grip-lat-pulldown", "Neutral-Grip Lat Pulldown", 3, 8, 12, 140, 5], ["chest-supported-wide-row", "Chest-Supported Wide Row", 3, 8, 12, 80, 5], ["preacher-curl", "Preacher Curls", 3, 8, 12, 55, 5], ["cable-hammer-curl", "Cable Hammer Curls", 3, 10, 15, 45, 5]]],
    6: ["Legs B", "legs_b", [["hack-squat", "Hack Squat", 3, 8, 12, 180, 10], ["leg-press", "Leg Press", 3, 10, 15, 360, 10], ["leg-extension", "Leg Extension", 2, 12, 15, 110, 5], ["seated-calf-raise", "Seated Calf Raises", 4, 12, 20, 90, 10]]],
  };
  const sessions = [], sets = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    if (!prog[dow] || rand() < 0.12) continue;
    const [name, key, exs] = prog[dow];
    const week = Math.floor(i / 7);
    const sid = crypto.randomUUID();
    let vol = 0, n = 0;
    exs.forEach(([slug, en, setsN, lo, hi, base, inc], order) => {
      const w = base + inc * Math.floor(week * 0.8);
      for (let s = 0; s < setsN; s++) {
        const reps = Math.max(lo, Math.min(hi, hi - s - Math.floor(rand() * 2) + (week % 2)));
        vol += w * reps; n++;
        sets.push({ id: crypto.randomUUID(), user_id: uid, session_id: sid, local_date: d, exercise_slug: slug, exercise_name: en, exercise_order: order, set_index: s, kind: "working", weight_lb: w, reps, rir: pick([1, 1, 2, 2, 0]), completed: true, completed_at: `${d}T18:${String(10 + order * 6 + s).padStart(2, "0")}:00Z`, target_rep_low: lo, target_rep_high: hi, target_unit: "reps", target_rir: "1–2", rest_sec: 120 });
      }
    });
    sessions.push({ id: sid, user_id: uid, template_key: key, name, local_date: d, started_at: `${d}T18:00:00Z`, ended_at: `${d}T19:05:00Z`, duration_sec: 3900 + Math.floor(rand() * 900), status: "done", total_volume_lb: vol, sets_completed: n });
  }
  await admin.from("workout_sessions").insert(sessions);
  for (let i = 0; i < sets.length; i += 500) {
    const { error } = await admin.from("exercise_sets").insert(sets.slice(i, i + 500));
    if (error) throw error;
  }

  await admin.from("body_measurements").insert([
    { user_id: uid, local_date: start, biceps_flexed_in: 14.25, forearm_in: 11.5, chest_in: 38.5, shoulders_in: 46, waist_in: 30.5, hips_in: 36.5, thigh_in: 21.5, calf_in: 14.5 },
    { user_id: uid, local_date: addDays(start, 28), biceps_flexed_in: 14.5, forearm_in: 11.6, chest_in: 39, shoulders_in: 46.75, waist_in: 30.75, hips_in: 36.75, thigh_in: 21.75, calf_in: 14.6 },
  ]);
  await admin.from("athletic_tests").insert([
    { user_id: uid, local_date: addDays(start, 2), test_type: "standing_vertical", value: 26.5 },
    { user_id: uid, local_date: addDays(start, 2), test_type: "approach_vertical", value: 31 },
    { user_id: uid, local_date: addDays(start, 30), test_type: "standing_vertical", value: 27.25 },
    { user_id: uid, local_date: addDays(start, 30), test_type: "approach_vertical", value: 32 },
    { user_id: uid, local_date: addDays(start, 30), test_type: "broad_jump", value: 104 },
  ]);
  console.log(`demo seeded: ${weights.length} weigh-ins, ${entries.length} foods, ${sessions.length} sessions, ${sets.length} sets`);
}

const fresh = await ensureUser("fresh@greekgod.local");
await admin.from("profiles").update({ onboarded: false }).eq("id", fresh);
const demo = await ensureUser("demo@greekgod.local");
await seedDemo(demo);
console.log("users ready:", { fresh, demo, password: PASSWORD });
