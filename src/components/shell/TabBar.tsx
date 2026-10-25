"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";
import { PRIMARY_NAV, isActive } from "./nav";
import { PlusButton } from "./PlusButton";

/**
 * The tab bar (docs/DESIGN-V3-SIMPLE.md §3.1): opaque --bg, a 1 px --line hairline on top, 49 px
 * plus the safe area. Four tabs, each a 24 px icon over a `t-tab` label: Today, Train, Food,
 * Progress. Active --text, inactive --tab-off; no pill, no gold, no blur, no shrink on scroll.
 * Tapping the active tab scrolls to the top. The white + sits at its right end, rising 14 px.
 * At large text sizes the labels stay (at most 13 px) and the bar grows; icons stay 24 px.
 * Sized in px on purpose so it never covers content at any text size. Phones and tablets only
 * (the rail takes over from 1024 px).
 */
export function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      data-tab-bar=""
      className="vt-tabbar fixed inset-x-0 bottom-0 z-(--z-chrome) border-t border-line bg-bg lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex min-h-[48px] max-w-col items-start pl-2 pr-3">
        <ul className="flex min-w-0 flex-1">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    // iOS convention: tapping the tab you're on scrolls it back to the top (from a
                    // detail page inside the tab it still navigates to the tab's root).
                    if (pathname !== href || e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                  }}
                  className={cn("press-none flex min-h-[48px] flex-col items-center justify-center gap-[3px] pb-[3px] pt-[5px]", active ? "text-fg" : "text-tab-off hover:text-fg")}
                >
                  <Icon className="size-6 shrink-0" strokeWidth={1.9} />
                  <span className="font-semibold leading-[1.1]" style={{ fontSize: "min(max(11px, 0.65rem), 13px)" }}>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <PlusButton className="-mt-[14px] ml-1.5" />
      </div>
    </nav>
  );
}
