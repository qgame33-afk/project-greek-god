import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { counterpartKey, PROGRAMS } from "@/lib/training/programs";

// The publication is two deploys (PROGRAM-V3 §3): A ships the functions and defaults, B only the one-time switch.
// At the Deploy A commit the switch waits in supabase/held/ (the deploy runner reads only
// supabase/migrations/); the Deploy B commit moves it into migrations/. Either way it is checked here.
const dir = path.resolve(__dirname, "../../../supabase/migrations");
const held = path.resolve(__dirname, "../../../supabase/held");
const B_NAME = "20261026000100_program_v3_switch.sql";
const A = readFileSync(path.join(dir, "20261026000000_program_v3.sql"), "utf8");
const B = readFileSync(existsSync(path.join(dir, B_NAME)) ? path.join(dir, B_NAME) : path.join(held, B_NAME), "utf8");

const arr = (sql: string, name: string) => JSON.parse(`[${new RegExp(`${name} text\\[\\] := array\\[([^\\]]+)\\]`).exec(sql)![1].replace(/'/g, '"')}]`);
const week = (sql: string, name: string) => JSON.parse(new RegExp(`${name} jsonb := '([^']+)'`).exec(sql)![1]);

describe("the two-set + metric migrations", () => {
  it("ship in two deploys: the switch is either held back or the last migration, never both", () => {
    const inMigrations = existsSync(path.join(dir, B_NAME));
    const inHeld = existsSync(path.join(held, B_NAME));
    expect(inMigrations !== inHeld).toBe(true);
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    if (inMigrations) expect(files.at(-1)).toBe(B_NAME);
    else expect(files.at(-1)).toBe("20261026000000_program_v3.sql");
  });

  it("are idempotent", () => {
    expect(A.startsWith("-- migrate:idempotent")).toBe(true);
    expect(B.startsWith("-- migrate:idempotent")).toBe(true);
  });

  it("use exactly the programs' keys and weeks", () => {
    expect(arr(A, "ppl_keys")).toEqual(PROGRAMS.ppl.keys);
    expect(arr(A, "two_keys")).toEqual(PROGRAMS.twoset.keys);
    expect(week(A, "ppl_week")).toEqual(PROGRAMS.ppl.schedule);
    expect(week(A, "two_week")).toEqual(PROGRAMS.twoset.schedule);
    const def = /set default '([^']+)'::jsonb/.exec(A)![1];
    expect(JSON.parse(def)).toEqual(PROGRAMS.twoset.schedule);
    for (const k of PROGRAMS.twoset.keys) expect(A).toContain(`'${k}'`);
    // the slot maps match counterpartKey (Push A ↔ Arms & Shoulders A …)
    PROGRAMS.ppl.keys.forEach((k, i) => expect(counterpartKey(k, "twoset")).toBe(arr(A, "two_keys")[i]));
    expect(A).not.toMatch(/arnold|shoulders_arms_a|legs_abs/i);
    expect(B).not.toMatch(/arnold/i);
  });

  it("are additive: nothing dropped, no session, set or template rewritten", () => {
    for (const sql of [A, B]) {
      expect(sql).not.toMatch(/\bdrop\b/i);
      expect(sql).not.toMatch(/delete from public\.workout_sessions/i);
      expect(sql).not.toMatch(/update public\.exercise_sets/i);
      expect(sql).not.toMatch(/update public\.program_templates/i);
      expect(sql).not.toMatch(/volleyball_sessions\s+set|athletic_tests\s+set|update public\.(volleyball_sessions|athletic_tests|recovery_logs)/i);
    }
  });

  it("deploy B's file holds only the one-time switch", () => {
    const body = B.replace(/--.*$/gm, "").trim();
    expect(body).toMatch(/^do \$\$[\s\S]*end \$\$;$/);
    expect(body).not.toMatch(/\bcreate\b|\balter\b/i);
    expect(body).toContain("public.set_training_program('twoset', null, p.id)");
    expect(body).toContain("? 'program'");
  });

  it("makes kg and cm the defaults, and switches existing accounts' units once (prefs.unitsSwitch)", () => {
    expect(A).toContain("alter column weight_unit set default 'kg'");
    expect(A).toContain("alter column length_unit set default 'cm'");
    const body = B.replace(/--.*$/gm, "");
    expect(body).toMatch(/set weight_unit = 'kg',\s+length_unit = 'cm'/);
    expect(body).toContain("where not (coalesce(prefs, '{}'::jsonb) ? 'unitsSwitch')");
    // the stored pounds and inches are never rewritten
    expect(body).not.toMatch(/weight_lb|_in\b|height_cm/);
  });

  it("guards the function: signed-in callers switch only themselves, anon can't call it", () => {
    expect(A).toContain("if auth.uid() is not null and uid <> auth.uid() then raise exception 'not allowed'");
    expect(A).toContain("revoke all on function public.set_training_program(text, date, uuid) from public, anon");
    expect(A).toMatch(/for update;/);
  });
});
