import { describe, expect, it } from "vitest";
import {
  adjustRest,
  announcement,
  defaultRestSec,
  elapsedSec,
  endedAgoSec,
  endedWhileAway,
  formatClock,
  isFinalStretch,
  isRunning,
  pauseRest,
  remainingSec,
  restProgress,
  resumeRest,
  startRest,
} from "./rest";

const meta = { sessionId: "s1", fromSetId: "set1", exercise: "Bench Press", next: { setId: "set2", exercise: "Bench Press", set: "Set 2", load: "185 × 6" } };

describe("rest timer", () => {
  it("counts down from the prescribed rest in whole seconds", () => {
    const r = startRest(1000, 180, meta);
    expect(r.endSec).toBe(1180);
    expect(remainingSec(r, 1000)).toBe(180);
    expect(remainingSec(r, 1090)).toBe(90);
    expect(remainingSec(r, 1300)).toBe(0);
    expect(elapsedSec(r, 1030)).toBe(30);
    expect(restProgress(r, 1090)).toBeCloseTo(0.5);
    expect(isRunning(r, 1100)).toBe(true);
    expect(isRunning(r, 1180)).toBe(false);
  });

  it("survives a refresh because everything derives from endSec", () => {
    const r = startRest(5000, 120, meta);
    const restored = JSON.parse(JSON.stringify(r));
    expect(remainingSec(restored, 5075)).toBe(45);
  });

  it("±15 keeps elapsed time and never goes below zero", () => {
    const r = startRest(0, 120, meta);
    const plus = adjustRest(r, 15, 30);
    expect(remainingSec(plus, 30)).toBe(105);
    expect(plus.total).toBe(135);
    expect(elapsedSec(plus, 30)).toBe(30);
    const minus = adjustRest(r, -15, 30);
    expect(remainingSec(minus, 30)).toBe(75);
    expect(minus.total).toBe(105);
    const tooFar = adjustRest(r, -15, 110);
    expect(remainingSec(tooFar, 110)).toBe(0);
    expect(tooFar.total).toBe(110);
  });

  it("pauses and resumes without losing time", () => {
    const r = startRest(0, 90, meta);
    const p = pauseRest(r, 30);
    expect(remainingSec(p, 500)).toBe(60);
    expect(endedAgoSec(p, 500)).toBe(0);
    const adj = adjustRest(p, 15, 500);
    expect(remainingSec(adj, 900)).toBe(75);
    const res = resumeRest(adj, 1000);
    expect(remainingSec(res, 1000)).toBe(75);
    expect(remainingSec(res, 1075)).toBe(0);
  });

  it("reports how long ago rest ended after backgrounding", () => {
    const r = startRest(0, 60, meta);
    expect(endedAgoSec(r, 102)).toBe(42);
    expect(endedWhileAway(r, 102)).toBe(true);
    expect(endedWhileAway(r, 61)).toBe(false);
    expect(endedWhileAway({ ...r, doneShown: true }, 102)).toBe(false);
  });

  it("marks the final ten seconds", () => {
    expect(isFinalStretch(11)).toBe(false);
    expect(isFinalStretch(10)).toBe(true);
    expect(isFinalStretch(1)).toBe(true);
    expect(isFinalStretch(0)).toBe(false);
  });

  it("announces at 60, 30, 10 and 0 seconds only", () => {
    expect(announcement(null, 60)).toBeNull();
    expect(announcement(61, 60)).toBe("1 minute of rest left");
    expect(announcement(60, 59)).toBeNull();
    expect(announcement(31, 30)).toBe("30 seconds left");
    expect(announcement(11, 10)).toBe("10 seconds left");
    expect(announcement(1, 0)).toBe("Rest over. Next set.");
    expect(announcement(45, 25)).toBe("30 seconds left"); // skipped ahead with −15
    expect(announcement(20, 35)).toBeNull(); // +15 never announces
  });

  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(150)).toBe("2:30");
    expect(formatClock(-4)).toBe("0:00");
  });

  it("falls back to programme rest rules", () => {
    expect(defaultRestSec("compound")).toBeGreaterThanOrEqual(120);
    expect(defaultRestSec("isolation")).toBeGreaterThanOrEqual(60);
    expect(defaultRestSec("isolation")).toBeLessThanOrEqual(120);
    expect(defaultRestSec("explosive")).toBeGreaterThanOrEqual(120);
    expect(defaultRestSec("compound", 210)).toBe(210);
  });
});
