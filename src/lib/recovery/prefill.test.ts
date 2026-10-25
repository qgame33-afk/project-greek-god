import { describe, expect, it } from "vitest";
import { draftToPayload, type CheckinRowLite } from "./checkin";
import { dawnCheckinDone, mergeCheckin, sleepPrefill } from "./prefill";

const TODAY = "2026-10-19";
const night = (local_date: string, sleep_hours: number | string | null) => ({ local_date, sleep_hours });

describe("sleepPrefill", () => {
  it("odd count: the middle night", () => {
    const rows = [night("2026-10-16", 7), night("2026-10-17", 8.5), night("2026-10-18", 7.5)];
    expect(sleepPrefill(rows, TODAY)).toEqual({ hours: 7.5, nights: 3 });
  });

  it("even count: the mean of the middle two, snapped", () => {
    const rows = [night("2026-10-14", 6.5), night("2026-10-15", 7), night("2026-10-16", 7.5), night("2026-10-17", 9)];
    expect(sleepPrefill(rows, TODAY)).toEqual({ hours: 7.25, nights: 4 });
  });

  it("fewer than 3 nights → null", () => {
    expect(sleepPrefill([], TODAY)).toEqual({ hours: null, nights: 0 });
    expect(sleepPrefill([night("2026-10-17", 8), night("2026-10-18", 7)], TODAY)).toEqual({ hours: null, nights: 2 });
  });

  it("ignores today, nulls, blanks, impossible values and nights older than a week", () => {
    const rows = [
      night(TODAY, 4), // today's own row
      night("2026-10-18", null),
      night("2026-10-17", ""),
      night("2026-10-16", 0),
      night("2026-10-15", 30),
      night("2026-10-11", 5), // 8 nights back
      night("2026-10-12", 8), // 7 nights back: counts
      night("2026-10-13", "7.5"),
      night("2026-10-14", 7),
    ];
    expect(sleepPrefill(rows, TODAY)).toEqual({ hours: 7.5, nights: 3 });
  });

  it("snaps to the 0.25 h stepper: 7.1 → 7.0", () => {
    const rows = [night("2026-10-16", 7.1), night("2026-10-17", 7.1), night("2026-10-18", 7.1)];
    expect(sleepPrefill(rows, TODAY).hours).toBe(7);
    const odd = [night("2026-10-16", 6.6), night("2026-10-17", 6.62), night("2026-10-18", 9)];
    expect(sleepPrefill(odd, TODAY).hours).toBe(6.5);
  });

  it("crosses a month boundary and a DST change", () => {
    const rows = [night("2026-10-30", 7), night("2026-10-31", 8), night("2026-11-01", 7.75)];
    expect(sleepPrefill(rows, "2026-11-02")).toEqual({ hours: 7.75, nights: 3 });
  });
});

describe("mergeCheckin", () => {
  const stored: CheckinRowLite = {
    local_date: TODAY,
    sleep_hours: "7.50",
    sleep_quality: 4,
    energy: null,
    soreness: null,
    fatigue: 2,
    stress: 3,
    pain_notes: "left knee",
  };

  it("keeps every field the patch leaves out", () => {
    const d = mergeCheckin(stored, { soreness: 2 });
    expect(d).toEqual({ sleep: 7.5, quality: 4, energy: null, soreness: 2, fatigue: 2, stress: 3, pain: "left knee", volleyball: false });
    const payload = draftToPayload(TODAY, d);
    expect(payload.pain_notes).toBe("left knee");
    expect(payload.sleep_quality).toBe(4);
  });

  it("answers one at a time, never losing the earlier ones", () => {
    let row: CheckinRowLite | null = null;
    for (const patch of [{ sleep: 7.5 }, { soreness: 2 }, { energy: 4 }]) {
      const d = mergeCheckin(row, patch);
      const p = draftToPayload(TODAY, d);
      row = { ...p, local_date: TODAY };
    }
    expect(row).toMatchObject({ sleep_hours: 7.5, soreness: 2, energy: 4, sleep_quality: null });
    // the payload never carries volleyball, so a stored value stays as it is
    expect(row && "volleyball" in row).toBe(false);
    expect(dawnCheckinDone(row)).toBe(true);
  });

  it("undefined never clears; an explicit null does", () => {
    expect(mergeCheckin(stored, { fatigue: undefined }).fatigue).toBe(2);
    expect(mergeCheckin(stored, { fatigue: null }).fatigue).toBeNull();
    expect(mergeCheckin(stored, {})).toEqual(mergeCheckin(stored, {}));
    expect(mergeCheckin(null, {})).toMatchObject({ sleep: null, pain: "", volleyball: false });
  });
});

describe("dawnCheckinDone", () => {
  it("needs sleep, legs and energy", () => {
    const base = { sleep_hours: 7.5, soreness: 2, energy: 4 };
    expect(dawnCheckinDone(base)).toBe(true);
    expect(dawnCheckinDone({ ...base, sleep_hours: null })).toBe(false);
    expect(dawnCheckinDone({ ...base, soreness: null })).toBe(false);
    expect(dawnCheckinDone({ ...base, energy: null })).toBe(false);
    expect(dawnCheckinDone(null)).toBe(false);
  });
});
