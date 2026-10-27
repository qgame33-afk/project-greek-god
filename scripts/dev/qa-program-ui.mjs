// LOCAL DEVELOPMENT ONLY. UI checks of the two-set + metric switch-over (docs/PROGRAM-V3.md §6),
// signed in as qa-program@greekgod.local (run scripts/dev/qa-program.mjs --setup first).
//
//   node scripts/dev/qa-program-ui.mjs [--base http://localhost:3400] [--out <dir>] [--deployA] [--only U1,U10]
//
// --deployA runs U14 instead (before qa-program.mjs --switch: the new app on an unswitched PPL
// account shows the PPL week and writes nothing to program_templates or profiles).
// The first page load as the QA user is also what D12 (qa-program.mjs --verify) checks.
// U15: every screen shows loads and bodyweight in kg, never a pound or inch figure.
//
// Implemented here: U1 (week by weekday, page.clock at 09:00 Toronto), U2 (every template's
// rows), U10 (no volleyball words in text, aria-label, title, placeholder or alt), U11
// (screenshots at 390×844 and 375×667, horizontal overflow, console errors), U12 (fresh
// onboarding offers the two-set days), U14, U15 (kg on screens). U0, U3–U9 and U13 drive the workout, Train and
// check-in screens, which the screen streams are rebuilding; they are reported as TODO with
// the database facts they must produce, for the integration pass (G3).

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = flag("--base", "http://localhost:3400");
const OUT = flag("--out", "/tmp/qa-program-ui");
const ONLY = flag("--only", "")?.split(",").filter(Boolean) ?? [];
const DEPLOY_A = args.includes("--deployA");
const DB = process.env.QA_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE) || !/@(127\.0\.0\.1|localhost):/.test(DB)) throw new Error("Refusing: not local");
mkdirSync(OUT, { recursive: true });

const PASSWORD = "ascent-test-123";
const TZ = "America/Toronto";
const want = (id) => !ONLY.length || ONLY.includes(id);
const results = [];
const report = (id, ok, detail) => results.push({ id, ok, detail });

// the program, straight from the source (program-twoset.ts has only a type import)
const { TWOSET_TEMPLATES } = await import(`file://${path.join(ROOT, "src/lib/training/program-twoset.ts")}`).catch(async () => {
  const { execFileSync } = await import("node:child_process");
  const js = `import(${JSON.stringify("file://" + path.join(ROOT, "src/lib/training/program-twoset.ts"))}).then((m) => process.stdout.write(JSON.stringify(m)))`;
  return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", js]).toString());
});
const PPL_NAMES = ["Push A", "Pull A", "Legs A", "Push B", "Pull B (Q)", "Legs B"];
/** DESIGN-V3 G-1(a). */
/** A pound or inch figure on screen (program-v3 §6: kg and cm everywhere). */
const IMPERIAL = /\b\d+(?:[.,]\d+)?\s?(?:lb|lbs|pounds?|in|inches)\b(?!\s?(?:a|the|your|\d))/i;
const BANNED = /volley|approach jump|box jump|broad jump|squat jump|\bsprints?\b|vertical jump|standing vertical|approach vertical|standing reach|jumps (&|and) sprints|\bathletic\b/i;

const db = new pg.Client({ connectionString: DB });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = (await q(`select (now() at time zone $1)::date::text as d`, [TZ]))[0].d;
const dow = (s) => new Date(`${s}T12:00:00Z`).getUTCDay();
// the first full week after the fixture's own moved days (today+2 … today+5)
const nextMonday = addDays(today, (((8 - dow(today)) % 7) || 7) + 7);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const phone = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: TZ, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });

async function signedIn(email, size = [390, 844]) {
  const ctx = await browser.newContext(phone(...size));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
  return { ctx, page };
}

async function visit(page, url, wait = 1200) {
  const errors = [];
  const onC = (m) => m.type() === "error" && errors.push(m.text().slice(0, 200));
  const onE = (e) => errors.push(String(e).slice(0, 200));
  page.on("console", onC);
  page.on("pageerror", onE);
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(wait);
  page.off("console", onC);
  page.off("pageerror", onE);
  return errors;
}

/** Visible text plus every aria-label, title, placeholder and alt on the page. */
const pageWords = (page) =>
  page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")].flatMap((e) => ["aria-label", "title", "placeholder", "alt"].map((a) => e.getAttribute(a) ?? ""));
    return `${document.body.innerText}\n${attrs.join("\n")}`;
  });

