// SPEC §25 security test (local stack only): a signed-out visitor and a second account must not
// read or change another user's logs or photos; API routes and pages refuse anonymous calls.
// Usage: node scripts/dev/security-check.mjs [-v]   (needs the dev server and demo user)
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ ok, name, detail });

// one page large enough for every local account (the default page of 50 misses users once
// testers have created throwaway qa-* accounts)
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const demo = list.users.find((u) => u.email === "demo@greekgod.local");
let intr = list.users.find((u) => u.email === "intruder@greekgod.local");
if (!intr) intr = (await admin.auth.admin.createUser({ email: "intruder@greekgod.local", password: "intruder-test-123", email_confirm: true })).data.user;

const TABLES = ["profiles","goal_changes","custom_exercises","program_templates","day_plans","volleyball_sessions","workout_sessions","exercise_sets","food_entries","saved_foods","saved_meals","water_logs","ai_conversations","ai_messages","ai_usage","weight_entries","body_measurements","progress_photos","athletic_tests","recovery_logs","habit_definitions","habit_logs","monthly_reviews","push_subscriptions","reminder_deliveries","app_secrets","app_migrations"];
const VIEWS = ["daily_nutrition","daily_water","set_history","exercise_bests","exercise_daily","pr_events"];

// demo actually has data to steal
const demoCounts = {};
for (const t of ["workout_sessions","food_entries","weight_entries","recovery_logs"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("user_id", demo.id);
  demoCounts[t] = count;
}
check("demo account has data to protect", Object.values(demoCounts).every((c) => c > 0), JSON.stringify(demoCounts));
// a private photo of demo's to try to steal (temporary)
const photoPath = `${demo.id}/security-test.jpg`;
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z", "base64");
await admin.storage.from("progress-photos").upload(photoPath, jpeg, { contentType: "image/jpeg", upsert: true });
const { data: photo, error: phErr } = await admin.from("progress_photos").insert({ user_id: demo.id, local_date: "2020-01-02", pose: "front", storage_path: photoPath }).select().single();
if (phErr) throw phErr;
const { data: weight } = await admin.from("weight_entries").select("*").eq("user_id", demo.id).limit(1).single();

async function probe(label, sb) {
  for (const t of [...TABLES, ...VIEWS]) {
    const { data, error } = await sb.from(t).select("*").limit(5);
    const leaked = (data ?? []).filter((r) => r.user_id === demo.id || r.id === demo.id || t.startsWith("app_"));
    check(`${label}: read ${t}`, leaked.length === 0, error ? `error ${error.code}` : `${data?.length ?? 0} own rows`);
  }
  const { data: byId } = await sb.from("weight_entries").select("*").eq("user_id", demo.id);
  check(`${label}: filter by demo's user_id`, (byId ?? []).length === 0);
  // writes
  const { data: upd } = await sb.from("weight_entries").update({ weight_lb: 999 }).eq("id", weight.id).select();
  check(`${label}: update demo's weigh-in`, (upd ?? []).length === 0);
  const { data: del } = await sb.from("weight_entries").delete().eq("id", weight.id).select();
  check(`${label}: delete demo's weigh-in`, (del ?? []).length === 0);
  const { error: insErr } = await sb.from("weight_entries").insert({ user_id: demo.id, local_date: "2020-01-01", weight_lb: 1 });
  check(`${label}: insert a row as demo`, !!insErr, insErr?.code ?? "inserted!");
  const { error: secErr, data: sec } = await sb.from("app_secrets").select("*");
  check(`${label}: read app_secrets`, !!secErr || (sec ?? []).length === 0, secErr?.code ?? `${sec?.length}`);
  // storage
  const { data: dl, error: dlErr } = await sb.storage.from("progress-photos").download(photo.storage_path);
  check(`${label}: download demo's progress photo`, !dl && !!dlErr, dlErr?.message ?? "DOWNLOADED");
  const { data: su } = await sb.storage.from("progress-photos").createSignedUrl(photo.storage_path, 60);
  check(`${label}: sign a URL for demo's photo`, !su?.signedUrl);
  const { data: ls } = await sb.storage.from("progress-photos").list(demo.id);
  check(`${label}: list demo's photo folder`, (ls ?? []).length === 0, `${ls?.length ?? 0} items`);
  // a real image type, so a refusal comes from the access policy and not the bucket's MIME filter
  const { error: upErr } = await sb.storage.from("progress-photos").upload(`${demo.id}/planted.txt`, new Blob([jpeg], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  check(`${label}: upload into demo's folder`, !!upErr && !/mime type/i.test(upErr.message), upErr?.message ?? "UPLOADED");
  const { data: pub } = sb.storage.from("progress-photos").getPublicUrl(photo.storage_path);
  const r = await fetch(pub.publicUrl);
  check(`${label}: public URL of demo's photo`, r.status >= 400, `HTTP ${r.status}`);
  const before = (await admin.from("ai_usage").select("count").eq("user_id", demo.id)).data ?? [];
  await sb.rpc("bump_ai_usage", { p_feature: "coach", p_day: "2026-10-16", p_limit: 100 });
  const afterUse = (await admin.from("ai_usage").select("count").eq("user_id", demo.id)).data ?? [];
  check(`${label}: AI usage counter can't touch demo's`, JSON.stringify(before) === JSON.stringify(afterUse));
}

await probe("signed out", createClient(URL_, ANON, { auth: { persistSession: false } }));
const intruder = createClient(URL_, ANON, { auth: { persistSession: false } });
const { error: siErr } = await intruder.auth.signInWithPassword({ email: "intruder@greekgod.local", password: "intruder-test-123" });
check("intruder signs in", !siErr, siErr?.message ?? "");
await probe("other account", intruder);

// positive control: the owner can read the same things
const owner = createClient(URL_, ANON, { auth: { persistSession: false } });
await owner.auth.signInWithPassword({ email: "demo@greekgod.local", password: "ascent-test-123" });
const { data: ownDl } = await owner.storage.from("progress-photos").download(photoPath);
check("control: demo downloads own photo", !!ownDl && ownDl.size > 0, `${ownDl?.size ?? 0} bytes`);
const { data: ownW } = await owner.from("weight_entries").select("id").eq("id", weight.id);
check("control: demo reads own weigh-in", (ownW ?? []).length === 1);

// the weigh-in is untouched
const { data: after } = await admin.from("weight_entries").select("weight_lb").eq("id", weight.id).single();
check("demo's weigh-in unchanged", Number(after?.weight_lb) === Number(weight.weight_lb), `${weight.weight_lb} → ${after?.weight_lb}`);

// API routes refuse unauthenticated calls
for (const [method, path, body] of [["POST","/api/ai/coach",{messages:[{role:"user",content:"hi"}]}],["POST","/api/ai/food-chat",{messages:[{role:"user",content:"eggs"}]}],["POST","/api/ai/food-photo",{}],["POST","/api/ai/review",{month:"2026-09"}],["GET","/api/food/search?q=egg",null],["POST","/api/account/delete",{confirm:"DELETE"}],["POST","/api/push/subscribe",{}],["GET","/api/account/status",null],["POST","/api/reminders/dispatch",{}]]) {
  const res = await fetch("http://localhost:3000" + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  check(`signed out: ${method} ${path}`, [401, 403, 307, 308].includes(res.status), `HTTP ${res.status}`);
}
// pages redirect to sign-in
for (const p of ["/", "/progress?tab=photos", "/settings"]) {
  const res = await fetch("http://localhost:3000" + p, { redirect: "manual" });
  check(`signed out: page ${p}`, [307, 308].includes(res.status) && (res.headers.get("location") ?? "").includes("/sign-in"), `HTTP ${res.status} → ${res.headers.get("location")}`);
}

await admin.storage.from("progress-photos").remove([`${demo.id}/planted.txt`, photoPath]);
await admin.from("progress_photos").delete().eq("id", photo.id);
await admin.from("weight_entries").delete().eq("user_id", demo.id).eq("local_date", "2020-01-01");
await admin.auth.admin.deleteUser(intr.id);

const bad = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.argv.includes("-v")) console.log(r.ok ? "PASS" : "FAIL", r.name, r.detail);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
