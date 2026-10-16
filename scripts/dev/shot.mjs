// LOCAL DEVELOPMENT ONLY. Signs in as a local test user and screenshots pages.
//
//   node scripts/dev/shot.mjs --user demo --out /tmp/shots /  /training  /nutrition
//   node scripts/dev/shot.mjs --user fresh --desktop --full --out /tmp/shots /onboarding
//   node scripts/dev/shot.mjs --user demo --click "text=Log weight" --wait 800 --out /tmp/shots /progress
//
// Flags: --user demo|fresh|none  --desktop  --full (full page)  --click <selector> (repeatable)
//        --wait <ms after load>  --base http://localhost:3000  --out <dir>  --name <file prefix>
//        --scroll <px>
// Prints the saved file paths plus any console errors / failed requests seen on the page.

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

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
const clicks = [];
for (let i = args.indexOf("--click"); i !== -1; i = args.indexOf("--click")) {
  clicks.push(args[i + 1]);
  args.splice(i, 2);
}
const user = flag("--user", "demo");
const base = flag("--base", "http://localhost:3000");
const out = flag("--out", "/tmp/shots");
const name = flag("--name", "");
const wait = Number(flag("--wait", "900"));
const scroll = Number(flag("--scroll", "0"));
const desktop = bool("--desktop");
const full = bool("--full");
const paths = args.length ? args : ["/"];
mkdirSync(out, { recursive: true });

const PASSWORD = "ascent-test-123";
const state = `/tmp/pgg-auth-${user}.json`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctxOpts = desktop
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" };

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
const ctx = await browser.newContext({ ...ctxOpts, ...(user !== "none" ? { storageState: state } : {}), reducedMotion: "no-preference" });
const results = [];
for (const p of paths) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 300)));
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
  page.on("requestfailed", (r) => errors.push("failed: " + r.url().slice(0, 160) + " " + (r.failure()?.errorText ?? "")));
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("_next/webpack-hmr") && errors.push(`http ${r.status()}: ${r.url().slice(0, 160)}`));
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/sign-in") && user !== "none") {
    await login();
    await page.goto(base + p, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(wait);
  for (const c of clicks) {
    await page.locator(c).first().click({ timeout: 8000 });
    await page.waitForTimeout(700);
  }
  if (scroll) {
    await page.mouse.wheel(0, scroll);
    await page.waitForTimeout(500);
  }
  const file = path.join(out, `${name || (p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home")}${desktop ? "-desktop" : ""}${full ? "-full" : ""}.png`);
  await page.screenshot({ path: file, fullPage: full });
  // Mobile Chrome widens the layout viewport (zooming out) instead of scrolling, so also compare
  // innerWidth with the device width — otherwise a too-wide element never shows as overflow.
  const overflow = await page.evaluate((vw) => document.documentElement.scrollWidth > window.innerWidth + 1 || window.innerWidth > vw + 1, ctxOpts.viewport.width);
  results.push({ file, url: page.url(), overflowX: overflow, errors: [...new Set(errors)].slice(0, 15) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
