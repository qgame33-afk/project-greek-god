"use client";

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BackLink } from "./BackLink";

/**
 * A pushed page's header (docs/DESIGN-V3-SIMPLE.md §3.2): "‹ {parent}" (44 px) on the left, an
 * optional ⋯ or one icon on the right, then the page's `t-title` (its <h1>) and an optional line
 * under it. The back link returns in history when the parent is where the page was opened from.
 *
 *   <BackHeader href="/training" parent="Train" title="Program" />
 */
export function BackHeader({ href, parent, title, right, subtitle, className }: { href: string; parent: string; title?: ReactNode; right?: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <header data-page-header="" className={cn("mb-1", className)}>
      <div className="flex min-h-12 items-center justify-between gap-3">
        <BackLink href={href} className="press -ml-1.5 inline-flex h-11 items-center gap-0.5 pr-2 text-fg">
          <ChevronLeft className="size-5 shrink-0" strokeWidth={1.9} aria-hidden />
          <span className="t-body font-medium">{parent}</span>
        </BackLink>
        {right}
      </div>
      {title != null && <h1 className="t-title mt-1">{title}</h1>}
      {subtitle != null && <p className="t-label mt-1.5">{subtitle}</p>}
    </header>
  );
}
