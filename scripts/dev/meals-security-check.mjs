// Meal planner data checks (local stack only; docs/MEALS.md §3). Mirrors security-check.mjs for
// the meal tables without touching the demo/fresh accounts: two throwaway users
// (qa-m-sec-a / qa-m-sec-b @greekgod.local) are created, exercised and deleted again.
//   - RLS: a signed-out visitor and a second account can't read, change, delete or forge rows
//     in any meal table, can't attach rows to someone else's plan or planned meal, and can't
//     run the plan/grocery RPCs against someone else's plan.
//   - Behaviour: replace_meal_plan keeps locked + logged meals, sync_grocery_items keeps
//     checked/have/removed and custom items, the food-log link is idempotent and set null
//     when its planned meal goes, and deleting the account removes every meal row.
// Usage: node scripts/dev/meals-security-check.mjs [-v]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error("Refusing: not a local Supabase URL");
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "ascent-test-123";
const results = [];
const check = (name, ok, detail = "") => results.push({ ok: !!ok, name, detail });

const MEAL_TABLES = ["meal_prefs", "recipes", "meal_plans", "planned_meals", "meal_feedback", "favourite_recipes", "grocery_items"];

async function freshUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const old = list.users.find((u) => u.email === email);
  if (old) await admin.auth.admin.deleteUser(old.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: siErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (siErr) throw siErr;
  return { id: data.user.id, client };
}

const A = await freshUser("qa-m-sec-a@greekgod.local");
const B = await freshUser("qa-m-sec-b@greekgod.local");
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const a = A.client;

/* ------------------------------------------------ A creates its own rows */
const WEEK = "2026-10-12"; // a Monday
const must = (label, r) => {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data;
};
must("prefs", await a.from("meal_prefs").upsert({ user_id: A.id, allergies: ["peanut"], snacks_per_day: 3 }, { onConflict: "user_id" }).select().single());
const recipe = must("recipe", await a.from("recipes").insert({ origin: "custom", name: "Test wrap", data: { key: "usr:x", name: "Test wrap" } }).select().single());
const meals = [
  { local_date: WEEK, slot: "breakfast", position: 0, recipe_key: "lib:scrambled-eggs-toast", servings: 1 },
  { local_date: WEEK, slot: "lunch", position: 0, recipe_key: "lib:chicken-wrap", servings: 1.5 },
  { local_date: "2026-10-13", slot: "dinner", position: 0, recipe_key: "lib:spaghetti-bolognese", servings: 2, reason: [{ kind: "macro_fit", text: "Fits dinner", weight: 1 }] },
  { local_date: "2026-10-13", slot: "snack", position: 1, recipe_key: "lib:protein-shake", servings: 1, reason: null },
];
const planId = must("replace", await a.rpc("replace_meal_plan", { p_week_start: WEEK, p_meals: meals, p_settings: { difficulty: "super_easy" } }));
const planned = must("planned", await a.from("planned_meals").select("*").eq("plan_id", planId).order("local_date").order("slot"));
check("A: replace_meal_plan creates the week", planned.length === 4, `${planned.length} meals`);
const breakfast = planned.find((m) => m.slot === "breakfast");
const lunch = planned.find((m) => m.slot === "lunch");
const dinner = planned.find((m) => m.slot === "dinner");
must("feedback", await a.from("meal_feedback").insert({ recipe_key: "lib:chicken-wrap", event: "thumbs_up", features: ["protein:chicken", "time:quick"] }));
must("fav", await a.from("favourite_recipes").insert({ recipe_key: "lib:chicken-wrap" }));
const groceryN = must(
  "sync",
  await a.rpc("sync_grocery_items", {
    p_plan_id: planId,
    p_items: [
      { key: "egg", name: "Eggs", category: "dairy_eggs", qty: 12, unit: "piece", label: "1 dozen", est_cost_cad: 4.5, position: 0 },
      { key: "tortilla", name: "Tortillas", category: "bread_grains", qty: 4, unit: "piece", label: "1 pack", position: 1 },
      { key: "salt", name: "Salt", category: "pantry", have: true, position: 2 },
      { key: "egg", name: "Eggs (dupe)", category: "dairy_eggs", position: 9 },
    ],
  }),
);
check("A: sync_grocery_items writes deduplicated items", groceryN === 3, `${groceryN} items`);
must("custom", await a.from("grocery_items").insert({ plan_id: planId, key: `custom:${crypto.randomUUID()}`, name: "Paper towel", custom: true }));

