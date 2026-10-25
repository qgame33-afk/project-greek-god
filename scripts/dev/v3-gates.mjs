// LOCAL DEVELOPMENT ONLY. The DESIGN-V3 gates (docs/DESIGN-V3-SIMPLE.md §5.2) on live routes:
//   G-1 banned text (volleyball; ritual and jargon words; old program names; uppercase eyebrows)
//   G-2 rendered style (italic, one family, gradients, blur, tags, ≤ 1 gold fill per scroll stop, /art/ images)
//   G-3 layout (overflow, console and page errors, 44 px targets, workout dock 56/64 px, last control above the bar) at 390×844 and 375×667
//   G-4 large text (html 28 px: no overflow, trios and duos in one column, workout numbers inside their cards)
//   G-5 reduced motion (300 ms after load nothing animates except .motion-keep)
//   G-6 URLs (the landing renders its heading, never "Something went wrong" or a 404)
//   G-9 the §5.1 budget (scripts/dev/budget.mjs)
// G-7 (source greps) and G-8 (tsc, eslint, vitest) run from the shell.
//
//   node scripts/dev/v3-gates.mjs --base http://localhost:3400 --user demo main:/ "main:/training" "/settings|text=Workout"
//
// Route specs: `[main:|detail:]<url>[|<selector to click>…]` (see scripts/dev/v3-lib.mjs); open each
// sheet in turn by listing it as its own route. Flags: --user <name>  --base <url>  --only G-1,G-3
// --ppl (the QA user is on Push/Pull/Legs: skip G-1 c)  --verbose (print every finding).
// Prints a table (one row per route) and the findings; exits 1 on any failure.

import { authState, budgetVerdict, context, goldEveryStop, launch, measureBudget, open, parseArgs, parseRoute } from "./v3-lib.mjs";

const a = parseArgs(process.argv.slice(2));
const base = a.flag("--base", "http://localhost:3400");
const user = a.flag("--user", "demo");
const only = a.flag("--only", "G-1,G-2,G-3,G-4,G-5,G-6,G-9").split(",");
const ppl = a.bool("--ppl");
const verbose = a.bool("--verbose");
const routes = a.rest().map(parseRoute);
if (!routes.length) {
  console.error("usage: node scripts/dev/v3-gates.mjs [--user demo] [main:]<route>[|<click>…] …");
  process.exit(2);
}

const VOLLEY = /volley|approach jump|box jump|broad jump|squat jump|\bsprints?\b|vertical jump|standing vertical|approach vertical|standing reach|jumps (&|and) sprints|\bathletic\b/i;
const RITUAL = /\b(Offering|Oracle|Inscribe|Inscription|Seal|Sealed|Chronicle|Ascent|Olympus|Summit|Terraces?|Rites?|Dawn|Dusk|Fuel|Refuel|Market|Hall|Gallery|Mountain|Oath|Gild(ing)?)\b/;
const JARGON = /\b(corridor|the climb|rites?|deload|e1rm|rir)\b/i;
const OLD_NAMES = /\b(Push|Pull|Legs) [AB]\b/;

/** Collects every visible text chunk and the a11y attributes, with the exclusion flags they sit under. */
function collectText(page) {
  return page.evaluate(() => {
    const out = [];
    const flags = (el) => ({
      exempt: !!el.closest("[data-food], [data-ai-answer], [data-program-text]"),
      history: !!el.closest("[data-history]"),
    });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const s = t.textContent.trim();
      const el = t.parentElement;
      if (!s || !el || el.closest("script, style, noscript")) continue;
      if (!el.getClientRects().length) continue;
      out.push({ text: s, ...flags(el) });
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt]"))
      for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
        const v = el.getAttribute(attr);
        if (v) out.push({ text: v, attr, ...flags(el) });
      }
    return out;
  });
}

async function g1(page, url) {
  const chunks = await collectText(page);
  const fails = [];
  const crs = [];
  const path = url.split("?")[0];
  const oldNamesApply = !ppl && (path === "/" || path.startsWith("/training") || path === "/nutrition" || path === "/workout/start");
  for (const c of chunks) {
    if (VOLLEY.test(c.text)) fails.push(`(a) volleyball: "${c.text.slice(0, 70)}"`);
    const ritual = c.text.match(RITUAL) ?? c.text.match(JARGON);
    if (ritual) (c.exempt ? crs : fails).push(`(b) "${ritual[0]}" in "${c.text.slice(0, 70)}"`);
    if (oldNamesApply && !c.history && OLD_NAMES.test(c.text)) fails.push(`(c) old program name: "${c.text.slice(0, 70)}"`);
  }
  const caps = await page.evaluate(() => {
    const bad = [];
    for (const el of document.body.querySelectorAll("*")) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      if (!text || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      const letters = (text.match(/\p{L}/gu) ?? []).length;
      const ls = parseFloat(cs.letterSpacing);
      if (cs.textTransform === "uppercase") bad.push(`uppercase: "${text.slice(0, 40)}"`);
      else if (letters >= 2 && Number.isFinite(ls) && ls / parseFloat(cs.fontSize) > 0.02 + 1e-6) bad.push(`letter-spacing ${cs.letterSpacing}: "${text.slice(0, 40)}"`);
    }
    return bad;
  });
  for (const c of caps) fails.push(`(d) ${c}`);
  return { fails: [...new Set(fails)], notes: [...new Set(crs)].map((x) => `change request to the text's owner: ${x}`) };
}

