import { CalendarDays, Dumbbell, HeartPulse, LayoutDashboard, MessagesSquare, Settings, TrendingUp, UtensilsCrossed, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The five primary sections (mobile tab bar + desktop sidebar). */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: UtensilsCrossed },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/coach", label: "Coach", icon: MessagesSquare },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/recovery", label: "Recovery & Habits", icon: HeartPulse },
  { href: "/reviews", label: "Monthly reviews", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that take over the full screen (no tab bar / FAB). Cooking mode is one: a kitchen screen. */
export function isFocusRoute(pathname: string) {
  return pathname.startsWith("/workout/") || pathname.startsWith("/onboarding") || pathname.startsWith("/nutrition/meals/cook/");
}

/** Routes that own the bottom edge (focus screens, chat composers): no live-workout dock there. */
export function hidesLiveDock(pathname: string) {
  return isFocusRoute(pathname) || pathname.startsWith("/coach") || pathname.startsWith("/nutrition/coach") || pathname.startsWith("/nutrition/scan");
}

/**
 * Routes where the quick-log FAB would cover a composer or primary action: the above, plus the
 * recipe screen's START COOKING dock and the grocery list's row menus. (The live-workout dock
 * stays on those two: the cooking dock lifts above it.)
 */
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