// food log link: idempotent upsert on a client-generated id
const entryId = crypto.randomUUID();
const entry = {
  id: entryId,
  local_date: WEEK,
  meal: "lunch",
  name: "Chicken wrap",
  amount: 1.5,
  unit: "serving",
  calories: 900,
  protein_g: 60,
  base_amount: 1,
  base_calories: 600,
  base_protein_g: 40,
  source: "meal_plan",
  confidence: "estimate",
  planned_meal_id: lunch.id,
};
const first = must("log 1", await a.from("food_entries").upsert(entry, { onConflict: "id", ignoreDuplicates: true }).select());
const second = must("log 2", await a.from("food_entries").upsert({ ...entry, calories: 1 }, { onConflict: "id", ignoreDuplicates: true }).select());
const { count: logCount } = await admin.from("food_entries").select("*", { count: "exact", head: true }).eq("planned_meal_id", lunch.id);
const stored = must("stored", await admin.from("food_entries").select("calories").eq("id", entryId).single());
check("A: logging a planned meal is idempotent", first.length === 1 && second.length === 0 && logCount === 1 && Number(stored.calories) === 900, `inserted ${first.length}, then ${second.length}; ${logCount} row(s), ${stored.calories} kcal`);

/* ------------------------------------------------------- integrity rules */
const outside = await a.from("planned_meals").insert({ plan_id: planId, local_date: "2026-10-19", slot: "dinner", recipe_key: "lib:x" });
check("A: a planned meal outside the plan week is refused", !!outside.error, outside.error?.message ?? "inserted!");
const notMonday = await a.from("meal_plans").insert({ week_start: "2026-10-14" });
check("A: a plan week must start on Monday", !!notMonday.error, notMonday.error?.message ?? "inserted!");
const badServings = await a.from("planned_meals").update({ servings: 9 }).eq("id", breakfast.id).select();
check("A: servings outside 0.25–6 are refused", !!badServings.error, badServings.error?.message ?? "updated!");
const badAllergy = await a.from("meal_prefs").update({ allergies: ["peanut", "kryptonite"] }).eq("user_id", A.id).select();
check("A: unknown allergies are refused", !!badAllergy.error, badAllergy.error?.message ?? "updated!");
const badSource = await a.from("food_entries").insert({ local_date: WEEK, meal: "lunch", name: "x", calories: 1, source: "made_up" });
check("A: food_entries.source check still holds", !!badSource.error, badSource.error?.message ?? "inserted!");

