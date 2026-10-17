import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A museum placard (docs/DESIGN-V2.md §1.3 Composition): content that sits on night under an
 * eyebrow, in hairline-ruled rows — the default for lists and facts. Only the Now card, sheets and
 * grouped settings lists are slabs.
 *
 *   <Placard eyebrow="Earlier" action={<CardAction …/>}>
 *     <PlacardRow title="Weigh-in" value="168.6" detail="7:04 am" />
 *   </Placard>
 */
export function Placard({
  eyebrow,
  action,
  children,
  className,
  as: As = "section",
  labelledBy,
}: {
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
  labelledBy?: string;
}) {
  return (
    <As className={cn("min-w-0", className)} aria-labelledby={labelledBy}>
      {(eyebrow || action) && (
        <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
          {eyebrow ? (
            <h2 id={labelledBy} className="t-eyebrow">
              {eyebrow}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      <div className="divide-y divide-vein border-y border-vein">{children}</div>
    </As>
  );
}

/**
 * One placard row: 56 px min, title + optional detail on the left, value on the right. With `href`
 * or `onClick` the whole row is the target (44 px+) and shows a chevron.
 */
export function PlacardRow({
  title,
  detail,
  value,
  lead,
  href,
  onClick,
  className,
  ariaLabel,
}: {
  title: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  lead?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      {lead && <span className="shrink-0">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="t-title-3 block text-ivory">{title}</span>
        {detail && <span className="t-meta mt-0.5 block text-stone">{detail}</span>}
      </span>
      {value != null && <span className="t-num-s shrink-0 text-right text-ivory">{value}</span>}
      {(href || onClick) && <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />}
    </>
  );
  const cls = cn("flex min-h-14 w-full items-center gap-3 py-2.5 text-left", (href || onClick) && "press-soft", className);
  if (href)
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}
