import type { SVGProps } from "react";
import { CalendarDays, ChartLine, Check, Circle, Dumbbell, House, Layers, MessageCircle, Moon as LucideMoon, Plus, Utensils, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The Olympus icon set, retired (docs/DESIGN-V3-SIMPLE.md §1.5, §1.7.4): every export keeps its
 * name and props and now draws its Lucide outline (stroke 1.9, `currentColor`, `aria-hidden`
 * unless a `title` is given). Volleyball renders nothing. Callers move to lucide-react directly as
 * their screens are rebuilt; this file goes at integration (§6.7).
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  className?: string;
  /** Accessible name. Without one the icon is decorative (aria-hidden). */
  title?: string;
  strokeWidth?: number;
}

function lucide(Icon: LucideIcon, fallbackStroke = 1.9) {
  function Mapped({ className, title, strokeWidth, ...rest }: IconProps) {
    return (
      <Icon
        className={cn("size-6 shrink-0", className)}
        strokeWidth={strokeWidth != null ? Math.max(strokeWidth, 1.9) : fallbackStroke}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
        {...(rest as Record<string, unknown>)}
      />
    );
  }
  return Mapped;
}

/** Tab: Today. */
export const NowSunrise = lucide(House);
/** Tab: Train. */
export const TrainColumn = lucide(Dumbbell);
/** Tab: Food. */
export const FuelAmphora = lucide(Utensils);
/** Tab: Progress. */
export const AscentPeak = lucide(ChartLine);
/** Add (+). */
export const OfferingPlus = lucide(Plus, 2.6);
/** Coach. */
export const OracleSparkles = lucide(MessageCircle);
/** Done. */
export const LaurelSprig = lucide(Check);
export const SealTick = lucide(Check);
/** The week. */
export const TempleGlyph = lucide(CalendarDays);
/** Plates. */
export const PlateStackIcon = lucide(Layers);
/** Not done. */
export const CoinMissed = lucide(Circle);
export const Moon = lucide(LucideMoon);

/** Volleyball leaves the app (law 14): renders nothing; each caller is removed by its owner. */
export function Volleyball(_props: IconProps) {
  return null;
}
