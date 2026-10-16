import { describe, expect, it } from "vitest";
import { runDispatch, type DispatchDeps, type PushPayload, type PushTarget, type SendResult } from "./dispatch";
import type { ReminderFacts } from "./schedule";

const facts: ReminderFacts = {
  plannedWorkout: { name: "Legs B", exercises: 5, minutes: 65 },
  workoutDone: false,
  mealsLogged: 0,
  caloriesToday: 0,
  calorieGoal: 3300,
  waterMl: 0,
  waterGoalMl: 3000,
  weighedInToday: false,
  weighInsThisWeek: 0,
  lastPhotoDate: null,
  lastMonthReviewSaved: false,
  sleepGoalH: 8,
};

function fakeDeps(opts: { targets: PushTarget[]; send?: (t: PushTarget) => SendResult; reminders?: unknown; sent?: string[] }) {
  const claims = new Set<string>();
  const removed: string[] = [];
  const released: string[] = [];
  const sends: { target: string; payload: PushPayload }[] = [];
  let factsCalls = 0;
  let targets = [...opts.targets];
  const deps: DispatchDeps = {
    candidates: async () => [
      { userId: "u1", timezone: "America/Toronto", reminders: opts.reminders ?? { workout: { on: true, time: "17:00" }, food: { on: true, time: "17:00" } } },
      { userId: "u2", timezone: "America/Toronto", reminders: {} },
    ],
    facts: async () => {
      factsCalls++;
      return facts;
    },
    sentOn: async () => opts.sent ?? [],
    claim: async (u, n) => {
      const k = `${u}|${n.kind}|${n.dueKey}`;
      if (claims.has(k)) return false;
      claims.add(k);
      return true;
    },
    release: async (u, n) => {
      claims.delete(`${u}|${n.kind}|${n.dueKey}`);
      released.push(n.kind);
    },
    subscriptions: async () => targets,
    send: async (t, payload) => {
      sends.push({ target: t.id, payload });
      return opts.send ? opts.send(t) : { ok: true };
    },
    removeSubscription: async (id) => {
      removed.push(id);
      targets = targets.filter((t) => t.id !== id);
    },
  };
  return { deps, claims, removed, released, sends, factsCalls: () => factsCalls };
}

const T = (id: string): PushTarget => ({ id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" });
const at17 = new Date("2026-10-16T21:02:00Z"); // 17:02 in Toronto

describe("runDispatch", () => {
  it("sends due reminders to every device and records each once", async () => {
    const f = fakeDeps({ targets: [T("phone"), T("laptop")] });
    const s = await runDispatch(f.deps, { now: at17 });
    expect(s).toMatchObject({ users: 1, due: 2, sent: 2, failed: 0, removedSubscriptions: 0 });
    expect(f.sends).toHaveLength(4);
    expect(f.sends[0].payload).toMatchObject({ title: "Legs B today", url: "/", tag: "pgg-workout", kind: "workout" });
    expect([...f.claims].sort()).toEqual(["u1|food|2026-10-16", "u1|workout|2026-10-16"]);
    // a second, overlapping run can't double-send
    const again = await runDispatch(f.deps, { now: at17 });
    expect(again.sent).toBe(0);
    expect(again.skipped).toBe(2);
    expect(f.sends).toHaveLength(4);
  });

  it("loads nothing when no reminder is due at this time", async () => {
    const f = fakeDeps({ targets: [T("phone")] });
    const s = await runDispatch(f.deps, { now: new Date("2026-10-16T18:00:00Z") });
    expect(s.due).toBe(0);
    expect(f.factsCalls()).toBe(0);
  });

  it("removes subscriptions the push service says are gone (404/410)", async () => {
    const f = fakeDeps({ targets: [T("old"), T("phone")], send: (t) => (t.id === "old" ? { ok: false, gone: true, status: 410, error: "Gone" } : { ok: true }) });
    const s = await runDispatch(f.deps, { now: at17 });
    expect(f.removed).toEqual(["old"]);
    expect(s.removedSubscriptions).toBe(1);
    expect(s.sent).toBe(2);
    expect(f.sends.filter((x) => x.target === "old")).toHaveLength(1); // not retried for the second reminder
  });

  it("frees the slot when no device could be reached", async () => {
    const f = fakeDeps({ targets: [T("phone")], send: () => ({ ok: false, gone: false, status: 500, error: "boom" }) });
    const s = await runDispatch(f.deps, { now: at17 });
    expect(s.sent).toBe(0);
    expect(s.failed).toBe(2);
    expect(f.released.sort()).toEqual(["food", "workout"]);
    expect(f.claims.size).toBe(0);
  });

  it("dry runs report without sending or recording", async () => {
    const f = fakeDeps({ targets: [T("phone")] });
    const s = await runDispatch(f.deps, { now: at17, dryRun: true });
    expect(s.due).toBe(2);
    expect(s.results[0].kinds).toEqual(["workout", "food"]);
    expect(f.sends).toHaveLength(0);
    expect(f.claims.size).toBe(0);
  });

  it("respects reminders already sent today", async () => {
    const f = fakeDeps({ targets: [T("phone")], sent: ["workout", "hydration", "sleep"] });
    const s = await runDispatch(f.deps, { now: at17 });
    expect(s.due).toBe(0);
    expect(s.results[0].skipped).toBe("already done or daily limit reached");
  });
});
