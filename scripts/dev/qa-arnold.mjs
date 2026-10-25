// LOCAL DEVELOPMENT ONLY. The Arnold switch-over acceptance run (docs/PROGRAM-ARNOLD.md §8.1–8.3).
//
//   node scripts/dev/qa-arnold.mjs --setup    recreate qa-arnold@greekgod.local as production looks
//                                            before publication (PPL, history, an active workout,
//                                            moved days, a customised template, volleyball rows),
//                                            snapshot it, then apply migration A (deploy A state)
//   node scripts/dev/qa-arnold.mjs --switch   apply 20261021000100_arnold_switch.sql (deploy B)
//   node scripts/dev/qa-arnold.mjs --verify   the database assertions D1–D13 (D12 needs one app
//                                            load as the QA user first: qa-arnold-ui.mjs)
//
// Migration files are applied with psql -f, exactly as written. Refuses anything but localhost.

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const DB = process.env.QA_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_) || !/@(127\.0\.0\.1|localhost):/.test(DB)) throw new Error("Refusing: not the local Supabase");

const EMAIL = "qa-arnold@greekgod.local";
const PASSWORD = "ascent-test-123";
const TZ = "America/Toronto";
const MIG_A = path.join(ROOT, "supabase/migrations/20261021000000_arnold_program.sql");
const MIG_B = path.join(ROOT, "supabase/migrations/20261021000100_arnold_switch.sql");
const STATE_DIR = process.env.QA_ARNOLD_STATE_DIR || path.join(ROOT, "node_modules/.cache/qa-arnold");
const STATE = path.join(STATE_DIR, "state.json");

const PPL_WEEK = { 0: "rest", 1: "push_a", 2: "pull_a", 3: "legs_a", 4: "push_b", 5: "pull_b", 6: "legs_b" };
const ARNOLD_WEEK = { 0: "rest", 1: "shoulders_arms_a", 2: "chest_back_a", 3: "legs_abs_a", 4: "shoulders_arms_b", 5: "chest_back_b", 6: "legs_abs_b" };
const PREFS = { tapLogsGhost: true, systemKeyboard: false, restFocus: false, haptics: true, restChime: false, gymAuto: false, day: { trainAt: "16:30" } };
const PPL_ROWS = JSON.parse(readFileSync(path.join(ROOT, "scripts/dev/fixtures/ppl-rows-2026-10.json"), "utf8"));
/** The five lifts whose last sessions are fixed, so U3/U5 can check the suggestions. */
const CONTROLLED = {
  "incline-db-press": { key: "push_a", sets: [[60, 10, 2], [60, 10, 1], [60, 10, 1]] },
  "seated-db-shoulder-press": { key: "push_b", sets: [[50, 12, null], [50, 12, null]] },
  "back-squat": { key: "legs_a", sets: [[225, 6, null], [225, 6, null], [225, 6, null], [225, 5, null]] },
  "machine-chest-press": { key: "push_b", sets: [[150, 12, 0], [150, 12, 0], [150, 12, 0]] },
  "cable-lateral-raise": { key: "push_a", sets: [[15, 20, 0], [15, 20, 0], [15, 20, 0]] },
};
const HASHED = ["workout_sessions", "exercise_sets", "program_templates", "volleyball_sessions", "athletic_tests", "recovery_logs", "weight_entries", "food_entries", "water_logs", "meal_plans", "planned_meals", "grocery_items", "progress_photos"];
const COUNTED = ["set_history", "pr_events", "exercise_bests"];

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DB });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const dow = (s) => new Date(`${s}T12:00:00Z`).getUTCDay();
const torontoToday = async () => (await q(`select (now() at time zone $1)::date::text as d`, [TZ]))[0].d;
const psql = (file) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", file], { stdio: ["ignore", "pipe", "pipe"] }).toString();

async function snapshot(uid) {
  const out = { md5: {}, counts: {} };
  for (const t of HASHED) {
    const exists = (await q(`select to_regclass($1) as r`, [`public.${t}`]))[0].r;
    out.md5[t] = exists ? (await q(`select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) as h, count(*)::int as n from public.${t} x where x.user_id = $1`, [uid]))[0] : null;
  }
  for (const v of COUNTED) out.counts[v] = (await q(`select count(*)::int as n from public.${v} where user_id = $1`, [uid]))[0].n;
  return out;
}
const dayPlans = async (uid) => q(`select plan_date::text, template_key, reason, moved_from::text, note from public.day_plans where user_id = $1 order by plan_date`, [uid]);
const profileRow = async (uid) => (await q(`select weekly_schedule, prefs, training_mode, md5(p::text) as h from public.profiles p where id = $1`, [uid]))[0];