/* --------------------------------------------------- probes against A */
async function probe(label, sb, self) {
  for (const t of MEAL_TABLES) {
    const { data, error } = await sb.from(t).select("*").limit(50);
    const leaked = (data ?? []).filter((r) => r.user_id === A.id);
    check(`${label}: read ${t}`, leaked.length === 0, error ? `error ${error.code}` : `${data?.length ?? 0} visible rows`);
    const { data: byOwner } = await sb.from(t).select("*").eq("user_id", A.id);
    check(`${label}: filter ${t} by A's user_id`, (byOwner ?? []).length === 0);
  }
  const targets = [
    ["meal_prefs", "user_id", A.id, { snacks_per_day: 1 }],
    ["recipes", "id", recipe.id, { name: "hacked" }],
    ["meal_plans", "id", planId, { grocery_budget_cad: 1 }],
    ["planned_meals", "id", dinner.id, { recipe_key: "lib:hacked" }],
    ["favourite_recipes", "recipe_key", "lib:chicken-wrap", { repeat_ok: false }],
    ["grocery_items", "plan_id", planId, { checked: true }],
    ["meal_feedback", "user_id", A.id, { event: "thumbs_down" }],
  ];
  for (const [t, col, val, values] of targets) {
    const { data: upd } = await sb.from(t).update(values).eq(col, val).select();
    check(`${label}: update A's ${t}`, (upd ?? []).length === 0, `${upd?.length ?? 0} rows`);
    const { data: del } = await sb.from(t).delete().eq(col, val).select();
    check(`${label}: delete A's ${t}`, (del ?? []).length === 0, `${del?.length ?? 0} rows`);
  }
  const forged = {
    meal_prefs: { user_id: A.id },
    recipes: { user_id: A.id, origin: "custom", name: "forged", data: {} },
    meal_plans: { user_id: A.id, week_start: "2026-10-26" },
    planned_meals: { user_id: A.id, plan_id: planId, local_date: WEEK, slot: "dinner", recipe_key: "lib:forged" },
    meal_feedback: { user_id: A.id, recipe_key: "lib:x", event: "thumbs_down" },
    favourite_recipes: { user_id: A.id, recipe_key: "lib:forged" },
    grocery_items: { user_id: A.id, plan_id: planId, key: "forged", name: "forged" },
  };
  for (const [t, row] of Object.entries(forged)) {
    const { error } = await sb.from(t).insert(row);
    check(`${label}: insert a ${t} row as A`, !!error, error?.code ?? "inserted!");
  }
  if (self) {
    // rows owned by the intruder but pointing at A's parents
    const pm = await sb.from("planned_meals").insert({ user_id: self, plan_id: planId, local_date: WEEK, slot: "dinner", recipe_key: "lib:planted" });
    check(`${label}: attach a planned meal to A's plan`, !!pm.error, pm.error?.message ?? "inserted!");
    const gi = await sb.from("grocery_items").insert({ user_id: self, plan_id: planId, key: "planted", name: "planted" });
    check(`${label}: attach a grocery item to A's plan`, !!gi.error, gi.error?.message ?? "inserted!");
    const fe = await sb.from("food_entries").insert({ user_id: self, local_date: WEEK, meal: "lunch", name: "x", calories: 1, source: "meal_plan", planned_meal_id: lunch.id });
    check(`${label}: link a food entry to A's planned meal`, !!fe.error, fe.error?.message ?? "inserted!");
    const own = await sb.rpc("replace_meal_plan", { p_week_start: WEEK, p_meals: [{ local_date: WEEK, slot: "dinner", recipe_key: "lib:own" }] });
    check(`${label}: replace_meal_plan only writes the caller's own week`, !own.error && own.data !== planId, own.error?.message ?? `own plan ${String(own.data).slice(0, 8)}`);
  }
  const sync = await sb.rpc("sync_grocery_items", { p_plan_id: planId, p_items: [{ key: "planted", name: "planted" }] });
  check(`${label}: sync_grocery_items on A's plan`, !!sync.error, sync.error?.message ?? "ran!");
}

await probe("signed out", anon, null);
const anonRpc = await anon.rpc("replace_meal_plan", { p_week_start: WEEK, p_meals: [] });
check("signed out: replace_meal_plan refused", !!anonRpc.error, anonRpc.error?.message ?? "ran!");
await probe("other account", B.client, B.id);

// A's rows are exactly as A left them
const { data: aMeals } = await admin.from("planned_meals").select("recipe_key").eq("plan_id", planId);
check("A's planned meals untouched", (aMeals ?? []).length === 4 && !(aMeals ?? []).some((m) => /hacked|forged|planted/.test(m.recipe_key)), `${aMeals?.length} meals`);
const { data: aItems } = await admin.from("grocery_items").select("key, checked").eq("plan_id", planId);
check("A's grocery list untouched", (aItems ?? []).length === 4 && !(aItems ?? []).some((i) => i.checked || /planted|forged/.test(i.key)), `${aItems?.length} items`);
const { data: aPrefs } = await admin.from("meal_prefs").select("snacks_per_day").eq("user_id", A.id).single();
check("A's preferences untouched", aPrefs?.snacks_per_day === 3, `snacks_per_day ${aPrefs?.snacks_per_day}`);

// positive control: A reads every table
for (const t of MEAL_TABLES) {
  const { data } = await a.from(t).select("*");
  check(`control: A reads own ${t}`, (data ?? []).length > 0 && (data ?? []).every((r) => r.user_id === A.id), `${data?.length ?? 0} rows`);
}

