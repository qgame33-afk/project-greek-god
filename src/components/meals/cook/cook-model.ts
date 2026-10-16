// Cooking mode's step navigation and swipe reading. Pure (unit-tested).

/** Clamp a step index to the recipe. */
export function clampStep(i: number, steps: number): number {
  if (steps <= 0 || !Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(steps - 1, Math.round(i)));
}

/**
 * What a horizontal drag means: a swipe left goes to the next step, right to the previous.
 * It has to be mostly sideways (so scrolling a long step never flips it) and either long
 * enough (a quarter of the width, at least 56 px) or a quick flick (≥ 0.45 px/ms over 24 px).
 */
export function swipeIntent(g: { dx: number; dy: number; ms: number; width: number }): "next" | "prev" | null {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  if (ax < 24 || ax < ay * 1.4) return null;
  const far = ax >= Math.max(56, g.width * 0.25);
  const flick = g.ms > 0 && ax / g.ms >= 0.45;
  if (!far && !flick) return null;
  return g.dx < 0 ? "next" : "prev";
}

/** Drag resistance at the ends (no step before the first / after the last): the finger moves the page a third as far. */
export function dragOffset(dx: number, atStart: boolean, atEnd: boolean): number {
  if ((dx > 0 && atStart) || (dx < 0 && atEnd)) return dx / 3;
  return dx;
}

/** "Step 2 of 5". */
export function stepOf(i: number, steps: number): string {
  return `Step ${clampStep(i, steps) + 1} of ${Math.max(1, steps)}`;
}

/** The first step not yet done (where cooking picks up), or the last step when all are done. */
export function resumeStep(done: readonly number[], steps: number, saved: number): number {
  if (steps <= 0) return 0;
  const s = clampStep(saved, steps);
  if (!done.includes(s)) return s;
  for (let i = 0; i < steps; i++) if (!done.includes(i)) return i;
  return steps - 1;
}

const UNIT_AFTER_NUMBER = /(\d)[ \u00A0](?=(?:cm|mm|g|kg|ml|mL|L|min|minutes?|sec|seconds?|hours?|°C|°F|tbsp|tsp|cups?|slices?|pieces?)\b|°)/g;

/** "2 cm cubes" never breaks between the number and its unit ("2" at a line end, "cm" on the next). */
export function kitchenText(text: string): string {
  return text.replace(UNIT_AFTER_NUMBER, "$1\u00A0");
}
