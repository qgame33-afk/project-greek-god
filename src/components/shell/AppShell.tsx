"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { HeartPulse, Plus } from "lucide-react";
import { Mark } from "@/components/art/Mark";
import { Meander } from "@/components/art/Motifs";
import { OfflineBanner } from "@/components/shared/Offline";
import { QuickLog } from "@/components/shell/QuickLog";
import { LiveDock } from "@/components/workout/LiveDock";
import { useProfile } from "@/lib/data/profile";
import { useUser } from "@/lib/data/core";
import { cn } from "@/lib/cn";
import { navDirection, prefersReducedMotion } from "@/lib/motion";
import { PRIMARY_NAV, SECONDARY_NAV, headingUnderBar, hidesFab, isActive, isFocusRoute } from "./nav";
import { useHistoryTrail } from "./trail";

export function AppShell({ children }: { children: ReactNode }) {
  // Everything inside the app is per-user and per-timezone, so it renders on the client only.
  // (Server-rendered dates would be in UTC, and the shell never blocks on data anyway.)
  const mounted = useMounted();
  if (!mounted) return <ShellFallback />;
  return <AppShellInner>{children}</AppShellInner>;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const focus = isFocusRoute(pathname);
  const [quickOpen, setQuickOpen] = useState(false);
  const keyboard = useKeyboardOpen();

  // Keep the device-level haptics switch in step with the synced preference.
  useEffect(() => {
    const prefs = (profile?.prefs ?? {}) as { haptics?: boolean };
    if (prefs.haptics === undefined) return;
    try {
      localStorage.setItem("pgg.haptics", prefs.haptics ? "on" : "off");
    } catch {
      /* private mode */
    }
  }, [profile?.prefs]);

  // First-time users go through onboarding before anything else.
  useEffect(() => {
    if (!loading && profile && !profile.onboarded && !pathname.startsWith("/onboarding")) router.replace("/onboarding");
  }, [loading, profile, pathname, router]);

  useNavDirection(pathname);
  const search = useSearchParams().toString();
  useHistoryTrail(search ? `${pathname}?${search}` : pathname);

  const showFab = !focus && !hidesFab(pathname) && !keyboard;

  // Every route, focus routes included, enters and exits as one `page` view transition;
  // globals.css turns <html data-nav> into the push / pop / tab-order slide. The transition
  // sits at the same place in the tree for shell and focus routes (React only runs enter/exit
  // for a ViewTransition at the top of what mounts or unmounts), so going into the workout or
  // cooking mode the screen you leave slides away too instead of vanishing in one frame.
  return (
    <div className={focus ? undefined : "min-h-dvh"}>
      {!focus && <Sidebar pathname={pathname} onQuickLog={() => setQuickOpen(true)} />}
      {!focus && <TopBar pathname={pathname} />}

      <ViewTransition key={pathname} enter="page" exit="page" default="none">
        {focus ? (
          // full height: a focus screen drawn with position: fixed (cooking mode) still has a
          // box for the transition to capture
          <div data-vt-page="" className="min-h-dvh">
            {children}
          </div>
        ) : (
          <main data-vt-page="" className="pb-tabbar w-full pt-4 md:pl-[76px] md:pb-16 lg:pl-[248px] lg:pt-8">
            <div className="mx-auto w-full max-w-[1180px] px-4 md:px-6 lg:px-8">
              <OfflineBanner />
              <div>{children}</div>
            </div>
          </main>
        )}
      </ViewTransition>

      {!focus && <TabBar pathname={pathname} />}
      {!focus && <LiveDock />}

      {showFab && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label="Quick log"
          className="press vt-fab fixed right-4 z-[35] grid size-[54px] place-items-center rounded-full border border-line-gold bg-s3 text-gold-300 shadow-[var(--e2)] md:hidden"
          style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 14px)" }}
        >
          <Plus className="size-6" strokeWidth={2.2} />
        </button>
      )}

      {!focus && <QuickLog open={quickOpen} onOpenChange={setQuickOpen} />}
    </div>
  );
}

/* ----------------------------------------------------------- mobile top */