async function g2(page) {
  const found = await page.evaluate(() => {
    const out = [];
    const families = new Set();
    for (const el of document.body.querySelectorAll("*")) {
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        if (cs.fontStyle === "italic") out.push(`italic: "${el.textContent.trim().slice(0, 40)}"`);
        families.add(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      }
      for (const pseudo of [null, "::before", "::after"]) {
        const s = pseudo ? getComputedStyle(el, pseudo) : cs;
        if (/gradient\(/.test(s.backgroundImage) && !el.closest("[data-dock-fade]")) out.push(`gradient on <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}">${pseudo ?? ""}`);
        if (s.backdropFilter && s.backdropFilter !== "none") out.push(`backdrop-filter on <${el.tagName.toLowerCase()}>${pseudo ?? ""}`);
      }
      if (el.children.length === 0 && /^(LOG|PLAN|RULE|CALC|PROJ)$/.test(el.textContent.trim())) out.push(`provenance tag "${el.textContent.trim()}"`);
      if (el.tagName === "IMG" && /\/art\//.test(el.getAttribute("src") ?? "")) out.push(`image from /art/: ${el.getAttribute("src")}`);
    }
    const fams = [...families];
    if (fams.length !== 1 || fams[0] !== "-apple-system") out.push(`first font families: ${fams.join(" / ")} (want -apple-system)`);
    const faces = [...document.fonts].map((f) => f.family).filter((f) => /Cormorant|Bodoni|Inter Tight/i.test(f));
    if (faces.length) out.push(`retired font faces loaded: ${[...new Set(faces)].join(", ")}`);
    return out;
  });
  const gold = await goldEveryStop(page);
  if (gold > 1) found.push(`${gold} gold fills at one scroll stop`);
  return { fails: [...new Set(found)] };
}

async function g3(page, url) {
  return page.evaluate(
    ({ workout }) => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push(`horizontal overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`);
      const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().height > 0).pop() ?? null;
      const scope = dialog ?? document.body;
      const hit44 = (el) => {
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
          if (e.classList.contains("hit-44")) return true;
          const b = getComputedStyle(e, "::before");
          if (b.content !== "none" && b.position === "absolute" && parseFloat(b.width) >= 44 && parseFloat(b.height) >= 44) return true;
        }
        return false;
      };
      const small = [];
      for (const el of scope.querySelectorAll('button, a[href], [role="button"], [role="radio"], [role="switch"], [role="tab"], input:not([type="hidden"])')) {
        if (el.closest("[aria-hidden='true'], .sr-only, [inert]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        if ((r.width < 43.5 || r.height < 43.5) && !hit44(el)) small.push(`${Math.round(r.width)}×${Math.round(r.height)} ${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`);
      }
      if (small.length) out.push(`targets under 44 px (${small.length}): ${small.slice(0, 6).join("; ")}`);
      if (workout) {
        const dock = document.querySelector("[data-dock]");
        if (dock) {
          for (const b of dock.querySelectorAll("button")) {
            const h = b.getBoundingClientRect().height;
            if (h > 0 && h < 56) out.push(`workout dock control ${Math.round(h)} px < 56: "${b.textContent.trim().slice(0, 30)}"`);
          }
          const gold = dock.querySelector('[data-gold="fill"]');
          if (gold && gold.getBoundingClientRect().height < 64) out.push(`workout gold button ${Math.round(gold.getBoundingClientRect().height)} px < 64`);
        }
      }
      return out;
    },
    { workout: url.startsWith("/workout/") },
  );
}

/** Scrolled to the end, the last interactive element sits above the tab bar or dock. */
async function g3End(page) {
  return page.evaluate(async () => {
    if ([...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().height > 0)) return [];
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 250));
    const chrome = [document.querySelector("[data-tab-bar]"), document.querySelector("[data-dock]"), document.querySelector("[data-live-slot]")].filter((e) => e && e.getBoundingClientRect().height > 0);
    const top = Math.min(innerHeight, ...chrome.map((e) => e.getBoundingClientRect().top));
    const inChrome = (el) => el.closest("[data-tab-bar], [data-dock], [data-live-slot], [data-sonner-toaster], .vt-topbar, aside");
    const ctrls = [...document.querySelectorAll('main button, main a[href], main [role="button"], main input')].filter((e) => !inChrome(e) && e.getBoundingClientRect().height > 1 && !e.closest(".sr-only, [aria-hidden='true'], [inert]") && getComputedStyle(e).visibility !== "hidden");
    const last = ctrls.sort((x, y) => x.getBoundingClientRect().bottom - y.getBoundingClientRect().bottom).pop();
    const bottom = last ? last.getBoundingClientRect().bottom : 0;
    window.scrollTo(0, 0);
    if (last && bottom > top + 1) return [`last control under the bar (${Math.round(bottom)} > ${Math.round(top)}): "${(last.getAttribute("aria-label") ?? last.textContent).trim().slice(0, 30)}"`];
    return [];
  });
}

