"use client";

/**
 * Remove this device's cached app state for the signed-in user: rest timers, the onboarding
 * draft, session-scoped flags and (when safe) the offline outbox. Device preferences such as
 * the appearance settings stay.
 */
export function clearLocalCaches({ includeOutbox }: { includeOutbox: boolean }) {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("pgg.rest.") || k.startsWith("pgg.onboarding.") || (includeOutbox && k === "pgg-outbox-v1")) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
}
