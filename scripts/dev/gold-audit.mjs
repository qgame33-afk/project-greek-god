// LOCAL DEVELOPMENT ONLY. The gold and glass budget audit (docs/DESIGN-V2.md §1.1.2, §1.4, §6).
//
//   node scripts/dev/gold-audit.mjs --base http://localhost:3300 --user demo / /training /nutrition
//
// Signs in like shot.mjs, loads each path at 390×844, scrolls it in viewport steps and fails
// (exit 1) when, at any scroll stop:
//   - more than one [data-gold="fill"] control is visible in the viewport (one gold fill per viewport);
//   - more than three elements on the page have a computed backdrop-filter (glass budget).
// Flags: --user demo|fresh|none  --base <url>  --desktop  --wait <ms>

import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  if (i === -1) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const bool = (n) => {
  const i = args.indexOf(n);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const user = flag("--user", "demo");
const base = flag("--base", "http://localhost:3000");
const wait = Number(flag("--wait", "1200"));
const desktop = bool("--desktop");
const paths = args.length ? args : ["/"];

const PASSWORD = "ascent-test-123";
const state = `/tmp/pgg-auth-${user}.json`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctxOpts = desktop
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function login() {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(base + "/sign-in", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', `${user}@greekgod.local`);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
  await ctx.storageState({ path: state });
  await ctx.close();
}

if (user !== "none" && !existsSync(state)) await login();
const ctx = await browser.newContext({ ...ctxOpts, ...(user !== "none" ? { storageState: state } : {}), reducedMotion: "reduce" });
let failed = 0;
const report = [];
for (const p of paths) {
  const page = await ctx.newPage();
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/sign-in") && user !== "none") {
    await login();
    await page.goto(base + p, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(wait);
  const stops = [];
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const vh = window.innerHeight;
      const visible = (el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
      const gold = [...document.querySelectorAll('[data-gold="fill"]')]
        .filter((el) => {
          if (!visible(el)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh;
        })
        .map((el) => (el.textContent ?? "").trim().slice(0, 30) || el.getAttribute("aria-label") || el.tagName);
      let blur = 0;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        const f = cs.backdropFilter || cs.webkitBackdropFilter;
        if (f && f !== "none" && visible(el)) blur++;
      }
      return { y: Math.round(window.scrollY), gold, blur, end: window.scrollY + vh >= document.documentElement.scrollHeight - 2 };
    });
    stops.push(s);
    if (s.end) break;
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.8)));
    await page.waitForTimeout(250);
  }
  const maxGold = Math.max(...stops.map((s) => s.gold.length));
  const maxBlur = Math.max(...stops.map((s) => s.blur));
  const bad = (maxGold > 1 ? 1 : 0) + (maxBlur > 3 ? 1 : 0);
  failed += bad;
  report.push({
    path: p,
    maxGoldPerViewport: maxGold,
    maxBackdropFilter: maxBlur,
    overGold: stops.filter((s) => s.gold.length > 1).map((s) => ({ y: s.y, gold: s.gold })),
    ok: !bad,
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
console.log(failed ? `gold-audit: FAIL (${failed} issues)` : "gold-audit: OK");
process.exit(failed ? 1 : 0);
