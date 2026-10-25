// scripts/dev/ownership.mjs — checks docs/DESIGN-V3-SIMPLE.md §6.2 against the tree.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? process.cwd();
const spec = readFileSync(process.env.SPEC ?? join(root, "docs/DESIGN-V3-SIMPLE.md"), "utf8");
const m = spec.match(/```ownership\n([\s\S]*?)```/);
if (!m) { console.error("no ownership block in the spec"); process.exit(1); }

const rules = m[1].split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((l) => {
  const [stream, pattern] = l.split(/\s+/);
  const exact = !pattern.includes("*");
  const rx = new RegExp("^" + pattern.split("**/").map((part) => part.split("**").map((p) => p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*")).join("(?:.*/)?") + "$");
  return { stream, pattern, exact, rx, hits: 0 };
});

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== "__scratch" && f !== "node_modules") walk(p); }
    else if (/\.(tsx|ts|css)$/.test(f)) files.push(relative(root, p));
  }
};
walk(join(root, "src/components"));
walk(join(root, "src/app"));
files.sort();

const owner = new Map();
const problems = [];
for (const f of files) {
  const exact = rules.filter((r) => r.exact && r.pattern === f);
  const globs = rules.filter((r) => !r.exact && r.rx.test(f));
  const pick = exact.length ? exact : globs;
  const streams = [...new Set(pick.map((r) => r.stream))];
  pick.forEach((r) => r.hits++);
  if (exact.length > 1) problems.push(`two exact rules for ${f}: ${exact.map((r) => r.stream).join(", ")}`);
  else if (streams.length === 0) problems.push(`NO OWNER  ${f}`);
  else if (streams.length > 1) problems.push(`OVERLAP   ${f}: ${pick.map((r) => `${r.stream} ${r.pattern}`).join(" | ")}`);
  else owner.set(f, streams[0]);
}
for (const r of rules) if (!r.hits) problems.push(`rule matches nothing: ${r.stream} ${r.pattern}`);

const tsx = files.filter((f) => f.endsWith(".tsx"));
const count = {};
for (const f of tsx) { const s = owner.get(f) ?? "?"; count[s] = (count[s] ?? 0) + 1; }
console.log(`files checked: ${files.length} (${tsx.length} .tsx)`);
console.log(".tsx per owner:", JSON.stringify(count));
if (process.argv.includes("--list")) for (const f of files) console.log((owner.get(f) ?? "?").padEnd(11), f);
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("OK: every .tsx under src/components and src/app has exactly one owner; every rule matches a file.");
