/* eslint-disable @next/next/no-img-element -- a 76 px static icon from /public, no optimisation needed */
import { cn } from "@/lib/cn";

/**
 * The brand mark (docs/DESIGN-V3-SIMPLE.md §0 law 6, §4.11). The laurel-A app icon appears on the
 * sign-in screen only, as the real app icon (`/icons/icon-192.png`, 76 px, radius 18): that is
 * <AppIcon />. The old drawn wreath, <Mark />, keeps its props for old callers and renders nothing.
 * At integration (§6.7) <Mark /> goes and <AppIcon /> stays (the sign-in icon wrapper).
 */
export function Mark(_props: { size?: number; className?: string }) {
  return null;
}

/** The laurel-A app icon for the sign-in screen. Decorative: the page title names the app. */
export function AppIcon({ size = 76, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icons/icon-192.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * (18 / 76)) }}
    />
  );
}

export default Mark;
