"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { createElement, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Up next (docs/DESIGN-V3-SIMPLE.md §1.4.7, §4.1.2): the Day Engine's next action, never blank.
 * A `t-cap` caption, a 52 px tile with a glyph, the title (`t-row`, two lines at most; VoiceOver
 * reads it whole), a subtitle of up to two lines, and ONE button: `sm` on the right, or full width under the
 * text with `stack` (labels longer than "Start").
 *
 *   <UpNextCard icon={Dumbbell} title="Shoulders, Biceps & Triceps B" subtitle="7 lifts · about 45 min"
 *     action={{ label: "Start", href: "/workout/start?t=shoulders_arms_b" }} dataName />
 *
 * `onBody` makes the tile and text one more button (the recipe, Options for today). `resume`
 * marks the card `data-today-resume` so the workout bar steps aside.
 */
export interface UpNextAction {
  label: string;
  onClick?: () => void;
  href?: string;
  /** primary (gold, default), secondary or inverse. */
  variant?: "primary" | "secondary" | "inverse";
  ariaLabel?: string;
  disabled?: boolean;
  loading?: boolean;
}

export interface UpNextCardProps {
  /** A Lucide icon, or a ready glyph element (a recipe's RecipeGlyph). */
  icon: LucideIcon | ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: UpNextAction | null;
  stack?: boolean;
  caption?: ReactNode;
  onBody?: () => void;
  /** VoiceOver name of the body button (defaults to the title and subtitle). */
  bodyLabel?: string;
  /** The title is a name from data (§5.1). */
  dataName?: boolean;
  resume?: boolean;
  className?: string;
}

export function UpNextCard({ icon, title, subtitle, action, stack, caption = "Up next", onBody, bodyLabel, dataName, resume, className }: UpNextCardProps) {
  const glyph = isValidElement(icon) ? icon : icon ? createElement(icon as LucideIcon, { className: "size-6", strokeWidth: 1.9, "aria-hidden": true }) : null;
  const text = (
    <>
      <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-tile bg-control text-fg [&_svg]:size-6">
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-row line-clamp-2 block leading-tight" data-budget-name={dataName ? "" : undefined}>
          {title}
        </span>
        {/* two lines, so the end of the line ("1 change suggested") is never cut off */}
        {subtitle != null && <span className="t-label mt-[3px] line-clamp-2 block">{subtitle}</span>}
      </span>
    </>
  );
  const button = action ? <ActionButton a={action} block={stack} /> : null;
  return (
    <section aria-label={typeof caption === "string" ? caption : "Up next"} className={cn("rounded-card bg-surface p-4", className)} data-up-next="" data-today-resume={resume ? "" : undefined}>
      <p className="t-cap mb-2.5 ml-0.5">{caption}</p>
      <div className="flex items-center gap-3.5">
        {onBody ? (
          <button type="button" onClick={onBody} aria-label={bodyLabel} className="press-soft flex min-w-0 flex-1 items-center gap-3.5 text-left">
            {text}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3.5">{text}</div>
        )}
        {!stack && button && <div className="shrink-0">{button}</div>}
      </div>
      {stack && button && <div className="mt-3.5">{button}</div>}
    </section>
  );
}

function ActionButton({ a, block }: { a: UpNextAction; block?: boolean }) {
  const variant = a.variant ?? "primary";
  if (a.href)
    return (
      <Button asChild variant={variant} size="sm" block={block}>
        <Link href={a.href} aria-label={a.ariaLabel}>
          {a.label}
        </Link>
      </Button>
    );
  return (
    <Button variant={variant} size="sm" block={block} onClick={a.onClick} aria-label={a.ariaLabel} disabled={a.disabled} loading={a.loading}>
      {a.label}
    </Button>
  );
}
