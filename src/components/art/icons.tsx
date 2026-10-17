import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The Olympus icon set (docs/DESIGN-V2.md §1.6): a 24-unit grid, 1.6 stroke, round caps and
 * joins, drawn to sit beside Instrument text. `aria-hidden` unless a `title` is given. Colour is
 * `currentColor`; size with `className` (e.g. "size-6"). Lucide stays for utility glyphs.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  className?: string;
  /** Accessible name. Without one the icon is decorative (aria-hidden). */
  title?: string;
  strokeWidth?: number;
}

function Icon({ className, title, strokeWidth = 1.6, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Tab: Now — the sun on the horizon. */
export function NowSunrise(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 18.5h18" />
      <path d="M6.6 18.5a5.4 5.4 0 0 1 10.8 0" />
      <path d="M12 5.5v2.6M5.3 9.3l1.8 1.8M18.7 9.3l-1.8 1.8" />
    </Icon>
  );
}

/** Tab: Train — a Doric column. */
export function TrainColumn(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 4.5h15M6.5 7.2h11" />
      <path d="M8.3 7.2v10.6M12 7.2v10.6M15.7 7.2v10.6" />
      <path d="M6.5 17.8h11M4.5 20.3h15" />
    </Icon>
  );
}

/** Tab: Fuel — an amphora. */
export function FuelAmphora(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.3 3.5h5.4" />
      <path d="M10.4 3.5v2.4c0 1.2-3.6 2.6-3.6 6.9 0 3.7 2.3 6.4 5.2 7.9 2.9-1.5 5.2-4.2 5.2-7.9 0-4.3-3.6-5.7-3.6-6.9V3.5" />
      <path d="M8.6 12.3h6.8" />
    </Icon>
  );
}

/** Tab: Ascent — the mountain with a summit star. */
export function AscentPeak(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.5 20 9.2 9.3l3.1 4.4 3-4.9L21.5 20z" />
      <path d="M17.3 2.6l1.1 1.1-1.1 1.1-1.1-1.1z" fill="currentColor" />
    </Icon>
  );
}

/** The Offering (+): log or ask. */
export function OfferingPlus(p: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** The Oracle (✦): AI. Always aegean where it appears. */
export function OracleSparkles(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.5 3.5c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" />
      <path d="M18.2 14.6c.3 2 1 2.8 3 3.1-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1.1 3-3.1z" />
    </Icon>
  );
}

/** A laurel sprig: the record mark. */
export function LaurelSprig(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.2 21c1.9-4.6 3.3-10 3.8-16.5" />
      <path d="M10.9 16.6c-2.6.4-4.3-.6-5.1-2.7 2.5-.4 4.3.6 5.1 2.7zM11.6 12.4c-2.5-.1-4-1.4-4.4-3.6 2.5.1 4 1.4 4.4 3.6zM12 8.3C9.9 7.8 8.8 6.3 8.9 4.2c2.1.5 3.2 2 3.1 4.1z" />
      <path d="M11.1 15.9c1.9-1.8 3.9-2 5.8-.8-1.8 1.8-3.8 2-5.8.8zM11.8 11.6c1.6-2 3.5-2.6 5.6-1.7-1.6 2-3.5 2.6-5.6 1.7zM12.2 7.4c1.2-1.8 2.9-2.4 4.8-1.8-1.2 1.8-2.9 2.4-4.8 1.8z" />
    </Icon>
  );
}

export function Volleyball(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c-1.5 3.5-1.2 7 1 9.5M20 9.5c-3.5-.6-7 .3-9 3.5M6 18.5c1.8-2.8 4.5-4.8 7-5.5" />
    </Icon>
  );
}

/** Plates on a sleeve (equipment glyph; the per-side drawing is art/PlateStack). */
export function PlateStackIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.5 12h3M18.5 12h3" />
      <rect x="5.5" y="5" width="3" height="14" rx="1" />
      <rect x="9.5" y="7" width="2.6" height="10" rx="1" />
      <rect x="13.1" y="9" width="2.2" height="6" rx=".8" />
      <path d="M15.3 12h3.2" />
    </Icon>
  );
}

/** A temple: the summit, the week. */
export function TempleGlyph(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 8.3 12 3.8l8.5 4.5z" />
      <path d="M5 10.5h14" />
      <path d="M6.8 10.5v7.3M10.2 10.5v7.3M13.8 10.5v7.3M17.2 10.5v7.3" />
      <path d="M4.6 18h14.8M3.5 20.5h17" />
    </Icon>
  );
}

/** Sealed: a tick in a ring. */
export function SealTick(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.3" />
    </Icon>
  );
}

/** Not logged: a dashed ring with a dash. */
export function CoinMissed(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2.6 2.4" />
      <path d="M8.5 12h7" />
    </Icon>
  );
}

/** Lights out. */
export function Moon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    </Icon>
  );
}