/* ================================================================ --setup */

async function setup() {
  const today = await torontoToday();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const old = list.users.find((u) => u.email === EMAIL);
  if (old) await admin.auth.admin.deleteUser(old.id);
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  const start = addDays(today, -42);
  await q(`update public.profiles set onboarded = true, display_name = 'Quinton', timezone = $2, start_date = $3, weekly_schedule = $4, training_mode = 'intro', prefs = $5, start_weight_lb = 163, goal_weight_lb = 183 where id = $1`, [uid, TZ, start, PPL_WEEK, PREFS]);

  // the six PPL rows as production stores them, Pull B customised
  const rows = PPL_ROWS.map((r) =>
    r.key === "pull_b" ? { ...r, name: "Pull B (Q)", exercises: r.exercises.map((e) => (e.slug === "wrist-curl" ? { ...e, sets: 3, note: "QA custom" } : e)) } : r,
  );
  for (const r of rows) await q(`insert into public.program_templates (user_id, key, name, focus, sort, warmup, exercises) values ($1,$2,$3,$4,$5,$6,$7)`, [uid, r.key, r.name, r.focus, r.sort, JSON.stringify(r.warmup), JSON.stringify(r.exercises)]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

  // six weeks of done PPL sessions on their weekdays before today
  const dates = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d) => d < today && dow(d) !== 0);
  const lastOf = (key) => dates.filter((d) => PPL_WEEK[dow(d)] === key).at(-1);
  const lastDate = Object.fromEntries(Object.entries(CONTROLLED).map(([slug, c]) => [slug, lastOf(c.key)]));
  let sessions = 0;
  let setsN = 0;
  for (const [wi, d] of dates.entries()) {
    const key = PPL_WEEK[dow(d)];
    const t = byKey[key];
    const sid = crypto.randomUUID();
    const sets = [];
    t.exercises.forEach((e, order) => {
      const c = CONTROLLED[e.slug];
      // a controlled lift's last session is the fixed one: later sessions of another template skip it
      if (c && c.key !== key && d > lastDate[e.slug]) return;
      const fixed = c && c.key === key && d === lastDate[e.slug] ? c.sets : null;
      const week = Math.floor(wi / 6);
      const base = { "box-jump": 0, "approach-jump": 0, "broad-jump": 0 }[e.slug] ?? 40 + ((e.slug.length * 7) % 60);
      const n = fixed ? fixed.length : e.sets;
      for (let i = 0; i < n; i++) {
        const [w, r, rir] = fixed ? fixed[i] : [base ? base + 5 * Math.floor(week / 2) : null, Math.min(e.repHigh, e.repLow + (week % 3)), e.rir === "Fresh" ? null : 2];
        sets.push([sid, d, e.slug, e.name, order, i, w, e.unit === "sec" ? null : r, e.unit === "sec" ? r : null, rir, `${d}T21:${String(10 + order * 5 + i).padStart(2, "0")}:00Z`, e.repLow, e.repHigh, e.unit, e.rir, e.rest]);
      }
    });
    await q(`insert into public.workout_sessions (id, user_id, template_key, name, local_date, started_at, ended_at, duration_sec, status, mode, sets_completed) values ($1,$2,$3,$4,$5,$6,$7,3600,'done','standard',$8)`, [sid, uid, key, t.name, d, `${d}T21:00:00Z`, `${d}T22:00:00Z`, sets.length]);
    for (const s of sets) await q(`insert into public.exercise_sets (user_id, session_id, local_date, exercise_slug, exercise_name, exercise_order, set_index, kind, weight_lb, reps, duration_sec, rir, completed, completed_at, target_rep_low, target_rep_high, target_unit, target_rir, rest_sec) values ($1,$2,$3,$4,$5,$6,$7,'working',$8,$9,$10,$11,true,$12,$13,$14,$15,$16,$17)`, [uid, ...s]);
    sessions++;
    setsN += sets.length;
  }

  // an active intro session today: 3 sets done, 3 open, none of the controlled lifts
  const todayKey = PPL_WEEK[dow(today)] === "rest" ? "legs_b" : PPL_WEEK[dow(today)];
  const at = byKey[todayKey];
  const pick = at.exercises.filter((e) => !CONTROLLED[e.slug] && !/jump/.test(e.slug)).slice(0, 3);
  const asid = crypto.randomUUID();
  await q(`insert into public.workout_sessions (id, user_id, template_key, name, local_date, started_at, status, mode) values ($1,$2,$3,$4,$5,now() - interval '20 minutes','active','intro')`, [asid, uid, todayKey, at.name, today]);
  let k = 0;
  for (const [order, e] of pick.entries())
    for (let i = 0; i < 2; i++, k++) {
      const done = k < 3;
      await q(`insert into public.exercise_sets (user_id, session_id, local_date, exercise_slug, exercise_name, exercise_order, set_index, kind, weight_lb, reps, completed, completed_at, target_rep_low, target_rep_high, target_unit, target_rir, rest_sec) values ($1,$2,$3,$4,$5,$6,$7,'working',$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [uid, asid, today, e.slug, e.name, order, i, done ? 100 : null, done ? e.repLow : null, done, done ? new Date(Date.now() - (10 - k) * 60000).toISOString() : null, e.repLow, e.repHigh, e.unit, e.rir, e.rest]);
    }

  // his own day plans: a moved day, a rest day and an override inside the freeze window
  const plans = [
    [addDays(today, 2), "push_b", "rescheduled", addDays(today, 3)],
    [addDays(today, 3), "rest", "rescheduled", null],
    [addDays(today, 5), "rest", "rest", null],
    [addDays(today, -3), "rest", "rest", null],
  ];
  for (const [d, key, reason, from] of plans) await q(`insert into public.day_plans (user_id, plan_date, template_key, reason, moved_from) values ($1,$2,$3,$4,$5)`, [uid, d, key, reason, from]);

  // the rows that must stay hidden (and in the export)
  for (const i of [1, 3, 5]) await q(`insert into public.volleyball_sessions (user_id, local_date, kind, duration_min, intensity) values ($1,$2,'practice',90,3)`, [uid, addDays(today, -i)]);
  for (const i of [1, 2]) await q(`insert into public.recovery_logs (user_id, local_date, sleep_hours, soreness, fatigue, energy, volleyball) values ($1,$2,7.5,3,3,3,true)`, [uid, addDays(today, -i)]);
  await q(`insert into public.athletic_tests (user_id, local_date, test_type, value) values ($1,$2,'standing_vertical',26.5), ($1,$2,'broad_jump',104)`, [uid, addDays(today, -20)]);

  const snap = await snapshot(uid);
  const prefsBefore = (await profileRow(uid)).prefs;
  const plansBefore = await dayPlans(uid);
  // deploy A: functions and the column default; nothing switched
  psql(MIG_A);
  const after = await profileRow(uid);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ uid, today, todayKey, activeSession: asid, snap, prefsBefore, plansBefore, pplRowsMd5: snap.md5.program_templates }, null, 2));
  console.log(JSON.stringify({ setup: "ok", email: EMAIL, uid, today, todayKey, sessions, sets: setsN, controlled: lastDate, activeSession: asid, programAfterMigrationA: (after.prefs ?? {}).program ?? null, weekAfterMigrationA: after.weekly_schedule }, null, 2));
}

/* ================================================================ --switch */

async function doSwitch() {
  psql(MIG_B);
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  const p = await profileRow(st.uid);
  console.log(JSON.stringify({ switch: "applied", file: path.basename(MIG_B), program: p.prefs.program, programSwitch: p.prefs.programSwitch, week: p.weekly_schedule }, null, 2));
}

/* ================================================================ --verify */

const results = [];
const check = (id, ok, detail) => results.push({ id, ok: !!ok, detail });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (rows) => rows.map((r) => [r.plan_date, r.template_key, r.reason, r.moved_from, r.note ?? null]);

async function signIn() {
  const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  return c;
}

async function expectedD6(st) {
  const today = st.today;
  const out = [];
  for (let d = addDays(today, -14); d <= addDays(today, 5); d = addDays(d, 1)) {
    const own = st.plansBefore.find((p) => p.plan_date === d);
    if (d === addDays(today, -3)) out.push([d, "rest", "rest", null, null]);
    else if (d < today || d === today) {
      const pplKey = PPL_WEEK[dow(d)];
      // the switch freezes a date only when its old plan differs from the new one (Sundays are rest in both)
      if (!own && pplKey !== ARNOLD_WEEK[dow(d)]) out.push([d, pplKey, "custom", null, "program-switch"]);
    } else if (d === addDays(today, 2)) out.push([d, "shoulders_arms_b", "rescheduled", addDays(today, 3), null]);
    else if (own) out.push([d, own.template_key, own.reason, own.moved_from, own.note ?? null]);
  }
  return out;
}

async function verify() {
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  const uid = st.uid;
  const p = await profileRow(uid);
  const snap = await snapshot(uid);
  const prefs = p.prefs ?? {};

  check("D1", same(p.weekly_schedule, ARNOLD_WEEK), p.weekly_schedule);
  const keptKeys = Object.keys(st.prefsBefore).every((k) => same(prefs[k], st.prefsBefore[k]));
  check("D2", prefs.program === "arnold" && same(prefs.schedules?.ppl, PPL_WEEK) && prefs.programSwitch?.from === "ppl" && prefs.programSwitch?.to === "arnold" && prefs.programSwitch?.date === st.today && keptKeys, { program: prefs.program, schedules: prefs.schedules, programSwitch: prefs.programSwitch, keptKeys });
  check("D3", p.training_mode === "intro", p.training_mode);

  // D12 inserts the Arnold rows, so D4 compares the PPL rows only
  const pplMd5 = (await q(`select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) as h, count(*)::int as n from public.program_templates x where x.user_id = $1 and x.key = any($2)`, [uid, Object.values(PPL_WEEK).filter((k) => k !== "rest")]))[0];
  check("D4", pplMd5.h === st.snap.md5.program_templates.h && pplMd5.n === 6, { ppl: pplMd5, before: st.snap.md5.program_templates });

  const active = (await q(`select status, template_key, name, (select count(*)::int from public.exercise_sets s where s.session_id = w.id) as sets from public.workout_sessions w where id = $1`, [st.activeSession]))[0];
  check("D5", snap.md5.workout_sessions.h === st.snap.md5.workout_sessions.h && snap.md5.exercise_sets.h === st.snap.md5.exercise_sets.h && active?.status === "active" && active.sets === 6, { active, sessions: snap.md5.workout_sessions, sets: snap.md5.exercise_sets });

  const plans = norm(await dayPlans(uid));
  const want = await expectedD6(st);
  check("D6", same(plans, want), same(plans, want) ? `${plans.length} rows as expected` : { got: plans, want });

  const other = ["volleyball_sessions", "athletic_tests", "recovery_logs", "weight_entries", "food_entries", "water_logs", "meal_plans", "planned_meals", "grocery_items", "progress_photos"];
  const d7 = other.filter((t) => !same(snap.md5[t], st.snap.md5[t]));
  check("D7", d7.length === 0, d7.length ? d7 : "unchanged");
  check("D8", same(snap.counts, st.snap.counts), snap.counts);

  // D9: both files again → nothing changes
  const beforeD9 = { snap: await snapshot(uid), plans: await dayPlans(uid), profile: (await profileRow(uid)).h };
  psql(MIG_A);
  psql(MIG_B);
  const afterD9 = { snap: await snapshot(uid), plans: await dayPlans(uid), profile: (await profileRow(uid)).h };
  check("D9", same(beforeD9, afterD9), same(beforeD9, afterD9) ? "a second run changed nothing" : { beforeD9, afterD9 });

  // D10: two parallel switches to PPL as the QA user, then back
  const c = await signIn();
  const both = await Promise.all([c.rpc("set_training_program", { p_program: "ppl", p_today: st.today }), c.rpc("set_training_program", { p_program: "ppl", p_today: st.today })]);
  const changed = both.map((r) => r.data?.changed);
  const onPpl = { plans: norm(await dayPlans(uid)), week: (await profileRow(uid)).weekly_schedule };
  const fixture = norm(st.plansBefore);
  const back = await c.rpc("set_training_program", { p_program: "arnold", p_today: st.today });
  const onArnold = { plans: norm(await dayPlans(uid)), week: (await profileRow(uid)).weekly_schedule };
  check(
    "D10",
    changed.filter((x) => x === true).length === 1 && changed.filter((x) => x === false).length === 1 && same(onPpl.plans, fixture) && same(onPpl.week, PPL_WEEK) && back.data?.changed === true && same(onArnold.plans, want) && same(onArnold.week, ARNOLD_WEEK),
    { changed, errors: both.map((r) => r.error?.message ?? null), pplPlansEqualFixture: same(onPpl.plans, fixture), pplWeek: same(onPpl.week, PPL_WEEK), back: back.data, arnoldPlansEqualD6: same(onArnold.plans, want), arnoldWeek: same(onArnold.week, ARNOLD_WEEK) },
  );

  // D11: cross-user guard and anon
  const demo = (await q(`select id from auth.users where email = 'demo@greekgod.local'`))[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const cross = await c.rpc("set_training_program", { p_program: "ppl", p_user: demo });
  const anon = await createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("set_training_program", { p_program: "ppl", p_user: uid });
  check("D11", /not allowed/.test(cross.error?.message ?? "") && /permission denied/i.test(anon.error?.message ?? ""), { asQaUserForDemo: cross.error?.message ?? cross.data, asAnon: anon.error?.message ?? anon.data });

  // D12: after the first app load, the six Arnold rows equal the built-ins (sort 0–5); PPL rows unchanged
  const arn = await q(`select key, name, focus, sort, warmup, exercises from public.program_templates where user_id = $1 and key = any($2) order by sort`, [uid, Object.values(ARNOLD_WEEK).filter((k) => k !== "rest")]);
  if (!arn.length) check("D12", false, "pending: load the app once as qa-arnold (scripts/dev/qa-arnold-ui.mjs), then --verify again");
  else {
    const ref = arnoldBuiltins();
    const canon = (t) => JSON.stringify({ name: t.name, focus: t.focus ?? "", warmup: (t.warmup ?? []).map((w) => ({ label: w.label, detail: w.detail })), exercises: (t.exercises ?? []).map((e) => ({ slug: e.slug, name: e.name, sets: +e.sets, repLow: +e.repLow, repHigh: +e.repHigh, unit: e.unit, rir: e.rir, rest: +e.rest, optional: e.optional ? true : undefined, note: e.note || undefined })) });
    const okRows = arn.length === 6 && arn.every((r, i) => r.sort === i && r.key === ref[i].key && canon(r) === canon(ref[i]));
    check("D12", okRows && pplMd5.h === st.snap.md5.program_templates.h, { rows: arn.map((r) => [r.key, r.sort]), equalToBuiltins: okRows });
  }

  // D13: only set_training_program writes program/schedules/programSwitch
  const hits = execFileSync("grep", ["-rnE", "programSwitch|schedules|\\bprogram\\b", path.join(ROOT, "src"), "--include=*.ts", "--include=*.tsx"]).toString().split("\n");
  const writers = hits.filter((l) => /from\("profiles"\)\.(update|upsert)\([^)]*(program|schedules|programSwitch)/.test(l));
  const prefsWrite = readFileSync(path.join(ROOT, "src/lib/prefs.ts"), "utf8").includes('const SERVER_ONLY = new Set<string>(["program", "schedules", "programSwitch"])');
  check("D13", writers.length === 0 && prefsWrite, writers.length ? writers : "no client writes; mergePrefs never writes program/schedules/programSwitch");

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} ${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)}`);
  const failed = results.filter((r) => !r.ok).map((r) => r.id);
  console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "ALL PASS");
  return failed.length;
}

/** The built-in Arnold templates, straight from src/lib/training/program-arnold.ts (it has only a type import, so Node's type stripping loads it). */
function arnoldBuiltins() {
  const file = path.join(ROOT, "src/lib/training/program-arnold.ts");
  const js = `import(${JSON.stringify("file://" + file)}).then((m) => process.stdout.write(JSON.stringify(m.ARNOLD_TEMPLATES)))`;
  return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", js]).toString());
}

/* ================================================================== main */

try {
  if (process.argv.includes("--setup")) await setup();
  else if (process.argv.includes("--switch")) await doSwitch();
  else if (process.argv.includes("--verify")) process.exitCode = (await verify()) ? 1 : 0;
  else console.log("usage: node scripts/dev/qa-arnold.mjs --setup | --switch | --verify");
} finally {
  await db.end();
}
