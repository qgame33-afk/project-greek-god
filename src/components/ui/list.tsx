"use client";

import Link from "next/link";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { createElement, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lists (docs/DESIGN-V3-SIMPLE.md §1.4.8).
 *   <ListGroup>  a --card group, radius 20, rows separated by --line hairlines
 *   <Row>        [icon tile 32] title (+ subtitle) [value in --text-2] [chevron]; 56 px, 68 with a
 *                subtitle. A link with `href`, a button with `onClick`.
 *   <ListItem>   the standalone 76 px card row with a 52 px tile (meals, eaten food), with an
 *                optional trailing control (a CheckCircle) that is its own button.
 *   <RadioRow>   a row with a 24 px circle (selected = white fill, black check), in a <RadioGroup>.
 *   <SectionHead> a `t-section` heading, 28 px above and 12 px below, with an optional action.
 *
 * `dataName` marks the title as a name from data (`data-budget-name`, §5.1); `history` marks a
 * past session's stored name (`data-history`, §5.2).
 */

function glyphOf(icon: LucideIcon | ReactNode, cls: string) {
  if (icon == null || icon === false) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === "object" || typeof icon === "function") return createElement(icon as LucideIcon, { className: cls, strokeWidth: 1.9, "aria-hidden": true });
  return icon as ReactNode;
}

export function ListGroup({ children, className, ariaLabel, role }: { children: ReactNode; className?: string; ariaLabel?: string; role?: string }) {
  return (
    <div role={role ?? (ariaLabel ? "group" : undefined)} aria-label={ariaLabel} className={cn("overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line", className)}>
      {children}
    </div>
  );
}

export interface RowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  /** A Lucide icon (drawn in a 32 px tile) or a ready element. */
  icon?: LucideIcon | ReactNode;
  href?: string;
  onClick?: () => void;
  /** Shown by default on rows that open something. */
  chevron?: boolean;
  /** Anything on the right instead of a chevron (a pill, a switch). Never put a button in a row that is itself a button. */
  accessory?: ReactNode;
  ariaLabel?: string;
  dataName?: boolean;
  history?: boolean;
  /** Destructive action text (--danger). */
  danger?: boolean;
  /** Title wraps instead of ending in an ellipsis. */
  wrap?: boolean;
  className?: string;
}

export function Row({ title, subtitle, value, icon, href, onClick, chevron, accessory, ariaLabel, dataName, history, danger, wrap, className }: RowProps) {
  const tappable = !!(href || onClick);
  const showChev = chevron ?? (tappable && !accessory);
  const inner = (
    <>
      {icon != null && (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
          {glyphOf(icon, "size-5")}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("t-row block", !wrap && !accessory && "truncate", danger && "text-danger")} data-budget-name={dataName ? "" : undefined} data-history={history ? "" : undefined}>
          {title}
        </span>
        {subtitle != null && <span className="t-label mt-0.5 block">{subtitle}</span>}
      </span>
      {value != null && <span className="t-body shrink-0 whitespace-nowrap text-right text-fg-2 tabular-nums">{value}</span>}
      {accessory}
      {showChev && <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />}
    </>
  );
  const cls = cn("flex w-full items-center gap-3.5 px-4 text-left", subtitle != null ? "min-h-[68px] py-3" : "min-h-14 py-2.5", tappable && "press-soft", className);
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
  return (
    <div className={cls} aria-label={ariaLabel} role={ariaLabel ? "group" : undefined}>
      {inner}
    </div>
  );
}

export interface ListItemProps {
  /** The 52 px tile's glyph: a Lucide icon or an element (RecipeGlyph). */
  tile: LucideIcon | ReactNode;
  /** A `t-cap` line above the title ("3:00 PM", "6:15 PM · AI"). */
  caption?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** VoiceOver name of the row's body. */
  ariaLabel?: string;
  /** A control on the right that is its own button (a CheckCircle). */
  trailing?: ReactNode;
  chevron?: boolean;
  dataName?: boolean;
  history?: boolean;
  className?: string;
}

export function ListItem({ tile, caption, title, subtitle, href, onClick, ariaLabel, trailing, chevron, dataName, history, className }: ListItemProps) {
  const tappable = !!(href || onClick);
  const body = (
    <>
      <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-tile bg-control text-fg [&_svg]:size-6">
        {glyphOf(tile, "size-6")}
      </span>
      <span className="min-w-0 flex-1">
        {caption != null && <span className="t-cap block">{caption}</span>}
        <span className={cn("t-row block line-clamp-3 leading-tight", caption != null && "mt-0.5")} data-budget-name={dataName ? "" : undefined} data-history={history ? "" : undefined}>
          {title}
        </span>
        {subtitle != null && <span className="t-label mt-[3px] block">{subtitle}</span>}
      </span>
      {(chevron ?? (tappable && !trailing)) && <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />}
    </>
  );
  const bodyCls = cn("flex min-w-0 flex-1 items-center gap-3.5 text-left", tappable && "press-soft");
  return (
    <div className={cn("flex min-h-[76px] items-center gap-3 rounded-tile-lg bg-surface py-3.5 pl-3.5 pr-4", className)}>
      {href ? (
        <Link href={href} className={bodyCls} aria-label={ariaLabel}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={bodyCls} aria-label={ariaLabel}>
          {body}
        </button>
      ) : (
        <div className={bodyCls}>{body}</div>
      )}
      {trailing}
    </div>
  );
}

export function RadioGroup({ children, ariaLabel, className }: { children: ReactNode; ariaLabel: string; className?: string }) {
  return (
    <ListGroup role="radiogroup" ariaLabel={ariaLabel} className={className}>
      {children}
    </ListGroup>
  );
}

export function RadioRow({ title, subtitle, checked, onSelect, disabled, className }: { title: ReactNode; subtitle?: ReactNode; checked: boolean; onSelect: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn("press-soft flex w-full items-center gap-3.5 px-4 text-left disabled:opacity-50", subtitle != null ? "min-h-[68px] py-3" : "min-h-14 py-2.5", className)}
    >
      <span className="min-w-0 flex-1">
        <span className="t-row block">{title}</span>
        {subtitle != null && <span className="t-label mt-0.5 block">{subtitle}</span>}
      </span>
      <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full", checked ? "bg-fg text-bg" : "border-2 border-ui-line")}>
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function SectionHead({ children, action, className, id }: { children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-3 mt-7 flex min-h-6 items-baseline justify-between gap-3", className)}>
      <h2 id={id} className="t-section">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A section head's text action ("All food"): `t-label` 600 in --text-2, 44 px hit. */
export function SectionAction({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "press t-label hit-44 font-semibold text-fg-2 hover:text-fg";
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
