import { describe, expect, it } from "vitest";
import { addTime, clockText, durationText, isDone, isRinging, isRunning, pauseTimer, resumeTimer, sanitizeTimers, startTimer, timeLeft, timerId, timerProgress, visibleTimers } from "./timer-model";

const T0 = 1_760_000_000_000;
const make = (totalSec = 600, now = T0) => startTimer({ recipeKey: "lib:spaghetti-bolognese", step: 0, label: "Step 1 · Cook the spaghetti", totalSec }, now);

describe("cooking timers", () => {
  it("counts down from the clock, rounding up", () => {
    const t = make(600);
    expect(t.id).toBe(timerId("lib:spaghetti-bolognese", 0));
    expect(isRunning(t)).toBe(true);
    expect(timeLeft(t, T0)).toBe(600);
    expect(timeLeft(t, T0 + 400)).toBe(600);
    expect(timeLeft(t, T0 + 1000)).toBe(599);
    expect(timeLeft(t, T0 + 599_500)).toBe(1);
    expect(timeLeft(t, T0 + 600_000)).toBe(0);
    expect(timeLeft(t, T0 + 900_000)).toBe(0);
    expect(isDone(t, T0 + 600_000)).toBe(true);
    expect(timerProgress(t, T0 + 300_000)).toBeCloseTo(0.5);
  });

  it("pauses and resumes without losing time", () => {
    let t = make(600);
    t = pauseTimer(t, T0 + 100_000);
    expect(isRunning(t)).toBe(false);
    expect(timeLeft(t, T0 + 500_000)).toBe(500);
    t = resumeTimer(t, T0 + 500_000);
    expect(timeLeft(t, T0 + 510_000)).toBe(490);
    // pausing twice / resuming twice are no-ops
    expect(pauseTimer(pauseTimer(t, T0 + 520_000), T0 + 530_000).pausedLeft).toBe(480);
    expect(resumeTimer(t, T0)).toBe(t);
  });

  it("adds and removes time, never below zero, and re-arms a finished timer", () => {
    const t = make(60);
    expect(timeLeft(addTime(t, 60, T0), T0)).toBe(120);
    expect(addTime(t, 60, T0).totalSec).toBe(120);
    expect(timeLeft(addTime(t, -90, T0), T0)).toBe(0);
    const done = { ...t, dismissedAt: null, rangAt: T0 + 60_000 };
    const again = addTime(done, 60, T0 + 120_000);
    expect(timeLeft(again, T0 + 120_000)).toBe(60);
    expect(again.rangAt).toBeNull();
    const paused = addTime(pauseTimer(t, T0 + 30_000), 30, T0 + 40_000);
    expect(timeLeft(paused, T0 + 99_000)).toBe(60);
  });

  it("rings once finished until dismissed", () => {
    const t = make(60);
    expect(isRinging(t, T0 + 59_000)).toBe(false);
    expect(isRinging(t, T0 + 60_000)).toBe(true);
    expect(isRinging({ ...t, dismissedAt: T0 + 61_000 }, T0 + 62_000)).toBe(false);
  });

  it("shows running timers and recent alarms only", () => {
    const a = make(60);
    const b = { ...make(60), id: "b" };
    const c = { ...make(60), id: "c", dismissedAt: T0 + 70_000 };
    expect(visibleTimers([a, b, c], T0 + 30_000).map((t) => t.id)).toEqual([a.id, "b"]);
    expect(visibleTimers([a], T0 + 60_000 + 11 * 60_000)).toEqual([]);
  });

  it("formats clocks and durations", () => {
    expect(clockText(599)).toBe("9:59");
    expect(clockText(5)).toBe("0:05");
    expect(clockText(3723)).toBe("1:02:03");
    expect(clockText(-4)).toBe("0:00");
    expect(durationText(600)).toBe("10 min");
    expect(durationText(45)).toBe("45 sec");
    expect(durationText(90)).toBe("1 min 30 sec");
    expect(durationText(3900)).toBe("1 h 5 min");
    expect(durationText(7200)).toBe("2 h");
  });

  it("caps absurd lengths and cleans what was stored on the device", () => {
    expect(make(99_999).totalSec).toBe(4 * 3600);
    expect(make(0).totalSec).toBe(1);
    const ok = make(600);
    const stale = { ...make(60), id: "stale", endAt: T0 - 2 * 3600_000 };
    const raw = [ok, stale, null, { id: 3 }, { ...ok, id: "nothing", endAt: null, pausedLeft: null }, { ...ok, id: "paused", endAt: null, pausedLeft: 30 }];
    expect(sanitizeTimers(raw, T0).map((t) => t.id)).toEqual([ok.id, "paused"]);
    expect(sanitizeTimers("nope", T0)).toEqual([]);
  });
});
