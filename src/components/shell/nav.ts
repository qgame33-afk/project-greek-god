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

/** Routes where the quick-log FAB would cover a composer or primary action (the recipe screen's START COOKING dock, the grocery list's row menus). */
export function hidesFab(pathname: string) {
  return (
    isFocusRoute(pathname) ||
    pathname.startsWith("/coach") ||
    pathname.startsWith("/nutrition/coach") ||
    pathname.startsWith("/nutrition/scan") ||
    pathname.startsWith("/nutrition/meals/recipe/") ||
    pathname.startsWith("/nutrition/meals/grocery")
  );
}
