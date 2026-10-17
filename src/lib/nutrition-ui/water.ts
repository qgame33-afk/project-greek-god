// Water meter + undo helpers.

export const WATER_PRESETS = [250, 500, 750] as const;
export const WATER_MIN = 50;
export const WATER_MAX = 2000;

/** Fill (0–1) for each of `n` meter cells. */
export function waterCells(totalMl: number, goalMl: number, n = 12): number[] {
  if (!(goalMl > 0)) return Array.from({ length: n }, () => 0);
  const filled = Math.max(0, Math.min(1, totalMl / goalMl)) * n;
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, filled - i)));
}

/** "1.8" — water to 0.1 L. */
export function liters(ml: number): string {
  return (Math.round(ml / 100) / 10).toFixed(1);
}

/**
 * Litres still to drink, from the two figures as shown ("0.3 / 3.0 L" → "2.7"), so the
 * drunk and to-go numbers always add up to the goal on screen.
 */
export function litersLeft(goalMl: number, totalMl: number): string {
  return (Math.max(0, Math.round(goalMl / 100) - Math.round(totalMl / 100)) / 10).toFixed(1);
}

/** "2.7 L" to go, or "50 mL" when the gap is too small to show in litres. Null once met. */
export function waterToGo(goalMl: number, totalMl: number): string | null {
  const left = goalMl - totalMl;
  if (!(goalMl > 0) || left <= 0) return null;
  const l = litersLeft(goalMl, totalMl);
  return l === "0.0" ? `${Math.round(left)} mL` : `${l} L`;
}

/**
 * The tap a toast's Undo should remove: the newest log of that size that wasn't
 * there when the tap happened. Robust to rapid taps and to the optimistic row
 * being replaced by the server row (same id).
 */
export function undoTarget<T extends { id: string; amount_ml: number; logged_at: string }>(logs: T[], before: Set<string>, ml: number, id?: string): T | null {
  if (id) {
    const exact = logs.find((l) => l.id === id);
    if (exact) return exact;
  }
  const fresh = logs.filter((l) => !before.has(l.id) && l.amount_ml === ml);
  if (!fresh.length) return null;
  return fresh.reduce((a, b) => (b.logged_at > a.logged_at ? b : a));
}

export function clampWater(ml: number): number {
  if (!Number.isFinite(ml)) return WATER_MIN;
  return Math.min(WATER_MAX, Math.max(WATER_MIN, Math.round(ml / 10) * 10));
}
