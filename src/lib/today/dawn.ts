// Dawn: the Today choreography plays on the first visit of each browser session only.
// Later visits (and reduced motion) render everything in its final state instantly.

export const DAWN_KEY = "pgg.dawn";

type ReadableStorage = { getItem(key: string): string | null };

export function shouldPlayDawn(storage: ReadableStorage | null | undefined, reducedMotion: boolean): boolean {
  if (reducedMotion || !storage) return false;
  try {
    return storage.getItem(DAWN_KEY) == null;
  } catch {
    return false;
  }
}

/** Timeline of the choreography, ms from the moment Today's content mounts. */
export const DAWN = {
  heroFade: 0,
  countdownStart: 120,
  countdownDuration: 1400,
  friezeStart: 260,
  friezeDuration: 1400,
  cardsStart: 420,
  cardStagger: 70,
  maxStaggered: 6,
} as const;

/** Delay (ms) for the i-th card under Dawn; later cards share the last slot. */
export function cardDelay(index: number): number {
  return DAWN.cardsStart + Math.min(index, DAWN.maxStaggered - 1) * DAWN.cardStagger;
}
