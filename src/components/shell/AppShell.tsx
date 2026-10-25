"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChartLine, Dumbbell, House, Plus, Utensils } from "lucide-react";
import { OfferingHost } from "@/components/offering/OfferingHost";
import { useQueryCacheReady } from "@/components/providers";
import { OfflineBanner } from "@/components/shared/Offline";
import { useMediaQuery } from "@/components/ui/sheet";
import { useProfile } from "@/lib/data/profile";
import { ROUTE_SKIP_WITHIN_MS, navDirection } from "@/lib/motion";
import { LiveSlot } from "./LiveSlot";
import { Rail } from "./Rail";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { hidesCapsule, hidesLiveSlot, isFocusRoute } from "./nav";
import { useHistoryTrail } from "./trail";

/**
 * The app shell (docs/DESIGN-V3-SIMPLE.md §3). Phones and tablets: the page draws its own header
 * (PageHeader / BackHeader), a sticky top bar shows its title once it scrolls under, the tab bar
 * (Today · Train · Food · Progress) with the white + sits at the bottom, and the workout bar sits
 * above it while a workout is live elsewhere. From 1024 px: the rail, content centred at 560 px.
 * Focus routes (the workout, onboarding, cooking mode) get no chrome at all; the scanner and the
 * Food coach hide the tab bar. Screens pad their bottom by --chrome-clear (`pb-chrome`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  // Everything inside the app is per-user and per-timezone, so it renders on the client only.
  // (Server-rendered dates would be in UTC, and the shell never blocks on data anyway.)
  // It also waits for the persisted query cache to come back (offline cold start; ≤ 400 ms).
  const mounted = useMounted();
  const cacheReady = useQueryCacheReady();
  if (!mounted || !cacheReady) return <ShellFallback />;
  return <AppShellInner>{children}</AppShellInner>;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const focus = isFocusRoute(pathname);
  const keyboard = useKeyboardOpen();
  const desktop = useMediaQuery("(min-width: 1024px)");
  // the tab bar and workout bar are lg:hidden in CSS too, so the first paint never flashes them
  const tabBar = !desktop && !hidesCapsule(pathname) && !keyboard;

  // First-time users go through onboarding before anything else.
  useEffect(() => {
    if (!loading && profile && !profile.onboarded && !pathname.startsWith("/onboarding")) router.replace("/onboarding");
  }, [loading, profile, pathname, router]);

  useNavDirection(pathname);
  const search = useSearchParams().toString();
  useHistoryTrail(search ? `${pathname}?${search}` : pathname);

  // Every route, focus routes included, enters and exits as one `page` view transition;
  // globals.css turns <html data-nav> into the push / pop / tab-order movement. The transition
  // sits at the same place in the tree for shell and focus routes (React only runs enter/exit
  // for a ViewTransition at the top of what mounts or unmounts), so going into the workout or
  // cooking mode the screen you leave moves away too instead of vanishing in one frame.
  return (
    <div className={focus ? undefined : "min-h-dvh"}>
      {!focus && <Rail pathname={pathname} showLiveSlot={desktop} />}
      {!focus && <TopBar pathname={pathname} />}

      <ViewTransition key={pathname} enter="page" exit="page" default="none">
        {focus ? (
          // full height: a focus screen drawn with position: fixed (cooking mode) still has a
          // box for the transition to capture
          <div data-vt-page="" className="min-h-dvh">
            {children}
          </div>
        ) : (
          <main data-vt-page="" className="pb-chrome w-full pt-[calc(var(--safe-top)+4px)] lg:pb-16 lg:pl-[248px] lg:pt-8">
            <div className="mx-auto w-full max-w-col px-gutter">
              <OfflineBanner />
              <div>{children}</div>
            </div>
          </main>
        )}
      </ViewTransition>

      {tabBar && <TabBar pathname={pathname} />}
      {!desktop && <LiveSlot hidden={hidesLiveSlot(pathname) || keyboard} />}
      <OfferingHost />
    </div>
  );
}

/**
 * Tags <html data-nav> with how this route change should move (push / pop / forward / back /
 * fade; see navDirection). It runs as a layout effect, which React calls inside the view
 * transition's update — after the old page is captured, before the animations are built — so
 * the CSS for this very transition already sees the new direction. A second navigation within
 * 400 ms is `instant` (no animation), so a transition never sits between two quick taps.
 */
function useNavDirection(pathname: string) {
  const prev = useRef<string | null>(null);
  const lastAt = useRef(0);
  useLayoutEffect(() => {
    const dir = navDirection(prev.current, pathname);
    prev.current = pathname;
    if (dir === "none") return;
    const now = performance.now();
    const quick = now - lastAt.current < ROUTE_SKIP_WITHIN_MS;
    lastAt.current = now;
    document.documentElement.dataset.nav = quick ? "instant" : dir;
  }, [pathname]);
}

const noSubscribe = () => () => {};
/** False on the server and during hydration, true once running in the browser. */
function useMounted() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Static first paint: the chrome without any data, so there's no blank flash. */
export function ShellFallback() {
  const icons = [House, Dumbbell, Utensils, ChartLine];
  return (
    <div className="min-h-dvh" aria-busy="true">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line bg-bg lg:block" />
      <div aria-hidden className="fixed inset-x-0 bottom-0 border-t border-line bg-bg lg:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <div className="mx-auto flex h-[48px] max-w-col items-start pl-2 pr-3">
          <div className="flex flex-1 text-tab-off">
            {icons.map((Icon, i) => (
              <span key={i} className="grid flex-1 place-items-center pt-[7px]">
                <Icon className="size-6" strokeWidth={1.9} />
              </span>
            ))}
          </div>
          <span className="-mt-[14px] ml-1.5 grid size-[58px] place-items-center rounded-full bg-fg text-bg">
            <Plus className="size-7" strokeWidth={2.6} />
          </span>
        </div>
      </div>
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
