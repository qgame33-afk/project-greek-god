"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";
import { PRIMARY_NAV, isActive } from "./nav";

// Sized in px on purpose: the capsule keeps its 64 px height and 44 px icons at any text size
// (labels hide at large sizes instead), so it never grows over content.

/**
 * The floating capsule (docs/DESIGN-V2.md §2.1): `<nav aria-label="Primary">` with the four tabs —
 * Now, Train, Fuel, Ascent — on glass, 64 px tall, r32, sitting `--capsule-gap` above the home
 * indicator. The active tab has an m4 pill that glides on a spring (translate only) and leaf-300
 * icon and label; inactive tabs are stone (gold is never used for them). Tapping the active tab
 * scrolls to the top. Scrolling down hides the labels (Capsule shrink, 220 ms; none under reduced
 * motion); at large text sizes the labels hide for good and the icons stay 44 px.
 */
export function Capsule({ pathname }: { pathname: string }) {
  const index = PRIMARY_NAV.findIndex((n) => isActive(pathname, n.href));
  // Off-tab screens (Recovery, Settings) fade the pill out where it was, so coming back slides
  // from the last tab instead of from the left edge.
  const [last, setLast] = useState(Math.max(index, 0));
  if (index >= 0 && index !== last) setLast(index);
  const at = index >= 0 ? index : last;
  const compact = useScrollCompact(pathname);

  return (
    <nav
      aria-label="Primary"
      data-compact={compact}
      className="capsule glass vt-tabbar fixed left-[14px] right-[calc(14px+56px+10px)] z-(--z-chrome) h-(--capsule-h) rounded-capsule px-[6px] md:hidden"
      style={{ bottom: "calc(var(--safe-bottom) + var(--capsule-gap))" }}
    >
      <ul className="relative grid h-full grid-cols-4 items-center">
        <li
          aria-hidden
          className="pointer-events-none absolute inset-y-[6px] left-0 w-1/4 transition-[translate,opacity] duration-(--dur-lift) ease-spring"
          style={{ translate: `${at * 100}% 0`, opacity: index >= 0 ? 1 : 0 }}
        >
          <span className="block size-full rounded-full bg-m4 shadow-[inset_0_1px_0_rgb(255_244_220/.06)]" />
        </li>
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative h-full py-[6px]">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                onClick={(e) => {
                  // iOS convention: tapping the tab you're already on scrolls it back to the top
                  // (from a detail page inside the tab it still navigates back to the tab's root).
                  if (pathname !== href || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                }}
                className={cn(
                  "press flex h-full min-w-[52px] flex-col items-center justify-center gap-[3px] rounded-full transition-colors duration-(--dur-fast)",
                  active ? "text-leaf-300" : "text-stone hover:text-ivory",
                )}
              >
                <span className="capsule-icon grid size-[44px] shrink-0 place-items-center">
                  <Icon className="size-[24px]" strokeWidth={active ? 1.8 : 1.6} />
                </span>
                <span aria-hidden className="capsule-label -mt-[9px]">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** True after scrolling down past the first screenful; false again on any scroll up. */
function useScrollCompact(pathname: string) {
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    let frame = 0;
    lastY.current = window.scrollY;
    const on = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - lastY.current;
      lastY.current = y;
      if (prefersReducedMotion() || y < 80) return setCompact(false);
      if (dy > 4) setCompact(true);
      else if (dy < -4) setCompact(false);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(on);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
      setCompact(false);
    };
  }, [pathname]);
  return compact;
}