async function g4(page, url) {
  await page.addStyleTag({ content: "html{font-size:28px !important}" });
  await page.waitForTimeout(400);
  return page.evaluate((workout) => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth) out.push(`AX horizontal overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    for (const g of document.querySelectorAll("[data-stat-row]")) {
      const cols = getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (cols !== 1 && g.getBoundingClientRect().height > 0) out.push(`AX: a trio or duo keeps ${cols} columns`);
    }
    if (workout)
      for (const n of document.querySelectorAll(".t-gym")) {
        const card = n.closest('[role="group"]');
        if (!card) continue;
        const a = n.getBoundingClientRect();
        const b = card.getBoundingClientRect();
        if (a.right > b.right + 1 || a.left < b.left - 1) out.push("AX: a workout number leaves its card");
      }
    return out;
  }, url.startsWith("/workout/"));
}

async function g5(ctx, r) {
  const { page } = await open(ctx, base, r, { wait: 300 });
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((an) => an.playState === "running")
      .map((an) => an.effect?.target)
      .filter((t) => t && !(t.closest?.(".motion-keep, .wk-ring-arc, .wk-meter") ?? false))
      .map((t) => `<${t.tagName?.toLowerCase()} class="${String(t.className?.baseVal ?? t.className ?? "").slice(0, 50)}">`),
  );
  await page.close();
  return { fails: running.length ? [`animations still running under reduced motion: ${[...new Set(running)].slice(0, 5).join(", ")}`] : [] };
}

async function g6(page, status) {
  return page.evaluate((st) => {
    const out = [];
    if (st >= 400) out.push(`HTTP ${st}`);
    const body = document.body.innerText;
    if (/Something went wrong|This page could not be found|\b404\b/.test(body)) out.push("error or 404 page");
    const dialog = [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().height > 0);
    if (!dialog && ![...document.querySelectorAll("h1")].some((h) => h.getClientRects().length && h.textContent.trim())) out.push("no visible <h1> (the landing's heading)");
    return out;
  }, status);
}

const browser = await launch();
const state = await authState(browser, base, user);
const results = new Map(routes.map((r) => [r.spec, Object.fromEntries(only.map((g) => [g, []]))]));
const notes = new Map(routes.map((r) => [r.spec, []]));
const add = (r, g, fails) => only.includes(g) && results.get(r.spec)[g].push(...fails);

for (const size of ["phone", "small"]) {
  const ctx = await context(browser, size, state);
  for (const r of routes) {
    const { page, errors, status } = await open(ctx, base, r);
    const tag = size === "small" ? " (375×667)" : "";
    if (size === "phone") {
      if (only.includes("G-1")) {
        const x = await g1(page, r.url);
        add(r, "G-1", x.fails);
        notes.get(r.spec).push(...x.notes);
      }
      if (only.includes("G-2")) add(r, "G-2", (await g2(page)).fails);
      if (only.includes("G-6")) add(r, "G-6", await g6(page, status));
    }
    if (only.includes("G-3")) {
      add(r, "G-3", errors.map((e) => e + tag));
      add(r, "G-3", (await g3(page, r.url)).map((f) => f + tag));
      add(r, "G-3", (await g3End(page)).map((f) => f + tag));
    }
    if (only.includes("G-9")) {
      const b = await measureBudget(page);
      const gold = await goldEveryStop(page);
      add(r, "G-9", budgetVerdict(r.kind, b, gold).map((f) => `${f}${tag} [${b.blocks} blocks, ${b.words} words]`));
    }
    if (size === "phone" && only.includes("G-4")) add(r, "G-4", await g4(page, r.url));
    await page.close();
  }
  await ctx.close();
}
if (only.includes("G-5")) {
  const ctx = await context(browser, "phone", state, { reducedMotion: "reduce" });
  for (const r of routes) add(r, "G-5", (await g5(ctx, r)).fails);
  await ctx.close();
}
await browser.close();

let failed = false;
const w = Math.max(10, ...routes.map((r) => r.spec.length));
console.log("route".padEnd(w + 2) + only.map((g) => g.padEnd(6)).join(""));
for (const r of routes) {
  const res = results.get(r.spec);
  console.log(r.spec.padEnd(w + 2) + only.map((g) => (res[g].length ? "FAIL" : "pass").padEnd(6)).join(""));
}
for (const r of routes) {
  const res = results.get(r.spec);
  for (const g of only)
    if (res[g].length) {
      failed = true;
      console.log(`\n${r.spec} ${g}`);
      for (const f of verbose ? res[g] : res[g].slice(0, 8)) console.log("  - " + f);
      if (!verbose && res[g].length > 8) console.log(`  … ${res[g].length - 8} more (--verbose)`);
    }
  for (const n of notes.get(r.spec)) console.log(`\n${r.spec} note: ${n}`);
}
process.exit(failed ? 1 : 0);
