import type { ComponentType } from "react";
import { ChartLine, Dumbbell, House, MessageCircle, Settings, Utensils } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** The four tabs (docs/DESIGN-V3-SIMPLE.md §3.1, §3.7), also the top of the desktop rail. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/training", label: "Train", icon: Dumbbell },
  { href: "/nutrition", label: "Food", icon: Utensils },
  { href: "/progress", label: "Progress", icon: ChartLine },
];

/** The rail's second group (§3.5). Monthly recap and Check-ins are reached from their parents. */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Focus routes (§3.4): no tab bar, no +, each with its own way out. The live workout, onboarding
 * and cooking mode take the whole screen (no shell chrome at all); the scanner and sign-in hide
 * the tab bar too (see hidesCapsule).
 */
export function isFocusRoute(pathname: string) {
  return pathname.startsWith("/workout/") || pathname.startsWith("/onboarding") || pathname.startsWith("/nutrition/meals/cook/");
}

/**
 * Routes where the tab bar and + hide: the focus routes, the scanner and sign-in, plus the Food
 * coach (a full-screen layer on phones with its composer along the bottom edge).
 */
export function hidesCapsule(pathname: string) {
  return isFocusRoute(pathname) || pathname.startsWith("/nutrition/scan") || pathname.startsWith("/nutrition/coach") || pathname.startsWith("/sign-in");
}

/** Routes where the workout bar never shows: the workout itself and the other full-screen routes. */
export function hidesLiveSlot(pathname: string) {
  return hidesCapsule(pathname);
}

/**
 * Whether the page's big heading has scrolled up under the sticky top bar (44 px plus the safe
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