function TopBar({ pathname }: { pathname: string }) {
  const { user } = useUser();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  const home = pathname === "/";
  const { title, show } = useScrolledPageTitle(!home, pathname);
  return (
    <header
      className={cn("chrome vt-topbar sticky top-0 z-20 border-b transition-colors md:hidden", scrolled ? "border-line-hair" : "border-transparent")}
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-[52px] items-center justify-between gap-3 px-4">
        {home ? (
          <Link href="/" className="flex h-11 items-center gap-2" aria-label="Project Greek God — home">
            <Mark size={24} />
            <span className="font-serif text-[13px] font-semibold tracking-[0.14em] text-gold">PROJECT GREEK GOD</span>
          </Link>
        ) : (
          // Other screens: the page's own title takes over once its big heading scrolls away.
          <Link href="/" className="flex h-11 min-w-0 items-center gap-2.5" aria-label="Project Greek God — home">
            <Mark size={24} className="shrink-0" />
            <span
              aria-hidden
              className={cn(
                "truncate font-num text-[17px] font-bold uppercase leading-none tracking-[0.02em] text-fg transition-[opacity,transform] duration-200 ease-out",
                show && title ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {title}
            </span>
          </Link>
        )}
        <div className="flex items-center gap-1">
          {pathname === "/" && (
            <Link href="/recovery" aria-label="Recovery and habits" className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
              <HeartPulse className="size-[21px]" />
            </Link>
          )}
          <Link
            href="/settings"
            aria-label="Settings and profile"
            className="press grid size-11 place-items-center"
          >
            <span className="grid size-8 place-items-center rounded-full border border-line-gold bg-s3 font-serif text-[13px] font-semibold text-gold-300">{initial}</span>
          </Link>
        </div>
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
function useScrolledPageTitle(enabled: boolean, pathname: string) {
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

/* --------------------------------------------------------- mobile tabs */

function TabBar({ pathname }: { pathname: string }) {
  const index = PRIMARY_NAV.findIndex((n) => isActive(pathname, n.href));
  // Off-tab screens (Recovery, Settings) fade the indicator out where it was, so coming back
  // slides from the last tab instead of from the left edge.
  const [last, setLast] = useState(Math.max(index, 0));
  if (index >= 0 && index !== last) setLast(index);
  const at = index >= 0 ? index : last;
  return (
    <nav
      aria-label="Main"
      className="chrome vt-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-line-hair md:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="relative grid h-[var(--tabbar-h)] grid-cols-5">
        {/* One indicator for the whole bar: a translate-only slide on the spring curve (no layout
            measuring), and a short gold bar per DESIGN §5.1. */}
        <li
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 flex w-1/5 justify-center transition-[translate,opacity] duration-(--dur-slow) ease-spring"
          style={{ translate: `${at * 100}% 0`, opacity: index >= 0 ? 1 : 0 }}
        >
          <span className="h-[2px] w-5 rounded-full bg-gold-400" />
        </li>
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  // iOS convention: tapping the tab you're already on scrolls it back to the top
                  // (from a detail page inside the tab it still navigates back to the tab's root).
                  if (pathname !== href || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                }}
                className={cn(
                  "group flex h-full flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold transition-colors duration-(--dur-fast)",
                  active ? "text-gold-400" : "text-fg-3 hover:text-fg-2",
                )}
              >
                <Icon className="size-[22px] transition-[scale] duration-(--dur-slow) ease-bounce group-active:scale-[.92] group-active:duration-(--dur-press)" strokeWidth={active ? 2 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------ tablet/desktop */

function Sidebar({ pathname, onQuickLog }: { pathname: string; onQuickLog: () => void }) {
  const { user } = useUser();
  const item = (href: string, label: string, Icon: typeof HeartPulse) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "press-soft relative z-10 flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold md:justify-center lg:justify-start",
          active ? "text-fg" : "text-fg-2 hover:bg-white/[.03] hover:text-fg",
        )}
      >
        <Icon className={cn("size-5 shrink-0 transition-colors duration-(--dur-fast)", active && "text-gold-400")} strokeWidth={active ? 2 : 1.75} />
        <span className="md:hidden lg:inline">{label}</span>
      </Link>
    );
  };
  return (
    <aside className="vt-sidebar fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-line-hair bg-[#0B0C10] px-3 py-5 md:flex lg:w-[248px] lg:px-4">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-1 md:justify-center lg:justify-start">
        <Mark size={30} />
        <span className="hidden leading-none lg:block">
          <span className="block whitespace-nowrap font-serif text-[12.5px] font-semibold tracking-[0.1em] text-gold">PROJECT GREEK GOD</span>
          <span className="mt-1.5 block text-[10px] font-bold tracking-[0.35em] text-fg-3">THE ASCENT</span>
        </span>
      </Link>
      <nav aria-label="Main" className="relative flex flex-col gap-1">
        <NavHighlight index={PRIMARY_NAV.findIndex((n) => isActive(pathname, n.href))} />
        {PRIMARY_NAV.map((n) => item(n.href, n.label === "Today" ? "Dashboard" : n.label === "Coach" ? "AI Coach" : n.label, n.icon))}
      </nav>
      <div className="my-5 hidden px-2 text-gold-700 opacity-60 lg:block">
        <Meander width={200} height={10} />
      </div>
      <div className="my-5 h-px bg-line-hair lg:hidden" />
      <nav aria-label="More" className="relative flex flex-col gap-1">
        <NavHighlight index={SECONDARY_NAV.findIndex((n) => isActive(pathname, n.href))} />
        {SECONDARY_NAV.map((n) => item(n.href, n.label, n.icon))}
      </nav>
      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={onQuickLog}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-line-gold text-[14px] font-bold text-gold-300 hover:bg-gold-tint"
          title="Quick log"
        >
          <Plus className="size-5" />
          <span className="hidden lg:inline">Quick log</span>
        </button>
        <p className="hidden truncate px-1 text-[12px] text-fg-3 lg:block">{user?.email}</p>
      </div>
    </aside>
  );
}

/** The sidebar's active pill (surface-2 + gold edge): one element that glides between the 44px
 *  rows (+4px gap) on a translate-only spring, instead of popping from row to row. */
function NavHighlight({ index }: { index: number }) {
  const [last, setLast] = useState(Math.max(index, 0));
  if (index >= 0 && index !== last) setLast(index);
  const at = index >= 0 ? index : last;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-[12px] bg-s2 transition-[translate,opacity] duration-(--dur-slow) ease-spring"
      style={{ translate: `0 ${at * 48}px`, opacity: index >= 0 ? 1 : 0 }}
    >
      <span className="absolute left-0 top-2.5 h-6 w-[2px] rounded-full bg-gold-400" />
    </span>
  );
}

/**
 * Tags <html data-nav> with how this route change should move (push / pop / forward / back /
 * fade; see navDirection). It runs as a layout effect, which React calls inside the view
 * transition's update — after the old page is captured, before the animations are built — so
 * the CSS for this very transition already sees the new direction.
 */
function useNavDirection(pathname: string) {
  const prev = useRef<string | null>(null);
  useLayoutEffect(() => {
    const dir = navDirection(prev.current, pathname);
    prev.current = pathname;
    if (dir !== "none") document.documentElement.dataset.nav = dir;
  }, [pathname]);
}

const noSubscribe = () => () => {};
/** False on the server and during hydration, true once running in the browser. */
function useMounted() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Static first paint: the chrome without any data, so there's no blank flash. */
export function ShellFallback() {
  return (
    <div className="min-h-dvh" aria-busy="true">
      <aside className="fixed inset-y-0 left-0 hidden w-[76px] border-r border-line-hair bg-[#0B0C10] md:block lg:w-[248px]" />
      <header className="chrome sticky top-0 z-20 md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex h-[52px] items-center gap-2 px-4">
          <Mark size={24} />
          <span className="font-serif text-[13px] font-semibold tracking-[0.14em] text-gold">PROJECT GREEK GOD</span>
        </div>
      </header>
      <nav className="chrome fixed inset-x-0 bottom-0 z-30 border-t border-line-hair md:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <div className="h-[var(--tabbar-h)]" />
      </nav>
    </div>
  );
}

/** True while the on-screen keyboard is likely open (iOS shrinks the visual viewport). */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  const base = useRef(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    base.current = window.innerHeight;
    const on = () => setOpen(base.current - vv.height > 150);
    vv.addEventListener("resize", on);
    return () => vv.removeEventListener("resize", on);
  }, []);
  return open;
}
