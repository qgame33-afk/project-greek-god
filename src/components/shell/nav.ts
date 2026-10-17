import type { ComponentType } from "react";
import { BookOpen, HeartPulse, Settings } from "lucide-react";
import { AscentPeak, FuelAmphora, NowSunrise, OracleSparkles, TrainColumn } from "@/components/art/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** The four tabs of the floating capsule (and the top of the desktop rail): docs/DESIGN-V2.md §2.3. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Now", icon: NowSunrise },
  { href: "/training", label: "Train", icon: TrainColumn },
  { href: "/nutrition", label: "Fuel", icon: FuelAmphora },
  { href: "/progress", label: "Ascent", icon: AscentPeak },
];

/** The rail's second group and Settings' links. The Oracle also opens from ✦ in every header. */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/coach", label: "Oracle", icon: OracleSparkles },
  { href: "/reviews", label: "Chronicle", icon: BookOpen },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that take over the full screen (no chrome at all): the live workout, onboarding, cooking mode. */
export function isFocusRoute(pathname: string) {
  return pathname.startsWith("/workout/") || pathname.startsWith("/onboarding") || pathname.startsWith("/nutrition/meals/cook/");
}

/**
 * Routes where the floating capsule and the Offering button hide: focus routes, plus the scanner
 * and the Food coach. Both draw a full-screen layer on phones (FocusScreen) with their own back
 * button and a control along the bottom edge (shutter, composer) that the chrome would cover.
 */
export function hidesCapsule(pathname: string) {
  return isFocusRoute(pathname) || pathname.startsWith("/nutrition/scan") || pathname.startsWith("/nutrition/coach");
}

/** Routes where the live slot never shows: the workout itself and the other full-screen routes. */
export function hidesLiveSlot(pathname: string) {
  return hidesCapsule(pathname) || pathname.startsWith("/sign-in");
}

/** @deprecated compat for the old LiveDock (Gym removes it): routes that own the bottom edge. */
export function hidesLiveDock(pathname: string) {
  return isFocusRoute(pathname) || pathname.startsWith("/coach") || pathname.startsWith("/nutrition/coach") || pathname.startsWith("/nutrition/scan");
}

/** @deprecated compat for the old LiveDock: the FAB is gone (the Offering button replaced it). */
export function hidesFab(pathname: string) {
  return hidesLiveDock(pathname) || pathname.startsWith("/nutrition/meals/recipe/") || pathname.startsWith("/nutrition/meals/grocery");
}

/**
 * Whether the page's big heading has scrolled up under the mobile top bar (52 px plus the safe
 * area, rounded up to 60), so the bar should show the page title. A heading with no box, or one
 * that sits up there while the page is at the top (it belongs to a full-screen layer), never counts.
 */
export function headingUnderBar(entry: { isIntersecting: boolean; top: number; height: number }, scrollY: number) {
  return !entry.isIntersecting && entry.height > 0 && entry.top < 60 && scrollY > 0;
}

/** The avatar initial: the first letter of the display name, never the email's. "·" when unknown. */
export function avatarInitial(displayName: string | null | undefined) {
  const n = (displayName ?? "").trim();
  if (!n || n.includes("@")) return "·";
  return n.slice(0, 1).toUpperCase();
}
