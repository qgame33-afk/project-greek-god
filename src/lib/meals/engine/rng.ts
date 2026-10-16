// Deterministic randomness for the planner: the same seed always gives the same week, so
// tests are stable and "Regenerate" can step through attempts reproducibly. No Math.random.

/** 32-bit hash of a string (cyrb53, folded). */
export function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export type Rng = () => number;

/** mulberry32: a small, fast PRNG returning [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG seeded from any parts: rngFor("2026-10-12", "dinner", 0). */
export function rngFor(...parts: (string | number)[]): Rng {
  return mulberry32(hashString(parts.join("|")));
}

/** One stable number in [0, 1) for these parts (independent of call order). */
export function unitFor(...parts: (string | number)[]): number {
  return mulberry32(hashString(parts.join("|")))();
}
