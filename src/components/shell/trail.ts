"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, type MouseEvent } from "react";

/**
 * A model of the browser history this tab has walked through inside the app, so in-app back
 * controls ("< Meal plan", "Close cooking mode") can go *back* when the entry before this one is
 * the screen they lead to, instead of stacking a new entry on top (after which the system back
 * gesture would re-open the screen just closed).
 *
 * `back` ends with the current entry; `forward` holds entries a Back left behind (nearest
 * first). Pure and unit-tested; AppShell feeds it every URL change.
 */
export interface Trail {
  back: string[];
  forward: string[];
  /** history.length when the trail was last updated. */
  length: number;
}

export interface TrailStep {
  /** pathname + search of the entry now showing */
  url: string;
  /** a popstate (browser or system back / forward, or router.back()) led here */
  popped: boolean;
  historyLength: number;
}

export function stepTrail(t: Trail | null, s: TrailStep): Trail {
  if (!t) return { back: [s.url], forward: [], length: s.historyLength };
  const current = t.back[t.back.length - 1];
  if (s.popped) {
    if (t.back.length >= 2 && t.back[t.back.length - 2] === s.url) return { back: t.back.slice(0, -1), forward: [current, ...t.forward], length: s.historyLength };
    if (t.forward[0] === s.url) return { back: [...t.back, s.url], forward: t.forward.slice(1), length: s.historyLength };
    // a jump of more than one entry (long-press on Back): start over from here
    return { back: [s.url], forward: [], length: s.historyLength };
  }
  if (s.url === current) return { ...t, length: s.historyLength };
  // A push drops the forward entries and adds one; a replace keeps the length. They only look
  // the same with exactly one forward entry, where a push (a link tapped after one Back) is far
  // more common than a replace.
  const replaced = s.historyLength === t.length && t.forward.length !== 1;
  if (replaced) return { back: [...t.back.slice(0, -1), s.url], forward: t.forward, length: s.historyLength };
  return { back: [...t.back, s.url], forward: [], length: s.historyLength };
}

/** The pathname of the entry before the current one, if this tab came from there. */
export function previousPathname(t: Trail | null): string | null {
  if (!t || t.back.length < 2) return null;
  return pathOf(t.back[t.back.length - 2]);
}

/** The pathname of an href or URL path, decoded ("lib%3Aa" and "lib:a" are the same screen). */
export function pathOf(href: string) {
  const path = href.split(/[?#]/)[0] || "/";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/* ------------------------------------------------------------------ store */

let trail: Trail | null = null;
/** The URL a popstate went to, while the router hasn't rendered it yet. */
let poppedTo: string | null = null;
/** The last step not known to be a traversal, to redo as one if its popstate arrives late. */
let lastStep: { before: Trail | null; url: string } | null = null;

const here = () => window.location.pathname + window.location.search;

/** AppShell: keep the trail in step with every in-app URL change. */
export function useHistoryTrail(url: string) {
  useEffect(() => {
    const onPop = () => {
      const now = here();
      // the router can render the entry before the event reaches this listener
      if (lastStep?.url === now) {
        trail = stepTrail(lastStep.before, { url: now, popped: true, historyLength: window.history.length });
        lastStep = null;
      } else poppedTo = now;
    };
    window.addEventListener("popstate", onPop, { capture: true });
    return () => window.removeEventListener("popstate", onPop, { capture: true });
  }, []);
  useEffect(() => {
    // Next has already written this entry to history (an insertion effect) by now
    const now = here();
    const popped = poppedTo === now;
    poppedTo = null;
    const before = trail;
    trail = stepTrail(trail, { url: now, popped, historyLength: window.history.length });
    lastStep = popped || trail === before ? null : { before, url: now };
  }, [url]);
}

interface NavigationLike {
  currentEntry: { index: number } | null;
  entries: () => { url: string | null }[];
}

/**
 * The pathname of the history entry before this one. Exact where the Navigation API exists
 * (it lists this tab's entries); otherwise from the trail.
 */
function previousEntryPath(): string | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (nav?.currentEntry && typeof nav.entries === "function") {
    const i = nav.currentEntry.index;
    const url = i > 0 ? nav.entries()[i - 1]?.url : null;
    return url ? pathOf(new URL(url).pathname) : null;
  }
  return previousPathname(trail);
}

/**
 * Up-navigation to `parentHref`: history back when the previous entry is that screen, else a
 * replace (so leaving a deep-linked screen never leaves it behind the parent either). Use as a
 * Link's onClick (modified clicks keep the link's default) or call it directly.
 */
export function useGoUp(parentHref: string) {
  const router = useRouter();
  return useCallback(
    (e?: MouseEvent) => {
      if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      e?.preventDefault();
      if (previousEntryPath() === pathOf(parentHref)) backWithTransition(() => router.back());
      else router.replace(parentHref);
    },
    [router, parentHref],
  );
}

/* ------------------------------------------------------- animated back */

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

const PAGE = "[data-vt-page]";
function namePage(el: HTMLElement | null, name: string) {
  if (!el) return;
  el.style.setProperty("view-transition-name", name);
  el.style.setProperty("view-transition-class", "page");
}
function unnamePage(el: HTMLElement | null) {
  el?.style.removeProperty("view-transition-name");
  el?.style.removeProperty("view-transition-class");
}

/**
 * History back with the same pop slide an in-app link gets. React renders a popstate
 * navigation synchronously and without a view transition (right for the system back gesture,
 * which animates natively), so an in-app back button runs the view transition itself: the page
 * leaving and the page arriving get the shell's `page` class (globals.css), and <html data-nav>
 * is set to "pop" by AppShell during the swap as usual.
 */
function backWithTransition(back: () => void) {
  const doc = document as ViewTransitionDoc;
  const leaving = document.querySelector<HTMLElement>(PAGE);
  if (typeof doc.startViewTransition !== "function" || !leaving) return back();
  namePage(leaving, "vt-back-out");
  let arriving: HTMLElement | null = null;
  const t = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const started = Date.now();
        // the router swaps the page during the popstate; rendering is paused meanwhile, so poll
        // with timers (no animation frames) until the new page is in, or give up after a beat
        const wait = () => {
          const now = document.querySelector<HTMLElement>(PAGE);
          if (now && now !== leaving && !leaving.isConnected) {
            arriving = now;
            namePage(arriving, "vt-back-in");
            resolve();
          } else if (Date.now() - started > 800) resolve();
          else window.setTimeout(wait, 16);
        };
        window.addEventListener("popstate", () => window.setTimeout(wait, 0), { once: true });
        back();
      }),
  );
  t.finished.finally(() => {
    unnamePage(leaving);
    unnamePage(arriving);
  });
}
