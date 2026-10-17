// LOCAL DEVELOPMENT ONLY. The type floor audit (docs/DESIGN-V2.md §1.2, §6).
//
//   node scripts/dev/type-audit.mjs --base http://localhost:3300 --user demo / /training /nutrition
//
// Signs in like shot.mjs, loads each path at 390×844 and fails (exit 1) on:
//   - any visible text (HTML or SVG <text>, at its rendered size) under 11 px;
//   - any `.t-monument` under 90 px.
// Flags: --user demo|fresh|none  --base <url>  --desktop  --wait <ms>  --root <px> (force html font-size)

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
const root = flag("--root", "");
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
const ctx = await browser.newContext({ ...ctxOpts, ...(user !== "none" ? { storageState: state } : {}) });
let failed = 0;
const report = [];
for (const p of paths) {
  const page = await ctx.newPage();
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/sign-in") && user !== "none") {
    await login();
    await page.goto(base + p, { waitUntil: "networkidle" });
  }
  if (root) await page.addStyleTag({ content: `html{font-size:${root}px!important}` });
  await page.waitForTimeout(wait);
  const found = await page.evaluate(() => {
    const out = { small: [], monument: [] };
    const visible = (el) =>
      typeof el.checkVisibility === "function" ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : el.getClientRects().length > 0;
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")}`;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest("[aria-hidden='true'] svg defs, script, style, noscript, .sr-only, nextjs-portal")) continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let px = parseFloat(getComputedStyle(el).fontSize);
      // SVG text: scale user units by the element's screen transform
      if (el instanceof SVGElement && typeof el.getScreenCTM === "function") {
        const m = el.getScreenCTM();
        if (m) px = px * Math.sqrt(m.a * m.a + m.b * m.b);
      }
      if (px < 10.95) out.small.push({ px: Math.round(px * 10) / 10, el: describe(el), text: text.slice(0, 40) });
    }
    for (const el of document.querySelectorAll(".t-monument")) {
      if (!visible(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 90) out.monument.push({ px, el: describe(el), text: (el.textContent ?? "").trim().slice(0, 20) });
    }
    return out;
  });
  const bad = found.small.length + found.monument.length;
  failed += bad;
  report.push({ path: p, under11: found.small.slice(0, 30), monumentUnder90: found.monument, total: bad });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
console.log(failed ? `type-audit: FAIL (${failed} issues)` : "type-audit: OK");
process.exit(failed ? 1 : 0);
