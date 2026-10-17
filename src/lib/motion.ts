// Motion tokens — the one place the app's durations, easings and springs are defined
// (docs/DESIGN-V2.md §1.8). CSS mirrors them as custom properties in src/app/globals.css
// (`--dur-*`, `--ease-*`), so Tailwind classes, keyframes and view transitions use the same numbers
// as motion/react and the Web Animations API below. Rules: 150–250 ms for UI feedback, springs for
// tactile things, transform/opacity/stroke-dashoffset only, and reduced motion always respected
// (the system setting or Settings → Appearance → Motion, see prefersReducedMotion()).

import { useLayoutEffect, useRef, type RefObject } from "react";

/** Durations in ms. */
export const DURATION = {
  /** Press-down feedback. */
  press: 90,
  /** Small state changes: fades, colour swaps, chevrons, a Seal. */
  fast: 160,
  /** The default: content swaps, dialogs, disclosures. */
  base: 220,
  /** Route view transitions (tab to tab, push/pop). */
  route: 200,
  /** Sheets and push routes arriving (Lift). */
  lift: 320,
  /** Gold filling: statue, columns, meters, coins (600–1400 by size). */
  gild: 900,
  /** Stroke draws: laurel stems, terrace contours, chart lines on first show. */
  inscribe: 800,
  /** A hero number counting to its value. */
  count: 700,
  /** @deprecated alias of `lift`. */
  slow: 320,
  /** Bottom sheets (vaul keeps its own 400 ms curve). */
  sheet: 400,
  /** @deprecated alias of `gild`. */
  ring: 900,
} as const;

/** Cubic-bezier easings as motion/react arrays… */
export const EASE = {
  /** Default deceleration for things arriving. */
  out: [0.22, 1, 0.36, 1],
  /** Long, soft settle for gold data marks (rings, bust). */
  gold: [0.16, 1, 0.3, 1],
  /** iOS sheet curve. */
  sheet: [0.32, 0.72, 0, 1],
  /** Things leaving. */
  in: [0.55, 0, 1, 0.45],
  /** A small overshoot: Seal (outline → leaf), the seal key's Final 10 pulse. */
  pop: [0.34, 1.56, 0.64, 1],
} as const;

/** …and the same curves as CSS strings (for WAAPI / inline styles). */
export const EASE_CSS = {
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  gold: "cubic-bezier(0.16, 1, 0.3, 1)",
  sheet: "cubic-bezier(0.32, 0.72, 0, 1)",
  in: "cubic-bezier(0.55, 0, 1, 0.45)",
  pop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/** Springs for motion/react. CSS has matching `--ease-spring` / `--ease-bounce` linear() curves. */
export const SPRING = {
  /** Selection indicators (tab bar, segmented thumb): quick, no visible overshoot. */
  snappy: { type: "spring", stiffness: 520, damping: 42, mass: 1 },
  /** Tactile pops (a check, a badge): a little overshoot. */
  tactile: { type: "spring", stiffness: 620, damping: 28, mass: 0.9 },
  /** Panels and cards moving into place. */
  gentle: { type: "spring", stiffness: 320, damping: 34, mass: 1 },
} as const;

/**
 * True when motion should be reduced: the system setting, or Settings → Appearance → Motion =
 * Reduce (which writes <html data-motion="reduce">, see src/lib/appearance.ts).
 */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.motion === "reduce") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------- route direction */

/**
 * How a route change should move, decided from the two paths alone (no per-link tagging):
 * - `push` / `pop`: deeper into / back out of the same section (Training → an exercise),
 *   or into a full-screen focus route (the live workout) and back.
 * - `forward` / `back`: across sections, in tab-bar (and sidebar) order.
 * - `fade`: same depth in the same section, onboarding, or anything unknown.
 * AppShell writes the result to `<html data-nav>` and globals.css maps it to the slide.
 */
export type NavDirection = "push" | "pop" | "forward" | "back" | "fade" | "none";

/** A second navigation within this many ms of the last one skips its route animation. */
export const ROUTE_SKIP_WITHIN_MS = 400;

/** Capsule order (Now, Train, Fuel, Ascent), then the secondary sections in rail order. */
const SECTIONS = ["/", "/training", "/nutrition", "/progress", "/coach", "/reviews", "/recovery", "/settings"];

function segments(path: string) {
  return path.split("/").filter(Boolean).length;
}

function clean(path: string) {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "");
  return p || "/";
}

function locate(path: string): { section: string; depth: number; index: number } {
  const p = clean(path);
  if (p.startsWith("/workout")) return { section: "/workout", depth: 1, index: -1 };
  if (p.startsWith("/onboarding")) return { section: "/onboarding", depth: 0, index: -1 };
  if (p === "/") return { section: "/", depth: 0, index: 0 };
  for (let i = 1; i < SECTIONS.length; i++) {
    const root = SECTIONS[i];
    if (p === root || p.startsWith(root + "/")) return { section: root, depth: segments(p) - segments(root), index: i };
  }
  return { section: p, depth: segments(p), index: -1 };
}

/** Full-screen focus routes that open as a layer over whatever was open: the live workout, cooking mode, the scanner. */
const LAYERS = ["/workout", "/nutrition/meals/cook", "/nutrition/scan"];

function layerOf(path: string) {
  const p = clean(path);
  return LAYERS.find((l) => p === l || p.startsWith(l + "/")) ?? null;
}

export function navDirection(from: string | null | undefined, to: string): NavDirection {
  if (!from) return "none";
  const a = locate(from);
  const b = locate(to);
  if (clean(from) === clean(to)) return "none";
  if (a.section === "/onboarding" || b.section === "/onboarding") return "fade";
  // Focus layers slide in over the screen you were on and back out to wherever you go next.
  const la = layerOf(from);
  const lb = layerOf(to);
  if (lb && lb !== la) return "push";
  if (la && la !== lb) return "pop";
  if (a.section === b.section) return b.depth > a.depth ? "push" : b.depth < a.depth ? "pop" : "fade";
  // Into another section's detail page (Roadmap → a monthly review): still a push.
  if (b.depth > 0) return "push";
  if (a.index < 0 || b.index < 0) return "fade";
  return b.index > a.index ? "forward" : "back";
}

/* ----------------------------------------------------------- content swap */

/** `useSwapIn` direction for swaps with no spatial order (a chart range): rise in place. */
export const RISE_IN_PLACE = () => 0;

/**
 * Plays a short enter animation on the returned ref's element whenever `key` changes (never on
 * first mount): opacity plus a small slide in the direction of travel. For in-place content
 * swaps — another day, another chart range, another tab — without remounting anything or
 * re-rendering per frame (Web Animations API, transform/opacity only). Skipped under
 * prefers-reduced-motion.
 *
 * `direction(prev, next)` > 0 slides in from the right (later / further along), < 0 from the
 * left, 0 rises in place. Defaults to comparing the keys (ISO dates and indices sort right).
 */
export function useSwapIn<T extends HTMLElement, K extends string | number>(
  key: K,
  opts: { direction?: (prev: K, next: K) => number; distance?: number } = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const prev = useRef(key);
  const { direction, distance = 14 } = opts;
  useLayoutEffect(() => {
    const before = prev.current;
    if (before === key) return;
    prev.current = key;
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    const d = direction ? direction(before, key) : before < key ? 1 : -1;
    const from = d === 0 ? `translate3d(0, 6px, 0)` : `translate3d(${Math.sign(d) * distance}px, 0, 0)`;
    el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], { duration: DURATION.base, easing: EASE_CSS.out });
  }, [key, direction, distance]);
  return ref;
}
