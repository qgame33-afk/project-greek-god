"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useHeader } from "./chrome";
import { HeaderActions } from "./HeaderActions";
import { headingUnderBar } from "./nav";

/**
 * The phone header row and sticky top bar (docs/DESIGN-V2.md §2.1, §1.4). At rest it is transparent
 * (the page's light shows through): the page's eyebrow (from <TabHeader>) on the left, ✦ and the
 * avatar on the right. Once the page scrolls it turns opaque night with a 24 px gradient fade — never
 * blurred — and the page's <h1> takes the eyebrow's place when it scrolls under.
 */
export function TopBar({ pathname }: { pathname: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const on = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
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
  const header = useHeader(pathname);
  const { title, show } = useScrolledPageTitle(true, pathname);
  const showTitle = show && !!title;
  return (
    <header className="vt-topbar sticky top-0 z-(--z-sticky) md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
      {/* the opaque bar and its fade appear once the page has scrolled */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-night transition-opacity duration-(--dur-base)"
        style={{ opacity: scrolled ? 1 : 0 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-6 bg-[linear-gradient(to_bottom,var(--night),transparent)] transition-opacity duration-(--dur-base)"
        style={{ opacity: scrolled ? 1 : 0 }}
      />
      <div className="relative flex h-(--topbar-h) items-center justify-between gap-3 px-gutter">
        <div className="relative min-w-0 flex-1">
          {header?.eyebrow && (
            <p
              className="t-eyebrow truncate transition-[opacity,transform] duration-(--dur-base) ease-out"
              style={{ opacity: showTitle ? 0 : 1, transform: showTitle ? "translateY(-4px)" : "none" }}
            >
              {header.eyebrow}
            </p>
          )}
          <p
            aria-hidden
            className={cn(
              "absolute inset-x-0 top-1/2 -translate-y-1/2 truncate font-voice text-[length:max(20px,1.25rem)] font-semibold leading-tight text-ivory transition-[opacity,translate] duration-(--dur-base) ease-out",
              showTitle ? "opacity-100" : "translate-y-[calc(-50%+4px)] opacity-0",
            )}
          >
            {title}
          </p>
        </div>
        <HeaderActions oracle={header?.oracle} />
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
