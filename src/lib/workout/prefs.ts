/** Workout-related preferences stored in profiles.prefs (JSON). */
export interface WorkoutPrefs {
  /** Tapping ✓ logs the dotted ghost values when nothing was typed. */
  tapLogsGhost: boolean;
  /** Use the iOS keyboard instead of the NumberPad dock. */
  systemKeyboard: boolean;
  /** Open the rest timer in full-screen focus mode. */
  restFocus: boolean;
  haptics: boolean;
  /** 660/990 Hz chime when rest ends. */
  restChime: boolean;
}

export const DEFAULT_PREFS: WorkoutPrefs = { tapLogsGhost: true, systemKeyboard: false, restFocus: false, haptics: true, restChime: false };

export function parsePrefs(json: unknown): WorkoutPrefs {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const b = (k: keyof WorkoutPrefs) => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_PREFS[k]);
  return { tapLogsGhost: b("tapLogsGhost"), systemKeyboard: b("systemKeyboard"), restFocus: b("restFocus"), haptics: b("haptics"), restChime: b("restChime") };
}
