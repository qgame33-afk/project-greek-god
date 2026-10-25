import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROGRAMS } from "@/lib/training/programs";

// The publication is two deploys (PROGRAM-ARNOLD §3.1a): A ships the functions, B only the switch.
const dir = path.resolve(__dirname, "../../../supabase/migrations");
const A = readFileSync(path.join(dir, "20261021000000_arnold_program.sql"), "utf8");
const B = readFileSync(path.join(dir, "20261021000100_arnold_switch.sql"), "utf8");

const arr = (sql: string, name: string) => JSON.parse(`[${new RegExp(`${name} text\\[\\] := array\\[([^\\]]+)\\]`).exec(sql)![1].replace(/'/g, '"')}]`);
const week = (sql: string, name: string) => JSON.parse(new RegExp(`${name} jsonb := '([^']+)'`).exec(sql)![1]);

describe("the Arnold migrations", () => {
  it("are idempotent", () => {
    expect(A.startsWith("-- migrate:idempotent")).toBe(true);
    expect(B.startsWith("-- migrate:idempotent")).toBe(true);
  });

  it("use exactly the programs' keys and weeks", () => {
    expect(arr(A, "ppl_keys")).toEqual(PROGRAMS.ppl.keys);
    expect(arr(A, "arn_keys")).toEqual(PROGRAMS.arnold.keys);
    expect(week(A, "ppl_week")).toEqual(PROGRAMS.ppl.schedule);
    expect(week(A, "arn_week")).toEqual(PROGRAMS.arnold.schedule);
    const def = /set default '([^']+)'::jsonb/.exec(A)![1];
    expect(JSON.parse(def)).toEqual(PROGRAMS.arnold.schedule);
    for (const k of PROGRAMS.arnold.keys) expect(A).toContain(`'${k}'`);
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
    expect(body).toContain("public.set_training_program('arnold', null, p.id)");
    expect(body).toContain("? 'program'");
  });

  it("guards the function: signed-in callers switch only themselves, anon can't call it", () => {
    expect(A).toContain("if auth.uid() is not null and uid <> auth.uid() then raise exception 'not allowed'");
    expect(A).toContain("revoke all on function public.set_training_program(text, date, uuid) from public, anon");
    expect(A).toMatch(/for update;/);
  });
});
