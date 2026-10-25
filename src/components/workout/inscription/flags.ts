"use client";

// A per-device note the summary reads (§4.2.11), written at Finish on this device. Only ever a
// convenience: a past workout opened elsewhere simply shows "17 sets" instead of "17 of 20".

const PLAN_KEY = (id: string) => `pgg.planned.${id}`;

/** The number of working sets planned, noted just before finishing drops the unlogged ones. */
export function rememberPlanned(sessionId: string, planned: number) {
  try {
    localStorage.setItem(PLAN_KEY(sessionId), String(planned));
  } catch {
    /* private mode — the summary shows the logged count alone */
  }
}

export function plannedFor(sessionId: string): number | null {
  try {
    const v = Number(localStorage.getItem(PLAN_KEY(sessionId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
