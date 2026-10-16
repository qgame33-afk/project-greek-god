"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { m } from "motion/react";
import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { HeartPulse, Plus } from "lucide-react";
import { Mark } from "@/components/art/Mark";
import { Meander } from "@/components/art/Motifs";
import { QuickLog } from "@/components/shell/QuickLog";
import { useProfile } from "@/lib/data/profile";
import { useUser } from "@/lib/data/core";
import { cn } from "@/lib/cn";
import { PRIMARY_NAV, SECONDARY_NAV, hidesFab, isActive, isFocusRoute } from "./nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const focus = isFocusRoute(pathname);
  const [quickOpen, setQuickOpen] = useState(false);
  const keyboard = useKeyboardOpen();

  // First-time users go through onboarding before anything else.
  useEffect(() => {
    if (!loading && profile && !profile.onboarded && !pathname.startsWith("/onboarding")) router.replace("/onboarding");
  }, [loading, profile, pathname, router]);

  if (focus) return <>{children}</>;

  const showFab = !hidesFab(pathname) && !keyboard;

  return (
    <div className="min-h-dvh">
      <Sidebar pathname={pathname} onQuickLog={() => setQuickOpen(true)} />
      <TopBar pathname={pathname} />

      <main className="pb-tabbar mx-auto w-full max-w-[1180px] px-4 pt-4 md:pl-[100px] md:pr-6 lg:pb-16 lg:pl-[280px] lg:pr-8 lg:pt-8">
        <ViewTransition key={pathname} enter="page" exit="page" default="none">
          <div>{children}</div>
        </ViewTransition>
      </main>

      <TabBar pathname={pathname} />

      {showFab && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label="Quick log"
          className="press fixed right-4 z-[35] grid size-[54px] place-items-center rounded-full border border-line-gold bg-s3 text-gold-300 shadow-[var(--e2)] lg:hidden"
          style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 14px)" }}
        >
          <Plus className="size-6" strokeWidth={2.2} />
        </button>
      )}

      <QuickLog open={quickOpen} onOpenChange={setQuickOpen} />
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
  return (
    <header
      className={cn("chrome sticky top-0 z-20 border-b transition-colors md:hidden", scrolled ? "border-line-hair" : "border-transparent")}
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-[52px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Project Greek God — home">
          <Mark size={24} />
          <span className="font-serif text-[13px] font-semibold tracking-[0.14em] text-gold">PROJECT GREEK GOD</span>
        </Link>
        <div className="flex items-center gap-1">
          {pathname === "/" && (
            <Link href="/recovery" aria-label="Recovery and habits" className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
              <HeartPulse className="size-[21px]" />
            </Link>
          )}
          <Link
            href="/settings"
            aria-label="Settings and profile"
            className="grid size-11 place-items-center"
          >
            <span className="grid size-8 place-items-center rounded-full border border-line-gold bg-s3 font-serif text-[13px] font-semibold text-gold-300">{initial}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------- mobile tabs */

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="chrome fixed inset-x-0 bottom-0 z-30 border-t border-line-hair md:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="grid h-[var(--tabbar-h)] grid-cols-5">
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-full flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold transition-colors", active ? "text-gold-400" : "text-fg-3 hover:text-fg-2")}
              >
                {active && (
                  <m.span layoutId="tab-indicator" className="absolute top-0 h-[2px] w-5 rounded-full bg-gold-400" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.75} />
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
          "relative flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold transition-colors md:justify-center lg:justify-start",
          active ? "bg-s2 text-fg" : "text-fg-2 hover:bg-white/[.03] hover:text-fg",
        )}
      >
        {active && <span className="absolute left-0 top-2.5 h-6 w-[2px] rounded-full bg-gold-400" />}
        <Icon className={cn("size-5 shrink-0", active && "text-gold-400")} strokeWidth={active ? 2 : 1.75} />
        <span className="md:hidden lg:inline">{label}</span>
      </Link>
    );
  };
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-line-hair bg-[#0B0C10] px-3 py-5 md:flex lg:w-[248px] lg:px-4">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-1 md:justify-center lg:justify-start">
        <Mark size={30} />
        <span className="hidden leading-none lg:block">
          <span className="block font-serif text-[14px] font-semibold tracking-[0.12em] text-gold">PROJECT GREEK GOD</span>
          <span className="mt-1.5 block text-[10px] font-bold tracking-[0.35em] text-fg-3">THE ASCENT</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {PRIMARY_NAV.map((n) => item(n.href, n.label === "Today" ? "Dashboard" : n.label === "Coach" ? "AI Coach" : n.label, n.icon))}
      </nav>
      <div className="my-5 hidden px-2 text-gold-700 opacity-60 lg:block">
        <Meander width={200} height={10} />
      </div>
      <div className="my-5 h-px bg-line-hair lg:hidden" />
      <nav aria-label="More" className="flex flex-col gap-1">
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
