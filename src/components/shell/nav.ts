import { Dumbbell, HeartPulse, LayoutDashboard, MessagesSquare, Settings, TrendingUp, UtensilsCrossed, type LucideIcon } from "lucide-react";

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
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that take over the full screen (no tab bar / FAB). */
export function isFocusRoute(pathname: string) {
  return pathname.startsWith("/workout/") || pathname.startsWith("/onboarding");
}

/** Routes where the quick-log FAB would cover a composer or primary action. */
export function hidesFab(pathname: string) {
  return isFocusRoute(pathname) || pathname.startsWith("/coach") || pathname.startsWith("/nutrition/coach") || pathname.startsWith("/nutrition/scan");
}