/* ------------------------------------------------- replace semantics */
must("lock", await a.from("planned_meals").update({ locked: true }).eq("id", breakfast.id).select().single());
const replacement = [
  { local_date: WEEK, slot: "breakfast", position: 0, recipe_key: "lib:should-be-dropped" }, // collides with locked breakfast
  { local_date: WEEK, slot: "lunch", position: 0, recipe_key: "lib:should-be-dropped-too" }, // collides with the logged lunch
  { local_date: "2026-10-13", slot: "dinner", position: 0, recipe_key: "lib:beef-tacos", servings: 1.25 },
];
must("replace 2", await a.rpc("replace_meal_plan", { p_week_start: WEEK, p_meals: replacement }));
const after = must("after", await a.from("planned_meals").select("id, recipe_key, slot, locked").eq("plan_id", planId));
const keys = after.map((m) => m.recipe_key).sort();
check(
  "replace keeps locked and logged meals, replaces the rest",
  after.length === 3 && keys.join() === ["lib:beef-tacos", "lib:chicken-wrap", "lib:scrambled-eggs-toast"].join() && after.some((m) => m.id === breakfast.id) && after.some((m) => m.id === lunch.id),
  keys.join(", "),
);
const { data: settingsKept } = await a.from("meal_plans").select("settings").eq("id", planId).single();
check("replace without settings keeps the stored snapshot", settingsKept?.settings?.difficulty === "super_easy");

/* ------------------------------------------------- grocery semantics */
const items = must("items", await a.from("grocery_items").select("*").eq("plan_id", planId));
const egg = items.find((i) => i.key === "egg");
const tortilla = items.find((i) => i.key === "tortilla");
must("check egg", await a.from("grocery_items").update({ checked: true, have: true }).eq("id", egg.id).select().single());
must("remove tortilla", await a.from("grocery_items").update({ removed: true }).eq("id", tortilla.id).select().single());
must(
  "sync 2",
  await a.rpc("sync_grocery_items", {
    p_plan_id: planId,
    p_items: [
      { key: "egg", name: "Eggs", category: "dairy_eggs", qty: 18, unit: "piece", label: "1.5 dozen", position: 0 },
      { key: "tortilla", name: "Tortillas", category: "bread_grains", qty: 8, unit: "piece", position: 1 },
      { key: "ground-beef-lean", name: "Lean ground beef", category: "meat", qty: 454, unit: "g", have: true, position: 2 },
    ],
  }),
);
const items2 = must("items 2", await a.from("grocery_items").select("*").eq("plan_id", planId));
const egg2 = items2.find((i) => i.key === "egg");
const tort2 = items2.find((i) => i.key === "tortilla");
const beef2 = items2.find((i) => i.key === "ground-beef-lean");
check(
  "grocery sync keeps checked/have/removed, updates qty, keeps custom, drops stale",
  egg2?.checked && egg2?.have && Number(egg2?.qty) === 18 && tort2?.removed && beef2?.have && !beef2?.checked && !items2.some((i) => i.key === "salt") && items2.some((i) => i.custom),
  items2.map((i) => `${i.key}${i.checked ? "✓" : ""}${i.have ? "h" : ""}${i.removed ? "x" : ""}`).join(" "),
);
const { data: gen } = await a.from("meal_plans").select("grocery_generated_at").eq("id", planId).single();
check("grocery sync stamps grocery_generated_at", !!gen?.grocery_generated_at);

/* ------------------------------------------------- food link lifecycle */
must("unlock+delete", await a.from("planned_meals").delete().eq("id", lunch.id).select());
const { data: orphan } = await admin.from("food_entries").select("planned_meal_id, calories").eq("id", entryId).single();
check("deleting a planned meal keeps the food entry and clears the link", orphan && orphan.planned_meal_id === null && Number(orphan.calories) === 900, JSON.stringify(orphan));

/* ------------------------------------------------- account deletion */
await admin.auth.admin.deleteUser(A.id);
for (const t of [...MEAL_TABLES, "food_entries"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("user_id", A.id);
  check(`account deletion removes ${t}`, count === 0, `${count} left`);
}
await admin.auth.admin.deleteUser(B.id);

const bad = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.argv.includes("-v")) console.log(r.ok ? "PASS" : "FAIL", r.name, r.detail);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
