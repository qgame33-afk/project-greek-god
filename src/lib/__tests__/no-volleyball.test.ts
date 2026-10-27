import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PROGRAM-ARNOLD §6.4: no code says volleyball, jumps or sprints any more. The tables and rows
// stay in the database and the export; the retired jump slugs stay in the library for history.
const BANNED = /volley|approach.?jump|box.?jump|broad.?jump|squat.?jump|standing_vertical|approach_vertical|standing_reach|\bsprint\b/i;
const SRC = path.resolve(__dirname, "../..");

/** Where the words are allowed for good. */
const ALLOWED = new Set([
  "lib/supabase/database.types.ts", // generated: the tables stay
  "lib/export/tables.ts", // the export keeps the tables
  "lib/training/library.ts", // the four retired slugs, kept so history resolves
  "lib/training/programs.ts", // visibleWarmup's "Jump prep" filter
  "lib/__tests__/no-volleyball.test.ts",
]);

/**
 * Files still waiting on a stream to drop their volleyball reads (DESIGN-V3 §6.2, PROGRAM-ARNOLD
 * §6.2 and the deprecated P1 exports they read). It never grows; PROGRAM removes entries as
 * files come clean (the second test lists them) and P2/F4 empties it.
 */
const PENDING = new Set<string>([]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__scratch" || name === "node_modules") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path.relative(SRC, p).split(path.sep).join("/"));
  }
  return out;
}

describe("no volleyball (PROGRAM-ARNOLD §6.4)", () => {
  const matches = files(SRC).filter((f) => BANNED.test(readFileSync(path.join(SRC, f), "utf8")));

  it("appears nowhere outside the allowed files and the pending list", () => {
    expect(matches.filter((f) => !ALLOWED.has(f) && !PENDING.has(f))).toEqual([]);
  });

  it("reports pending files that are already clean (PROGRAM drops them from the list)", () => {
    const clean = [...PENDING].filter((f) => !matches.includes(f));
    if (clean.length) console.info(`no-volleyball: ready to leave PENDING: ${clean.join(", ")}`);
    expect(PENDING.size).toBeLessThanOrEqual(50);
  });
});