const md5 = async (uid) => (await q(`select (select md5(coalesce(string_agg(x::text,'|' order by x.id),'')) from public.program_templates x where x.user_id=$1) as t, (select md5(p::text) from public.profiles p where p.id=$1) as p`, [uid]))[0];

try {
  const uid = (await q(`select id from auth.users where email = 'qa-program@greekgod.local'`))[0]?.id;
  if (!uid) throw new Error("qa-program@greekgod.local missing: run scripts/dev/qa-program.mjs --setup");

  if (DEPLOY_A) {
    /* U14: deploy A on an unswitched PPL account */
    const before = await md5(uid);
    const { ctx, page } = await signedIn("qa-program@greekgod.local");
    const errs = [...(await visit(page, "/training")), ...(await visit(page, "/"))];
    const text = await pageWords(page);
    await visit(page, "/training");
    const train = await pageWords(page);
    const after = await md5(uid);
    const shows = PPL_NAMES.some((n) => train.includes(n) || text.includes(n));
    report("U14", shows && !BANNED.test(train + text) && before.t === after.t && before.p === after.p, { showsPplNames: shows, banned: (train + text).match(BANNED)?.[0] ?? null, wroteTemplates: before.t !== after.t, wroteProfile: before.p !== after.p, errors: errs.slice(0, 5) });
    await page.screenshot({ path: path.join(OUT, "U14-training-ppl.png") });
    await ctx.close();
  } else {
    const { ctx, page } = await signedIn("qa-program@greekgod.local");
    // the first app load: useTemplates inserts the six two-set rows (D12)
    await visit(page, "/training", 2500);

    if (want("U1")) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(nextMonday, i);
        await page.clock.setFixedTime(new Date(`${d}T13:00:00Z`)); // 09:00 Toronto (EDT/EST close enough for a date)
        const tr = (await visit(page, "/training", 1500), await pageWords(page));
        const home = (await visit(page, "/", 1500), await pageWords(page));
        const t = TWOSET_TEMPLATES.find((x) => x.weekday === dow(d));
        // an open workout from another day leads Today until it is finished (U0), so Today is judged only without one
        const open = (await q(`select count(*)::int as n from public.workout_sessions where user_id = $1 and status = 'active'`, [uid]))[0].n > 0;
        const has = (txt) => (t ? [t.name, t.short].some((n) => txt.includes(n)) : /\brest\b/i.test(txt));
        days.push({ date: d, expect: t?.name ?? "Rest", train: has(tr), today: open ? "skipped (a workout is open)" : has(home) });
        await page.screenshot({ path: path.join(OUT, `U1-${d}-today.png`) });
      }
      report("U1", days.every((x) => x.train && x.today !== false), days);
    }

    if (want("U2")) {
      const rows = [];
      for (const t of TWOSET_TEMPLATES) {
        await visit(page, `/training/program/${t.key}`, 1500);
        const text = await pageWords(page);
        const missing = t.exercises.filter((e) => !text.includes(e.name)).map((e) => e.name);
        rows.push({ key: t.key, missing });
        await page.screenshot({ path: path.join(OUT, `U2-${t.key}.png`), fullPage: true });
      }
      report("U2", rows.every((r) => !r.missing.length), rows);
    }

    if (want("U10")) {
      const routes = ["/", "/training", "/training?tab=program", "/training?tab=lifts", "/progress", "/progress?tab=athletic", "/progress?tab=strength", "/recovery", "/recovery?checkin=1", "/reviews", "/settings", "/coach", "/nutrition", "/nutrition/meals"];
      const hits = [];
      for (const r of routes) {
        const errors = await visit(page, r, 1500);
        const words = await pageWords(page);
        const m = words.match(BANNED);
        if (m) hits.push({ route: r, word: m[0], at: words.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ") });
        if (errors.length) hits.push({ route: r, consoleErrors: errors.slice(0, 3) });
      }
      report("U10", !hits.some((h) => h.word), hits.length ? hits : "no banned word on any route");
    }

    if (want("U11")) {
      const shots = [];
      for (const size of [[390, 844], [375, 667]]) {
        const s = await signedIn("qa-program@greekgod.local", size);
        for (const r of ["/", "/training", "/training/program/arms_b", "/progress"]) {
          const errors = await visit(s.page, r, 1500);
          const overflow = await s.page.evaluate((vw) => document.documentElement.scrollWidth > window.innerWidth + 1 || window.innerWidth > vw + 1, size[0]);
          const file = path.join(OUT, `U11-${size.join("x")}-${r.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`);
          await s.page.screenshot({ path: file });
          shots.push({ route: r, size: size.join("×"), overflow, errors: errors.length, file });
        }
        await s.ctx.close();
      }
      report("U11", shots.every((s) => !s.overflow), shots);
    }
    if (want("U15")) {
      const active = (await q(`select id from public.workout_sessions where user_id = $1 and status = 'active' limit 1`, [uid]))[0]?.id;
      const routes = ["/", "/training", "/training?tab=lifts", "/training/exercise/incline-db-press", "/progress", "/progress?tab=strength", "/progress?tab=body", "/coach", "/settings", ...(active ? [`/workout/${active}`] : [])];
      const rows = [];
      for (const r of routes) {
        await visit(page, r, 1800);
        const words = await pageWords(page);
        const m = words.match(IMPERIAL);
        const kg = /\d\s?kg\b/.test(words);
        rows.push({ route: r, kg, imperial: m ? words.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ") : null });
        await page.screenshot({ path: path.join(OUT, `U15-${r.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`), fullPage: true });
      }
      report("U15", rows.every((x) => !x.imperial) && rows.some((x) => x.kg), rows);
    }
    await ctx.close();

    if (want("U12")) {
      const s = await signedIn("fresh@greekgod.local");
      await visit(s.page, "/onboarding", 1500);
      let text = await pageWords(s.page);
      // walk forward until the training step shows (Continue / Next)
      for (let i = 0; i < 6 && !TWOSET_TEMPLATES.some((t) => text.includes(t.short)); i++) {
        const btn = s.page.getByRole("button", { name: /continue|next|get started|start/i }).first();
        if (!(await btn.count())) break;
        await btn.click().catch(() => {});
        await s.page.waitForTimeout(800);
        text = await pageWords(s.page);
      }
      const offers = TWOSET_TEMPLATES.filter((t) => text.includes(t.short) || text.includes(t.name)).length;
      await s.page.screenshot({ path: path.join(OUT, "U12-onboarding.png") });
      report("U12", offers >= 1 && !BANNED.test(text), { twosetDaysShown: offers, banned: text.match(BANNED)?.[0] ?? null, note: "finishing onboarding (weekly_schedule = the two-set week, 6 rows) is SHEETS' flow; lib: onboarding/plan.test.ts" });
      await s.ctx.close();
    }

    for (const [id, what] of [
      ["U16", "kg entry and save in the workout (§10.5): type 22.5 kg → exercise_sets.weight_lb 49.6, shown back as 22.5 kg; the stepper moves 2 kg on dumbbells, 2.5 kg on bars and stacks (lib: loads.test.ts)"],
      ["U0", "open the active Pull A session (started on PPL); log one open set in kg; Finish → status done, name/template_key unchanged, no two-set exercise added (D5 holds until then)"],
      ["U3", "next Tuesday, Chest & Back: Start → 2 sets of each of 6 lifts in his order; rest 150/150/150/150/90/90; effort 0–1, then to failure; incline DB press suggested 29 kg after 27 kg × 10, 10 (lib: session.test.ts, progression.test.ts)"],
      ["U4", "log incline 29 kg × 8; rest timer 2:30; +15 → remaining rest 2:45; Undo"],
      ["U5", "next Monday, Arms & Shoulders: 12 sets; seated DB press suggested 24.5 kg after 22.5 kg × 12, 12; lateral raise ghost in kg"],
      ["U6", "History lists Push A … Pull B (Q) with kg loads; Incline Dumbbell Press detail shows the PPL sessions in kg; PRs in kg"],
      ["U7", "Program → switch to Push/Pull/Legs and Undo (DB side proven by D10)"],
      ["U8", "overlap tip in the workout: 'stop 1–2 reps short on Machine Chest Press' (lib: overlap.test.ts)"],
      ["U9", "rest-day options from a poor check-in (lib: schedule.test.ts shiftWeek)"],
      ["U13", "reorder the week after Wednesday's workout (lib: scheduleFreeze trainedToday test)"],
    ])
      if (want(id)) report(id, null, `TODO for the screen streams / G3: ${what}`);
  }
} finally {
  await browser.close();
  await db.end();
}

for (const r of results) console.log(`${r.ok === true ? "PASS" : r.ok === false ? "FAIL" : "TODO"} ${r.id} ${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)}`);
process.exitCode = results.some((r) => r.ok === false) ? 1 : 0;
