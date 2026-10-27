// LOCAL DEVELOPMENT ONLY. Shared by scripts/dev/v3-gates.mjs and scripts/dev/budget.mjs
// (docs/DESIGN-V3-SIMPLE.md §5.1–§5.3): sign-in, contexts, route specs and the in-page measures.
//
// A route spec is `[main:|detail:]<url>[|<selector to click>…]`, e.g.
//   main:/                       Today, a main screen
//   /settings?section=account    a detail screen (the default)
//   main:/|[aria-label=Add]      the Add sheet over Today (clicks run in order, 900 ms apart)

import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

export const PASSWORD = "ascent-test-123";
export const SIZES = { phone: { width: 390, height: 844 }, small: { width: 375, height: 667 } };
export const LIMITS = { main: { blocks: 25, words: 60 }, detail: { blocks: 35, words: 90 } };

export function parseArgs(argv) {
  const args = [...argv];
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
  return { flag, bool, rest: () => args };
}

export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
}

/** Signs in once per user (state cached in /tmp like shot.mjs). `none` stays signed out. */
export async function authState(browser, base, user) {
  if (user === "none") return undefined;
  const state = `/tmp/pgg-auth-${user}.json`;
  if (existsSync(state)) return state;
  const ctx = await browser.newContext({ viewport: SIZES.phone });
  const page = await ctx.newPage();
  await page.goto(base + "/sign-in", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', user.includes("@") ? user : `${user}@greekgod.local`);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
  await ctx.storageState({ path: state });
  await ctx.close();
  return state;
}

export async function context(browser, size, state, extra = {}) {
  return browser.newContext({
    viewport: SIZES[size] ?? size,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ...(state ? { storageState: state } : {}),
    ...extra,
  });
}

export function parseRoute(spec) {
  let kind = "detail";
  let s = spec;
  const m = s.match(/^(main|detail):/);
  if (m) {
    kind = m[1];
    s = s.slice(m[0].length);
  }
  const [url, ...clicks] = s.split("|");
  return { spec, kind, url, clicks };
}

/** Opens a route (and its sheet), collecting console and page errors. */
export async function open(ctx, base, route, { wait = 1500 } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
  const res = await page.goto(base + route.url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => (errors.push("goto: " + e.message.slice(0, 120)), null));
  await page.waitForTimeout(wait);
  for (const c of route.clicks) {
    await page.locator(c).first().click({ timeout: 8000 }).catch(() => errors.push(`click failed: ${c}`));
    await page.waitForTimeout(900);
  }
  return { page, errors, status: res?.status() ?? 0 };
}

/**
 * §5.1 first-viewport budget, measured in the page: from under the status bar to the top of the
 * tab bar (in the workout, the top of the dock); for an open sheet, from its top edge to the
 * bottom, counting only the sheet.
 */
export function measureBudget(page) {
  return page.evaluate(() => {
    const vh = innerHeight;
    const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().height > 0).pop() ?? null;
    const scope = dialog ?? document.body;
    let bottom = vh;
    if (!dialog) {
      const bar = document.querySelector("[data-tab-bar]");
      const dock = document.querySelector("[data-dock]");
      for (const el of [bar, dock]) if (el && el.getBoundingClientRect().height > 0) bottom = Math.min(bottom, el.getBoundingClientRect().top);
    }
    const top = dialog ? Math.max(0, dialog.getBoundingClientRect().top) : 0;
    const opacity = (el) => {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const blocks = new Set();
    const families = new Set();
    const words = [];
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const s = t.textContent.trim();
      if (!s) continue;
      const el = t.parentElement;
      // .sr-only text is for VoiceOver only: it is never on screen, so it is not part of the budget
      if (!el || el.closest("[data-tab-bar], script, style, noscript, [data-sonner-toaster], .sr-only")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      const rc = r.getBoundingClientRect();
      if (rc.width <= 1 || rc.height <= 1 || rc.bottom <= top || rc.top >= bottom) continue;
      if (opacity(el) < 0.6) continue;
      const group = el.closest("[data-budget-group]");
      blocks.add(group ?? el);
      families.add(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      if (group) continue;
      const name = el.closest("[data-budget-name]");
      if (name) {
        if (!words.includes(name)) words.push(name);
      } else words.push(s);
    }
    const wordCount = words.reduce((n, x) => n + (typeof x === "string" ? x.split(/\s+/).filter((y) => /[\p{L}\p{N}]/u.test(y)).length : 1), 0);
    const tags = [...scope.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^(LOG|PLAN|RULE|CALC|PROJ)$/.test(e.textContent.trim()) && e.getBoundingClientRect().height > 0).length;
    return { blocks: blocks.size, words: wordCount, families: [...families], tags, sheet: !!dialog };
  });
}

/** Visible gold fills in the viewport (or in the open sheet). */
export function goldNow(page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().height > 0).pop() ?? null;
    const scope = dialog ?? document;
    return [...scope.querySelectorAll('[data-gold="fill"]')].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.height <= 0 || r.bottom <= 0 || r.top >= innerHeight) return false;
      for (let x = e; x && x.nodeType === 1; x = x.parentElement) if (Number(getComputedStyle(x).opacity) < 0.6 || getComputedStyle(x).visibility === "hidden") return false;
      return true;
    }).length;
  });
}

/** Max gold fills over the scroll stops (80% of the viewport each, to the end). */
export async function goldEveryStop(page) {
  let max = await goldNow(page);
  const sheet = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().height > 0));
  if (sheet) return max;
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = Math.round(vh * 0.8); y < total; y += Math.round(vh * 0.8)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(150);
    max = Math.max(max, await goldNow(page));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return max;
}

export function budgetVerdict(kind, b, gold) {
  const lim = LIMITS[kind];
  const fails = [];
  if (b.blocks > lim.blocks) fails.push(`blocks ${b.blocks} > ${lim.blocks}`);
  if (b.words > lim.words) fails.push(`words ${b.words} > ${lim.words}`);
  if (gold > 1) fails.push(`gold fills ${gold} > 1`);
  if (b.families.length !== 1) fails.push(`families ${b.families.join(" / ")}`);
  if (b.tags) fails.push(`tags ${b.tags}`);
  return fails;
}

export function printTable(rows) {
  const w = rows.reduce((m, r) => Math.max(m, r[0].length), 10);
  for (const r of rows) console.log(r[0].padEnd(w + 2) + r.slice(1).join("  "));
}
