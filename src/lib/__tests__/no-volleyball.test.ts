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
 * §6.2 and the deprecated P1 exports they read). This list may only shrink: a listed file that
 * no longer matches fails the test until it is removed from here. Integration (P2/F4) empties it.
 */
const PENDING = new Set([
  // screens (TODAY, TRAIN, FOOD, PROGRESS, SHEETS, WORKOUT) and FOUNDATION's art/signature
  "components/art/icons.tsx",
  "components/meals/week/Mosaic.tsx",
  "components/meals/week/WeekPlanner.tsx",
  "components/now/CheckIn.tsx",
  "components/now/NowScreen.tsx",
  "components/now/bodies.tsx",
  "components/now/useDayInput.ts",
  "components/now/useNowData.ts",
  "components/onboarding/OathArt.tsx",
  "components/onboarding/OathSummary.tsx",
  "components/onboarding/steps.tsx",
  "components/oracle/context.ts",
  "components/progress/athletic/AthleticLogSheet.tsx",
  "components/progress/charts/HistoryChart.tsx",
  "components/progress/hall/Athletic.tsx",
  "components/progress/hall/HallTab.tsx",
  "components/progress/hall/TestSheet.tsx",
  "components/recovery/DateStrip.tsx",
  "components/recovery/GuidanceCard.tsx",
  "components/recovery/LedgerCheckIn.tsx",
  "components/recovery/VolleyballSheet.tsx",
  "components/recovery/WeeklyReviewCard.tsx",
  "components/reviews/sections.tsx",
  "components/settings/SettingsView.tsx",
  "components/settings/inputs.tsx",
  "components/signature/Colonnade.tsx",
  "components/training/DaySheet.tsx",
  "components/training/ProgramTab.tsx",
  "components/training/TrainingHub.tsx",
  "components/training/VolleyballList.tsx",
  "components/training/VolleyballSheet.tsx",
  "components/training/week/ReadinessStrip.tsx",
  "components/training/week/Temple.tsx",
  "components/training/week/TodaySession.tsx",
  "components/training/week/WeekTab.tsx",
  "components/workout/inscription/data.ts",
  // PROGRAM's deprecated exports those screens still read (P2 deletes them once they stop)
  "components/training/hooks.ts",
  "lib/adherence.ts",
  "lib/data/training.ts",
  "lib/now/day-engine.ts",
  "lib/onboarding/plan.ts",
  "lib/progress/athletic.ts",
  "lib/progress/hall.ts",
  "lib/recovery/checkin.ts",
  "lib/recovery/guidance.ts",
  "lib/recovery/volleyball.ts",
  "lib/recovery/weekly.ts",
  "lib/reviews/compute.ts",
  "lib/training/schedule.ts",
  "lib/training/week.ts",
]);

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

  it("the pending list only shrinks: a clean file must leave it", () => {
    expect([...PENDING].filter((f) => !matches.includes(f))).toEqual([]);
  });
});
