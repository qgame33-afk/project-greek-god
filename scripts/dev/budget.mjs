// LOCAL DEVELOPMENT ONLY. The live first-viewport budget (docs/DESIGN-V3-SIMPLE.md §5.1, gate G-9):
// text blocks, words, gold fills (at every scroll stop), font families and provenance tags, at
// 390×844 and 375×667. Main screens: ≤ 25 blocks, ≤ 60 words; detail screens: ≤ 35, ≤ 90; ≤ 1
// gold fill, 1 family, 0 tags everywhere.
//
//   node scripts/dev/budget.mjs --base http://localhost:3400 --user demo main:/ /settings "main:/|[aria-label=Add]"
//
// Route specs are `[main:|detail:]<url>[|<selector to click>…]` (scripts/dev/v3-lib.mjs).
// Flags: --user demo|fresh|qa-<name>|none  --base <url>  --only phone|small  --wait <ms>
// Prints one row per route and size; exits 1 on any failure.

import { authState, budgetVerdict, context, goldEveryStop, launch, measureBudget, open, parseArgs, parseRoute, printTable } from "./v3-lib.mjs";

const a = parseArgs(process.argv.slice(2));
const base = a.flag("--base", "http://localhost:3400");
const user = a.flag("--user", "demo");
const only = a.flag("--only", "");
const wait = Number(a.flag("--wait", "1500"));
const routes = a.rest().map(parseRoute);
if (!routes.length) {
  console.error("usage: node scripts/dev/budget.mjs [--user demo] [main:]<route>[|<click>…] …");
  process.exit(2);
}

const browser = await launch();
const state = await authState(browser, base, user);
const rows = [["route", "size", "kind", "blocks", "words", "gold", "family", "tags", "result"]];
let failed = false;
for (const size of only ? [only] : ["phone", "small"]) {
  const ctx = await context(browser, size, state);
  for (const r of routes) {
    const { page, errors } = await open(ctx, base, r, { wait });
    const b = await measureBudget(page);
    const gold = await goldEveryStop(page);
    const fails = budgetVerdict(r.kind, b, gold);
    if (errors.some((e) => e.startsWith("click failed"))) fails.push(errors.find((e) => e.startsWith("click failed")));
    if (fails.length) failed = true;
    rows.push([r.spec, size, r.kind, String(b.blocks), String(b.words), String(gold), b.families.join("/"), String(b.tags), fails.length ? "FAIL " + fails.join("; ") : "pass"]);
    await page.close();
  }
  await ctx.close();
}
printTable(rows);
await browser.close();
process.exit(failed ? 1 : 0);
