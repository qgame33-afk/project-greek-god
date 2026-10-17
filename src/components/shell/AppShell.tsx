"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AscentPeak, FuelAmphora, NowSunrise, OfferingPlus, TrainColumn } from "@/components/art/icons";
import { OfferingHost } from "@/components/offering/OfferingHost";
import { useQueryCacheReady } from "@/components/providers";
import { OfflineBanner } from "@/components/shared/Offline";
import { useMediaQuery } from "@/components/ui/sheet";
import { useProfile } from "@/lib/data/profile";
import { ROUTE_SKIP_WITHIN_MS, navDirection } from "@/lib/motion";
import { Capsule } from "./Capsule";
import { LiveSlot } from "./LiveSlot";
import { OfferingButton } from "./OfferingButton";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { hidesCapsule, hidesLiveSlot, isFocusRoute } from "./nav";
import { useHistoryTrail } from "./trail";

/**
 * The app shell (docs/DESIGN-V2.md §2.1). Phones: a sticky header row (eyebrow · ✦ · avatar) that
 * turns into an opaque top bar on scroll, the floating capsule (Now · Train · Fuel · Ascent) with the
 * Offering (+) beside it, and the live slot above the capsule while a session runs elsewhere. From
 * 768 px: the rail. Focus routes (the workout, onboarding, cooking mode) get no chrome at all.
 * Screens pad their bottom by --chrome-clear (the `pb-chrome` utility); a scroll-edge fade sits
 * under the floating chrome so no row with a control ever rests beneath it.
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
  const desktop = useMediaQuery("(min-width: 768px)");
  // the capsule, Offering and slot are md:hidden in CSS too, so the first paint never flashes them
  const floating = !desktop && !hidesCapsule(pathname) && !keyboard;

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
          <main data-vt-page="" className="pb-chrome w-full pt-2 md:pb-16 md:pl-[76px] md:pt-8 lg:pl-[248px]">
            <div className="mx-auto w-full max-w-col px-gutter md:px-6 lg:max-w-wide lg:px-8">
              <OfflineBanner />
              <div>{children}</div>
            </div>
          </main>
        )}
      </ViewTransition>

      {floating && (
        <>
          <div aria-hidden className="scroll-edge pointer-events-none fixed inset-x-0 bottom-0 z-(--z-chrome) h-[calc(var(--chrome-clear)+8px)] md:hidden" />
          <Capsule pathname={pathname} />
          <OfferingButton />
        </>
      )}
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
  const icons = [NowSunrise, TrainColumn, FuelAmphora, AscentPeak];
  return (
    <div className="min-h-dvh" aria-busy="true">
      <aside className="fixed inset-y-0 left-0 hidden w-[76px] border-r border-vein bg-m1 md:block lg:w-[248px]" />
      <header className="sticky top-0 md:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="h-(--topbar-h)" />
      </header>
      <div
        aria-hidden
        className="glass fixed left-[14px] right-[calc(14px+56px+10px)] grid h-(--capsule-h) grid-cols-4 items-center rounded-capsule px-[6px] text-stone md:hidden"
        style={{ bottom: "calc(var(--safe-bottom) + var(--capsule-gap))" }}
      >
        {icons.map((Icon, i) => (
          <span key={i} className="grid place-items-center">
            <Icon className="size-[24px]" />
          </span>
        ))}
      </div>
      <div
        aria-hidden
        className="glass fixed right-[14px] grid size-[56px] place-items-center rounded-full text-ivory md:hidden"
        style={{ bottom: "calc(var(--safe-bottom) + var(--capsule-gap) + 4px)" }}
      >
        <OfferingPlus className="size-[26px]" />
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
