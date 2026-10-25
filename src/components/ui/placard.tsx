import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ListGroup, Row } from "./list";

/**
 * The old placard, as a wrapper over the V3 list (docs/DESIGN-V3-SIMPLE.md §1.4.8): a `t-cap`
 * caption (the old eyebrow, no uppercase) with an optional action, then a ListGroup. PlacardRow
 * is a Row. New screens use ListGroup / Row from ui/list directly; this file goes at integration.
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
            <h2 id={labelledBy} className="t-cap">
              {eyebrow}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      <ListGroup>{children}</ListGroup>
    </As>
  );
}

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
  return <Row title={title} subtitle={detail} value={value} href={href} onClick={onClick} className={className} ariaLabel={ariaLabel} icon={lead ?? undefined} />;
}
