// LOCAL DEVELOPMENT ONLY. Accessibility-size screenshots (docs/DESIGN-V2.md §1.2.2, §6).
//
//   node scripts/dev/ax-shot.mjs --base http://localhost:3300 --user demo --size 28 --out /tmp/ax / /training
//
// Signs in like shot.mjs, forces `html{font-size:<size>px}` (28 ≈ the iPhone's AX3 text size) at
// 390×844, screenshots each path and checks the floating chrome: horizontal overflow, the capsule's
// tab targets ≥ 44 px, its labels hidden at large sizes, and whether a tab target overlaps the
// Offering button. Prints a JSON report; exit 1 on any failed check.
// Flags: --user demo|fresh|none  --base <url>  --size <px>  --out <dir>  --full  --wait <ms>

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
const user = flag("--user", "demo");
const base = flag("--base", "http://localhost:3000");
const size = Number(flag("--size", "28"));
const out = flag("--out", "/tmp/ax-shots");
const wait = Number(flag("--wait", "1200"));
const full = bool("--full");
const paths = args.length ? args : ["/"];
mkdirSync(out, { recursive: true });

const PASSWORD = "ascent-test-123";
const state = `/tmp/pgg-auth-${user}.json`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

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
const ctx = await browser.newContext({ ...ctxOpts, ...(user !== "none" ? { storageState: state } : {}) });
await ctx.addInitScript((px) => {
  const add = () => {
    const s = document.createElement("style");
    s.textContent = `html{font-size:${px}px!important}`;
    document.head.appendChild(s);
  };
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add);
}, size);
let failed = 0;
const results = [];
for (const p of paths) {
  const page = await ctx.newPage();
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/sign-in") && user !== "none") {
    await login();
    await page.goto(base + p, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(wait);
  const file = path.join(out, `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-ax${size}${full ? "-full" : ""}.png`);
  await page.screenshot({ path: file, fullPage: full });
  const check = await page.evaluate((vw) => {
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1 || window.innerWidth > vw + 1;
    const capsule = document.querySelector("nav.capsule");
    const tabs = capsule ? [...capsule.querySelectorAll("a")].map((a) => a.getBoundingClientRect()) : [];
    const labels = capsule ? [...capsule.querySelectorAll(".capsule-label")].filter((l) => getComputedStyle(l).display !== "none").length : 0;
    const offer = document.querySelector('[data-offering="float"]')?.getBoundingClientRect() ?? null;
    const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      overflowX,
      capsule: !!capsule,
      smallestTab: tabs.length ? Math.round(Math.min(...tabs.map((r) => Math.min(r.width, r.height)))) : null,
      labelsShown: labels,
      tabOverlapsOffering: tabs.some((r) => overlap(r, offer)),
    };
  }, ctxOpts.viewport.width);
  const ok = !check.overflowX && (!check.capsule || ((check.smallestTab ?? 0) >= 44 && !check.tabOverlapsOffering));
  if (!ok) failed++;
  results.push({ file, ...check, ok });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
console.log(failed ? `ax-shot: FAIL (${failed} routes)` : "ax-shot: OK");
process.exit(failed ? 1 : 0);
