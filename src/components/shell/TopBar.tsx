"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { headingUnderBar } from "./nav";

/**
 * The sticky top bar (docs/DESIGN-V3-SIMPLE.md §3.2). Pages draw their own header (PageHeader or
 * BackHeader); this bar takes no room. Once the page scrolls it is an opaque --bg strip over the
 * status bar (no blur, no gradient), and when the page's <h1> scrolls under it the bar grows a
 * 44 px row with that title. No eyebrow, no ✦, no avatar.
 */
export function TopBar({ pathname }: { pathname: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const on = () => {
      frame = 0;
      setScrolled(window.scrollY > 4);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(on);
    };
    on();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  const { title, show } = useScrolledPageTitle(true, pathname);
  const showTitle = show && !!title;
  return (
    <header
      aria-hidden={!showTitle}
      className="vt-topbar pointer-events-none fixed inset-x-0 top-0 z-(--z-sticky) bg-bg transition-opacity duration-(--dur-fast) lg:hidden"
      style={{ paddingTop: "var(--safe-top)", opacity: scrolled ? 1 : 0 }}
    >
      <div className={cn("grid place-items-center overflow-hidden px-16", showTitle ? "h-11 border-b border-line" : "h-0")}>
        <p className={cn("t-row truncate transition-opacity duration-(--dur-fast)", showTitle ? "opacity-100" : "opacity-0")}>{title}</p>
      </div>
    </header>
  );
}

/**
 * The page's <h1> text, and whether it has scrolled up under the top bar.
 *
 * Every route renders its own <main> (the shell keys the page's view transition by pathname), so
 * nothing here may hold on to a page element across navigations: the hook starts over for each
 * pathname, watches the stable document body for the heading to appear, change or be replaced,
 * and ignores reports about a heading that has left the page (an IntersectionObserver on a
 * detached node says "not intersecting, top 0", which would read as "scrolled away").
 */
export function useScrolledPageTitle(enabled: boolean, pathname: string) {
  const [bar, setBar] = useState<PageTitleState>(NO_TITLE);
  useEffect(() => {
    if (!enabled) return;
    let io: IntersectionObserver | null = null;
    let observed: Element | null = null;
    let frame = 0;
    const update = (patch: Partial<Omit<PageTitleState, "path">>) =>
      setBar((b) => {
        const base = b.path === pathname ? b : { ...NO_TITLE, path: pathname };
        const next = { ...base, ...patch };
        return next.path === b.path && next.title === b.title && next.show === b.show ? b : next;
      });
    const attach = () => {
      frame = 0;
      const el = pageHeading();
      update({ title: el?.textContent?.trim() || null });
      if (el === observed) return;
      io?.disconnect();
      io = null;
      observed = el;
      update({ show: false });
      if (!el) return;
      const mine = new IntersectionObserver(
        ([e]) => {
          if (io !== mine || !e.target.isConnected) return;
          update({ show: headingUnderBar({ isIntersecting: e.isIntersecting, top: e.boundingClientRect.top, height: e.boundingClientRect.height }, window.scrollY) });
        },
        { rootMargin: "-60px 0px 0px 0px" },
      );
      io = mine;
      mine.observe(el);
    };
    // coalesce bursts of DOM changes (a page streaming in) into one look per frame
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(attach);
    };
    attach();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    return () => {
      mo.disconnect();
      io?.disconnect();
      io = null;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, pathname]);
  const current = enabled && bar.path === pathname;
  return { title: current ? bar.title : null, show: current && bar.show };
}

interface PageTitleState {
  path: string;
  title: string | null;
  show: boolean;
}
const NO_TITLE: PageTitleState = { path: "", title: null, show: false };

/** The current page's heading: the first <h1> in the page that is laid out (a copy hidden at
 *  this breakpoint has no boxes and never counts). */
function pageHeading(): Element | null {
  for (const h of document.querySelectorAll("main h1")) if (h.isConnected && h.getClientRects().length > 0) return h;
  return null;
}
