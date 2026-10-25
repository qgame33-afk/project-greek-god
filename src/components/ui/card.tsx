import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "card" | "monument" | "instrument" | "inset" | "accent";

/**
 * The card (docs/DESIGN-V3-SIMPLE.md §1.4.1): flat --card (--sheet-card in a sheet), radius 24,
 * padding 20, no border, shadow, gradient or texture. One thing per card. The old variants all
 * render the V3 card (`inset`, which sits inside another card, is a control surface).
 *
 * With `onClick` or `href` the whole card is one button or link with the card press (.98).
 */
const VARIANT: Record<Variant, string> = {
  card: "bg-surface rounded-card p-5",
  monument: "bg-surface rounded-card p-5",
  instrument: "bg-surface rounded-tile-lg p-5",
  inset: "bg-control rounded-tile p-3",
  accent: "bg-surface rounded-card p-5",
};

type CardProps = ComponentProps<"section"> & {
  variant?: Variant;
  /** Makes the whole card a link (press-soft). */
  href?: string;
  /** VoiceOver name for a card that is a button or link. */
  ariaLabel?: string;
};

export function Card({ variant = "card", className, href, onClick, ariaLabel, children, ...props }: CardProps) {
  const cls = cn(VARIANT[variant], className);
  if (href)
    return (
      <Link href={href} aria-label={ariaLabel} className={cn("press-soft block text-left", cls)}>
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick as unknown as ComponentProps<"button">["onClick"]} aria-label={ariaLabel} className={cn("press-soft block w-full text-left", cls)}>
        {children}
      </button>
    );
  return (
    <section className={cls} {...props}>
      {children}
    </section>
  );
}

/** A card's caption row: a `t-cap` title on the left, an optional action on the right. */
export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string; gold?: boolean }) {
  return (
    <div className={cn("mb-3 flex min-h-6 items-center justify-between gap-3", className)}>
      <h2 className="t-cap">{title}</h2>
      {action}
    </div>
  );
}

/** A text action for card headers: 44 px hit area, --text, never gold. */
export function CardAction({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "press t-label -my-3 -mr-2 inline-flex h-11 items-center rounded-pill px-2 font-semibold text-fg-2 hover:text-fg";
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** A card that is a link, with the 16 px chevron. */
export function LinkCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn("press-soft flex items-center gap-3 rounded-card bg-surface p-5", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </Link>
  );
}
