"use client";

// Small per-device notes the Inscription reads (§3.3). Both are written at the seal, on this
// device, and are only ever conveniences: a past session opened elsewhere simply shows no
// animation and "17 sets" instead of "17 of 20 planned".

const PLAN_KEY = (id: string) => `pgg.planned.${id}`;
const INSCRIBE_KEY = (id: string) => `pgg.inscribe.${id}`;

/** The number of working sets planned, noted just before the seal drops the unlogged ones. */
export function rememberPlanned(sessionId: string, planned: number) {
  try {
    localStorage.setItem(PLAN_KEY(sessionId), String(planned));
  } catch {
    /* private mode — the Inscription shows the logged count alone */
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

/** The seal just happened on this device: the Inscription plays its moment (once). */
export function markInscription(sessionId: string) {
  try {
    sessionStorage.setItem(INSCRIBE_KEY(sessionId), String(Date.now()));
  } catch {
    /* no moment then — the final composition shows at once */
  }
}

/** True right after this device sealed the session (within 10 minutes). */
export function peekInscription(sessionId: string): boolean {
  try {
    const v = sessionStorage.getItem(INSCRIBE_KEY(sessionId));
    return !!v && Date.now() - Number(v) < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/** The moment has been shown: a revisit never replays it. */
export function clearInscription(sessionId: string) {
  try {
    sessionStorage.removeItem(INSCRIBE_KEY(sessionId));
  } catch {
    /* ignore */
  }
}
